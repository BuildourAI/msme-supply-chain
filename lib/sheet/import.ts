/**
 * Turning a sheet into records, in two halves.
 *
 * `planImport` reads and decides but writes nothing: every row comes back with
 * what it would do and, when it would do nothing, why. That is what the last
 * step of the dialog shows, and it is the whole reason an import here is not
 * frightening — you see the outcome before you agree to it.
 *
 * `applyImport` then carries out exactly that plan and records enough to undo
 * it. Splitting the two is what makes the preview honest: there is no second
 * code path that could decide something different from what was shown.
 *
 * Records are built through `lib/workspace/records.ts`, the same functions the
 * add dialogs use, so an import cannot drift from what typing it by hand would
 * produce.
 */
import { issueId } from '@/lib/workspace/defaults'
import { dropLots, newLot } from '@/lib/workspace/ledger'
import {
  buildItem, buildVendor, findItemByCode, findItemByName, findVendorByName,
  parseNumber, parseUom,
} from '@/lib/workspace/records'
import { addField, BUILTIN, setValue } from '@/lib/workspace/fields'
import { nextNo } from '@/lib/workspace/sourcing'
import { forgetAlias } from '@/lib/intake/alias'
import { toIsoDate, toYesNo } from './match'
import type { Item, SpecCheck, Vendor } from '@/lib/domain/types'
import {
  addCheck, checkProblem, checksFor, readBucket, readCheckKind, updateCheck, type CheckInput,
} from '@/lib/workspace/checks'
import type {
  FieldDef, FieldKind, ImportUndo, OrderState, PurchaseOrder, QuoteLine, Rfq, SheetEntity,
  TableView, Workspace,
} from '@/lib/workspace/types'

/**
 * A status column read back into a state.
 *
 * Anything unrecognised lands on draft rather than on a guess: an order the
 * system is unsure about is one nobody has confirmed, which is the state that
 * asks a person to look rather than the one that says goods are on their way.
 */
const ORDER_STATES: OrderState[] = ['draft', 'confirmed', 'shipped', 'delivered', 'cancelled']

function readOrderState(raw: string): OrderState {
  const v = raw.trim().toLowerCase()
  return ORDER_STATES.find((s) => s === v) ?? 'draft'
}

/** What to do about a row naming something that already exists. */
export type DupPolicy = 'update' | 'skip' | 'add'

export interface Mapping {
  /** which column of the sheet */
  column: number
  /**
   * A built-in key, an existing field id, `NEW_FIELD` to invent one, or null to
   * leave the column out.
   */
  target: string | null
  /**
   * What inventing one would make. Carried on every unmatched column so the
   * offer can be shown, and honoured ONLY when `target` is the sentinel —
   * otherwise picking a real column after being offered a new one would
   * silently create a field nobody asked for as well.
   */
  create?: { label: string; kind: FieldKind; choices?: string[] }
}

/** `target` for a column the person has chosen to turn into a new field. */
export const NEW_FIELD = '__new__'

export const makesField = (m: Mapping): boolean =>
  m.target === NEW_FIELD && m.create !== undefined

export interface RowPlan {
  /** 1-based, counting the body only, so it matches what the person sees */
  line: number
  status: 'new' | 'update' | 'skip'
  /** what the row is called, for the preview */
  name: string
  /** why it will be skipped */
  reason?: string
  /** the record it would overwrite */
  matchId?: string
  /**
   * The records a row points at, for the lists that name two of them. A quote
   * is from somebody, for something; one id in `matchId` cannot carry both.
   */
  links?: { vendorId: string; itemId: string }
  /** target key → the value as written in the sheet */
  raw: Record<string, string>
}

/* ----------------------------------------------------------- reading a row -- */

/**
 * Which built-in column names the record, per list.
 *
 * A quote and an order each name two records that have to already exist —
 * who, and for what — and this is only the first of them. The second is
 * checked in `planImport`, which is also where the row is refused by name
 * rather than being quietly written against nothing.
 */
const IDENTITY: Record<SheetEntity, string> = {
  supplier: 'name', material: 'name', rfq: 'item',
  quote: 'supplier', order: 'vendor',
  check: 'item',
  // never imported — see `importable` — but every list names its identity
  receipt: 'id', challan: 'no',
  rack: 'name', lot: 'item', count: 'on', move: 'on', job: 'no', issue: 'no', loss: 'on',
}

/** The second record a row has to resolve, for the lists that name two. */
const SECOND: Partial<Record<SheetEntity, string>> = { quote: 'item', order: 'item' }

/**
 * A check, as a sheet row describes it.
 *
 * Read the same way at plan time, where it is refused if the form would refuse
 * it, and at apply time, where it is written — so the preview never promises a
 * row the apply then quietly changes.
 */
function checkFromRow(itemId: string, get: (target: string) => string): CheckInput {
  const n = (v: string) => (v === '' ? undefined : parseNumber(v) ?? undefined)
  const min = n(get('min'))
  const max = n(get('max'))
  return {
    itemId,
    label: get('label'),
    // no kind given: a band means a reading, anything else is somebody looking
    kind: readCheckKind(get('kind')) ?? (min != null || max != null ? 'measure' : 'visual'),
    min,
    max,
    unit: get('unit') || undefined,
    failBucket: readBucket(get('bucket')) ?? 'qc_hold',
    failReason: get('reason'),
    // a check is one that must be marked unless the sheet says otherwise
    mandatory: toYesNo(get('mandatory')) !== 'No',
  }
}

/**
 * The lists a sheet can fill.
 *
 * A receipt and a challan are records of things that happened — material at
 * the gate, material on a lorry — and a spreadsheet row claiming either would
 * put stock on the shelf that nobody inspected, or take it off without a
 * challan anybody signed. They have columns to arrange and export, never to
 * import into.
 */
export const importable = (entity: SheetEntity): boolean =>
  !['receipt', 'challan', 'rack', 'lot', 'count', 'move', 'job', 'issue', 'loss'].includes(entity)

/**
 * Whether a value fits the column it was matched to.
 *
 * Returns the reason it does not, or null. Every one of these stops the row
 * rather than writing something approximate: a lead time that silently became
 * zero, or a tonne read as a metre, is a number somebody will act on.
 *
 * The kind comes from the column's own declaration rather than a list of
 * target names kept here. The list version had already drifted — it read
 * "rate" as a number for every entity, which was true of materials and an
 * accident everywhere else.
 */
function complain(
  entity: SheetEntity, target: string, value: string, field?: FieldDef,
): string | null {
  if (value === '') return null
  const kind: FieldKind | 'uom' | undefined = field
    ? field.kind
    // a unit is the one built-in whose validation is stricter than its kind
    : target === 'uom' ? 'uom' : BUILTIN[entity].find((b) => b.key === target)?.kind

  if (kind === 'number' && parseNumber(value) === null) return `“${value}” is not a number`
  if (kind === 'date' && toIsoDate(value) === null) return `“${value}” is not a date`
  if (kind === 'yesno' && toYesNo(value) === null) return `“${value}” is not a yes or a no`
  if (kind === 'uom' && parseUom(value) === null) {
    return `“${value}” is not a unit this understands — try kg, MT, m, m2 or nos`
  }
  return null
}

/* ------------------------------------------------------------------- plan -- */

export function planImport(
  ws: Workspace,
  entity: SheetEntity,
  body: string[][],
  mappings: Mapping[],
  policy: DupPolicy,
): RowPlan[] {
  const used = mappings.filter((m) => m.target !== null)
  const identity = IDENTITY[entity]
  const hasIdentity = used.some((m) => m.target === identity)
  const second = SECOND[entity]
  const hasSecond = second !== undefined && used.some((m) => m.target === second)

  return body.map((row, i) => {
    const line = i + 1
    // keyed by column, because two columns can both be heading for a new field
    // and would otherwise collide on the same sentinel
    const raw: Record<string, string> = {}
    for (const m of used) raw[String(m.column)] = (row[m.column] ?? '').trim()

    const keyOf = (target: string) =>
      String(used.find((m) => m.target === target)?.column ?? -1)
    const name = raw[keyOf(identity)] ?? ''
    const plan = (status: RowPlan['status'], extra: Partial<RowPlan> = {}): RowPlan =>
      ({ line, status, name, raw, ...extra })

    if (!hasIdentity) {
      return plan('skip', { reason: `No column is matched to ${identity === 'item' ? 'a material' : 'a name'}` })
    }
    if (second !== undefined && !hasSecond) {
      return plan('skip', { reason: 'No column is matched to a material' })
    }
    if (name === '') return plan('skip', { reason: 'No name in this row' })

    // every mapped value has to make sense before anything is written
    for (const m of used) {
      const field = ws.fields.find((f) => f.id === m.target)
      const why = complain(entity, m.target!, raw[String(m.column)] ?? '', field)
      if (why) return plan('skip', { reason: why })
    }

    if (!importable(entity)) {
      return plan('skip', { reason: 'These are recorded as they happen, not imported' })
    }

    if (entity === 'check') {
      /*
       * A check is for a material that already exists, like a request is — a
       * sheet row must not invent the thing it describes a test for. The label
       * is the natural key within that material, so a second import of the
       * same inspection sheet updates rather than doubling every check.
       */
      const item = findItemByName(ws, name) ?? findItemByCode(ws, name)
      if (!item) return plan('skip', { reason: `No material called “${name}”` })
      const label = raw[keyOf('label')] ?? ''
      if (label === '') return plan('skip', { reason: 'No check named in this row' })
      const kindWord = raw[keyOf('kind')] ?? ''
      if (kindWord && !readCheckKind(kindWord)) {
        return plan('skip', { reason: `“${kindWord}” is not a reading, a document, a look or a count` })
      }
      const bucketWord = raw[keyOf('bucket')] ?? ''
      if (bucketWord && !readBucket(bucketWord)) {
        return plan('skip', { reason: `“${bucketWord}” is not held, cannot be used, past its date or usable` })
      }
      const existing = checksFor(ws, item.id)
        .find((c) => c.label.trim().toLowerCase() === label.trim().toLowerCase())
      // the form's own refusals, so a sheet cannot write what a person could not
      const why = checkProblem(ws, checkFromRow(item.id, (t) => raw[keyOf(t)] ?? ''), existing?.id)
      if (why) return plan('skip', { reason: why })
      if (!existing) return plan('new', { links: { vendorId: '', itemId: item.id } })
      if (policy === 'skip') return plan('skip', { reason: `${item.name} already has “${label}”` })
      if (policy === 'add') return plan('skip', { reason: `${item.name} already has “${label}” — a check is named once per material` })
      return plan('update', { matchId: existing.id, links: { vendorId: '', itemId: item.id } })
    }

    if (entity === 'rfq') {
      // a request is for a material that has to already exist — inventing one
      // from a request would create a material nobody has described
      const item = findItemByName(ws, name) ?? findItemByCode(ws, name)
      if (!item) return plan('skip', { reason: `No material called “${name}”` })
      return plan('new', { matchId: item.id })
    }

    if (entity === 'quote' || entity === 'order') {
      /*
       * Both ends have to exist, for the same reason a request's material
       * does: a quote invents neither the supplier who gave it nor the
       * material it is for, and a row that quietly created both would leave
       * two records nobody has described sitting in the masters.
       *
       * Every row is new. There is no natural key for a quote — the same
       * supplier can quote the same material twice in a week, and the second
       * one is a second quote, not a correction of the first.
       */
      const vendor = findVendorByName(ws, name)
      if (!vendor) return plan('skip', { reason: `No supplier called “${name}”` })

      const what = raw[keyOf(second!)] ?? ''
      if (what === '') return plan('skip', { reason: 'No material in this row' })
      const item = findItemByName(ws, what) ?? findItemByCode(ws, what)
      if (!item) return plan('skip', { reason: `No material called “${what}”` })

      return plan('new', { links: { vendorId: vendor.id, itemId: item.id } })
    }

    const code = raw[keyOf('code')] ?? ''
    const existing = entity === 'supplier'
      ? findVendorByName(ws, name)
      : findItemByName(ws, name) ?? (code ? findItemByCode(ws, code) : undefined)

    if (!existing) return plan('new')
    if (policy === 'skip') return plan('skip', { reason: `${name} is already here` })
    if (policy === 'add') return plan('new')
    return plan('update', { matchId: existing.id })
  })
}

export interface ImportReport {
  added: number
  changed: number
  skipped: number
}

export const summarise = (plans: RowPlan[]): ImportReport => ({
  added: plans.filter((p) => p.status === 'new').length,
  changed: plans.filter((p) => p.status === 'update').length,
  skipped: plans.filter((p) => p.status === 'skip').length,
})

/* ------------------------------------------------------------------ apply -- */

/** The value as it will be stored, so one column cannot sort three ways. */
function canonical(kind: FieldKind, value: string): string {
  if (value === '') return ''
  if (kind === 'number') { const n = parseNumber(value); return n === null ? value : String(n) }
  if (kind === 'date') return toIsoDate(value) ?? value
  if (kind === 'yesno') return toYesNo(value) ?? value
  return value
}

export function applyImport(
  ws: Workspace,
  entity: SheetEntity,
  plans: RowPlan[],
  mappings: Mapping[],
  source: string,
  today: string,
): { ws: Workspace; undo: ImportUndo } {
  let w = ws
  const created: string[] = []
  const updated: { id: string; before: Record<string, unknown> }[] = []
  const cells: [string, string, string][] = []
  const fieldsCreated: string[] = []
  const lotsCreated: string[] = []
  const sideBefore: NonNullable<ImportUndo['sideBefore']> = []

  /*
   * Columns the mapping step invented become real fields first, so that every
   * row below writes into something that exists. Their ids are recorded, and
   * an undo takes them away again — a column left behind full of dashes is a
   * mess somebody then has to clean up by hand.
   */
  const targetOf = new Map<number, string>()
  for (const m of mappings) {
    if (m.target === null) continue
    if (makesField(m)) {
      const made = addField(w, { entity, ...m.create! })
      w = made.ws
      fieldsCreated.push(made.id)
      targetOf.set(m.column, made.id)
    } else {
      targetOf.set(m.column, m.target)
    }
  }

  const fieldFor = (id: string) => w.fields.find((f) => f.id === id)

  for (const plan of plans) {
    if (plan.status === 'skip') continue

    const values: Record<string, string> = {}
    for (const m of mappings) {
      if (m.target === null) continue
      values[targetOf.get(m.column)!] = plan.raw[String(m.column)] ?? ''
    }

    let recordId: string
    if (entity === 'supplier') {
      const before = plan.matchId ? w.vendors.find((v) => v.id === plan.matchId) : undefined
      let id = plan.matchId ?? ''
      if (!id) { const [next, made] = issueId(w, 'VN'); w = next; id = made; created.push(id) }
      else updated.push({ id, before: { ...before } as Record<string, unknown> })

      const terms = parseNumber(values.terms ?? '')
      const vendor: Vendor = buildVendor({
        id,
        name: values.name,
        // 0 means "cash on delivery" to every screen that reads it, so a column
        // that simply was not filled in must not say that
        paymentTermsDays: terms ?? before?.paymentTermsDays ?? 30,
      })
      w = {
        ...w,
        vendors: before ? w.vendors.map((v) => (v.id === id ? vendor : v)) : [...w.vendors, vendor],
      }
      if (values.type) {
        sideBefore.push({ map: 'vendorType', id, before: w.vendorType[id] ?? null })
        w = { ...w, vendorType: { ...w.vendorType, [id]: values.type } }
      }
      if (values.phone || values.email) {
        const was = w.vendorContact[id] ?? {}
        w = {
          ...w,
          vendorContact: {
            ...w.vendorContact,
            [id]: {
              phone: values.phone || was.phone,
              email: values.email || was.email,
            },
          },
        }
      }
      recordId = id
    } else if (entity === 'material') {
      const before = plan.matchId ? w.items.find((it) => it.id === plan.matchId) : undefined
      let id = plan.matchId ?? ''
      if (!id) { const [next, made] = issueId(w, 'IT'); w = next; id = made; created.push(id) }
      else updated.push({ id, before: { ...before } as Record<string, unknown> })

      const rate = parseNumber(values.rate ?? '')
      /*
       * Safety stock is a product of daily use and a cushion. A sheet that
       * carries them — as "Used per day" and either "Days of cushion" or a
       * "Safety stock" quantity — sets them; a column left blank keeps what the
       * material already holds, so re-importing a price list never quietly
       * zeroes anybody's safety stock. A brand-new material with no figures
       * gets nothing, because nothing has been measured: a reorder point
       * invented from a spreadsheet is a number somebody would act on.
       */
      const fig = (k: string) => { const n = parseNumber(values[k] ?? ''); return n !== null && n >= 0 ? n : null }
      const daily = fig('daily') ?? before?.avgDailyConsumption ?? 0
      const heldCushion = before && before.avgDailyConsumption > 0
        ? before.safetyStock / before.avgDailyConsumption : 0
      const safety = fig('safety')
      const cushionDays = fig('cushion')
        ?? (safety !== null && daily > 0 ? safety / daily : null)
        ?? heldCushion
      const item: Item = buildItem(w, {
        id,
        name: values.name,
        code: values.code || before?.code || suggest(values.name, w.items),
        uom: parseUom(values.uom ?? '') ?? before?.uom ?? 'kg',
        moq: fig('minOrder') ?? before?.moq ?? 0,
        daily,
        cushionDays,
        lastPurchaseRate: rate ?? before?.lastPurchaseRate ?? 0,
      }, before)
      w = {
        ...w,
        items: before ? w.items.map((x) => (x.id === id ? item : x)) : [...w.items, item],
      }

      if (values.group) {
        sideBefore.push({ map: 'itemGroup', id, before: w.itemGroup[id] ?? null })
        w = { ...w, itemGroup: { ...w.itemGroup, [id]: values.group } }
      }
      /*
       * An on-hand figure is an opening lot, written through the ledger so it
       * opens with a line. Re-importing replaces it — unless something has
       * been done with it since, in which case it is left as it is and the
       * count is where a correction belongs.
       */
      const onHand = parseNumber(values.onHand ?? '')
      if (onHand !== null && onHand > 0) {
        const lotId = `LOT-IMP-${id}`
        const touched = (w.moves ?? []).some((m) => m.lotId === lotId && m.kind !== 'opening')
        if (!touched) {
          w = dropLots(w, (l) => l.id === lotId)
          const [next, made] = newLot(w, {
            id: lotId, itemId: id, batchNo: `OPENING-${today}`, usability: 'usable',
          }, { on: today, kind: 'opening', qty: onHand, source: 'opening', sourceRef: `import ${today}`, actor: '' })
          if (made) { w = next; lotsCreated.push(lotId) }
        }
      }
      recordId = id
    } else if (entity === 'quote') {
      // both ends were resolved by planImport, which refused the row otherwise
      const vendorId = plan.links!.vendorId
      const ref = values.ref || undefined
      const on = toIsoDate(values.on ?? '') ?? today

      /*
       * Rows that are the same quotation become one.
       *
       * A spreadsheet of quotes is usually somebody typing up the quotations
       * they received, and the rows of one of them share a supplier and a
       * reference. Grouping on that is what stops a six-line quotation
       * arriving as six of them — the same thing an uploaded PDF does. With
       * no reference there is nothing to group on, so each row is its own
       * quotation, which is what a row with no reference actually is.
       */
      const onto = ref
        ? w.quotes.find((q) => q.vendorId === vendorId && q.ref === ref && created.includes(q.id))
        : undefined

      let id = onto?.id ?? ''
      if (!id) {
        const [next, made] = issueId(w, 'QT')
        w = next
        id = made
        created.push(id)
        w = {
          ...w,
          quotes: [...w.quotes, {
            id, vendorId, ref, on,
            validUntil: toIsoDate(values.valid ?? '') || undefined,
            lines: [],
          }],
        }
      }

      const held = w.quotes.find((q) => q.id === id)!
      const lineId = `${id}/${held.lines.length + 1}`
      const line: QuoteLine = {
        id: lineId,
        itemId: plan.links!.itemId,
        unitPrice: parseNumber(values.price ?? '') ?? 0,
        moq: parseNumber(values.moq ?? '') ?? 0,
        leadDays: parseNumber(values.lead ?? '') ?? 0,
        /*
         * Always received, however the sheet describes it. Accepting is what
         * writes the rate and turns the rivals down, and a spreadsheet cell
         * must not do that on somebody's behalf — which is also why `state`
         * is not offered as a column to map.
         */
        state: 'received',
      }
      w = {
        ...w,
        quotes: w.quotes.map((q) => (q.id === id ? { ...q, lines: [...q.lines, line] } : q)),
      }
      // the owner's own columns hang off the line, not off the quotation
      recordId = lineId
    } else if (entity === 'order') {
      const [next, id] = issueId(w, 'PO')
      w = next
      created.push(id)
      const ordered = toIsoDate(values.ordered ?? '') ?? today
      const order: PurchaseOrder = {
        id,
        // issued here and never read from the sheet: two orders sharing a
        // number is a thing nobody can untangle afterwards. Read off what is
        // already there, so a second row in the same import gets the next one
        no: nextNo('PO', w.orders),
        vendorId: plan.links!.vendorId,
        itemId: plan.links!.itemId,
        qty: parseNumber(values.qty ?? '') ?? 0,
        unitPrice: parseNumber(values.rate ?? '') ?? 0,
        orderedOn: ordered,
        expectedOn: toIsoDate(values.expected ?? '') ?? ordered,
        state: readOrderState(values.state ?? ''),
      }
      w = { ...w, orders: [...w.orders, order] }
      recordId = id
    } else if (entity === 'check') {
      // written through the form's own tidying, so an imported check comes out
      // the same shape as a typed one — a reason always, a band only on a reading
      const input = checkFromRow(plan.links!.itemId, (t) => (values[t] ?? '').trim())
      if (plan.matchId) {
        const before = (w.specChecks ?? []).find((c) => c.id === plan.matchId)
        updated.push({ id: plan.matchId, before: { ...before } as Record<string, unknown> })
        w = updateCheck(w, plan.matchId, input)
        recordId = plan.matchId
      } else {
        const [next, id] = addCheck(w, input)
        w = next
        created.push(id)
        recordId = id
      }
    } else if (entity === 'rfq') {
      // a request, against a material that planImport already resolved
      const [next, id] = issueId(w, 'RF')
      w = next
      created.push(id)
      const rfq: Rfq = {
        id,
        no: `RFQ-${(w.nextIds.RF ?? 0)}`,
        itemId: plan.matchId!,
        qty: parseNumber(values.qty ?? '') ?? 0,
        neededBy: toIsoDate(values.needed ?? '') ?? today,
        vendorIds: [],
        state: 'draft',
        raisedOn: today,
      }
      w = { ...w, rfqs: [...w.rfqs, rfq] }
      recordId = id
    } else {
      /*
       * This used to be a bare `else` that built a request, so any list added
       * without its own branch imported as requests. Refusing is the only safe
       * default — `planImport` already skips these rows, so reaching here is a
       * bug, and a loud one is better than a wrong record.
       */
      throw new Error(`Nothing imports into ${entity}`)
    }

    // finally the owner's own columns, canonicalised so one column cannot end
    // up sorting three different ways
    for (const [target, value] of Object.entries(values)) {
      const field = fieldFor(target)
      if (!field) continue
      const stored = canonical(field.kind, value)
      cells.push([recordId, field.id, w.custom?.[recordId]?.[field.id] ?? ''])
      w = setValue(w, recordId, field.id, stored)
    }
  }

  const report = summarise(plans)
  const undo: ImportUndo = {
    id: `IMP-${today}-${created.length}-${updated.length}`,
    entity,
    at: today,
    source,
    created,
    updated,
    cells,
    fieldsCreated,
    lotsCreated,
    sideBefore,
    added: report.added,
    changed: report.changed,
  }
  return { ws: { ...w, lastImport: undo }, undo }
}

/** local copy of the code suggestion, to avoid a cycle through defaults */
function suggest(name: string, items: { code: string }[]): string {
  const stem = name.trim().split(/\s+/).slice(0, 2)
    .map((x) => x.replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase())
    .filter(Boolean).join('-') || 'ITEM'
  const used = new Set(items.map((i) => i.code.toUpperCase()))
  if (!used.has(stem)) return stem
  for (let n = 2; ; n += 1) if (!used.has(`${stem}-${n}`)) return `${stem}-${n}`
}

/* ------------------------------------------------------------------- undo -- */

/**
 * Put back exactly what the last import touched, and nothing else.
 *
 * Deliberately not a restore from a snapshot. Somebody who imports on Monday,
 * fixes two names on Tuesday and undoes on Wednesday must keep Tuesday's work;
 * and because custom values for all three lists share one map, a snapshot
 * restore of a supplier import would wipe values typed against materials.
 */
export function undoImport(ws: Workspace): Workspace {
  const undo = ws.lastImport
  if (!undo) return ws
  let w = ws

  // cells first, while the records they hang off still exist
  for (const [recordId, fieldId, before] of undo.cells) {
    w = setValue(w, recordId, fieldId, before)
  }

  const gone = new Set(undo.created)
  // opening lots it wrote go with their lines, and so does the stock of any material it invented
  w = dropLots(w, (l) => (undo.lotsCreated ?? []).includes(l.id) || gone.has(l.itemId))
  w = {
    ...w,
    vendors: w.vendors.filter((v) => !gone.has(v.id)),
    items: w.items.filter((i) => !gone.has(i.id)),
    rfqs: w.rfqs.filter((r) => !gone.has(r.id)),
    vendorItems: w.vendorItems.filter((vi) => !gone.has(vi.vendorId) && !gone.has(vi.itemId)),
    /*
     * `gone` now holds quote and order ids too, not only the masters they hang
     * off — an import into those lists creates the records themselves, so the
     * undo has to remove them by their own id as well as by a vanished parent.
     */
    quotes: w.quotes
      .filter((q) => !gone.has(q.id) && !gone.has(q.vendorId) && !(q.rfqId && gone.has(q.rfqId)))
      // a material the import invented takes the lines that priced it
      .map((q) => ({ ...q, lines: q.lines.filter((l) => !gone.has(l.itemId)) }))
      .filter((q) => q.lines.length > 0),
    orders: w.orders.filter((o) => !gone.has(o.id)
      && !gone.has(o.vendorId) && !gone.has(o.itemId)),
    specChecks: (w.specChecks ?? []).filter((c) => !gone.has(c.id) && !gone.has(c.itemId)),
    challans: (w.challans ?? []).filter((c) => !gone.has(c.vendorId) && !gone.has(c.itemId)),
  }

  for (const { id, before } of undo.updated) {
    if (undo.entity === 'supplier') {
      w = { ...w, vendors: w.vendors.map((v) => (v.id === id ? (before as unknown as Vendor) : v)) }
    } else if (undo.entity === 'material') {
      w = { ...w, items: w.items.map((i) => (i.id === id ? (before as unknown as Item) : i)) }
    } else if (undo.entity === 'check') {
      w = {
        ...w,
        specChecks: (w.specChecks ?? []).map((c) => (c.id === id ? (before as unknown as SpecCheck) : c)),
      }
    }
  }

  /*
   * Rates written over a pairing that already existed. Nothing produced this
   * before supplier documents did, which is why the field sat declared and
   * unused since imports were written — an import that overwrote a rate could
   * not put it back. Approving a quotation is almost entirely the act of
   * setting rates, so it is the first thing that has to.
   */
  for (const { key, before } of (undo.vendorItemsBefore ?? [])) {
    const [vendorId, itemId] = key.split('|')
    const without = w.vendorItems.filter((vi) => !(vi.vendorId === vendorId && vi.itemId === itemId))
    w = { ...w, vendorItems: before ? [...without, before] : without }
  }

  /*
   * And the valuation basis with them. §13-1 values stock at last purchase
   * price, so putting a rate back without putting this back would leave the
   * material — and every screen that sums stock — carrying a figure from a
   * quotation nobody accepted.
   */
  for (const { id, before } of (undo.itemRatesBefore ?? [])) {
    w = { ...w, items: w.items.map((i) => (i.id === id ? { ...i, lastPurchaseRate: before } : i)) }
  }

  /*
   * Wordings the approval taught. An alias is permanent on purpose, but an
   * approval that is being taken back never happened, and leaving its lessons
   * behind would mean the next document from that supplier silently resolved
   * against a decision the owner has just reversed.
   */
  for (const a of (undo.aliasesCreated ?? [])) {
    w = forgetAlias(w, a.vendorId, a.raw)
  }

  /* The document goes back to waiting, rather than claiming to be filed. */
  if (undo.docApproved) {
    w = {
      ...w,
      docs: w.docs.map((d) => (d.id === undo.docApproved
        ? {
          ...d,
          status: 'draft' as const,
          appliedUndoId: undefined,
          lines: d.lines.map((l) => ({ ...l, decision: undefined })),
        }
        : d)),
    }
  }

  for (const s of (undo.sideBefore ?? [])) {
    const map = { ...w[s.map] }
    if (s.before === null) delete map[s.id]
    else map[s.id] = s.before
    w = { ...w, [s.map]: map }
  }

  // fields the import invented go too, taking any cells still in them
  const custom = { ...w.custom }
  for (const id of gone) delete custom[id]
  const contact = { ...w.vendorContact }
  for (const id of gone) delete contact[id]
  w = {
    ...w,
    custom,
    vendorContact: contact,
    fields: w.fields.filter((f) => !undo.fieldsCreated.includes(f.id)),
    lastImport: undefined,
  }
  /*
   * Taken out of every view rather than out of the one the undo names. An
   * approved document is filed as a supplier import and creates its columns on
   * the QUOTES list, so cleaning only `undo.entity` left a dead key in the
   * quote view's order — harmless, because `resolveColumns` drops keys that
   * name nothing, and still litter nobody asked for.
   */
  for (const fid of undo.fieldsCreated) {
    const cleaned: Record<string, Record<string, string>> = {}
    for (const [rid, row] of Object.entries(w.custom)) {
      const { [fid]: _drop, ...rest } = row
      if (Object.keys(rest).length) cleaned[rid] = rest
    }
    const views = { ...w.views } as Record<SheetEntity, TableView>
    for (const entity of Object.keys(views) as SheetEntity[]) {
      const v = views[entity]
      views[entity] = {
        ...v,
        order: (v.order ?? []).filter((k) => k !== fid),
        hidden: (v.hidden ?? []).filter((k) => k !== fid),
        shown: (v.shown ?? []).filter((k) => k !== fid),
      }
    }
    w = { ...w, custom: cleaned, views }
  }
  return w
}
