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
    expect(navFor('inbound', set(), TODAY)).toEqual(rows)
    expect(navFor('sourcing', set(), TODAY)).toEqual(sourcingNav(set(), TODAY))
  })
})

/* ================================================================= the queue */

describe('the gate\'s queue', () => {
  const due = (expectedOn: string): Workspace => ({
    ...set(),
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
