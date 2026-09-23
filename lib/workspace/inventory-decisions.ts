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
import { sortDecisions, type Decision } from './decisions'
import { lotRows, round3, type LotRow } from './ledger'
import { unplacedLots } from './racks'
import type { Workspace } from './types'

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
      act: 'open',
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
      act: 'open',
      actLabel: 'Count it',
      href: `/inventory/ledger?item=${it.id}`,
      refs: { itemId: it.id },
      weight: -usable,
    })
  }

  return sortDecisions(out)
}

export const inventoryOpenCount = (ws: Workspace, today: string): number =>
  inventoryDecisionsFor(ws, today).length
