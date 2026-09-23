/**
 * The inbound desk, for an owner's own company.
 *
 * The sample company's inbound stage is proved by `inbound.test.ts` against its
 * seed. This proves the owner's version against a workspace built the way an
 * owner builds one — typed in, nothing from the sample — and that it runs the
 * same domain arithmetic rather than a copy of it.
 */
import { describe, expect, it } from 'vitest'
import { emptyWorkspace } from '@/lib/workspace/defaults'
import { INBOUND_STEPS, SOURCING_STEPS, progressOf, stepsFor } from '@/lib/workspace/checklist'
import {
  addCheck, checkProblem, checksFor, readBucket, readCheckKind, removeCheck, setChecks,
  uncheckedItems, type CheckInput,
} from '@/lib/workspace/checks'
import { decisionsFor } from '@/lib/workspace/decisions'
import { inboundDecisionsFor, inboundOpenCount } from '@/lib/workspace/inbound-decisions'
import { JOBWORKER, jobworkers } from '@/lib/workspace/jobwork'
import { metricsFor, pickedMetrics, INBOUND_PICKS, DEFAULT_PICKS } from '@/lib/workspace/metrics'
import { BUILT, STAGE_HOME, inboundNav, navFor, sourcingNav } from '@/lib/workspace/reveal'
import { removeItem, removeVendor } from '@/lib/workspace/sourcing'
import { parseStored } from '@/lib/workspace/storage'
import { SCHEMA, type Workspace } from '@/lib/workspace/types'
import { applyImport, importable, planImport } from '@/lib/sheet/import'
import {
  arrive, closeBlockedBy, closeReceipt, markCheck, measuredRejectionPct, outstandingOn,
  recordReceipt, removeReceipt,
} from '@/lib/workspace/receipts'
import { qcHeld } from '@/lib/workspace/inbound'
import { defectPct } from '@/lib/workspace/metrics'
import { applyCount } from '@/lib/workspace/count'
import { buildGrn, grnFileName, grnSendableFor } from '@/lib/paper/grn'
import type { Item, Vendor, VendorItem } from '@/lib/domain/types'

const TODAY = '2026-09-20'

const fresh = (): Workspace => emptyWorkspace({
  id: 'WS-1', createdAt: '2026-01-01',
  ownerName: 'R. Mehta', contact: '', companyName: 'Patel Heaters', makes: '',
})

const item = (over: Partial<Item> = {}): Item => ({
  id: 'IT-001', code: 'CRCA', name: 'CRCA sheet', uom: 'kg', itemClass: 'B',
  coverageCeilingMonths: 2, moq: 1, safetyStock: 0, avgDailyConsumption: 2,
  floorConsumptionPerDay: 2, lastPurchaseRate: 80, feeds: [], ...over,
})
const vendor = (over: Partial<Vendor> = {}): Vendor => ({
  id: 'VN-001', name: 'Shah Metals', paymentTermsDays: 30, ...over,
})
const rate = (over: Partial<VendorItem> = {}): VendorItem => ({
  vendorId: 'VN-001', itemId: 'IT-001', rate: 80,
  freightPerUnit: 0, nonCreditableGst: 0, paymentTermCost: 0, rejectionAllowance: 0,
  quotedLeadTimeDays: 7, trailingLeadTimeDays: 7, trailingRejectionRate: 0,
  onTimePct: 0, score: 0, quoteValidUntil: '', ...over,
})
const set = (): Workspace => ({
  ...fresh(),
  items: [item(), item({ id: 'IT-002', code: 'SS', name: 'SS strip' })],
  vendors: [vendor()],
  vendorItems: [rate()],
})
const gauge = (over: Partial<CheckInput> = {}): CheckInput => ({
  itemId: 'IT-001', label: 'Thickness', kind: 'measure', min: 1.15, max: 1.25, unit: 'mm',
  failBucket: 'damaged', failReason: 'Out of gauge', mandatory: true, ...over,
})

/* ================================================================ the steps */

describe('setting up the gate', () => {
  it('asks for the masters first when a company starts here', () => {
    const p = progressOf(fresh(), INBOUND_STEPS)
    expect(p.total).toBe(5)
    expect(p.doneCount).toBe(0)
    expect(p.next?.id).toBe('materials')
  })

  it('shares the sourcing steps it needs — the same objects, so one tick ticks both', () => {
    expect(INBOUND_STEPS[0]).toBe(SOURCING_STEPS.find((s) => s.id === 'materials'))
    expect(INBOUND_STEPS[1]).toBe(SOURCING_STEPS.find((s) => s.id === 'suppliers'))
    const p = progressOf(set(), INBOUND_STEPS)
    expect(p.doneCount).toBe(2)
    expect(p.next?.id).toBe('checks')
  })

  it('ticks the checks step on the first check, and un-ticks it on the last one going', () => {
    const [ws, id] = addCheck(set(), gauge())
    expect(progressOf(ws, INBOUND_STEPS).steps[2].done).toBe(true)
    expect(progressOf(removeCheck(ws, id), INBOUND_STEPS).steps[2].done).toBe(false)
  })

  it('accepts "we do not send material out" as a real answer', () => {
    const ws = set()
    const step = INBOUND_STEPS.find((s) => s.id === 'jobworkers')!
    expect(step.done(ws)).toBe(false)
    expect(step.done({ ...ws, drafts: { 'inbound.noJobwork': true } })).toBe(true)
    expect(step.summary({ ...ws, drafts: { 'inbound.noJobwork': true } })).toBe('no material sent out')
  })

  it('counts a supplier typed Jobworker as a jobworker, and gives them no rates', () => {
    const ws: Workspace = {
      ...set(),
      vendors: [vendor(), vendor({ id: 'VN-002', name: 'Shree Galvanisers' })],
      vendorType: { 'VN-002': JOBWORKER },
    }
    expect(jobworkers(ws).map((v) => v.name)).toEqual(['Shree Galvanisers'])
    expect(INBOUND_STEPS.find((s) => s.id === 'jobworkers')!.done(ws)).toBe(true)
    // a jobworker's charge is for a process, never a rate against the steel
    expect(ws.vendorItems.some((vi) => vi.vendorId === 'VN-002')).toBe(false)
  })

  it('ticks the gate rules only once the owner has agreed them', () => {
    const step = INBOUND_STEPS.find((s) => s.id === 'gateRules')!
    expect(step.done(set())).toBe(false)
    expect(step.done({ ...set(), drafts: { 'inbound.rules.agreed': true } })).toBe(true)
  })

  it('gives each stage its own list, and sourcing keeps its five', () => {
    expect(stepsFor('inbound')).toBe(INBOUND_STEPS)
    expect(stepsFor('sourcing')).toBe(SOURCING_STEPS)
    expect(stepsFor('inventory')).toBe(SOURCING_STEPS)
  })
})

/* =============================================================== the checks */

describe('what to check when it arrives', () => {
  it('refuses a reading with no band, and a band upside down', () => {
    const ws = set()
    expect(checkProblem(ws, gauge({ min: undefined, max: undefined }))).toMatch(/band/)
    expect(checkProblem(ws, gauge({ min: 2, max: 1 }))).toMatch(/lowest is above/)
    expect(checkProblem(ws, gauge())).toBeNull()
  })

  it('keeps no band on anything that is not a reading', () => {
    const [ws] = addCheck(set(), gauge({ kind: 'document', label: 'Mill certificate' }))
    const c = checksFor(ws, 'IT-001')[0]
    expect(c.min).toBeUndefined()
    expect(c.max).toBeUndefined()
  })

  it('always leaves a reason on a check, the owner\'s or its own name', () => {
    const [ws] = addCheck(set(), gauge({ failReason: '' }))
    expect(checksFor(ws, 'IT-001')[0].failReason).toBe('Thickness failed at the gate')
  })

  it('names a check once per material', () => {
    const [ws] = addCheck(set(), gauge())
    expect(checkProblem(ws, gauge({ label: 'thickness ' }))).toMatch(/already has a check/)
    // but the same name on another material is a different check
    expect(checkProblem(ws, gauge({ itemId: 'IT-002' }))).toBeNull()
  })

  it('writes a material\'s list as a whole: edits, adds and takes off', () => {
    let [ws, keep] = addCheck(set(), gauge())
    ;[ws] = addCheck(ws, gauge({ label: 'Rust', kind: 'visual' }))
    ws = setChecks(ws, 'IT-001', [
      { id: keep, input: gauge({ max: 1.3 }) },
      { input: gauge({ label: 'Mill certificate', kind: 'document' }) },
    ])
    const labels = checksFor(ws, 'IT-001').map((c) => c.label).sort()
    expect(labels).toEqual(['Mill certificate', 'Thickness'])
    expect(checksFor(ws, 'IT-001').find((c) => c.id === keep)!.max).toBe(1.3)
  })

  it('names the materials nobody has written a check for — a number that goes down', () => {
    const ws = set()
    expect(uncheckedItems(ws).length).toBe(2)
    const [after] = addCheck(ws, gauge())
    expect(uncheckedItems(after).map((i) => i.id)).toEqual(['IT-002'])
    expect(inboundNav(after, TODAY).find((r) => r.label === 'Checks')!.badge).toBe('1')
  })

  it('reads a sheet\'s wording for how and where, and refuses what it cannot read', () => {
    expect(readCheckKind('Measurement')).toBe('measure')
    expect(readCheckKind('MTC')).toBe('document')
    expect(readCheckKind('smell')).toBeNull()
    expect(readBucket('Reject')).toBe('damaged')
    expect(readBucket('QC hold')).toBe('qc_hold')
  })

  it('goes with its material when the material is deleted', () => {
    const [ws] = addCheck(set(), gauge())
    expect(checksFor(removeItem(ws, 'IT-001'), 'IT-001')).toEqual([])
  })
})

/* ================================================================ importing */

describe('an inspection sheet brought in', () => {
  const mapping = [
    { column: 0, target: 'item' }, { column: 1, target: 'label' }, { column: 2, target: 'kind' },
    { column: 3, target: 'min' }, { column: 4, target: 'max' }, { column: 5, target: 'unit' },
    { column: 6, target: 'bucket' },
  ]
  const body = [
    ['CRCA sheet', 'Thickness', 'reading', '1.15', '1.25', 'mm', 'reject'],
    ['CRCA sheet', 'Mill certificate', 'certificate', '', '', '', 'hold'],
    ['Brass rod', 'Diameter', 'reading', '9.9', '10.1', 'mm', 'reject'],
    ['SS strip', 'Width', 'reading', '', '', 'mm', 'reject'],
  ]

  it('writes the rows the form would accept and names the ones it would not', () => {
    const plans = planImport(set(), 'check', body, mapping as never, 'update')
    expect(plans.map((p) => p.status)).toEqual(['new', 'new', 'skip', 'skip'])
    expect(plans[2].reason).toMatch(/No material called/)
    // a reading with no band is refused here, not written and discovered later
    expect(plans[3].reason).toMatch(/band/)

    const { ws } = applyImport(set(), 'check', plans, mapping as never, 'gate.xlsx', TODAY)
    const crca = checksFor(ws, 'IT-001')
    expect(crca.map((c) => c.kind).sort()).toEqual(['document', 'measure'])
    expect(crca.find((c) => c.label === 'Thickness')).toMatchObject({ min: 1.15, max: 1.25, failBucket: 'damaged' })
  })

  it('updates the same check on a second import rather than doubling it', () => {
    const plans1 = planImport(set(), 'check', body.slice(0, 1), mapping as never, 'update')
    const { ws } = applyImport(set(), 'check', plans1, mapping as never, 'gate.xlsx', TODAY)
    const again = [['CRCA sheet', 'Thickness', 'reading', '1.1', '1.3', 'mm', 'reject']]
    const plans2 = planImport(ws, 'check', again, mapping as never, 'update')
    expect(plans2[0].status).toBe('update')
    const { ws: w2 } = applyImport(ws, 'check', plans2, mapping as never, 'gate.xlsx', TODAY)
    expect(checksFor(w2, 'IT-001')).toHaveLength(1)
    expect(checksFor(w2, 'IT-001')[0]).toMatchObject({ min: 1.1, max: 1.3 })
  })

  it('never imports receipts or challans — those are recorded as they happen', () => {
    expect(importable('check')).toBe(true)
    expect(importable('receipt')).toBe(false)
    expect(importable('challan')).toBe(false)
    const plans = planImport(set(), 'receipt', [['x']], [{ column: 0, target: 'id' }] as never, 'update')
    expect(plans[0].status).toBe('skip')
  })
})

/* ================================================================== the rail */

describe('the inbound rail', () => {
  it('is open for an owner, and its tile leads to the gate', () => {
    expect(BUILT).toContain('inbound')
    expect(STAGE_HOME.inbound).toBe('/inbound/dashboard')
  })

  it('has five rows, none of them "later"', () => {
    const rows = inboundNav(set(), TODAY)
    expect(rows.map((r) => r.label)).toEqual(['Dashboard', 'Receiving', 'Checks', 'Open orders', 'Jobwork'])
    expect(rows.some((r) => r.later)).toBe(false)
    // five rows is short enough that nothing needs a "More"
    expect(rows.some((r) => r.tucked)).toBe(false)
    expect(navFor('inbound', set(), TODAY)).toEqual(rows)
    expect(navFor('sourcing', set(), TODAY)).toEqual(sourcingNav(set(), TODAY))
  })
})

/* ================================================================= the queue */

describe('the gate\'s queue', () => {
  /*
   * With stock on the shelf to cover the wait: an order that lands after the
   * line stops is its own decision (lands-late, in `inbound-orders.test.ts`),
   * and these are about the lorry, not the stockout.
   */
  const due = (expectedOn: string): Workspace => ({
    ...set(),
    stockLots: [{ id: 'LOT-001', itemId: 'IT-001', batchNo: 'OPENING', qty: 500, usability: 'usable' }],
    orders: [{
      id: 'PO-001', no: 'PO-1', vendorId: 'VN-001', itemId: 'IT-001', qty: 100, unitPrice: 80,
      orderedOn: '2026-09-10', expectedOn, state: 'confirmed',
    }],
  })

  it('asks for an order due today, and one past its date, on the gate — never on sourcing', () => {
    for (const on of [TODAY, '2026-09-17']) {
      const ws = due(on)
      expect(inboundDecisionsFor(ws, TODAY).map((d) => d.kind)).toEqual(['to-receive'])
      expect(decisionsFor(ws, TODAY).map((d) => d.kind)).not.toContain('to-receive')
    }
    expect(inboundDecisionsFor(due('2026-09-17'), TODAY)[0].detail).toMatch(/3 days past/)
  })

  it('says nothing about an order still on its way', () => {
    expect(inboundDecisionsFor(due('2026-09-28'), TODAY)).toEqual([])
    expect(inboundOpenCount(due('2026-09-28'), TODAY)).toBe(0)
  })

  it('keeps chasing a late supplier on sourcing', () => {
    expect(decisionsFor(due('2026-09-17'), TODAY).map((d) => d.kind)).toContain('late')
  })

  it('asks nothing of a date it was not given', () => {
    expect(inboundDecisionsFor(due(TODAY), '')).toEqual([])
  })
})

/* =============================================================== the figures */

describe('the gate\'s figures', () => {
  it('says each one is waiting for something on day one, rather than showing a nought', () => {
    const gate = metricsFor(fresh(), TODAY)
      .filter((m) => ['qcHeld', 'inspectedOnTime', 'atJobworkers', 'unacked'].includes(m.key))
    expect(gate).toHaveLength(4)
    for (const m of gate) {
      expect(m.measured).toBe(false)
      expect(m.sub).toBe('nothing to measure yet')
      expect(m.value).not.toMatch(/^[\d₹]/)
    }
  })

  it('keeps each desk\'s choice separately', () => {
    expect(pickedMetrics(fresh(), TODAY, 'inbound').map((m) => m.key)).toEqual(INBOUND_PICKS)
    expect(pickedMetrics(fresh(), TODAY).map((m) => m.key)).toEqual(DEFAULT_PICKS)
    const ws = { ...fresh(), metricPicks: ['stale'], inboundMetricPicks: ['qcHeld'] }
    expect(pickedMetrics(ws, TODAY, 'inbound').map((m) => m.key)).toEqual(['qcHeld'])
    expect(pickedMetrics(ws, TODAY).map((m) => m.key)).toEqual(['stale'])
  })
})

/* =========================================================== saved and read */

describe('a workspace saved before the gate existed', () => {
  it('reads back with empty inbound lists and every old receipt closed', () => {
    const old = {
      ...set(),
      specChecks: undefined, challans: undefined, inboundMetricPicks: undefined,
      receipts: [{
        id: 'GR-001', orderId: 'PO-001', vendorId: 'VN-001', itemId: 'IT-001',
        qty: 10, accepted: 10, rejected: 0, orderedOn: '2026-09-01', receivedOn: '2026-09-08',
      }],
      schema: 5,
    }
    const back = parseStored(JSON.stringify({ workspace: old, session: { actor: 'R. Mehta', role: 'owner' } }))!
    expect(back.workspace.specChecks).toEqual([])
    expect(back.workspace.challans).toEqual([])
    expect(back.workspace.receipts[0].status).toBeUndefined()
    expect(back.workspace.schema).toBe(SCHEMA)
    expect(back.workspace.views.check).toBeDefined()
  })

  it('does not reissue a check id after the newest is deleted', () => {
    let [ws, a] = addCheck(set(), gauge())
    ;[ws] = addCheck(ws, gauge({ label: 'Rust', kind: 'visual' }))
    ws = removeCheck(ws, checksFor(ws, 'IT-001').find((c) => c.label === 'Rust')!.id)
    const [, next] = addCheck(ws, gauge({ label: 'Weight', kind: 'visual' }))
    expect(a).toBe('CK-001')
    expect(next).toBe('CK-003')
  })

  it('takes a jobworker\'s challans with them', () => {
    const ws: Workspace = {
      ...set(),
      vendors: [vendor(), vendor({ id: 'VN-002', name: 'Shree Galvanisers' })],
      vendorType: { 'VN-002': JOBWORKER },
      challans: [{
        id: 'JW-001', no: 'JW-1', vendorId: 'VN-002', itemId: 'IT-001', qtySent: 50,
        sentOn: '2026-09-10', dueBack: '2026-09-25', expectedYield: 1, rate: 80, status: 'out',
      }],
    }
    expect(removeVendor(ws, 'VN-002').challans).toEqual([])
  })
})

/* ================================================================= the gate */

describe('goods at the gate', () => {
  const po = (over: Partial<Workspace['orders'][0]> = {}): Workspace['orders'][0] => ({
    id: 'PO-001', no: 'PO-1', vendorId: 'VN-001', itemId: 'IT-001', qty: 100, unitPrice: 82,
    orderedOn: '2026-09-10', expectedOn: '2026-09-18', state: 'confirmed', ...over,
  })
  const withOrder = (): Workspace => {
    const [ws] = addCheck({ ...set(), orders: [po()] }, gauge())
    return ws
  }
  const at = (ws: Workspace, qty = 100, on = '2026-09-17'): [Workspace, string] =>
    arrive(ws, { order: ws.orders[0], qty, receivedOn: on })
  const usable = (ws: Workspace) => ws.stockLots
    .filter((l) => l.itemId === 'IT-001' && l.usability === 'usable').reduce((a, l) => a + l.qty, 0)

  it('arrives OPEN: counted as arrived, not as stock, and the order does not move', () => {
    const [ws, id] = at(withOrder(), 100, '2026-09-19')
    const r = ws.receipts.find((x) => x.id === id)!
    expect(r).toMatchObject({ status: 'open', accepted: 0, rejected: 0, orderedOn: '2026-09-10' })
    expect(ws.stockLots).toEqual([])
    expect(ws.orders[0].state).toBe('confirmed')
    expect(outstandingOn(ws, ws.orders[0])).toBe(0)
    // the lorry arrived when it arrived: quoted seven days, took nine, and the
    // lead time is measured from the arrival, not from whenever it is inspected
    expect(ws.vendorItems[0].trailingLeadTimeDays).toBe(9)
  })

  it('will not close on a partial inspection, an over-rejection, or an unexplained exception', () => {
    let [ws, id] = at(withOrder())
    const r = () => ws.receipts.find((x) => x.id === id)!
    expect(closeBlockedBy(ws, r(), 0)).toMatch(/has to be answered/)

    ws = markCheck(ws, id, { checkId: checksFor(ws, 'IT-001')[0].id, outcome: 'fail', measured: 1.4 })
    expect(closeBlockedBy(ws, r(), 101)).toMatch(/more than arrived/)
    // a failure with nothing rejected: allowed, but only with a reason
    expect(closeBlockedBy(ws, r(), 0)).toMatch(/say why it is being accepted/)
    expect(closeBlockedBy(ws, r(), 0, 'Customer accepts 1.4 mm on this job')).toBeNull()
    // and a close that should not happen does not happen
    expect(closeReceipt(ws, id, { rejected: 0, inspector: 'S. Kale', closedAt: TODAY })).toBe(ws)
  })

  it('closes into a usable lot AND a non-usable one, in the failed check\'s bucket, with its reason', () => {
    let [ws, id] = at(withOrder())
    ws = markCheck(ws, id, { checkId: checksFor(ws, 'IT-001')[0].id, outcome: 'fail', measured: 1.4 })
    ws = closeReceipt(ws, id, { rejected: 4, inspector: 'S. Kale', closedAt: TODAY })
    const lots = ws.stockLots.filter((l) => l.itemId === 'IT-001')
    expect(lots.find((l) => l.id === `LOT-${id}`)).toMatchObject({ qty: 96, usability: 'usable' })
    expect(lots.find((l) => l.id === `LOT-${id}-NU`)).toMatchObject({
      qty: 4, usability: 'damaged', usabilityReason: 'Out of gauge',
    })
    const r = ws.receipts.find((x) => x.id === id)!
    expect(r).toMatchObject({ status: 'closed', accepted: 96, rejected: 4, inspector: 'S. Kale', closedAt: TODAY })
    expect(r.failedCheckIds).toEqual([checksFor(ws, 'IT-001')[0].id])
    expect(ws.orders[0].state).toBe('delivered')
  })

  it('moves the last purchase price to what this order paid, and back if it is taken back', () => {
    let [ws, id] = at(withOrder())
    ws = markCheck(ws, id, { checkId: checksFor(ws, 'IT-001')[0].id, outcome: 'pass', measured: 1.2 })
    ws = closeReceipt(ws, id, { rejected: 0, inspector: 'S. Kale', closedAt: TODAY })
    expect(ws.items[0].lastPurchaseRate).toBe(82)
    const back = removeReceipt(ws, id)
    expect(back.items[0].lastPurchaseRate).toBe(80)
    expect(back.stockLots).toEqual([])
    expect(back.orders[0].state).toBe('confirmed')
  })

  it('closes a material with no checks unchecked, and says so', () => {
    const ws0: Workspace = { ...set(), orders: [po({ itemId: 'IT-002' })] }
    const [ws, id] = arrive(ws0, { order: ws0.orders[0], qty: 50, receivedOn: '2026-09-17' })
    const done = closeReceipt(ws, id, { rejected: 0, inspector: 'S. Kale', closedAt: TODAY })
    expect(done.receipts.find((r) => r.id === id)!.noSpec).toBe(true)
  })

  it('does not call a delivery clean, or rejected, until it is inspected', () => {
    let [ws, id] = at(withOrder())
    expect(measuredRejectionPct(ws, 'VN-001', 'IT-001')).toBeNull()
    expect(defectPct(ws)).toBeNull()
    ws = markCheck(ws, id, { checkId: checksFor(ws, 'IT-001')[0].id, outcome: 'fail', measured: 1.4 })
    ws = closeReceipt(ws, id, { rejected: 10, inspector: 'S. Kale', closedAt: TODAY })
    expect(measuredRejectionPct(ws, 'VN-001', 'IT-001')).toBe(10)
    // and a delivery is judged against the record before it, not including it
    expect(measuredRejectionPct(ws, 'VN-001', 'IT-001', id)).toBeNull()
  })

  it('stops calling an order late, or on its way, once all of it is at the gate', () => {
    const late = withOrder()
    expect(decisionsFor(late, TODAY).map((d) => d.kind)).toContain('late')
    const [ws] = at(late)
    expect(decisionsFor(ws, TODAY).map((d) => d.kind)).not.toContain('late')
    expect(inboundDecisionsFor(ws, TODAY).map((d) => d.kind)).not.toContain('to-receive')
    // and the gate asks for the inspection instead
    expect(inboundDecisionsFor(ws, TODAY).map((d) => d.kind)).toEqual(['at-gate'])
  })

  it('raises a receipt left uninspected past the window in the worst band', () => {
    const [ws] = at(withOrder(), 100, '2026-09-14')   // six days before TODAY, window is three
    const d = inboundDecisionsFor(ws, TODAY)
    expect(d.map((x) => [x.kind, x.band])).toEqual([['qc-overdue', 'stops']])
    expect(d[0].detail).toMatch(/past the QC window/)
  })

  it('values what stands at the gate at the last purchase price', () => {
    const [ws] = at(withOrder(), 50)
    expect(qcHeld(ws).value).toBe(50 * 80)
  })

  it('raises a rejection well beyond the supplier\'s own record as a pattern', () => {
    // a clean history first, then a delivery with a fifth of it turned back
    let ws: Workspace = { ...withOrder(), orders: [po(), po({ id: 'PO-002', no: 'PO-2', expectedOn: '2026-09-19' })] }
    let id: string
    ;[ws, id] = arrive(ws, { order: ws.orders[0], qty: 100, receivedOn: '2026-09-15' })
    ws = markCheck(ws, id, { checkId: checksFor(ws, 'IT-001')[0].id, outcome: 'pass', measured: 1.2 })
    ws = closeReceipt(ws, id, { rejected: 2, reason: 'Two sheets bent in the lorry', inspector: 'S. Kale', closedAt: '2026-09-15' })
    ;[ws, id] = arrive(ws, { order: ws.orders[1], qty: 100, receivedOn: '2026-09-18' })
    ws = markCheck(ws, id, { checkId: checksFor(ws, 'IT-001')[0].id, outcome: 'fail', measured: 1.4 })
    ws = closeReceipt(ws, id, { rejected: 20, inspector: 'S. Kale', closedAt: '2026-09-18' })
    const spike = inboundDecisionsFor(ws, TODAY).find((d) => d.kind === 'spike')!
    expect(spike.band).toBe('costs')
    expect(spike.detail).toMatch(/20% rejected/)
    // "noted" sticks
    const noted = { ...ws, drafts: { ...ws.drafts, [`inbound.spikeNoted.${id}`]: true } }
    expect(inboundDecisionsFor(noted, TODAY).some((d) => d.kind === 'spike')).toBe(false)
  })

  it('does not call the first rejection from a supplier a pattern — there is nothing to compare it to', () => {
    let [ws, id] = at(withOrder())
    ws = markCheck(ws, id, { checkId: checksFor(ws, 'IT-001')[0].id, outcome: 'fail', measured: 1.4 })
    ws = closeReceipt(ws, id, { rejected: 4, inspector: 'S. Kale', closedAt: TODAY })
    expect(inboundDecisionsFor(ws, TODAY).some((d) => d.kind === 'spike')).toBe(false)
  })

  it('keeps a half-done inspection, mark by mark', () => {
    let [ws, id] = at(withOrder())
    const check = checksFor(ws, 'IT-001')[0].id
    ws = markCheck(ws, id, { checkId: check, outcome: 'pass', measured: 1.2 })
    ws = markCheck(ws, id, { checkId: check, outcome: 'fail', measured: 1.3 })
    expect(ws.receipts.find((r) => r.id === id)!.results).toEqual([{ checkId: check, outcome: 'fail', measured: 1.3 }])
  })
})

/* ================================================================= the GRN */

describe('the goods receipt note', () => {
  it('exists only for a closed receipt — an open one has no verdict to print', () => {
    const ws0: Workspace = { ...set(), orders: [{
      id: 'PO-001', no: 'PO-1', vendorId: 'VN-001', itemId: 'IT-001', qty: 100, unitPrice: 80,
      orderedOn: '2026-09-10', expectedOn: '2026-09-18', state: 'confirmed',
    }] }
    let [ws] = addCheck(ws0, gauge())
    ;[ws] = addCheck(ws, gauge({ label: 'Mill certificate', kind: 'document', failBucket: 'qc_hold', failReason: 'No certificate' }))
    let id: string
    ;[ws, id] = arrive(ws, { order: ws.orders[0], qty: 100, receivedOn: '2026-09-17' })
    expect(buildGrn(ws, id)).toBeNull()

    const [thick, cert] = checksFor(ws, 'IT-001').sort((a, b) => a.label.localeCompare(b.label)).reverse()
    ws = markCheck(ws, id, { checkId: thick.id, outcome: 'fail', measured: 1.32 })
    ws = markCheck(ws, id, { checkId: cert.id, outcome: 'pass' })
    ws = closeReceipt(ws, id, { rejected: 4, inspector: 'S. Kale', closedAt: TODAY })

    const doc = buildGrn(ws, id)!
    expect(doc.against).toBe('Order PO-1')
    expect(doc.received).toBe('100 kg')
    expect(doc.accepted).toBe('96 kg')
    expect(doc.rejected).toBe('4 kg')
    expect(doc.checks.map((c) => [c.label, c.result])).toEqual(
      expect.arrayContaining([['Thickness', 'Fail'], ['Mill certificate', 'Pass']]))
    expect(doc.checks.find((c) => c.label === 'Thickness')!.reading).toBe('1.32 mm')
    expect(doc.rejectedBecause).toBe('Out of gauge')
    expect(doc.inspector).toBe('S. Kale')

    // the message a phone will actually send carries all of it
    const msg = grnSendableFor(doc).message
    expect(msg).toMatch(/rejected 4 kg/)
    expect(msg).toMatch(/Rejected because: Out of gauge/)
    expect(msg).toMatch(/Thickness 1\.32 mm \(needed 1\.15 – 1\.25 mm\)/)
    expect(grnFileName(doc)).toBe('GRN-GR-001-Shah-Metals.pdf')
  })
})

/* ================================================================ recounting */

describe('a recount after goods have arrived', () => {
  it('writes the difference, so arrivals are not counted twice', () => {
    const ws0: Workspace = { ...set(), orders: [{
      id: 'PO-001', no: 'PO-1', vendorId: 'VN-001', itemId: 'IT-001', qty: 40, unitPrice: 80,
      orderedOn: '2026-09-10', expectedOn: '2026-09-18', state: 'confirmed',
    }] }
    let ws = applyCount(ws0, '2026-09-11', { 'IT-001': { good: 120 } })
    ws = recordReceipt(ws, { order: ws.orders[0], qty: 40, accepted: 40, rejected: 0, receivedOn: '2026-09-17' })
    const onHand = (w: Workspace) => w.stockLots
      .filter((l) => l.itemId === 'IT-001' && l.usability === 'usable').reduce((a, l) => a + l.qty, 0)
    expect(onHand(ws)).toBe(160)
    // the physical count agrees with the book: nothing changes
    expect(onHand(applyCount(ws, TODAY, { 'IT-001': { good: 160 } }))).toBe(160)
    // five short on the shelf: a correction of minus five, as its own lot
    const short = applyCount(ws, TODAY, { 'IT-001': { good: 155 } })
    expect(onHand(short)).toBe(155)
    expect(short.stockLots.find((l) => l.batchNo === `COUNT-${TODAY}`)!.qty).toBe(-5)
  })

  it('still replaces the opening count when nothing else has moved it', () => {
    let ws = applyCount(set(), '2026-09-11', { 'IT-001': { good: 120 } })
    ws = applyCount(ws, TODAY, { 'IT-001': { good: 110 } })
    expect(ws.stockLots.filter((l) => l.itemId === 'IT-001')).toHaveLength(1)
    expect(ws.stockLots[0].qty).toBe(110)
  })

  it('leaves a material nobody typed a figure for exactly as it was', () => {
    let ws = applyCount(set(), '2026-09-11', { 'IT-001': { good: 120 }, 'IT-002': { good: 30 } })
    ws = applyCount(ws, TODAY, { 'IT-001': { good: 100 } })
    expect(ws.stockLots.find((l) => l.itemId === 'IT-002')!.qty).toBe(30)
  })
})
