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
import type { Item, Vendor } from '@/lib/domain/types'
import { highestIssued } from './defaults'
import { SCHEMA } from './types'
import type {
  FieldDef, PurchaseOrder, Quote, Rfq, Session, TableView, Workspace, WorkspaceMode,
} from './types'

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
    save: (s) => { held = s; return true },
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
  const quotes = list<Quote>(raw.quotes)
  const orders = list<PurchaseOrder>(raw.orders)

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

  const view = (v: Partial<TableView> | undefined): TableView => ({
    order: list<string>(v?.order),
    hidden: list<string>(v?.hidden),
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
    stockLots: list(raw.stockLots),
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
    fields: list(raw.fields),
    custom: map(raw.custom),
    views: {
      supplier: view(views.supplier),
      material: view(views.material),
      rfq: view(views.rfq),
    },
    vendorContact: map(raw.vendorContact),
    sendLog: list(raw.sendLog),
    lastImport: raw.lastImport,
    nextIds,
    schema: SCHEMA,
    drafts: map(raw.drafts),
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
        ls.setItem(KEY, JSON.stringify(s))
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
