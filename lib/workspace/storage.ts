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
import type { Session, Workspace, WorkspaceMode } from './types'

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
    return { ...v, workspace: migrate(ws) } as Stored
  } catch {
    return null
  }
}

/**
 * A workspace saved before a field existed is not a broken workspace.
 *
 * Somebody who set their company up last week and comes back after an update
 * must not lose it because the build has since grown requests, quotes and
 * orders. Every list the app reads is filled in here if it is missing, so the
 * screens can index straight into them without guarding each one.
 */
function migrate(ws: Workspace): Workspace {
  const list = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])
  return {
    ...ws,
    people: list(ws.people),
    items: list(ws.items),
    vendors: list(ws.vendors),
    vendorItems: list(ws.vendorItems),
    stockLots: list(ws.stockLots),
    rfqs: list(ws.rfqs),
    quotes: list(ws.quotes),
    orders: list(ws.orders),
    vendorType: ws.vendorType ?? {},
    itemGroup: ws.itemGroup ?? {},
    drafts: ws.drafts ?? {},
    categories: {
      supplierType: list(ws.categories?.supplierType),
      materialGroup: list(ws.categories?.materialGroup),
      units: list(ws.categories?.units),
    },
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
