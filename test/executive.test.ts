/**
 * The owner's gist: the whole business in one look, read off the records.
 *
 * Money at the value its record carries, nothing typed in for it; every
 * desk's queue as its own dashboard counts it; goals judged against rules the
 * owner set; the last things written, newest first.
 */
import { describe, expect, it } from 'vitest'
import { buildRows } from '@/lib/domain/derive'
import { bundleFor } from '@/lib/workspace/bundle'
import { applyCount } from '@/lib/workspace/count'
import { BAND_ORDER, openCount } from '@/lib/workspace/decisions'
import { dispatchOpenCount } from '@/lib/workspace/dispatch-decisions'
import { raiseNote } from '@/lib/workspace/dispatch-notes'
import { emptyWorkspace } from '@/lib/workspace/defaults'
import {
  compact, dispatchedByMonth, dispatchedSameDays, fyOf, gist, goals, hasRecords, headlines, moneyOf, moneySits, monthsBack, needsYou,
  jobRings, ordersByPromise, pendingValue, queuesOf, QUEUE_WORD, recentActivity, spendByMaterial, stageCards,
  stockCover, whenWord,
} from '@/lib/workspace/executive'
import { inboundOpenCount } from '@/lib/workspace/inbound-decisions'
import { inventoryOpenCount } from '@/lib/workspace/inventory-decisions'
import { JOBWORKER, sendOut } from '@/lib/workspace/jobwork'
import { metricsFor, stageMetrics } from '@/lib/workspace/metrics'
import { productionOpenCount } from '@/lib/workspace/production-decisions'
import { recordReceipt } from '@/lib/workspace/receipts'
import type { PurchaseOrder, Workspace } from '@/lib/workspace/types'
import { TODAY, booked, made } from './dispatch-fixture'

const fresh = (): Workspace =>
  emptyWorkspace({ id: 'WS-1', createdAt: '2026-01-01', ownerName: 'Shanti', contact: '', companyName: 'Indigo Threads', makes: 'Jeans' })

const po = (over: Partial<PurchaseOrder> = {}): PurchaseOrder => ({
  id: 'PO-001', no: 'PO-1', vendorId: 'VN-001', itemId: 'IT-001', qty: 200, unitPrice: 240,
  orderedOn: '2026-09-10', expectedOn: '2026-09-26', state: 'confirmed', ...over,
})

/** booked(), with a supplier, one purchase order handed over and one still a draft */
const buying = (): Workspace => ({
  ...booked(),
  vendors: [{ id: 'VN-001', name: 'Arvind Mills', paymentTermsDays: 30 }],
  orders: [po(), po({ id: 'PO-002', no: 'PO-2', qty: 100, state: 'draft' })],
})

/** 30 of SO-1 sent today, on DC-1 */
const sentSome = (ws = booked()): Workspace => raiseNote(ws, {
  orderId: 'SO-001', on: TODAY, lines: [{ productId: 'PR-001', qty: 30 }],
  weightKg: 30, authorisedBy: 'R. Mehta', actor: 'K. Rao',
}, TODAY)[0]

describe('small words', () => {
  it('reads money the way an owner does, one decimal in lakh and crore', () => {
    expect(compact(1_860_000)).toBe('₹18.6 L')
    expect(compact(12_345_678)).toBe('₹1.2 Cr')
    expect(compact(45_000)).toBe('₹45,000')
  })

  it('counts months back across a year end, oldest first', () => {
    expect(monthsBack('2026-02-10', 4)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02'])
    expect(whenWord(TODAY, TODAY)).toBe('today')
    expect(whenWord('2026-09-22', TODAY)).toBe('yesterday')
    expect(whenWord('2026-09-19', TODAY)).toBe('19 Sep')
  })
})

describe('the financial year', () => {
  it('runs April to March, as the books do', () => {
    expect(fyOf('2026-09-25')).toEqual({ label: 'FY 2026–27', months: 6 })
    expect(fyOf('2026-04-01')).toEqual({ label: 'FY 2026–27', months: 1 })
    expect(fyOf('2027-03-31')).toEqual({ label: 'FY 2026–27', months: 12 })
    expect(fyOf('2027-01-10')).toEqual({ label: 'FY 2026–27', months: 10 })
  })

  it('sets this month beside the same days of the last, never a whole month', () => {
    let ws = sentSome()                                   // DC-1, 30 × ₹900 today (23 Sep)
    ;[ws] = raiseNote(ws, { orderId: 'SO-001', on: '2026-09-12', lines: [{ productId: 'PR-001', qty: 10 }], weightKg: 10, authorisedBy: 'R. Mehta', actor: 'K. Rao' }, TODAY)
    const d = dispatchedSameDays(ws, TODAY)
    expect(d).toMatchObject({ now: 36_000, before: 0, month: '2026-08', days: 23 })
    // nothing last month to compare with: no arrow on the tile
    expect(headlines(ws, TODAY).find((t) => t.key === 'dispatchedValue')!.flag).toBeUndefined()
  })

  it('flags the order book with what is past its promise', () => {
    const t = headlines(booked(), TODAY).find((x) => x.key === 'orderBook')!
    expect(t.sub).toBe('2 orders to dispatch')
    expect(t.flag).toEqual({ text: '₹90,000 past the promise', tone: 'critical' })
  })
})

describe('when the gist opens', () => {
  it('stays shut on the first day, and opens with the first record', () => {
    expect(hasRecords(fresh())).toBe(false)
    const counted = applyCount({ ...fresh(), items: booked().items }, '2026-09-01', { 'IT-001': { good: 10 } }, 'Shanti')
    expect(hasRecords(counted)).toBe(true)
  })
})

describe('the money', () => {
  it('counts the order book as what is still to go, at the order’s own rates', () => {
    const m = moneyOf(booked(), TODAY)
    // SO-1: 100 × 900, promised the 20th; SO-2: 200 × 950
    expect([m.orderBook, m.pastPromise, m.openOrders, m.pastOrders]).toEqual([280_000, 90_000, 2, 1])
    const sent = sentSome()
    expect(pendingValue(sent, sent.customerOrders[0])).toBe(63_000)
    expect(moneyOf(sent, TODAY).orderBook).toBe(253_000)
  })

  it('counts what was dispatched at selling value, not at what it cost to make', () => {
    const ws = sentSome()
    const bars = dispatchedByMonth(ws, TODAY)
    expect(bars.map((b) => b.label)).toEqual(['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'])
    expect(bars[5]).toMatchObject({ month: '2026-09', value: 27_000, count: 1 })
    const tile = headlines(ws, TODAY).find((t) => t.key === 'dispatchedValue')!
    expect([tile.value, tile.measured]).toEqual(['₹27,000', true])
  })

  it('counts what is on order as handed over and not yet in — no drafts, never below nought', () => {
    let ws = buying()
    expect(moneyOf(ws, TODAY)).toMatchObject({ onOrder: 48_000, onOrderCount: 1, landThisWeek: 1 })
    ws = recordReceipt(ws, { order: ws.orders[0], qty: 50, accepted: 50, rejected: 0, receivedOn: '2026-09-22' })
    expect(moneyOf(ws, TODAY).onOrder).toBe(36_000)
    const over = recordReceipt(buying(), { order: buying().orders[0], qty: 250, accepted: 250, rejected: 0, receivedOn: '2026-09-22' })
    expect(moneyOf(over, TODAY).onOrder).toBe(0)
  })

  it('reads stock at the last price paid, and finished goods at what they cost to make', () => {
    const m = moneyOf(booked(), TODAY)
    // 500 m of denim at 240; 120 pairs at 420
    expect([m.shelf, m.finished]).toEqual([120_000, 50_400])
    const sits = moneySits(m)
    expect(sits.map((s) => s.label)).toEqual(['On the shelf', 'Held back', 'Finished goods', 'At jobworkers', 'On order'])
    expect(sits.reduce((a, s) => a + s.value, 0)).toBe(170_400)
  })

  it('says what would fill a tile rather than printing nought', () => {
    const tiles = headlines(fresh(), TODAY)
    expect(tiles.map((t) => t.key)).toEqual(['orderBook', 'dispatchedValue', 'onOrder', 'stockValue', 'atJobworkers'])
    expect(tiles.every((t) => !t.measured)).toBe(true)
    expect(tiles[0].value).toBe('No orders yet')
  })

  it('never prices a counted shelf at nought when nothing has priced it', () => {
    const items = booked().items.map((i) => ({ ...i, lastPurchaseRate: 0 }))
    const ws = applyCount({ ...fresh(), items }, '2026-09-01', { 'IT-001': { good: 10 } }, 'Shanti')
    const shelf = headlines(ws, TODAY).find((t) => t.key === 'stockValue')!
    expect([shelf.measured, shelf.value]).toEqual([false, 'No price yet'])
    expect(gist(ws, TODAY).counted).toBe(true)
    expect(gist(fresh(), TODAY).counted).toBe(false)
  })
})

describe('the charts', () => {
  it('spends by material at the purchase order’s price, what arrived first', () => {
    let ws = buying()
    ws = recordReceipt(ws, { order: ws.orders[0], qty: 50, accepted: 50, rejected: 0, receivedOn: '2026-09-22' })
    expect(spendByMaterial(ws, TODAY)).toEqual({ basis: 'received', rows: [{ label: 'Denim 14 oz', value: 12_000 }], total: 12_000 })
  })

  it('falls back to what was ordered this month, and folds the tail into Other', () => {
    const base = buying()
    const items = Array.from({ length: 8 }, (_, i) => ({ ...base.items[0], id: `IT-1${i}`, name: `Material ${i}` }))
    const orders = items.map((it, i) => po({ id: `PO-1${i}`, no: `PO-1${i}`, itemId: it.id, qty: 10 * (i + 1), unitPrice: 100 }))
    const s = spendByMaterial({ ...base, items, orders }, TODAY)
    expect(s.basis).toBe('ordered')
    expect(s.rows).toHaveLength(7)
    expect(s.rows[0]).toEqual({ label: 'Material 7', value: 8_000 })
    expect(s.rows[6]).toEqual({ label: 'Other (2)', value: 3_000 })
    expect(s.total).toBe(36_000)
  })

  it('splits what is still to go by its promise: past, this week, later', () => {
    const p = ordersByPromise(booked(), TODAY)
    expect([p.past, p.soon, p.later]).toEqual([{ value: 90_000, count: 1 }, { value: 190_000, count: 1 }, { value: 0, count: 0 }])
    expect(p.late[0]).toMatchObject({ no: 'SO-1', customer: 'Bharat Panels', promised: '2026-09-20' })
    // every open order is a dot on the timeline, earliest promise first
    expect(p.orders.map((o) => [o.no, o.zone, o.value])).toEqual([['SO-1', 'past', 90_000], ['SO-2', 'soon', 190_000]])
  })

  it('rings each open job card by what was made against its plan', () => {
    expect(jobRings(booked(), TODAY)).toEqual([{
      id: 'JB-001', no: 'ST-1', name: 'Slim-fit jeans', made: 120, qty: 300, state: 'running', href: '/production/jobs?card=JB-001',
    }])
    expect(jobRings(made(60), TODAY)[0]).toMatchObject({ made: 60, state: 'behind' })
    expect(jobRings(fresh(), TODAY)).toEqual([])
  })

  it('says how long the shelf lasts per material, tightest first', () => {
    // 12.5 days on the shelf, nobody quotes it: a week is the bar, so inside two weeks is tight
    expect(stockCover(booked())).toEqual([{ id: 'IT-001', name: 'Denim 14 oz', days: 12.5, lead: null, state: 'tight' }])
    // a fortnight to get more in: it runs out first, so it is short
    const quote = {
      vendorId: 'VN-001', itemId: 'IT-001', rate: 240, freightPerUnit: 0, nonCreditableGst: 0, paymentTermCost: 0,
      rejectionAllowance: 0, quotedLeadTimeDays: 14, trailingLeadTimeDays: 14, trailingRejectionRate: 0,
      onTimePct: 100, score: 0, quoteValidUntil: '2026-12-31',
    }
    expect(stockCover({ ...booked(), vendorItems: [quote] })[0]).toMatchObject({ lead: 14, state: 'short' })
  })
})

describe('what needs the owner', () => {
  it('counts every desk’s queue as its own dashboard does — sourcing with its stock rows', () => {
    const ws = buying()
    const q = queuesOf(ws, TODAY)
    const n = needsYou(q)
    const rows = buildRows(bundleFor(ws, TODAY), ws.policy)
    expect(n.stages.map((s) => s.count)).toEqual([
      openCount(ws, TODAY, rows), inboundOpenCount(ws, TODAY), inventoryOpenCount(ws, TODAY),
      productionOpenCount(ws, TODAY), dispatchOpenCount(ws, TODAY),
    ])
    expect(n.total).toBe(n.stages.reduce((a, s) => a + s.count, 0))
    expect(n.stages.map((s) => s.href)).toEqual(['/sourcing/dashboard', '/inbound/dashboard', '/inventory/dashboard', '/production/dashboard', '/dispatch/dashboard'])
    // one line per kind, heaviest first: what stops the line, then what costs money, then what is half-done
    const bands = n.queues.map((w) => BAND_ORDER.indexOf(w.band))
    expect(bands).toEqual([...bands].sort((a, b) => a - b))
    expect(new Set(n.queues.map((w) => w.kind)).size).toBe(n.queues.length)
    expect(n.queues.reduce((a, w) => a + w.count, 0)).toBe(n.total)
    // SO-1 is past its promise, so dispatch has something that stops
    expect(n.queues.find((w) => w.kind === 'order-late')).toMatchObject({
      stage: 'dispatch', label: 'Sales orders late', count: 1, band: 'stops', href: '/dispatch/dashboard',
    })
  })

  it('names every kind of card in a few words', () => {
    for (const w of Object.values(QUEUE_WORD)) expect(w.length).toBeLessThanOrEqual(30)
  })
})

describe('goals, from the rules the owner set', () => {
  const judge = (ws: Workspace) => goals(ws, TODAY, [...metricsFor(ws, TODAY), ...stageMetrics(ws, TODAY, 'dispatch')])

  it('has nothing to judge where nothing has happened', () => {
    const g = judge(booked())
    expect(g.map((x) => x.key)).toEqual(['otif', 'scrap', 'accuracy', 'jobworkers', 'inspected', 'pace'])
    expect(g.find((x) => x.key === 'otif')).toMatchObject({ state: 'none', label: 'On time, in full', target: '≥ 95%', detail: 'nothing delivered to judge yet' })
    expect(g.map((x) => x.label.length + x.target.length).every((n) => n <= 32)).toBe(true)
    expect(g.find((x) => x.key === 'jobworkers')!.state).toBe('none')
  })

  it('reads the floor on pace, and behind when the pieces are not coming off', () => {
    expect(judge(booked()).find((x) => x.key === 'pace')).toMatchObject({ state: 'on', detail: '1 job card on pace' })
    const slow = judge(made(60)).find((x) => x.key === 'pace')!
    expect(slow).toMatchObject({ state: 'risk', detail: 'ST-1 is 60 behind plan', href: '/production/jobs?card=JB-001' })
  })

  it('holds jobworkers to the limit in the store rules', () => {
    let ws: Workspace = { ...booked(), vendors: [{ id: 'VN-002', name: 'Shree Wash', paymentTermsDays: 0 }], vendorType: { 'VN-002': JOBWORKER } }
    ;[ws] = sendOut(ws, { vendorId: 'VN-002', itemId: 'IT-001', qty: 100, sentOn: '2026-09-20', dueBack: '2026-09-30', expectedYield: 1 })
    expect(judge(ws).find((x) => x.key === 'jobworkers')).toMatchObject({ state: 'on', detail: '₹24,000 · limit ₹2.0 L' })
    const tight = { ...ws, policy: { ...ws.policy, jobworkerExposureCeiling: 10_000 } }
    expect(judge(tight).find((x) => x.key === 'jobworkers')!.state).toBe('off')
  })
})

describe('recent activity', () => {
  it('reads the last things written off the records, newest first', () => {
    const ws = sentSome(buying())
    const a = recentActivity(ws)
    expect(a[0]).toMatchObject({ on: TODAY, what: 'DC-1 to Bharat Panels', who: 'K. Rao', kind: 'doc' })
    expect(a.map((x) => x.on)).toEqual([...a.map((x) => x.on)].sort().reverse())
    expect(recentActivity(ws, 20).some((x) => x.what === 'SO-2 · ₹1.9 L' && x.who === 'Deccan Retail')).toBe(true)
    expect(a.length).toBeLessThanOrEqual(5)
    expect(a.every((x) => x.what.length <= 30)).toBe(true)
    expect(recentActivity(ws, 3)).toHaveLength(3)
  })
})

describe('the stage cards, and the whole', () => {
  it('shows each desk’s own first three figures and its two heaviest kinds of work', () => {
    const ws = buying()
    const g = gist(ws, TODAY)
    expect(g.cards.map((c) => c.label)).toEqual(['Sourcing', 'Inbound', 'Inventory', 'Production', 'Dispatch'])
    for (const c of g.cards) {
      expect(c.figures.length).toBeLessThanOrEqual(3)
      expect(c.work.length).toBeLessThanOrEqual(2)
      expect(c.work.every((w) => w.stage === c.stage)).toBe(true)
      expect(c.open).toBe(g.needs.stages.find((s) => s.stage === c.stage)!.count)
    }
    expect(g.cards.find((c) => c.stage === 'production')!.figures.map((f) => f.key))
      .toEqual(['lineRunsFor', 'jobsStopping', 'attainment'])
    expect(stageCards(ws, {
      sourcing: [], inbound: [], inventory: [], production: [], dispatch: [],
    }, queuesOf(ws, TODAY)).every((c) => c.figures.length === 0)).toBe(true)
    expect(g.headlines).toHaveLength(5)
    expect(g.goals).toHaveLength(6)
  })
})
