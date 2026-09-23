/**
 * Columns the owner controls.
 *
 * Two things live here and they are deliberately separate. A **field** is a
 * piece of information a record can hold — a GST number, a rating. A **view**
 * is how one list's table is arranged: what order the columns sit in, which are
 * hidden, and what each one is called. Renaming a column does not touch the
 * data; deleting a field does.
 *
 * The built-in columns are described here too, in the same shape as the custom
 * ones, so that one dialog can arrange both and the person arranging them never
 * has to care which is which. The screens keep rendering their own cells — a
 * built-in column knows how to draw a status pill and a custom one does not —
 * but the ORDER, the visibility and the heading all come from here.
 */
import type {
  FieldDef, FieldKind, SheetEntity, TableView, Workspace,
} from './types'

/* ------------------------------------------------------ built-in columns -- */

export interface BuiltinColumn {
  key: string
  label: string
  /** what an import would have to write to fill it; absent means derived */
  kind?: FieldKind
  /** other names a sheet might use for it */
  aliases?: string[]
  /** a row without this is not a row — it can never be hidden or unmatched */
  identity?: boolean
  /** computed from other records, so an import cannot set it */
  derived?: boolean
}

/**
 * The columns each list ships with.
 *
 * `derived` matters: "Supplies" counts a supplier's rates and "Back" counts the
 * quotes against a request. Offering those as import targets would invite
 * somebody to type a number the system recomputes a moment later.
 */
export const BUILTIN: Record<SheetEntity, BuiltinColumn[]> = {
  supplier: [
    { key: 'name', label: 'Supplier', kind: 'text', identity: true, aliases: ['name', 'supplier name', 'vendor', 'party'] },
    { key: 'type', label: 'Type', kind: 'choice', aliases: ['supplier type', 'category', 'vendor type'] },
    { key: 'supplies', label: 'Supplies', derived: true },
    { key: 'lead', label: 'Lead time', derived: true },
    { key: 'terms', label: 'Payment', kind: 'number', aliases: ['payment terms', 'terms', 'credit days', 'payment days'] },
    { key: 'open', label: 'Open orders', derived: true },
    { key: 'phone', label: 'Phone', kind: 'text', aliases: ['mobile', 'whatsapp', 'contact number', 'phone number'] },
    { key: 'email', label: 'Email', kind: 'text', aliases: ['e-mail', 'mail', 'email id'] },
  ],
  material: [
    { key: 'code', label: 'Code', kind: 'text', aliases: ['item code', 'part number', 'sku', 'material code'] },
    { key: 'name', label: 'Material', kind: 'text', identity: true, aliases: ['item', 'description', 'material name', 'part'] },
    { key: 'group', label: 'Group', kind: 'choice', aliases: ['category', 'material group', 'family'] },
    { key: 'uom', label: 'Bought in', kind: 'text', aliases: ['unit', 'uom', 'units', 'measure'] },
    { key: 'rate', label: 'Last paid', kind: 'number', aliases: ['rate', 'price', 'cost', 'last rate'] },
    { key: 'onHand', label: 'On hand', kind: 'number', aliases: ['stock', 'quantity', 'qty', 'balance'] },
    { key: 'suppliers', label: 'Suppliers', derived: true },
  ],
  rfq: [
    { key: 'no', label: 'Request', identity: true, derived: true },
    { key: 'state', label: 'Status', kind: 'choice', aliases: ['status'] },
    { key: 'item', label: 'Material', kind: 'text', aliases: ['material', 'item', 'part'] },
    { key: 'asked', label: 'Asked', derived: true },
    { key: 'qty', label: 'Qty', kind: 'number', aliases: ['quantity', 'qty', 'how much'] },
    { key: 'back', label: 'Back', derived: true },
    { key: 'needed', label: 'Needed by', kind: 'date', aliases: ['needed by', 'required by', 'due', 'delivery date'] },
  ],
  /*
   * A quote names two records that must already exist — who quoted, and for
   * what — so both are identity columns and neither can be hidden. The state
   * carries no `kind`, which is what keeps it off the import's target list:
   * accepting a quote writes a rate and turns its rivals down, and a
   * spreadsheet cell reading "Accepted" must not do any of that quietly.
   */
  quote: [
    { key: 'supplier', label: 'Supplier', kind: 'text', identity: true, aliases: ['name', 'vendor', 'party', 'supplier name', 'quoted by'] },
    { key: 'item', label: 'Material', kind: 'text', identity: true, aliases: ['material', 'item', 'part', 'description'] },
    { key: 'state', label: 'Status' },
    { key: 'price', label: 'Price', kind: 'number', aliases: ['rate', 'unit price', 'quoted rate', 'amount', 'price per unit'] },
    { key: 'moq', label: 'Smallest order', kind: 'number', aliases: ['moq', 'minimum', 'min order', 'minimum quantity'] },
    { key: 'lead', label: 'Takes', kind: 'number', aliases: ['lead time', 'lead days', 'delivery days', 'days'] },
    { key: 'ref', label: 'Their reference', kind: 'text', aliases: ['reference', 'quotation no', 'quote no', 'quotation number'] },
    { key: 'on', label: 'Quoted on', kind: 'date', aliases: ['date', 'quoted on', 'quotation date'] },
    { key: 'valid', label: 'Valid until', kind: 'date', aliases: ['valid until', 'valid upto', 'validity', 'expires'] },
    { key: 'rfq', label: 'Against', derived: true },
  ],
  /*
   * The order number is issued here, never read from a sheet — two orders
   * carrying the same number is a thing nobody can untangle afterwards. The
   * status is importable, unlike a quote's: marking an order shipped has no
   * consequences beyond saying so.
   */
  order: [
    { key: 'no', label: 'Order', identity: true, derived: true },
    { key: 'state', label: 'Status', kind: 'choice', aliases: ['status'] },
    { key: 'vendor', label: 'Supplier', kind: 'text', aliases: ['name', 'supplier name', 'vendor', 'party'] },
    { key: 'item', label: 'Material', kind: 'text', aliases: ['material', 'item', 'part', 'description'] },
    { key: 'qty', label: 'Qty', kind: 'number', aliases: ['quantity', 'qty', 'how much'] },
    { key: 'rate', label: 'Rate', kind: 'number', aliases: ['unit price', 'agreed rate', 'price', 'rate per unit'] },
    { key: 'total', label: 'Total', derived: true },
    /*
     * What has actually turned up against the line. Derived, because it is the
     * sum of the receipts and a sheet must not be allowed to claim a delivery
     * that was never recorded.
     */
    { key: 'received', label: 'Received', derived: true },
    { key: 'ordered', label: 'Ordered', kind: 'date', aliases: ['ordered on', 'order date', 'po date'] },
    { key: 'expected', label: 'Expected', kind: 'date', aliases: ['expected on', 'due', 'delivery date', 'promised'] },
  ],
  /*
   * A check names the material it is for and says what it checks, so both are
   * identity columns. Most factories already keep this as a sheet — the
   * incoming-inspection list pinned by the gate — which is why it is the one
   * inbound list that imports.
   */
  check: [
    { key: 'item', label: 'Material', kind: 'text', identity: true, aliases: ['material', 'item', 'part', 'description'] },
    { key: 'label', label: 'Check', kind: 'text', identity: true, aliases: ['check', 'parameter', 'characteristic', 'inspection', 'test'] },
    { key: 'kind', label: 'How', kind: 'choice', aliases: ['type', 'check type', 'method'] },
    { key: 'min', label: 'From', kind: 'number', aliases: ['min', 'minimum', 'lower limit', 'lsl', 'low'] },
    { key: 'max', label: 'To', kind: 'number', aliases: ['max', 'maximum', 'upper limit', 'usl', 'high'] },
    { key: 'unit', label: 'Unit', kind: 'text', aliases: ['uom', 'units', 'measured in'] },
    { key: 'bucket', label: 'If it fails', kind: 'choice', aliases: ['on failure', 'fail bucket', 'disposition', 'goes to'] },
    { key: 'reason', label: 'Reason', kind: 'text', aliases: ['fail reason', 'why', 'rejection reason'] },
    { key: 'mandatory', label: 'Must be marked', kind: 'yesno', aliases: ['mandatory', 'required', 'compulsory', 'must'] },
  ],
  /*
   * Receipts and challans are records of things that happened at the gate and
   * on the road, so none of their columns is importable — a spreadsheet row
   * saying forty kilos arrived and passed would put stock on the shelf that
   * nobody inspected. They carry columns for arranging and exporting only.
   */
  receipt: [
    { key: 'id', label: 'Receipt', identity: true, derived: true },
    { key: 'state', label: 'Status', derived: true },
    { key: 'vendor', label: 'From', derived: true },
    { key: 'item', label: 'Material', derived: true },
    { key: 'against', label: 'Against', derived: true },
    { key: 'qty', label: 'Arrived', derived: true },
    { key: 'accepted', label: 'Accepted', derived: true },
    { key: 'rejected', label: 'Rejected', derived: true },
    { key: 'failed', label: 'Checks failed', derived: true },
    { key: 'received', label: 'Arrived on', derived: true },
    { key: 'inspector', label: 'Inspected by', derived: true },
  ],
  challan: [
    { key: 'no', label: 'Challan', identity: true, derived: true },
    { key: 'state', label: 'Status', derived: true },
    { key: 'vendor', label: 'Jobworker', derived: true },
    { key: 'item', label: 'Material', derived: true },
    { key: 'process', label: 'Process', derived: true },
    { key: 'sent', label: 'Sent', derived: true },
    { key: 'sentOn', label: 'Sent on', derived: true },
    { key: 'dueBack', label: 'Due back', derived: true },
    { key: 'back', label: 'Back', derived: true },
    { key: 'out', label: 'Still there', derived: true },
  ],
}

export const EMPTY_VIEW: TableView = { order: [], hidden: [], labels: {} }

export const EMPTY_VIEWS: Record<SheetEntity, TableView> = {
  supplier: EMPTY_VIEW,
  material: EMPTY_VIEW,
  rfq: EMPTY_VIEW,
  quote: EMPTY_VIEW,
  order: EMPTY_VIEW,
  check: EMPTY_VIEW,
  receipt: EMPTY_VIEW,
  challan: EMPTY_VIEW,
}

/**
 * Columns that are hidden until somebody fills them.
 *
 * Phone and email exist so a request can be handed to a supplier, but a brand
 * new company has neither, and two empty columns on the first screen somebody
 * sees is exactly the clutter this desk was rebuilt to remove. They appear the
 * moment any supplier has one — or the moment the owner shows them by hand.
 */
const HIDDEN_UNTIL_USED: Record<string, (ws: Workspace) => boolean> = {
  phone: (ws) => Object.values(ws.vendorContact ?? {}).some((c) => Boolean(c?.phone)),
  email: (ws) => Object.values(ws.vendorContact ?? {}).some((c) => Boolean(c?.email)),
  // most quotes arrive on WhatsApp with no reference number on them at all
  ref: (ws) => (ws.quotes ?? []).some((q) => Boolean(q.ref)),
  /*
   * And most quotations name no minimum order. A six-line quotation showing
   * "Smallest order —" six times is the same clutter as an empty phone
   * column, on the screen where there is least room for it.
   */
  moq: (ws) => (ws.quotes ?? []).some((q) => q.lines.some((l) => l.moq > 0)),
}

/* -------------------------------------------------------------- reading -- */

export const fieldsFor = (ws: Workspace, entity: SheetEntity): FieldDef[] =>
  (ws.fields ?? []).filter((f) => f.entity === entity)

export const fieldById = (ws: Workspace, id: string): FieldDef | undefined =>
  (ws.fields ?? []).find((f) => f.id === id)

/** What one record holds in one field. Never undefined — an empty cell is ''. */
export const valueOf = (ws: Workspace, recordId: string, fieldId: string): string =>
  ws.custom?.[recordId]?.[fieldId] ?? ''

/** How many records carry a value here — what a delete has to say out loud. */
export function filledCount(ws: Workspace, fieldId: string): number {
  return Object.values(ws.custom ?? {}).filter((row) => (row?.[fieldId] ?? '') !== '').length
}

export interface ResolvedColumn {
  key: string
  label: string
  /** absent for a built-in column */
  field?: FieldDef
  builtin?: BuiltinColumn
  hidden: boolean
  identity: boolean
}

/**
 * Every column for a list, in the owner's order, headings resolved.
 *
 * Built-ins the view has never heard of are appended in their declared order
 * rather than dropped, so a column added to the build in a later release shows
 * up for somebody who arranged their table last month. Entries in the view that
 * no longer exist — a deleted field — fall away on their own.
 */
export function resolveColumns(ws: Workspace, entity: SheetEntity): ResolvedColumn[] {
  const view = ws.views?.[entity] ?? EMPTY_VIEW
  const builtins = BUILTIN[entity]
  const fields = fieldsFor(ws, entity)

  const byKey = new Map<string, ResolvedColumn>()
  for (const b of builtins) {
    const auto = HIDDEN_UNTIL_USED[b.key]
    byKey.set(b.key, {
      key: b.key,
      label: view.labels?.[b.key] ?? b.label,
      builtin: b,
      // a column nobody has decided about is left to the rule; one somebody
      // has decided about is in `hidden` or in `shown`, and the rule is over
      hidden: (view.hidden ?? []).includes(b.key)
        || (auto !== undefined && !(view.shown ?? []).includes(b.key) && !auto(ws)),
      identity: Boolean(b.identity),
    })
  }
  for (const f of fields) {
    byKey.set(f.id, {
      key: f.id,
      label: view.labels?.[f.id] ?? f.label,
      field: f,
      hidden: (view.hidden ?? []).includes(f.id),
      identity: false,
    })
  }

  const ordered: ResolvedColumn[] = []
  const seen = new Set<string>()
  for (const key of view.order ?? []) {
    const col = byKey.get(key)
    if (col && !seen.has(key)) { ordered.push(col); seen.add(key) }
  }
  for (const [key, col] of byKey) {
    if (!seen.has(key)) { ordered.push(col); seen.add(key) }
  }
  return ordered
}

export const visibleColumns = (ws: Workspace, entity: SheetEntity): ResolvedColumn[] =>
  resolveColumns(ws, entity).filter((c) => !c.hidden || c.identity)

/* -------------------------------------------------------------- writing -- */

/** Field ids are their own sequence, so one per workspace rather than per list. */
export function nextFieldId(ws: Workspace): string {
  const highest = (ws.fields ?? []).reduce((max, f) => {
    const m = /^CF-(\d+)$/.exec(f.id)
    return m ? Math.max(max, Number(m[1])) : max
  }, 0)
  return `CF-${String(highest + 1).padStart(3, '0')}`
}

export function addField(ws: Workspace, def: Omit<FieldDef, 'id'>): { ws: Workspace; id: string } {
  const id = nextFieldId(ws)
  const view = ws.views?.[def.entity] ?? EMPTY_VIEW
  // a new column goes at the end of wherever things have been arranged, which
  // means writing out the current arrangement the first time
  const { order, hidden } = pin(ws, def.entity)
  return {
    id,
    ws: {
      ...ws,
      fields: [...(ws.fields ?? []), { ...def, id }],
      views: {
        ...ws.views,
        [def.entity]: { ...view, order: [...order, id], hidden },
      },
    },
  }
}

export function updateField(ws: Workspace, id: string, patch: Partial<FieldDef>): Workspace {
  return { ...ws, fields: (ws.fields ?? []).map((f) => (f.id === id ? { ...f, ...patch, id } : f)) }
}

/** Removing a field takes its values with it — they cannot mean anything alone. */
export function removeField(ws: Workspace, id: string): Workspace {
  const custom: Record<string, Record<string, string>> = {}
  for (const [recordId, row] of Object.entries(ws.custom ?? {})) {
    const { [id]: _gone, ...rest } = row
    if (Object.keys(rest).length > 0) custom[recordId] = rest
  }
  const views = { ...ws.views } as Record<SheetEntity, TableView>
  for (const entity of Object.keys(views) as SheetEntity[]) {
    const v = views[entity]
    views[entity] = {
      order: (v.order ?? []).filter((k) => k !== id),
      hidden: (v.hidden ?? []).filter((k) => k !== id),
      shown: (v.shown ?? []).filter((k) => k !== id),
      labels: Object.fromEntries(Object.entries(v.labels ?? {}).filter(([k]) => k !== id)),
    }
  }
  return { ...ws, fields: (ws.fields ?? []).filter((f) => f.id !== id), custom, views }
}

export function setValue(ws: Workspace, recordId: string, fieldId: string, value: string): Workspace {
  const row = { ...(ws.custom?.[recordId] ?? {}) }
  if (value === '') delete row[fieldId]
  else row[fieldId] = value

  const custom = { ...(ws.custom ?? {}) }
  if (Object.keys(row).length === 0) delete custom[recordId]
  else custom[recordId] = row
  return { ...ws, custom }
}

export function setValues(ws: Workspace, recordId: string, values: Record<string, string>): Workspace {
  return Object.entries(values).reduce((acc, [fieldId, v]) => setValue(acc, recordId, fieldId, v), ws)
}

/* ---------------------------------------------------------------- views -- */

function writeView(ws: Workspace, entity: SheetEntity, patch: Partial<TableView>): Workspace {
  const current = ws.views?.[entity] ?? EMPTY_VIEW
  return { ...ws, views: { ...ws.views, [entity]: { ...current, ...patch } } }
}

/**
 * The arrangement as it stands, written down.
 *
 * Needed the moment anything is changed, because a partial order means
 * nothing. What it deliberately does NOT write down is the until-used rule's
 * current answer: only the columns somebody has actually decided about go into
 * `hidden`, and a column still governed by the rule is left to it.
 *
 * It used to capture the rule's answer as well, which read as careful and was
 * wrong. Inventing a column during an import pinned Phone, Email and the
 * quotation reference shut at the instant before the rows arrived — so a sheet
 * carrying a phone number for every supplier imported perfectly and showed
 * none of them, for ever.
 */
function pin(ws: Workspace, entity: SheetEntity): Pick<TableView, 'order' | 'hidden'> {
  const view = ws.views?.[entity] ?? EMPTY_VIEW
  if (view.order?.length) return { order: view.order, hidden: view.hidden ?? [] }
  return {
    order: resolveColumns(ws, entity).map((c) => c.key),
    hidden: view.hidden ?? [],
  }
}

/** Moving a column writes the whole order out, since a partial one means nothing. */
export function moveColumn(ws: Workspace, entity: SheetEntity, key: string, by: -1 | 1): Workspace {
  const { order, hidden } = pin(ws, entity)
  const at = order.indexOf(key)
  const to = at + by
  if (at < 0 || to < 0 || to >= order.length) return ws
  const next = [...order]
  ;[next[at], next[to]] = [next[to], next[at]]
  return writeView(ws, entity, { order: next, hidden })
}

/**
 * Hiding or showing a column is a decision, and is recorded as one.
 *
 * Both lists are kept because a column with an until-used rule needs three
 * answers, not two. Showing one has to survive the rule wanting to hide it
 * again — somebody who un-hides Phone before entering any phone numbers meant
 * it — and hiding one has to survive the rule wanting to show it.
 */
export function setHidden(ws: Workspace, entity: SheetEntity, key: string, hidden: boolean): Workspace {
  const view = ws.views?.[entity] ?? EMPTY_VIEW
  const pinned = pin(ws, entity)
  const off = new Set(pinned.hidden)
  const on = new Set(view.shown ?? [])
  if (hidden) { off.add(key); on.delete(key) } else { off.delete(key); on.add(key) }
  return writeView(ws, entity, { order: pinned.order, hidden: [...off], shown: [...on] })
}

/** Renaming to the built-in name clears the override rather than pinning it. */
export function renameColumn(ws: Workspace, entity: SheetEntity, key: string, label: string): Workspace {
  const view = ws.views?.[entity] ?? EMPTY_VIEW
  const trimmed = label.trim()
  const original = BUILTIN[entity].find((b) => b.key === key)?.label
  const labels = { ...(view.labels ?? {}) }

  if (trimmed === '' || trimmed === original) delete labels[key]
  else labels[key] = trimmed

  // a custom field's own label follows, so the import and the form agree
  const field = fieldById(ws, key)
  const renamed = field && trimmed !== '' ? updateField(ws, key, { label: trimmed }) : ws
  return writeView(renamed, entity, { labels })
}

/* -------------------------------------------------------------- tidying -- */

/**
 * Drop custom values whose record has gone.
 *
 * Called after every cascade delete rather than filtered at each site, because
 * the cascades are transitive — deleting a material also deletes the requests
 * for it — and a filter per site would have to know that. Keeping only the keys
 * that still name something is shorter, cannot miss a path, and tidies anything
 * an earlier version leaked.
 */
export function pruneCustom(ws: Workspace): Workspace {
  const live = new Set<string>([
    ...ws.vendors.map((v) => v.id),
    ...ws.items.map((i) => i.id),
    ...ws.rfqs.map((r) => r.id),
    /*
     * A quotation's LINES, not the quotation. The owner's own columns hang off
     * a material — an HSN code belongs to the sheet steel, not to the piece of
     * paper six materials arrived on — so a line id is what `custom` is keyed
     * by. The quotation id is kept too, so a value written against one before
     * quotations had lines is not thrown away by a prune.
     */
    ...ws.quotes.map((q) => q.id),
    ...ws.quotes.flatMap((q) => q.lines.map((l) => l.id)),
    ...ws.orders.map((o) => o.id),
    ...(ws.specChecks ?? []).map((c) => c.id),
    ...(ws.receipts ?? []).map((r) => r.id),
    ...(ws.challans ?? []).map((c) => c.id),
  ])
  const custom: Record<string, Record<string, string>> = {}
  for (const [id, row] of Object.entries(ws.custom ?? {})) {
    if (live.has(id)) custom[id] = row
  }
  const contact: Record<string, { email?: string; phone?: string }> = {}
  for (const [id, c] of Object.entries(ws.vendorContact ?? {})) {
    if (live.has(id)) contact[id] = c
  }
  return {
    ...ws,
    custom,
    vendorContact: contact,
    /*
     * A send entry names a request by id, or an order by NUMBER — several
     * lines are one document. So only the request case can be checked against
     * live ids; an order's number is checked against the orders themselves.
     */
    sendLog: (ws.sendLog ?? []).filter((s) => live.has(s.vendorId)
      && (s.kind === 'po' ? ws.orders.some((o) => o.no === s.id) : live.has(s.id))),
  }
}
