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

  /* ------------------------------------------------------- INB-01 · inbound QC */
  /** Days a GRN may sit uninspected before it escalates. */
  qcOverdueDays: number
  /**
   * A receipt whose rejection rate exceeds this multiple of the vendor's trailing
   * rate is not a bad batch, it is a signal — so it escalates rather than filing.
   */
  rejectionSpikeMultiple: number

  /* -------------------------------------------------- INB-02 · order change sync */
  /** Working days a change notice may go unacknowledged before it escalates. */
  ackChaseDays: number
  /** Changes to one PO line within 30 days above which the vendor is being whipsawed. */
  poChurnLimit: number

  /* --------------------------------------------------- INB-03 · jobwork register */
  /** Days past the promised return date before a challan escalates. */
  jobworkGraceDays: number
  /** ₹ any single jobworker may hold at once — a concentration limit. */
  jobworkerExposureCeiling: number
}

export const DEFAULT_POLICY: Policy = {
  cycleDays: { A: 15, B: 15, C: 15 },
  ownerApprovalThreshold: 200_000,
  inboundQcDays: 2,
  bufferDays: 3,
  coverageCeiling: { A: 2.0, B: 2.0, C: 2.0 },
  supplierDefault: 'lowest_landed_cost',
  qcOverdueDays: 3,
  rejectionSpikeMultiple: 2,
  ackChaseDays: 2,
  poChurnLimit: 2,
  jobworkGraceDays: 0,
  jobworkerExposureCeiling: 200_000,
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
