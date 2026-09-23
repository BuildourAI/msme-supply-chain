/**
 * What each screen needs before it can say anything true.
 *
 * A screen with no data has two honest options: show nothing and explain, or
 * show somebody else's figures. This build has never done the second, and it is
 * not going to start on the screen a new owner sees first. So every sourcing
 * route declares what it is waiting for, and the empty state names the step
 * that supplies it rather than saying "no data".
 */
import { quotedItems } from './bundle'
import type { StepId } from './checklist'
import type { Workspace } from './types'

export interface Need {
  /** what this screen would show once it can */
  shows: string
  /**
   * The step that unblocks it. A function of the workspace, not a constant: a
   * screen can be waiting on materials today and on a stock count tomorrow, and
   * an empty state that says "you have not added a supplier" above a button
   * reading "Add a material" is worse than no button at all.
   */
  step: (ws: Workspace) => StepId
  /** why it cannot yet — written for the owner, not the developer */
  blocked: (ws: Workspace) => string | null
}

const noMaterials = (ws: Workspace) =>
  ws.items.length === 0 ? 'You have not added any materials yet.' : null

const noSuppliers = (ws: Workspace) =>
  ws.vendors.length === 0 ? 'You have not added a supplier yet.' : null

const nothingQuotable = (ws: Workspace) =>
  quotedItems(ws).length === 0
    ? 'None of your materials has a supplier against it yet, so there is nothing to price.'
    : null

const noStock = (ws: Workspace) =>
  ws.stockLots.length === 0 ? 'No stock has been counted yet.' : null

export const NEEDS: Record<string, Need> = {
  '/sourcing/desk': {
    shows: 'what to buy today, with the reason it was raised',
    step: (ws) => (ws.items.length === 0 ? 'materials'
      : quotedItems(ws).length === 0 ? 'suppliers' : 'stock'),
    blocked: (ws) => noMaterials(ws) ?? noSuppliers(ws) ?? nothingQuotable(ws) ?? noStock(ws),
  },
  '/sourcing/compare': {
    shows: 'why the cheapest quote is not always the cheapest material',
    step: (ws) => (ws.items.length === 0 ? 'materials' : 'suppliers'),
    blocked: (ws) => {
      const base = noMaterials(ws) ?? noSuppliers(ws) ?? nothingQuotable(ws)
      if (base) return base
      const twoQuotes = quotedItems(ws).some(
        (it) => ws.vendorItems.filter((vi) => vi.itemId === it.id).length > 1,
      )
      return twoQuotes
        ? null
        : 'Every material has one supplier so far. A comparison needs two on the same material.'
    },
  },
  '/sourcing/blocked': {
    shows: 'money sitting in stock you cannot use, by cause and by age',
    step: (ws) => (ws.items.length === 0 ? 'materials' : 'stock'),
    blocked: (ws) => noMaterials(ws) ?? noStock(ws),
  },
  '/sourcing/intake': {
    shows: 'what each supplier quoted, searchable by material',
    step: (ws) => (ws.items.length === 0 ? 'materials' : 'suppliers'),
    blocked: (ws) => noSuppliers(ws),
  },
}

export const needFor = (path: string): Need | null => NEEDS[path] ?? null

/** The stages whose set-up comes after sourcing, inbound and the store. */
export const LATER_STAGES: Record<string, string> = {
  production: 'Production & material flow',
  dispatch: 'Dispatch & logistics',
}
