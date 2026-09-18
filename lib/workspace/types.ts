/**
 * A workspace is one company's own data.
 *
 * Every figure in this build is computed from a `SeedBundle`
 * (`lib/domain/derive.ts`), so an owner's company is simply another source of
 * that bundle — empty on the day they sign in, filled by the set-up steps. The
 * demo company keeps its seed and becomes the sample workspace, which is why
 * none of the derivations, formulas or guardrails change to support this.
 *
 * The domain types are left exactly as they are. Two things the owner
 * customises — what they call a kind of supplier, and what they call a group of
 * materials — have no field on `Vendor` or `Item`, and inventing one would
 * change types the reconciliation suites pin. They live here instead, as
 * side-tables keyed by id, which is also the honest shape: they are this
 * company's vocabulary, not a property of the material itself.
 */
import type { Policy } from '@/lib/domain/policy'
import type { Item, StockLot, Uom, Vendor, VendorItem } from '@/lib/domain/types'

export type PersonRole = 'owner' | 'manager' | 'stores' | 'buyer'

export const ROLE_LABEL: Record<PersonRole, string> = {
  owner: 'Owner',
  manager: 'Manager',
  stores: 'Stores',
  buyer: 'Buying',
}

export interface Person {
  name: string
  role: PersonRole
}

/**
 * The owner's own words. Every select over these offers "Add new…", because a
 * list of categories a developer guessed is a list somebody has to work around.
 */
export interface Categories {
  supplierType: string[]
  materialGroup: string[]
  units: Uom[]
}

export interface Workspace {
  id: string
  createdAt: string
  owner: { name: string; contact: string }
  company: { name: string; makes: string }
  people: Person[]
  categories: Categories
  /** the masters the set-up steps write */
  items: Item[]
  vendors: Vendor[]
  vendorItems: VendorItem[]
  stockLots: StockLot[]
  /** step 5 — the rules, which the Sourcing Desk's own panel then edits */
  policy: Policy
  /** this company's vocabulary, keyed by vendor id and item id */
  vendorType: Record<string, string>
  itemGroup: Record<string, string>
  /** a wizard closed halfway reopens where it was */
  drafts: Record<string, unknown>
}

/** Which company the screens are reading. The sample is never written to. */
export type WorkspaceMode = 'sample' | 'mine'

export interface Session {
  /** what the audit trail records against every action */
  actor: string
  role: PersonRole
}
