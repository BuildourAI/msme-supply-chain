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
import {
  buildItem, buildVendor, findItemByCode, findItemByName, findVendorByName,
  parseNumber, parseUom,
} from '@/lib/workspace/records'
import { addField, setValue } from '@/lib/workspace/fields'
import { toIsoDate, toYesNo } from './match'
import type { Item, StockLot, Vendor } from '@/lib/domain/types'
import type {
  FieldDef, FieldKind, ImportUndo, Rfq, SheetEntity, Workspace,
} from '@/lib/workspace/types'

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
  /** target key → the value as written in the sheet */
  raw: Record<string, string>
}

/* ----------------------------------------------------------- reading a row -- */

/** Which built-in column names the record, per list. */
const IDENTITY: Record<SheetEntity, string> = {
  supplier: 'name', material: 'name', rfq: 'item',
}

/**
 * Whether a value fits the column it was matched to.
 *
 * Returns the reason it does not, or null. Every one of these stops the row
 * rather than writing something approximate: a lead time that silently became
 * zero, or a tonne read as a metre, is a number somebody will act on.
 */
function complain(target: string, value: string, field?: FieldDef): string | null {
  if (value === '') return null
  const kind: FieldKind | 'uom' | undefined = field
    ? field.kind
    : target === 'uom' ? 'uom'
      : target === 'terms' || target === 'qty' || target === 'rate' || target === 'onHand' ? 'number'
        : target === 'needed' ? 'date' : undefined

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
    if (name === '') return plan('skip', { reason: 'No name in this row' })

    // every mapped value has to make sense before anything is written
    for (const m of used) {
      const field = ws.fields.find((f) => f.id === m.target)
      const why = complain(m.target!, raw[String(m.column)] ?? '', field)
      if (why) return plan('skip', { reason: why })
    }

    if (entity === 'rfq') {
      // a request is for a material that has to already exist — inventing one
      // from a request would create a material nobody has described
      const item = findItemByName(ws, name) ?? findItemByCode(ws, name)
      if (!item) return plan('skip', { reason: `No material called “${name}”` })
      return plan('new', { matchId: item.id })
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
       * Safety stock is a product of daily use and a cushion, neither of which
       * a catalogue sheet carries. For a material already here, the cushion is
       * recovered from what it already holds so that re-importing a price list
       * does not quietly zero everybody's safety stock. A brand-new material
       * gets nothing, because nothing has been measured — a reorder point
       * invented from a spreadsheet is a number somebody would act on.
       */
      const daily = before?.avgDailyConsumption ?? 0
      const cushionDays = before && daily > 0 ? before.safetyStock / daily : 0
      const item: Item = buildItem(w, {
        id,
        name: values.name,
        code: values.code || before?.code || suggest(values.name, w.items),
        uom: parseUom(values.uom ?? '') ?? before?.uom ?? 'kg',
        moq: before?.moq ?? 0,
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
      const onHand = parseNumber(values.onHand ?? '')
      if (onHand !== null && onHand > 0) {
        const lotId = `LOT-IMP-${id}`
        lotsCreated.push(lotId)
        const lot: StockLot = {
          id: lotId, itemId: id, batchNo: `OPENING-${today}`, qty: onHand, usability: 'usable',
        }
        w = { ...w, stockLots: [...w.stockLots.filter((l) => l.id !== lotId), lot] }
      }
      recordId = id
    } else {
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
  w = {
    ...w,
    vendors: w.vendors.filter((v) => !gone.has(v.id)),
    items: w.items.filter((i) => !gone.has(i.id)),
    rfqs: w.rfqs.filter((r) => !gone.has(r.id)),
    vendorItems: w.vendorItems.filter((vi) => !gone.has(vi.vendorId) && !gone.has(vi.itemId)),
    stockLots: w.stockLots.filter((l) => !(undo.lotsCreated ?? []).includes(l.id) && !gone.has(l.itemId)),
    quotes: w.quotes.filter((q) => !gone.has(q.vendorId) && !gone.has(q.itemId) && !(q.rfqId && gone.has(q.rfqId))),
    orders: w.orders.filter((o) => !gone.has(o.vendorId) && !gone.has(o.itemId)),
  }

  for (const { id, before } of undo.updated) {
    if (undo.entity === 'supplier') {
      w = { ...w, vendors: w.vendors.map((v) => (v.id === id ? (before as unknown as Vendor) : v)) }
    } else if (undo.entity === 'material') {
      w = { ...w, items: w.items.map((i) => (i.id === id ? (before as unknown as Item) : i)) }
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
  for (const fid of undo.fieldsCreated) {
    const cleaned: Record<string, Record<string, string>> = {}
    for (const [rid, row] of Object.entries(w.custom)) {
      const { [fid]: _drop, ...rest } = row
      if (Object.keys(rest).length) cleaned[rid] = rest
    }
    w = {
      ...w,
      custom: cleaned,
      views: {
        ...w.views,
        [undo.entity]: {
          ...w.views[undo.entity],
          order: w.views[undo.entity].order.filter((k) => k !== fid),
          hidden: w.views[undo.entity].hidden.filter((k) => k !== fid),
        },
      },
    }
  }
  return w
}
