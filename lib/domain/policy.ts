/**
 * Policy constants. §5 fixes the formulas; these are the knobs inside them.
 * §13-3 flags CYCLE_DAYS = 15 as a guess that should be set per item class, and
 * §13-4 flags the flat 2.0-month coverage ceiling as something that should vary
 * by ABC/XYZ. Both are exposed on the desk's Policy tab rather than buried here.
 */
import type { ItemClass } from './types'

export interface Policy {
  /** §5: "CYCLE_DAYS = 15 (configurable per item class)". §13-3 flags 15 as a guess. */
  cycleDays: Record<ItemClass, number>
  /** §11: any order above the owner's threshold needs the owner's sign-off, not just the buyer's. */
  ownerApprovalThreshold: number
  inboundQcDays: number
  bufferDays: number
  /** months of cover a single order may create, per item class */
  coverageCeiling: Record<ItemClass, number>
  /** §13-2 — a buyer optimises, an owner keeps a relationship. Stated, not accidental. */
  supplierDefault: 'lowest_landed_cost' | 'preferred'
}

export const DEFAULT_POLICY: Policy = {
  cycleDays: { A: 15, B: 15, C: 15 },
  ownerApprovalThreshold: 200_000,
  inboundQcDays: 2,
  bufferDays: 3,
  coverageCeiling: { A: 2.0, B: 2.0, C: 2.0 },
  supplierDefault: 'lowest_landed_cost',
}

/** Line Watch runs the same engine under a different, stated supplier policy. */
export const OWNER_POLICY: Policy = { ...DEFAULT_POLICY, supplierDefault: 'preferred' }

/**
 * §13-1 — the valuation basis, decided. Non-usable stock valued at qty × the
 * recommended vendor's base rate (last purchase price, ex-freight) sums to exactly
 * the ₹29,308 §9.1 states. Landed cost would give ₹30,871.40 and the cheapest
 * current quote ₹28,769.00, so the basis is recoverable from the data, not a guess.
 * One basis, applied everywhere stock is valued.
 */
export const VALUATION_BASIS = 'last purchase price, ex-freight' as const
