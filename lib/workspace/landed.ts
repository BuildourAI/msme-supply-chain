/**
 * The four things a quoted rate does not tell you.
 *
 * `landed = rate + freight + non-creditable GST + payment-term cost +
 * rejection allowance` is the sample company's arithmetic and this build's
 * §5 formula, and `lib/domain/calc.ts` already applies it to the owner's
 * quotes. It has nothing to apply it to: `buildRate` writes four of the five
 * components as zero and, until now, nothing could change them.
 *
 * So this file fills them, on the way in, from what the owner said. Three are
 * simply what they entered, converted once from the percentage that is natural
 * to say into the rupees the formula wants. The fourth is worked out — and it
 * is worked out from a number they already gave and the system already threw
 * away.
 *
 * Nothing here touches `lib/domain/`. The engine and the sample company's
 * twenty-seven reconciled quotes are exactly as they were.
 */
import type { VendorItem } from '@/lib/domain/types'
import type { Workspace } from './types'

/** Two decimal places, the way the domain layer rounds money. */
const money = (n: number) => Math.round(n * 100) / 100

/**
 * What a supplier's payment terms cost, against the best terms on offer.
 *
 * A supplier wanting cash, where another on the same material gives forty-five
 * days, is asking for the money forty-five days earlier — and that money has a
 * price, which is the owner's own cost of working capital.
 *
 * The baseline is the best terms available **on that material**, which is the
 * only honest one. An absolute baseline would have to be invented; this one is
 * observed. It also makes the arithmetic say something true and slightly
 * surprising: the best supplier's credit costs nothing, not because credit is
 * free, but because there was nothing better to have had.
 *
 * Zero when the owner has not said what their money costs. Zero when there is
 * one supplier, because there is nothing to be better than. Never negative.
 */
export function termCost(
  rate: number, theirDays: number, bestDays: number, costOfMoneyPct: number,
): number {
  if (!(rate > 0) || !(costOfMoneyPct > 0)) return 0
  const daysEarlier = Math.max(0, bestDays - theirDays)
  return money(rate * (daysEarlier / 365) * (costOfMoneyPct / 100))
}

/**
 * The slice of GST that cannot be claimed back.
 *
 * Most of it can, which is why this is nearly always zero and is asked as a
 * percentage rather than a rupee figure — an owner knows "I can't claim
 * anything from him, he's on composition", not "₹640 a tonne".
 */
export const gstCost = (rate: number, unclaimablePct: number): number =>
  (rate > 0 && unclaimablePct > 0 ? money(rate * (unclaimablePct / 100)) : 0)

/**
 * What the material you will have to throw away costs.
 *
 * §5 derives this as rate × the supplier's trailing rejection rate. Until goods
 * are recorded arriving there is no trailing anything, so it is what the owner
 * has seen — and it says so on screen rather than passing itself off as
 * measured.
 */
export const rejectionCost = (rate: number, rejectPct: number): number =>
  (rate > 0 && rejectPct > 0 ? money(rate * (rejectPct / 100)) : 0)

/* ------------------------------------------------------------- repricing -- */

/**
 * Every rate's payment-term cost, brought up to date.
 *
 * This cannot be done when a rate is written, which is the whole reason it is a
 * separate pass: a supplier's term cost depends on the best terms anyone offers
 * on that material, so adding a supplier who gives ninety days makes every
 * competitor on that material dearer. Editing one rate reprices its rivals.
 *
 * Idempotent, and a no-op on a workspace with no cost of money set.
 */
export function repriceTerms(ws: Workspace): Workspace {
  const pct = ws.policy?.costOfMoneyPct ?? 0
  const termsOf = new Map(ws.vendors.map((v) => [v.id, v.paymentTermsDays]))

  /* the best terms anyone offers, per material */
  const best = new Map<string, number>()
  for (const vi of ws.vendorItems) {
    const days = termsOf.get(vi.vendorId) ?? 0
    best.set(vi.itemId, Math.max(best.get(vi.itemId) ?? 0, days))
  }

  let moved = false
  const vendorItems = ws.vendorItems.map((vi) => {
    const next = termCost(vi.rate, termsOf.get(vi.vendorId) ?? 0, best.get(vi.itemId) ?? 0, pct)
    if (next === vi.paymentTermCost) return vi
    moved = true
    return { ...vi, paymentTermCost: next }
  })

  // an unchanged workspace is returned as it was, so a caller can compare by
  // reference and a save is not provoked by a pass that decided nothing
  return moved ? { ...ws, vendorItems } : ws
}

/* ---------------------------------------------------------------- reading -- */

/** The five components of one quote, for a screen that shows the breakdown. */
export interface Breakdown {
  rate: number
  freight: number
  gst: number
  terms: number
  rejection: number
  landed: number
}

export function breakdownOf(vi: VendorItem): Breakdown {
  const landed = money(
    vi.rate + vi.freightPerUnit + vi.nonCreditableGst + vi.paymentTermCost + vi.rejectionAllowance,
  )
  return {
    rate: vi.rate,
    freight: vi.freightPerUnit,
    gst: vi.nonCreditableGst,
    terms: vi.paymentTermCost,
    rejection: vi.rejectionAllowance,
    landed,
  }
}

/**
 * Which components nobody has told the system about.
 *
 * The state every owner is in on their first afternoon, and the screen has to
 * name it. Two suppliers both landing at their quoted rate is not a comparison
 * that came out even — it is a comparison that has not been given anything to
 * work with, and saying so is the difference between incomplete and wrong.
 */
export function unsetComponents(ws: Workspace, itemId?: string): string[] {
  const rates = ws.vendorItems.filter((vi) => !itemId || vi.itemId === itemId)
  if (rates.length === 0) return []

  const missing: string[] = []
  if (!rates.some((vi) => vi.freightPerUnit > 0)) missing.push('freight')
  if (!rates.some((vi) => vi.nonCreditableGst > 0)) missing.push('GST you cannot claim back')
  if (!((ws.policy?.costOfMoneyPct ?? 0) > 0)) missing.push('what your money costs')
  if (!rates.some((vi) => vi.rejectionAllowance > 0)) missing.push('a rejection rate')
  return missing
}

/* ---------------------------------------------------------------- ranking -- */

/** One supplier's rate on a material, placed against the others on it. */
export interface Ranked {
  vi: VendorItem
  b: Breakdown
  cheapestLanded: boolean
  cheapestQuoted: boolean
}

/**
 * Every rate on one material, cheapest-landed first.
 *
 * Extracted so that the comparison screen and the forms cannot disagree. They
 * ranked the same way by coincidence before this existed, which is not a
 * property worth relying on: a screen that says one supplier is cheapest and an
 * order form that suggests another is worse than neither of them saying
 * anything.
 *
 * Ties break on the quoted rate, then on whatever order the rates were entered
 * in — the sort is stable, so the answer is the same every render.
 */
export function rankByLanded(ws: Workspace, itemId: string): Ranked[] {
  const rows: Ranked[] = ws.vendorItems
    .filter((vi) => vi.itemId === itemId)
    .map((vi) => ({ vi, b: breakdownOf(vi), cheapestLanded: false, cheapestQuoted: false }))
    .sort((a, b) => a.b.landed - b.b.landed || a.vi.rate - b.vi.rate)

  if (rows.length > 0) {
    rows[0].cheapestLanded = true
    rows.reduce((a, b) => (b.vi.rate < a.vi.rate ? b : a)).cheapestQuoted = true
  }
  return rows
}

/* ------------------------------------------------------------- the advice -- */

/**
 * What is worth saying to somebody who has just picked a supplier.
 *
 * Deliberately a description rather than a decision. It reports where the
 * chosen supplier stands and who lands cheapest; what the screen does with that
 * is the screen's business, and what it must not do is act on it. §11 is that
 * the system suggests and drafts and never places an order — and quietly
 * swapping the supplier somebody selected is that line being crossed, however
 * good the arithmetic behind it.
 */
export interface Advice {
  /** every rate on the material, cheapest-landed first */
  rows: Ranked[]
  /** the one that lands cheapest, or null when nobody quotes this material */
  best: Ranked | null
  /** where the chosen supplier sits, or null when they have no rate for it */
  chosen: Ranked | null
  /** the chosen supplier is the one that lands cheapest */
  isBest: boolean
  /** cheapest-landed and cheapest-quoted are different suppliers */
  flips: boolean
  /** per unit, what moving from the chosen supplier to the best one saves */
  saving: number
  /** components nobody has entered — see `unsetComponents` */
  missing: string[]
  /**
   * Nothing has been entered beyond rates, so every supplier lands at exactly
   * what they quoted. A ranking in that state is a ranking on the quoted rate
   * wearing a different hat, and the screen has to say so.
   */
  flat: boolean
}

export function adviseFor(ws: Workspace, itemId: string, vendorId: string): Advice {
  const rows = rankByLanded(ws, itemId)
  const best = rows[0] ?? null
  const chosen = rows.find((r) => r.vi.vendorId === vendorId) ?? null
  return {
    rows,
    best,
    chosen,
    isBest: Boolean(chosen && chosen.cheapestLanded),
    flips: rows.length > 1 && !rows[0].cheapestQuoted,
    saving: chosen && best ? money(chosen.b.landed - best.b.landed) : 0,
    missing: unsetComponents(ws, itemId),
    flat: rows.length > 1 && rows.every((r) => r.b.landed === r.vi.rate),
  }
}
