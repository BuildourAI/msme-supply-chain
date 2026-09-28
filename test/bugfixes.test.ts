/**
 * The six defects the rules-and-customisation audit found, each held shut:
 * rules the owner set that did nothing, a class nobody could set, one measure
 * coloured two ways, a "Noted" that could lose another note, a wizard that
 * erased the company's state, and a document number handed out twice.
 */
import { describe, expect, it } from 'vitest'
import { buildRows } from '@/lib/domain/derive'
import { bundleFor } from '@/lib/workspace/bundle'
import { decisionsFor } from '@/lib/workspace/decisions'
import { dispatchDecisionsFor, noteDispatch } from '@/lib/workspace/dispatch-decisions'
import { landing } from '@/lib/workspace/desk-pictures'
import { orderHolds } from '@/lib/workspace/holds'
import { nextJobNo } from '@/lib/workspace/jobs'
import { sendOut } from '@/lib/workspace/jobwork'
import { incomingOf } from '@/lib/workspace/linewatch'
import { BANDS } from '@/lib/workspace/metrics'
import { behindNotedKey, noteProduction } from '@/lib/workspace/production-decisions'
import { buildItem, parseItemClass } from '@/lib/workspace/records'
import { addOrder, openJobForOrder } from '@/lib/workspace/sales'
import { keepIssued, nextNo } from '@/lib/workspace/sourcing'
import type { Decision } from '@/lib/workspace/decisions'
import type { PurchaseOrder, Workspace } from '@/lib/workspace/types'
import { TODAY, line, made, shop } from './dispatch-fixture'

const po = (over: Partial<PurchaseOrder> = {}): PurchaseOrder => ({
  id: 'PO-001', no: 'PO-1', vendorId: 'VN-001', itemId: 'IT-001', qty: 100, unitPrice: 240,
  orderedOn: '2026-09-20', expectedOn: '2026-09-30', state: 'draft', ...over,
})

const withSupplier = (ws: Workspace): Workspace => ({
  ...ws, vendors: [{ id: 'VN-001', name: 'Arvind Mills', paymentTermsDays: 30 }],
})

/* ------------------------------------------------------ 1. idle rules -- */

describe('the ceiling and the sign-off amount hold a draft order', () => {
  // 500 m of denim counted, 40 m a day, class A — the ceiling is 2 months, sign-off ₹2,00,000
  it('holds nothing on an ordinary order', () => {
    const ws = { ...withSupplier(shop()), orders: [po({ qty: 100 })] }
    expect(orderHolds(ws, 'PO-1')).toEqual([])
  })

  it('holds an order that would leave more stock than the ceiling, and says by how much', () => {
    // 500 + 2,000 = 2,500 m at 40 m a day is 2.1 months
    const ws = { ...withSupplier(shop()), orders: [po({ qty: 2000, unitPrice: 50 })] }
    const holds = orderHolds(ws, 'PO-1')
    expect(holds.map((h) => h.kind)).toEqual(['ceiling'])
    expect(holds[0].text).toMatch(/2\.1 months of stock — your ceiling is 2 months/)
  })

  it('holds an order dearer than the sign-off amount', () => {
    const ws = { ...withSupplier(shop()), orders: [po({ qty: 1000, unitPrice: 240 })] }
    const holds = orderHolds(ws, 'PO-1')
    expect(holds.map((h) => h.kind)).toEqual(['signoff'])
    expect(holds[0].text).toMatch(/₹2,40,000 is above your ₹2,00,000 sign-off amount/)
  })

  it('follows the rules as the owner sets them', () => {
    let ws = { ...withSupplier(shop()), orders: [po({ qty: 1000, unitPrice: 240 })] }
    ws = { ...ws, policy: { ...ws.policy, ownerApprovalThreshold: 5_00_000, coverageCeiling: { A: 1, B: 2, C: 2 } } }
    // no longer above the sign-off amount; now above a one-month ceiling (1,500 m is 1.3 months)
    expect(orderHolds(ws, 'PO-1').map((h) => h.kind)).toEqual(['ceiling'])
  })

  it('puts the reason on the "never sent" card', () => {
    const ws = { ...withSupplier(shop()), orders: [po({ qty: 1000, unitPrice: 240 })] }
    const rows = buildRows(bundleFor(ws, TODAY), ws.policy)
    const card = decisionsFor(ws, TODAY, rows).find((d) => d.kind === 'unsent')!
    expect(card.detail).toMatch(/^held · ₹2,40,000 is above your ₹2,00,000 sign-off amount/)
  })
})

describe('a jobworker is late only past the grace days, everywhere', () => {
  const out = (grace: number) => {
    let ws = { ...shop(), vendors: [{ id: 'VN-002', name: 'Shree Wash', paymentTermsDays: 30 }] }
    ws = { ...ws, policy: { ...ws.policy, jobworkGraceDays: grace } }
    ;[ws] = sendOut(ws, { vendorId: 'VN-002', itemId: 'IT-001', qty: 100, sentOn: '2026-09-10', dueBack: '2026-09-21', expectedYield: 1 })
    return ws
  }

  it('is late two days past its date with no grace', () => {
    expect(incomingOf(out(0), TODAY).find((i) => /JW-1/.test(i.what))!.late).toBe(true)
    expect(landing(out(0), TODAY)[0].items.find((i) => i.key.startsWith('jw:'))!.status).toBe('critical')
  })

  it('is still in its grace with three days allowed', () => {
    expect(incomingOf(out(3), TODAY).find((i) => /JW-1/.test(i.what))!.late).toBe(false)
    const cell = landing(out(3), TODAY)[0].items.find((i) => i.key.startsWith('jw:'))!
    expect([cell.status, cell.note]).toEqual(['none', 'in grace'])
  })
})

/* ------------------------------------------------------- 2. the class -- */

describe('a material carries the class it is given', () => {
  it('starts as B, takes A when asked, and keeps it through an edit that does not say', () => {
    const ws = shop()
    const input = { id: 'IT-009', name: 'Rivets', code: 'RIV', uom: 'nos' as const, moq: 0, daily: 100, cushionDays: 7 }
    expect(buildItem(ws, input).itemClass).toBe('B')
    const a = buildItem(ws, { ...input, itemClass: 'A' })
    expect([a.itemClass, a.coverageCeilingMonths]).toEqual(['A', ws.policy.coverageCeiling.A])
    expect(buildItem(ws, { ...input, name: 'Brass rivets' }, a).itemClass).toBe('A')
  })

  it('reads a class written the ways a sheet writes it', () => {
    expect(['A', 'b', 'Class C', 'c class', ' a '].map(parseItemClass)).toEqual(['A', 'B', 'C', 'C', 'A'])
    expect(['', 'D', 'high'].map(parseItemClass)).toEqual([null, null, null])
  })
})

/* ------------------------------------------------ 3. one colour per figure -- */

describe('one band per measure', () => {
  it('draws the same lines the tiles always drew', () => {
    expect([90, 80, 70].map(BANDS.onTime)).toEqual(['good', 'warn', 'critical'])
    expect([1, 2, 5].map(BANDS.rejected)).toEqual(['good', 'warn', 'critical'])
    expect([0.01, 0.03, 0.06].map(BANDS.floorRejects)).toEqual(['good', 'warn', 'critical'])
  })

  it('judges on-time-in-full against the owner’s own target', () => {
    expect([96, 88, 80].map((p) => BANDS.otif(p, 95))).toEqual(['good', 'warn', 'critical'])
    // a stricter target moves every line with it
    expect([98, 96].map((p) => BANDS.otif(p, 98))).toEqual(['good', 'warn'])
  })
})

/* ---------------------------------------------------------- 4. "Noted" -- */

describe('noting one short line keeps the other noted', () => {
  it('two lines short on one order, both noted, both stay away', () => {
    let ws = made(60)
    ;[ws] = addOrder(ws, { customerId: 'CU-001', takenOn: '2026-09-15', promisedDate: '2026-09-25', lines: [line(100, 900), line(80, 900)] })
    const so = ws.customerOrders[ws.customerOrders.length - 1]
    for (const l of so.lines) [ws] = openJobForOrder(ws, so.id, l.id, TODAY)
    const shorts = dispatchDecisionsFor(ws, TODAY).filter((d) => d.kind === 'order-short-stock')
    expect(shorts).toHaveLength(2)
    for (const d of shorts) ws = noteDispatch(ws, d, TODAY)
    expect(dispatchDecisionsFor(ws, TODAY).filter((d) => d.kind === 'order-short-stock')).toEqual([])
  })

  it('a note written before, under the order, still counts for its line', () => {
    let ws = made(60)
    ;[ws] = addOrder(ws, { customerId: 'CU-001', takenOn: '2026-09-15', promisedDate: '2026-09-25', lines: [line(100, 900)] })
    const so = ws.customerOrders[ws.customerOrders.length - 1]
    ;[ws] = openJobForOrder(ws, so.id, so.lines[0].id, TODAY)
    const d = dispatchDecisionsFor(ws, TODAY).find((x) => x.kind === 'order-short-stock')!
    const sig = Object.values(noteDispatch(ws, d, TODAY).drafts).find((v) => typeof v === 'string' && v.startsWith(so.lines[0].id))
    ws = { ...ws, drafts: { ...ws.drafts, [`dispatch.shortNoted.${so.id}`]: sig } }
    expect(dispatchDecisionsFor(ws, TODAY).some((x) => x.kind === 'order-short-stock')).toBe(false)
  })

  it('"noted for today" clears yesterday’s notes rather than keeping them for ever', () => {
    const ws = { ...made(60), drafts: { [behindNotedKey('JB-001', '2026-09-20')]: true, [behindNotedKey('JB-001', '2026-09-22')]: true, other: 'kept' } }
    const card = { kind: 'job-behind', refs: { jobId: 'JB-001' } } as unknown as Decision
    const after = noteProduction(ws, card, TODAY)
    expect(Object.keys(after.drafts).sort()).toEqual(['other', behindNotedKey('JB-001', TODAY)])
  })
})

/* ---------------------------------------------------- 6. numbers once -- */

describe('a document number is never handed out twice', () => {
  it('the newest order deleted, the next is still one past it', () => {
    const before = { ...shop(), orders: [po(), po({ id: 'PO-002', no: 'PO-2' })] }
    const after = keepIssued(before, { ...before, orders: before.orders.filter((o) => o.no !== 'PO-2') })
    expect(after.issuedNos).toEqual({ PO: 2 })
    expect(nextNo('PO', after.orders, after.issuedNos)).toBe('PO-3')
    // and without the memory it would have been reused
    expect(nextNo('PO', after.orders)).toBe('PO-2')
  })

  it('remembers every prefix, and a job prefix under its own name', () => {
    let ws = made(60) // ST-1 on the floor
    ;[ws] = addOrder(ws, { customerId: 'CU-001', takenOn: '2026-09-15', promisedDate: '2026-10-05', lines: [line(10, 900)] })
    const all = keepIssued(null, ws)
    expect(all.issuedNos).toMatchObject({ SO: 1, 'JOB:ST': 1 })
    const gone = keepIssued(all, { ...all, jobs: [], customerOrders: [] })
    expect(nextJobNo(gone)).toBe('ST-2')
    expect(nextNo('SO', gone.customerOrders, gone.issuedNos)).toBe('SO-2')
  })

  it('changes nothing when nothing numbered changed', () => {
    const ws = keepIssued(null, { ...shop(), orders: [po()] })
    expect(keepIssued(ws, ws)).toBe(ws)
  })
})
