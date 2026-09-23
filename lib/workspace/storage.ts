/**
 * Where a workspace is kept.
 *
 * This is the seam. Today it is the browser's own storage, so an owner can sign
 * in, set their sourcing up and come back to it tomorrow without anything
 * leaving their machine — which is also the only safe arrangement while the
 * demo sits on a public URL with no deployment password. The brief's stack puts
 * Supabase here eventually; when it does, only this file changes, because every
 * screen reads the workspace through the provider rather than through storage.
 *
 * Every access is wrapped. Storage throws in a private window, in an iframe
 * with third-party cookies blocked, and when a quota is full, and a company's
 * set-up screen must not be the thing that breaks because of it.
 */
import { DEFAULT_POLICY } from '@/lib/domain/policy'
import type { Item, SpecCheck, Vendor } from '@/lib/domain/types'
import { highestIssued } from './defaults'
import { lotDate, openingMovesFor } from './ledger'
import { SCHEMA } from './types'
import type {
  Challan, RateChange,
  FieldDef, GoodsReceipt, PurchaseOrder, Quote, QuoteLine, QuoteState, Rfq, SendEntry, Session,
  TableView, Workspace, WorkspaceMode,
  IssueSlip, Job, Rack, StockMove, Transfer, WsCount, WsCut, WsLoss, WsLot,
} from './types'
import type { SupplierDoc, VendorAlias } from '@/lib/intake/types'

const KEY = 'msme.workspace.v1'

export interface Stored {
  workspace: Workspace
  session: Session
  /**
   * Which company was on screen. Somebody who goes to look at the sample and
   * then follows a link should still be looking at the sample — snapping them
   * back to their own data mid-browse reads as the app losing their place.
   */
  mode?: WorkspaceMode
  /**
   * When this browser last wrote. Compared against the database's own
   * `updated_at` to settle which copy is newer when somebody signs in on a
   * second device — see `resolve` in `remote.ts`. Absent on anything saved
   * before syncing existed, which that function treats as the older copy.
   */
  savedAt?: string
}

export interface WorkspaceStore {
  load(): Stored | null
  save(s: Stored): boolean
  clear(): void
}

/** Server render, or a browser that refuses storage: nothing is remembered. */
const memoryStore = (): WorkspaceStore => {
  let held: Stored | null = null
  return {
    load: () => held,
    save: (s) => { held = { ...s, savedAt: new Date().toISOString() }; return true },
    clear: () => { held = null },
  }
}

function usable(): Storage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null
    const probe = `${KEY}.probe`
    window.localStorage.setItem(probe, '1')
    window.localStorage.removeItem(probe)
    return window.localStorage
  } catch {
    return null
  }
}

/**
 * A stored value that no longer parses is treated as absent rather than fatal.
 * The owner lands on the sign-in screen and starts again, which is a bad day;
 * a white screen they cannot get past would be a worse one.
 */
export function parseStored(raw: string | null): Stored | null {
  if (!raw) return null
  try {
    const v = JSON.parse(raw) as Partial<Stored>
    const ws = v?.workspace
    if (!ws || typeof ws !== 'object') return null
    if (typeof ws.id !== 'string' || !ws.company || typeof ws.company.name !== 'string') return null
    if (!Array.isArray(ws.items) || !Array.isArray(ws.vendors)) return null
    if (!v.session || typeof v.session.actor !== 'string') return null
    return { ...v, workspace: migrate(ws as Partial<Workspace>) } as Stored
  } catch {
    return null
  }
}

/**
 * A quote as it was saved before a quotation became one record.
 *
 * One material per row: `itemId`, `unitPrice`, `moq`, `leadDays` and a `state`
 * sat on the quote itself. An uploaded quotation pricing six materials wrote
 * six of these.
 */
type LooseQuote = Quote & {
  itemId?: string
  unitPrice?: number
  moq?: number
  leadDays?: number
  state?: QuoteState
}

/**
 * Six records back into the one quotation they always were.
 *
 * Grouped by the document they were read off, which is exact; failing that by
 * supplier, reference and date, which is what a quotation IS when somebody
 * typed it in. Anything with neither keeps a quotation of its own, because two
 * prices from one supplier on one day with nothing tying them together are as
 * likely to be two conversations as one piece of paper.
 *
 * Line ids are `QT-001/1` and so on, and `remapCells` below moves the owner's
 * own column values onto them — an HSN code was keyed to the old quote and
 * belongs to the material, which is now a line.
 */
function gatherQuotes(loose: LooseQuote[]): Quote[] {
  const out: Quote[] = []
  const at = new Map<string, Quote>()

  for (const q of loose) {
    // already in the new shape: nothing to gather
    if (Array.isArray(q.lines)) { out.push(q); continue }

    const key = q.docId
      ? `doc:${q.docId}`
      : q.ref ? `ref:${q.vendorId}|${q.ref}|${q.on}` : `one:${q.id}`

    const line: QuoteLine = {
      id: '',
      itemId: q.itemId ?? '',
      unitPrice: q.unitPrice ?? 0,
      moq: q.moq ?? 0,
      leadDays: q.leadDays ?? 0,
      state: q.state ?? 'received',
    }

    const held = at.get(key)
    if (held) {
      line.id = `${held.id}/${held.lines.length + 1}`
      held.lines.push(line)
      continue
    }

    const made: Quote = {
      id: q.id,
      rfqId: q.rfqId,
      docId: q.docId,
      vendorId: q.vendorId,
      ref: q.ref,
      validUntil: q.validUntil,
      on: q.on,
      lines: [],
    }
    line.id = `${made.id}/1`
    made.lines.push(line)
    at.set(key, made)
    out.push(made)
  }
  return out
}

/**
 * Where the old quote ids went, so their custom values can follow.
 *
 * A column the owner invented — an HSN code, a pack size — was keyed by quote
 * id and belongs to the material, which is a line now. Without this the values
 * survive against ids nothing points at and `pruneCustom` quietly drops them.
 */
function remapCells(
  loose: LooseQuote[], gathered: Quote[], custom: Record<string, Record<string, string>>,
): Record<string, Record<string, string>> {
  if (loose.every((q) => Array.isArray(q.lines))) return custom

  const lineFor = new Map<string, string>()
  const used = new Map<string, number>()
  for (const q of loose) {
    if (Array.isArray(q.lines)) continue
    const onto = gathered.find((g) => g.id === q.id
      || (g.docId && g.docId === q.docId)
      || (g.ref && g.ref === q.ref && g.vendorId === q.vendorId && g.on === q.on))
    if (!onto) continue
    const n = (used.get(onto.id) ?? 0) + 1
    used.set(onto.id, n)
    lineFor.set(q.id, `${onto.id}/${n}`)
  }

  const next: Record<string, Record<string, string>> = {}
  for (const [id, row] of Object.entries(custom)) next[lineFor.get(id) ?? id] = row
  return next
}

/**
 * A workspace saved before a field existed is not a broken workspace.
 *
 * Somebody who set their company up last week and comes back after an update
 * must not lose it because the build has since grown requests, quotes, custom
 * columns and a send log.
 *
 * Two things about how this is written are deliberate, and both were learned
 * the hard way. It takes a `Partial<Workspace>`, because what comes out of
 * `JSON.parse` is whatever was saved months ago and typing it as a complete
 * `Workspace` is a lie the compiler then enforces against us. And it builds the
 * result key by key with **no spread of the input**, so that adding a field to
 * `Workspace` fails to compile until it is handled here — which is the only
 * thing that makes this file reliable. A spread would have made every new field
 * a silent `undefined` in every existing browser.
 *
 * New fields must never be added to `parseStored`'s guard above. That guard
 * decides whether somebody is signed in at all, and tightening it would sign
 * out every existing owner.
 */
function migrate(raw: Partial<Workspace>): Workspace {
  const list = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])
  const map = <T,>(v: unknown): Record<string, T> =>
    (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, T>) : {})

  const items = list<Item>(raw.items)
  const vendors = list<Vendor>(raw.vendors)
  const rfqs = list<Rfq>(raw.rfqs)
  const wereQuotes = list<LooseQuote>(raw.quotes)
  const quotes = gatherQuotes(wereQuotes)
  const orders = list<PurchaseOrder>(raw.orders)
  const docs = list<SupplierDoc>(raw.docs)
  const receipts = list<GoodsReceipt>(raw.receipts)
  const specChecks = list<SpecCheck>(raw.specChecks)
  const challans = list<Challan>(raw.challans)

  /*
   * The store. Every lot saved before the journal existed gets its date and
   * one opening movement, so Σ movements = quantity from the first load —
   * and because this runs on every load, both are derived rather than
   * issued: a second load finds them already there.
   */
  const createdAt = raw.createdAt ?? ''
  const lotCtx = { receipts, challans, createdAt }
  const stockLots = list<WsLot>(raw.stockLots).map((l) => (l.on ? l : { ...l, on: lotDate(l, lotCtx) }))
  const heldMoves = list<StockMove>(raw.moves)
  const moves = [
    ...heldMoves,
    ...openingMovesFor({ lots: stockLots, moves: heldMoves, ...lotCtx, actor: raw.owner?.name ?? '' }),
  ]
  const racks = list<Rack>(raw.racks)
  const transfers = list<Transfer>(raw.transfers)
  const counts = list<WsCount>(raw.counts)
  const jobs = list<Job>(raw.jobs)
  const issues = list<IssueSlip>(raw.issues)
  const cuts = list<WsCut>(raw.cuts)
  const losses = list<WsLoss>(raw.losses)

  /*
   * The id counter is seeded from what is actually there the first time a blob
   * is read, and only ever moves forward afterwards. Taking the higher of the
   * two matters: a stored counter that somehow trails the data would otherwise
   * start reissuing ids that are already in use.
   */
  const stored = map<number>(raw.nextIds)
  const nextIds: Record<string, number> = { ...stored }
  const seed = (prefix: string, from: { id: string }[]) => {
    nextIds[prefix] = Math.max(stored[prefix] ?? 0, highestIssued(prefix, from))
  }
  seed('VN', vendors)
  seed('IT', items)
  seed('RF', rfqs)
  seed('QT', quotes)
  seed('PO', orders)
  seed('CF', list<FieldDef>(raw.fields))
  seed('SD', docs)
  seed('GR', receipts)
  seed('RC', list<RateChange>(raw.rateLog))
  seed('CK', specChecks)
  seed('JW', challans)
  seed('LOT', stockLots)
  seed('MV', moves)
  seed('RK', racks)
  seed('TR', transfers)
  seed('CC', counts)
  seed('JB', jobs)
  seed('IS', issues)
  seed('CT', cuts)
  seed('LS', losses)

  const view = (v: Partial<TableView> | undefined): TableView => ({
    order: list<string>(v?.order),
    hidden: list<string>(v?.hidden),
    shown: list<string>(v?.shown),
    labels: map<string>(v?.labels),
  })
  const views = map<Partial<TableView>>(raw.views)

  return {
    id: raw.id ?? '',
    createdAt: raw.createdAt ?? '',
    owner: { name: raw.owner?.name ?? '', contact: raw.owner?.contact ?? '' },
    company: {
      name: raw.company?.name ?? '',
      makes: raw.company?.makes ?? '',
      address: raw.company?.address,
      gstin: raw.company?.gstin,
      phone: raw.company?.phone,
      email: raw.company?.email,
    },
    people: list(raw.people),
    categories: {
      supplierType: list(raw.categories?.supplierType),
      materialGroup: list(raw.categories?.materialGroup),
      units: list(raw.categories?.units),
    },
    items,
    vendors,
    vendorItems: list(raw.vendorItems),
    stockLots,
    /*
     * Policy was never migrated, so a workspace saved before it existed loaded
     * with `policy` undefined — and the material form reads
     * `ws.policy.coverageCeiling.B` straight out, which threw the moment
     * somebody clicked "Add a material". Merged rather than replaced so a
     * partial policy keeps whatever the owner did set.
     */
    policy: { ...DEFAULT_POLICY, ...(raw.policy ?? {}) },
    vendorType: map(raw.vendorType),
    itemGroup: map(raw.itemGroup),
    rfqs,
    quotes,
    orders,
    /*
     * Empty on a workspace saved before goods could be recorded arriving, and
     * nothing is lost — there was nothing to lose. What it means going forward
     * is that lead times and rejection rates stop being what somebody typed.
     */
    receipts,
    /*
     * Both empty on anything saved before the inbound stage existed, and
     * nothing is lost. The receipts above need nothing either: one saved
     * without a status reads as closed, which is what it was — recorded as a
     * finished fact, before there was a gate for it to wait at.
     */
    specChecks,
    challans,
    /*
     * Empty on anything saved before rates were logged, which is honest: a
     * price that moved before there was a log is a move nobody recorded, and
     * inventing a history from the current rate would put a straight line
     * through months that were not flat.
     */
    rateLog: list<RateChange>(raw.rateLog),
    fields: list(raw.fields),
    custom: remapCells(wereQuotes, quotes, map(raw.custom)),
    views: {
      supplier: view(views.supplier),
      material: view(views.material),
      rfq: view(views.rfq),
      // a workspace saved before quotes and orders carried columns arrives with
      // neither, which is nothing lost: there was nothing arranged to lose
      quote: view(views.quote),
      order: view(views.order),
      check: view(views.check),
      receipt: view(views.receipt),
      challan: view(views.challan),
      rack: view(views.rack),
      lot: view(views.lot),
      count: view(views.count),
      move: view(views.move),
      job: view(views.job),
      issue: view(views.issue),
    },
    vendorContact: map(raw.vendorContact),
    /*
     * A send entry used to name only a request, as `rfqId`. Orders can be put
     * on paper now, so it carries a kind and an id — and an entry saved before
     * that is a request, which is what it always was.
     */
    sendLog: list<SendEntry & { rfqId?: string }>(raw.sendLog)
      .map((s) => ({ ...s, kind: s.kind ?? 'rfq', id: s.id ?? s.rfqId ?? '' }))
      .filter((s) => s.id !== ''),
    /*
     * Both arrive empty on a workspace saved before supplier documents existed,
     * and nothing is lost — there was nothing to lose. What this must not do is
     * appear in `parseStored`'s guard above: that guard decides whether somebody
     * is signed in at all, and an owner who has never uploaded a document is
     * still very much signed in.
     */
    docs,
    aliases: list<VendorAlias>(raw.aliases),
    lastImport: raw.lastImport,
    nextIds,
    schema: SCHEMA,
    drafts: map(raw.drafts),
    /*
     * Both optional and both meaning something by their absence: nobody has
     * chosen which figures to show, and nobody has waved a comparison through.
     * `undefined` is not the same as an empty one, so neither is defaulted.
     */
    metricPicks: raw.metricPicks,
    reviewedFlips: map<string>(raw.reviewedFlips),
    inboundMetricPicks: raw.inboundMetricPicks,
    /*
     * All empty on anything saved before the store opened, and nothing is
     * lost: the lots above carry what there was, each with its opening line.
     * Whether this company cuts material is left unanswered rather than
     * answered no — the store rules step asks.
     */
    racks,
    moves,
    transfers,
    counts,
    jobs,
    jobNumbering: raw.jobNumbering,
    issues,
    cutting: raw.cutting,
    cuts,
    losses,
    minRemnant: map<number>(raw.minRemnant),
    scrapRate: map<number>(raw.scrapRate),
    inventoryMetricPicks: raw.inventoryMetricPicks,
  }
}

export function browserStore(): WorkspaceStore {
  const ls = usable()
  if (!ls) return memoryStore()
  return {
    load: () => {
      try {
        return parseStored(ls.getItem(KEY))
      } catch {
        return null
      }
    },
    save: (s) => {
      try {
        // stamped here rather than by the caller, so every write carries one
        ls.setItem(KEY, JSON.stringify({ ...s, savedAt: new Date().toISOString() }))
        return true
      } catch {
        return false
      }
    },
    clear: () => {
      try {
        ls.removeItem(KEY)
      } catch {
        /* nothing to do — the caller is signing out either way */
      }
    },
  }
}

export { KEY as WORKSPACE_KEY }
