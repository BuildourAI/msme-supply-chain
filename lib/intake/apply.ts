/**
 * Approving a document, which is the moment it becomes the owner's data.
 *
 * Split in two the way `lib/sheet/import.ts` is, and for the same stated
 * reason: the preview a person approves and the write that follows must come
 * from one place, or there is a second code path free to decide something the
 * screen never showed.
 *
 * Nothing here contacts anybody. §11 holds — the system reads a document the
 * owner already has, suggests what it thinks the lines are, and writes only to
 * their own workspace.
 */
import type { Item, Uom } from '@/lib/domain/types'
import { issueId, suggestCode } from '@/lib/workspace/defaults'
import { buildItem, buildVendor, findVendorByName } from '@/lib/workspace/records'
import { addField, fieldsFor, setValue, setValues } from '@/lib/workspace/fields'
import type { FieldKind, ImportUndo, Workspace } from '@/lib/workspace/types'
import { learnAlias } from './alias'
import type { SupplierDoc } from './types'

/**
 * How long a supplier takes, when the document does not say.
 *
 * Quotations frequently give a delivery time in prose the reader cannot parse
 * ("10-14 days ex-works"), and a zero here would mean "arrives the same day" to
 * every screen that reads it — which is a worse lie than a conservative guess
 * the owner can correct on the supplier form.
 */
const DEFAULT_LEAD_DAYS = 7

/** Payment terms for a supplier this approval is inventing. */
const DEFAULT_TERMS_DAYS = 30

export interface ApprovalLine {
  /** the supplier's wording, which is what an alias gets written against */
  raw: string
  /** '' means leave this line out */
  itemId: string
  rate: number
  qty?: number
  /** what the document's own columns held on this line, by heading */
  extras?: Record<string, string>
  /** bring this wording into the item master — off unless the owner ticked it */
  creates?: boolean
  newName?: string
  newUom?: Uom
  /** remember this wording for this supplier, next time */
  learn?: boolean
}

export interface Approval {
  doc: SupplierDoc
  /** an existing supplier… */
  vendorId?: string
  /** …or the name of one to create */
  vendorName: string
  vendorType?: string
  contact?: { phone?: string; email?: string }
  custom?: Record<string, string>
  termsDays?: number
  /**
   * Columns off the document the owner chose to keep.
   *
   * The same offer the spreadsheet import makes at its mapping step, from a
   * PDF instead — and it goes through the same `addField`, so a column
   * invented here is an ordinary column afterwards. Only what is listed is
   * created: a heading the owner left unticked is read and forgotten.
   */
  columns?: { label: string; kind: FieldKind }[]
  lines: ApprovalLine[]
  /** who is accepting, for the alias trail */
  actor: string
  today: string
}

/* ------------------------------------------------------------------- plan -- */

export interface ApprovalPlan {
  vendor: { status: 'new' | 'existing'; name: string }
  /**
   * Lines that will become quotes.
   *
   * It counted rates until the sourcing desk grew a quotes list. What a
   * supplier sends is a quotation, and approving it records what they said —
   * accepting one of those quotes is the separate act that makes it a rate you
   * are comparing suppliers on. Two suppliers' quotations for the same material
   * now sit side by side before anything is committed to.
   */
  quotesMade: number
  itemsCreated: number
  aliasesLearned: number
  /** columns that would be created, which is never more than was offered */
  columnsAdded: number
  skipped: { raw: string; reason: string }[]
}

/**
 * What approving would do, without doing it.
 *
 * The screen renders this and the button then calls `applyApproval` on the same
 * input, so the two cannot disagree.
 */
export function planApproval(ws: Workspace, a: Approval): ApprovalPlan {
  const existing = a.vendorId
    ? ws.vendors.find((v) => v.id === a.vendorId)
    : findVendorByName(ws, a.vendorName)

  const skipped: { raw: string; reason: string }[] = []
  let quotesMade = 0
  let itemsCreated = 0
  let aliasesLearned = 0

  for (const l of a.lines) {
    const makes = l.creates && (l.newName ?? '').trim().length > 1
    if (!l.itemId && !makes) {
      skipped.push({ raw: l.raw, reason: 'no material chosen' })
      continue
    }
    if (!(l.rate > 0)) {
      skipped.push({ raw: l.raw, reason: 'no rate on the line' })
      continue
    }
    if (makes) itemsCreated += 1
    quotesMade += 1
    if (l.learn) aliasesLearned += 1
  }

  /* a heading already on the quotes list is filled, not created again */
  const known = new Set(
    fieldsFor(ws, 'quote').map((f) => f.label.trim().toLowerCase()),
  )
  const columnsAdded = (a.columns ?? [])
    .filter((c) => !known.has(c.label.trim().toLowerCase())).length

  return {
    vendor: { status: existing ? 'existing' : 'new', name: existing?.name ?? a.vendorName.trim() },
    quotesMade, itemsCreated, aliasesLearned, columnsAdded, skipped,
  }
}

/* ------------------------------------------------------------------ apply -- */

/**
 * Write it.
 *
 * Called the way `ImportDialog` calls `applyImport` — computed once, then
 * handed to `update` as a value. A closure that did the work inside the reducer
 * would run twice under StrictMode and issue every id twice with it.
 *
 * The undo it returns goes on `ws.lastImport`, which is what makes the Undo
 * button already on the Suppliers screen light up for an approved document with
 * no new UI at all.
 */
export function applyApproval(ws: Workspace, a: Approval): { ws: Workspace; undo: ImportUndo } {
  let w = ws
  const created: string[] = []
  const aliasesCreated: { vendorId: string; raw: string }[] = []
  const fieldsCreated: string[] = []
  const sideBefore: ImportUndo['sideBefore'] = []
  const cells: [string, string, string][] = []

  /* -------- the supplier -------- */

  const existing = a.vendorId
    ? w.vendors.find((v) => v.id === a.vendorId)
    : findVendorByName(w, a.vendorName)

  let vendorId: string
  if (existing) {
    vendorId = existing.id
  } else {
    const [next, id] = issueId(w, 'VN')
    w = {
      ...next,
      vendors: [...next.vendors, buildVendor({
        id, name: a.vendorName, paymentTermsDays: a.termsDays ?? DEFAULT_TERMS_DAYS,
      })],
    }
    vendorId = id
    created.push(id)
  }

  if (a.vendorType && !existing) {
    sideBefore.push({ map: 'vendorType', id: vendorId, before: null })
    w = { ...w, vendorType: { ...w.vendorType, [vendorId]: a.vendorType } }
  }

  /*
   * Contact details only for a supplier this approval invented. `undoImport`
   * clears contacts for ids it created and no others, so writing a phone number
   * onto somebody's existing supplier record would not be undoable — a closed
   * loop rather than an omission.
   */
  if (!existing && (a.contact?.phone || a.contact?.email)) {
    w = { ...w, vendorContact: { ...w.vendorContact, [vendorId]: { ...a.contact } } }
  }

  if (!existing && a.custom && Object.keys(a.custom).length > 0) {
    for (const [fieldId, value] of Object.entries(a.custom)) {
      cells.push([vendorId, fieldId, w.custom[vendorId]?.[fieldId] ?? ''])
    }
    w = setValues(w, vendorId, a.custom)
  }

  /* -------- the columns the document brought with it -------- */

  /*
   * Created first, so that every line below writes into a field that exists.
   * A heading already on the quotes list is reused rather than duplicated —
   * two columns both called "HSN code" is a mess somebody then sorts out by
   * hand, and the second one would hold half the values.
   */
  const fieldByLabel = new Map<string, string>()
  for (const f of fieldsFor(w, 'quote')) fieldByLabel.set(f.label.trim().toLowerCase(), f.id)

  for (const col of a.columns ?? []) {
    const key = col.label.trim().toLowerCase()
    if (key === '' || fieldByLabel.has(key)) continue
    const made = addField(w, { entity: 'quote', label: col.label.trim(), kind: col.kind })
    w = made.ws
    fieldsCreated.push(made.id)
    fieldByLabel.set(key, made.id)
  }

  /* -------- the lines -------- */

  const plan = planApproval(ws, a)
  const skip = new Set(plan.skipped.map((s) => s.raw))

  for (const l of a.lines) {
    if (skip.has(l.raw)) continue

    let itemId = l.itemId
    if (l.creates && (l.newName ?? '').trim().length > 1) {
      const [next, id] = issueId(w, 'IT')
      /*
       * Everything this build would otherwise compute is left at zero. A
       * reorder point invented from a supplier's quotation is a number somebody
       * would act on, and nobody has measured what this factory uses in a day.
       * The same reasoning `applyImport` gives for its own created materials.
       */
      w = {
        ...next,
        items: [...next.items, buildItem(next, {
          id,
          name: (l.newName ?? '').trim(),
          code: suggestCode((l.newName ?? '').trim(), next.items),
          uom: l.newUom ?? 'nos',
          moq: 0, daily: 0, cushionDays: 0,
          // not a purchase price: nothing has been agreed, let alone bought.
          // `acceptQuote` back-fills it when the owner takes the price.
          lastPurchaseRate: 0,
        })],
      }
      itemId = id
      created.push(id)
    }

    /*
     * A quote, not a rate.
     *
     * This used to write straight into `vendorItems`, which said that a
     * document arriving in the inbox had settled what a material costs. It had
     * not: they quoted, and the owner decides. Accepting one of these — on the
     * Quotes screen, one press — is what writes the rate, and until then two
     * suppliers' quotations for the same material sit side by side.
     *
     * The quantity the document quoted for is deliberately not carried onto the
     * quote as a minimum order. `Quote.moq` is the floor a supplier will sell
     * at, and a line reading "12 MT" is usually what somebody asked about. It
     * is not lost either way — the document keeps its own lines.
     */
    const [next, id] = issueId(w, 'QT')
    w = {
      ...next,
      quotes: [...next.quotes, {
        id,
        vendorId,
        itemId,
        unitPrice: l.rate,
        moq: 0,
        leadDays: DEFAULT_LEAD_DAYS,
        ref: a.doc.docNo,
        state: 'received' as const,
        on: a.doc.receivedAt || a.today,
      }],
    }
    created.push(id)

    /* and whatever the document's own columns said on this line */
    for (const [label, value] of Object.entries(l.extras ?? {})) {
      const fieldId = fieldByLabel.get(label.trim().toLowerCase())
      if (!fieldId || value.trim() === '') continue
      cells.push([id, fieldId, ''])
      w = setValue(w, id, fieldId, value.trim())
    }

    if (l.learn && itemId) {
      w = learnAlias(w, {
        vendorId, raw: l.raw, itemId, confirmedBy: a.actor, confirmedAt: a.today,
      })
      aliasesCreated.push({ vendorId, raw: l.raw })
    }
  }

  /* -------- the document -------- */

  const undo: ImportUndo = {
    /*
     * Its own shape, and not the import's `IMP-${today}-${counts}` — two
     * approvals in one day would collide there, and `doc.appliedUndoId` has to
     * mean exactly one thing for the Documents screen to say "this can still be
     * put back" truthfully rather than hopefully.
     */
    id: `INT-${a.doc.id}-${a.today}`,
    entity: 'supplier',
    at: a.today,
    source: a.doc.fileName,
    created,
    updated: [],
    sideBefore,
    aliasesCreated,
    docApproved: a.doc.id,
    cells,
    fieldsCreated,
    /*
     * Everything an approval writes is new — a supplier, some materials, a
     * quote per line — so nothing is overwritten and nothing has a "before".
     * `vendorItemsBefore` and `itemRatesBefore` were needed while this wrote
     * rates directly; `acceptQuote` is where a rate is overwritten now, and
     * that is one press the owner can reverse by looking at it.
     */
    added: created.length,
    changed: 0,
  }

  const doc: SupplierDoc = {
    ...a.doc,
    vendorId,
    vendorName: existing?.name ?? a.vendorName.trim(),
    status: 'approved',
    appliedUndoId: undo.id,
    lines: a.doc.lines.map((line) => {
      const decided = a.lines.find((l) => l.raw === line.raw)
      if (!decided || skip.has(line.raw)) return { ...line, decision: 'rejected' as const }
      return { ...line, decision: 'accepted' as const, itemId: decided.itemId || line.itemId }
    }),
  }

  w = {
    ...w,
    docs: w.docs.some((d) => d.id === doc.id)
      ? w.docs.map((d) => (d.id === doc.id ? doc : d))
      : [doc, ...w.docs],
    lastImport: undo,
  }

  return { ws: w, undo }
}

/** Whether an approved document's undo is still the one that would be reversed. */
export const stillUndoable = (ws: Workspace, doc: SupplierDoc): boolean =>
  Boolean(doc.appliedUndoId && ws.lastImport?.id === doc.appliedUndoId)

/** A material's name, for a line the owner has mapped. */
export const nameOf = (items: Item[], id?: string): string =>
  items.find((i) => i.id === id)?.name ?? ''
