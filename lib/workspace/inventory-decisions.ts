/**
 * The store's work queue.
 *
 * Same shape as the sourcing and inbound queues — a band, a sentence naming
 * the thing, one button — so the dashboard reads the same in every stage. The
 * store's questions are few and plain: which rack is due a count, which lots
 * nobody can find, where the book has gone below nothing.
 *
 * Pure, and empty without a date: every card here is about how long something
 * has been true.
 */
import { daysBetween } from '@/lib/domain/calc'
import { num } from '@/lib/domain/format'
import { openVariances } from './counting'
import { cutRows, offcutRows, remnantEffects } from './cutting'
import { sortDecisions, type Decision } from './decisions'
import { STATE_WORD, lotRows, round3, type LotRow } from './ledger'
import { scrapRows, unsoldPast } from './losses'
import { unplacedLots } from './racks'
import type { Workspace } from './types'

/**
 * How long a lot may sit held — on hold, damaged, past its date — before the
 * store is asked to decide. The gate's own window is for inspection; this is
 * for what came out of it, or went bad on the shelf, and was never settled.
 */
export const HELD_TOO_LONG_DAYS = 14

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

export function inventoryDecisionsFor(ws: Workspace, today: string): Decision[] {
  if (!today) return []
  const out: Decision[] = []
  const rows = lotRows(ws, today)

  /*
   * Due a count — gathered by rack, because a rack is what somebody walks. A
   * store with no racks named is one place, so there the unit is the material.
   */
  const groups = new Map<string, LotRow[]>()
  for (const r of rows.filter((x) => x.due)) {
    const key = r.lot.rack ? `rack:${r.lot.rack}` : `item:${r.lot.itemId}`
    groups.set(key, [...(groups.get(key) ?? []), r])
  }
  for (const [key, due] of groups) {
    const oldest = due.reduce((a, b) => (b.sinceConfirmed.value > a.sinceConfirmed.value ? b : a))
    const onRack = key.startsWith('rack:')
    const name = onRack ? (oldest.rack?.name ?? 'A rack') : (oldest.item?.name ?? 'A material')
    const cadence = ws.policy.countCadenceDays[oldest.cls]
    out.push({
      id: `count-due:${key}`,
      band: 'unfinished',
      kind: 'count-due',
      title: `${name} is due a count`,
      detail: `${plural(due.length, 'lot')} past ${due.length === 1 ? 'its' : 'their'} counting date — the oldest last confirmed ${
        plural(oldest.sinceConfirmed.value, 'day')} ago; class ${oldest.cls} is counted every ${cadence}.`,
      act: 'count',
      actLabel: onRack ? 'Walk it' : 'Count it',
      href: onRack ? `/inventory/ledger?rack=${oldest.lot.rack}` : `/inventory/ledger?item=${oldest.lot.itemId}`,
      refs: onRack ? { rackId: oldest.lot.rack } : { itemId: oldest.lot.itemId },
      weight: oldest.sinceConfirmed.value - cadence,
    })
  }

  /* Lots on no rack, once the store has named racks — the lot nobody can find. */
  const lost = unplacedLots(ws)
  if (lost.length > 0) {
    const oldest = lost.map((l) => l.on ?? today).sort()[0]
    out.push({
      id: 'no-rack',
      band: 'unfinished',
      kind: 'no-rack',
      title: `${plural(lost.length, 'lot is', 'lots are')} on no rack`,
      detail: `Nobody walking the racks will count ${lost.length === 1 ? 'it' : 'them'}. Say where ${
        lost.length === 1 ? 'it sits' : 'each sits'} — the oldest has been on the book since ${oldest}.`,
      act: 'open',
      actLabel: 'Place them',
      href: '/inventory/ledger?rack=none',
      refs: {},
      weight: daysBetween(oldest, today),
    })
  }

  /* The book below nothing: something left that was never written down. */
  for (const it of ws.items) {
    const usable = round3(ws.stockLots
      .filter((l) => l.itemId === it.id && l.usability === 'usable')
      .reduce((a, l) => a + l.qty, 0))
    if (usable >= 0) continue
    out.push({
      id: `negative-stock:${it.id}`,
      band: 'stops',
      kind: 'negative-stock',
      title: `The book shows ${usable} ${it.uom} of ${it.name}`,
      detail: 'Less than nothing: more went out than the book knew came in. Count it, and the count puts the book right.',
      act: 'count',
      actLabel: 'Count it',
      href: `/inventory/ledger?item=${it.id}`,
      refs: { itemId: it.id },
      weight: -usable,
    })
  }

  /*
   * A count outside its class's tolerance, nobody has looked at, and nothing
   * has recounted since. The book already follows the rack; what is left is
   * the question of why — a miscount, an issue nobody wrote, or loss.
   */
  for (const r of openVariances(ws)) {
    const diff = r.variance.value
    out.push({
      id: `count-variance:${r.count.id}`,
      band: 'costs',
      kind: 'count-variance',
      title: `${r.item?.name ?? 'A lot'} counted ${Math.abs(r.pct.value)}% ${diff < 0 ? 'short' : 'over'}`,
      detail: `${r.batch}${r.rack ? ` on ${r.rack.name}` : ''}: ${num(r.count.countedQty, 3)} counted against a book of ${
        num(r.count.bookQty, 3)} ${r.uom} on ${r.count.on}. Class ${r.cls} allows ${ws.policy.countTolerancePct[r.cls]}% — a miscount, an issue nobody wrote, or loss.`,
      act: 'keep',
      actLabel: 'Looked at it',
      alt: { act: 'count', label: 'Count it again' },
      href: `/inventory/ledger?item=${r.count.itemId}`,
      refs: { countId: r.count.id, lotId: r.count.lotId, itemId: r.count.itemId },
      weight: Math.abs(r.pct.value),
    })
  }

  /* Held and never settled: on the premises, never cover, and money either way. */
  for (const r of rows) {
    if (r.correction || r.lot.qty <= 0 || r.lot.usability === 'usable' || r.lot.remnant) continue
    const since = [...(ws.transfers ?? [])].filter((t) => t.lotId === r.lot.id && t.state)
      .map((t) => t.on).sort().pop() ?? r.lot.on ?? today
    const days = daysBetween(since, today)
    if (days <= HELD_TOO_LONG_DAYS) continue
    out.push({
      id: `held-long:${r.lot.id}`,
      band: 'costs',
      kind: 'held-long',
      title: `${r.item?.name ?? 'A lot'} has been ${STATE_WORD[r.lot.usability].toLowerCase()} for ${days} days`,
      detail: `${num(r.lot.qty, 3)} ${r.uom} · ${r.lot.batchNo}${r.lot.usabilityReason ? ` — ${r.lot.usabilityReason}` : ''}. Worth ${
        r.value.value > 0 ? `₹${Math.round(r.value.value).toLocaleString('en-IN')}` : 'its price'} and usable for nothing until somebody decides.`,
      act: 'write-off',
      actLabel: 'Write it off',
      alt: { act: 'release', label: 'Release it' },
      href: `/inventory/ledger?item=${r.lot.itemId}`,
      refs: { lotId: r.lot.id, itemId: r.lot.itemId },
      weight: days,
    })
  }

  /* Scrap booked as money and never collected: owed by a dealer, not in the bank. */
  for (const r of unsoldPast(ws, today)) {
    out.push({
      id: `scrap-unsold:${r.loss.id}`,
      band: 'costs',
      kind: 'scrap-unsold',
      title: `Scrap from ${r.loss.sourceRef} unsold for ${r.age} days`,
      detail: `${num(r.loss.qty, 3)} ${r.uom} of ${r.item?.name ?? 'material'}, booked at ₹${Math.round(r.recovery.value).toLocaleString('en-IN')}. Past ${
        ws.policy.scrapUnrealisedDays} days it is recovery on paper — sell it, or say nobody will.`,
      act: 'sell',
      actLabel: 'Record the sale',
      alt: { act: 'no-sale', label: 'No sale' },
      href: '/inventory/wastage',
      refs: { lossId: r.loss.id, itemId: r.loss.itemId },
      weight: r.age,
    })
  }

  /* Scrap running over target this month — a pattern, not a bad lay. */
  const month = today.slice(0, 7)
  for (const r of scrapRows(ws, month)) {
    if (!r.over || r.noted) continue
    out.push({
      id: `scrap-over:${r.item.id}:${month}`,
      band: 'costs',
      kind: 'scrap-over',
      title: `Scrap on ${r.item.name} ran ${r.pct.value}% this month`,
      detail: `${num(r.lost, 3)} ${r.item.uom} lost of ${num(r.issued, 3)} issued, against a target of ${r.target}% for class ${
        r.cls} (and ${ws.policy.scrapTolerancePct} points' margin). Net ₹${Math.round(r.net).toLocaleString('en-IN')}.`,
      act: 'keep',
      actLabel: 'Noted',
      href: '/inventory/wastage',
      refs: { itemId: r.item.id },
      weight: r.pct.value - r.target,
    })
  }

  if (ws.cutting) out.push(...cuttingDecisions(ws, today))

  return sortDecisions(out)
}

/**
 * The cutting table's three, asked only of a store that cuts. A remnant past
 * its age is money on a rack nobody will reach for; one that could cover part
 * of an order about to go out is the same material bought twice; a cut well
 * below its plan is a lay worth looking at.
 */
function cuttingDecisions(ws: Workspace, today: string): Decision[] {
  const out: Decision[] = []
  const money = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`

  for (const r of offcutRows(ws, today)) {
    if (!r.aged) continue
    const name = r.item?.name ?? 'material'
    out.push({
      id: `remnant-aged:${r.lot.id}`,
      band: 'costs',
      kind: 'remnant-aged',
      title: `A remnant of ${name} is ${r.age.value} days old`,
      detail: `${r.pieces ? `${plural(r.pieces, 'piece')} · ` : ''}${num(r.lot.qty, 3)} ${r.uom}${r.rack ? ` on ${r.rack.name}` : ''}${
        r.from ? `, from ${r.from}` : ''}. Past ${ws.policy.remnantAgeDays} days a remnant is rarely reached for — use it in a job, or scrap it${
        r.value > 0 ? ` (worth ${money(r.value)})` : ''}.`,
      act: 'use',
      actLabel: 'Use in a job',
      alt: { act: 'scrap', label: 'Scrap it' },
      href: '/inventory/offcuts',
      refs: { lotId: r.lot.id, itemId: r.lot.itemId },
      weight: r.age.value,
    })
  }

  for (const e of remnantEffects(ws, today)) {
    if (e.noted || !e.moves) continue
    out.push({
      id: `remnant-covers:${e.order.no}:${e.item.id}`,
      band: 'costs',
      kind: 'remnant-covers',
      title: `Draft ${e.order.no} buys ${num(e.order.qty, 3)} ${e.item.uom} of ${e.item.name}; ${num(e.remnant, 3)} ${e.item.uom} of remnants are on the racks`,
      detail: `Netting them off the need, the order could be ${num(e.effect.revisedQty.value, 3)} ${e.item.uom} rather than ${
        num(e.without.revisedQty.value, 3)}, with the smallest order applied again. Use the remnants first; they are not counted as cover.`,
      act: 'open',
      actLabel: 'Open the order',
      alt: { act: 'keep', label: 'Keep the order' },
      href: '/sourcing/orders',
      refs: { orderNo: e.order.no, itemId: e.item.id },
      weight: (e.without.revisedQty.value - e.effect.revisedQty.value) * (e.item.lastPurchaseRate || 1),
    })
  }

  for (const r of cutRows(ws)) {
    if (!r.belowPlan || r.noted) continue
    out.push({
      id: `cut-below-plan:${r.cut.id}`,
      band: 'costs',
      kind: 'cut-below-plan',
      title: `${r.cut.cutNo} came out ${r.shortfall.value} points below plan`,
      detail: `${r.item?.name ?? 'Material'} off ${r.batch}${r.job ? ` for ${r.job.no}` : ''}: ${r.yielded.value}% into parts against ${
        r.planned.value}% planned, on ${r.cut.on}. The rules allow ${ws.policy.yieldTolerancePct} points — a bad lay, a flaw in the lot, or a plan that was wrong.`,
      act: 'keep',
      actLabel: 'Noted',
      href: '/inventory/offcuts?view=cuts',
      refs: { cutId: r.cut.id, itemId: r.cut.itemId },
      weight: r.shortfall.value,
    })
  }
  return out
}

export const inventoryOpenCount = (ws: Workspace, today: string): number =>
  inventoryDecisionsFor(ws, today).length
