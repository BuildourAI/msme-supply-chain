/**
 * The three Inbound systems, checked the same way §9 is: a figure on screen and
 * the figure the formula produces have to be the same number, and the ones that
 * cross into the Sourcing seed have to agree with it.
 */
import { describe, expect, it } from 'vitest'
import * as I from '@/lib/domain/inbound'
import { DEFAULT_POLICY } from '@/lib/domain/policy'
import { challans, checksFor, grns, poSync, specChecks, TODAY_INBOUND } from '@/lib/seed/inbound'
import * as S from '@/lib/seed/sourcing'

const P = DEFAULT_POLICY
const open = grns.filter((g) => g.status === 'open')
const closed = grns.filter((g) => g.status === 'closed')
const grn = (no: string) => grns.find((g) => g.grnNo === no)!
const sync = (id: string) => poSync.find((s) => s.poLineId === id)!
const challan = (id: string) => challans.find((c) => c.id === id)!
const item = (id: string) => S.items.find((i) => i.id === id)!
const returnedFor = (id: string) => I.returnedQty(challan(id), grns).value

/* ------------------------------------------------------------------ INB-01 */

describe('INB-01 · a receipt is not usable stock until a GRN closes', () => {
  const ages: Record<string, number> = {
    'GRN-1187': 1, 'GRN-1188': 2, 'GRN-1189': 4, 'GRN-1190': 0, 'GRN-1192': 0,
  }
  for (const [no, days] of Object.entries(ages)) {
    it(`${no} has been in QC ${days} day(s)`, () =>
      expect(I.qcAgeDays(grn(no).receivedOn, TODAY_INBOUND).value).toBe(days))
  }

  it('escalates only the receipt past the QC window, not the one merely at the limit', () => {
    expect(I.qcState(ages['GRN-1189'], P)).toBe('overdue')
    expect(I.qcState(ages['GRN-1188'], P)).toBe('at_limit')
    expect(I.qcState(ages['GRN-1187'], P)).toBe('fresh')
  })

  it('issuable date is the received date plus the policy QC days', () =>
    expect(I.issuableFrom('2026-09-01', P).value).toBe('2026-09-03'))

  it('₹2,48,528 is standing at the gate, received and not issuable', () =>
    expect(I.valueHeldInQc(open).value).toBe(248528))

  it('a GRN cannot close until every mandatory check is marked', () => {
    const checks = checksFor('EL-TUB-INC85')
    expect(checks).toHaveLength(4)
    expect(I.inspectionComplete(checks, [])).toBe(false)
    const partial = checks.slice(0, 3).map((c) => ({ checkId: c.id, outcome: 'pass' as const }))
    expect(I.inspectionComplete(checks, partial)).toBe(false)
    const all = checks.map((c) => ({ checkId: c.id, outcome: 'pass' as const }))
    expect(I.inspectionComplete(checks, all)).toBe(true)
  })

  it('a not_checked mark does not count as marked', () => {
    const checks = checksFor('HW-GLD-M20')
    const results = checks.map((c) => ({ checkId: c.id, outcome: 'not_checked' as const }))
    expect(I.inspectionComplete(checks, results)).toBe(false)
  })

  it('a measured reading decides its own outcome — nobody has to agree with it', () => {
    const od = specChecks.find((c) => c.id === 'SC-TUB-OD')!
    expect(I.outcomeForMeasure(od, 8.5)).toBe('pass')
    expect(I.outcomeForMeasure(od, 8.4)).toBe('pass')   // the band is inclusive
    expect(I.outcomeForMeasure(od, 8.61)).toBe('fail')
    expect(I.outcomeForMeasure(od, 8.39)).toBe('fail')
    expect(I.outcomeForMeasure(od, undefined)).toBe('not_checked')
  })

  it('every failure routes to one of the §9.1 non-usable reasons, never free text', () => {
    const reasons = new Set(S.stockLots.filter((l) => l.usabilityReason).map((l) => l.usabilityReason))
    const specReasons = specChecks.filter((c) => c.failBucket !== 'usable').map((c) => c.failReason)
    expect(specReasons.length).toBeGreaterThan(0)
    for (const r of specReasons) expect(typeof r).toBe('string')
    // the four §9.1 lot reasons all appear as a possible GRN outcome
    for (const r of ['Ovality out of tolerance', 'Surface rust rejected at GRN',
                     'Moisture ingress — needs re-drying', 'Drawn off-gauge']) {
      expect(specReasons).toContain(r)
      expect(reasons.has(r)).toBe(true)
    }
  })

  it('accepted = received − rejected, and partial acceptance is ordinary', () =>
    expect(I.acceptedQty(1000, 50).value).toBe(950))

  /* the loop the build was missing: §9.1's trailing rejection rates are what the
     closed GRNs average to, so closing one re-prices the Sourcing Desk */
  const trailing: [string, string, number][] = [
    ['Nirmal Alloy Tubes', 'EL-TUB-INC85', 1.8],
    ['Mahalaxmi Steel', 'RM-CRC-120', 1.5],
    ['Nirmal Minerals', 'RM-MGO-EG', 1.6],
    ['Krishna Electricals', 'HW-GLD-M20', 1.3],
    ['Krishna Ceramics', 'CM-TRB-2W', 1.7],
  ]
  for (const [vendor, itemId, rate] of trailing) {
    it(`${vendor} · ${itemId} trailing rejection reproduces §9.1's ${rate}%`, () => {
      expect(I.trailingRejectionRate(closed, vendor, itemId).value).toBe(rate)
      const vi = S.vendorItems.find((v) => v.itemId === itemId
        && S.vendors.find((x) => x.id === v.vendorId)!.name === vendor)!
      expect(vi.trailingRejectionRate).toBe(rate)
    })
  }

  it('a receipt more than twice the vendor’s own record escalates rather than files', () => {
    expect(I.isRejectionSpike(4.0, 1.8, P)).toBe(true)
    expect(I.isRejectionSpike(3.6, 1.8, P)).toBe(false)
    expect(I.isRejectionSpike(0, 1.8, P)).toBe(false)
  })
})

/* ------------------------------------------------------------------ INB-02 */

describe('INB-02 · the vendor’s version is the one that arrives', () => {
  const states: Record<string, I.SyncState> = {
    'POL-1': 'acknowledged', 'POL-2': 'not_told', 'POL-3': 'awaiting_ack',
    'POL-4': 'acknowledged', 'POL-H1': 'not_told',
  }
  for (const [id, st] of Object.entries(states)) {
    it(`${id} is ${st.replace('_', ' ')}`, () => expect(I.syncState(sync(id))).toBe(st))
  }

  /* The invariant that keeps §9.1 intact: what §9.1 records as an open or
     in-transit quantity is what the VENDOR acknowledged, because that is what
     will actually arrive. So the Sourcing Desk does not move when INB-02 lands —
     it turns out to have been reading the vendor's number all along. */
  it('the vendor-acknowledged version of every open line IS §9.1’s quantity and date', () => {
    for (const l of S.poLines) {
      const s = sync(l.id)
      const acked = I.revisionAt(s, s.ackedVersion)
      expect(acked.qty).toBe(l.qty)
      expect(acked.promisedDate).toBe(l.promisedDate)
    }
  })

  it('and on two of those four lines the internal number is different', () => {
    const differing = S.poLines
      .map((l) => sync(l.id))
      .filter((s) => I.latestRevision(s).qty !== I.revisionAt(s, s.ackedVersion).qty)
      .map((s) => s.poNo)
    expect(differing.sort()).toEqual(['PO-2637', 'PO-2648'])
  })

  it('PO-2648: we need 450, the vendor is making 300, the gap is 150 nos', () => {
    const s = sync('POL-2')
    expect(I.internalQty(s).value).toBe(450)
    expect(I.vendorKnownQty(s).value).toBe(300)
    expect(I.quantityGap(s).value).toBe(150)
  })

  it('PO-2637: the cut was notified after despatch, so 0.5 MT arrives that nobody needs', () => {
    const s = sync('POL-3')
    expect(I.quantityGap(s).value).toBe(-0.5)
    expect(s.shipped).toBe(true)
  })

  it('PO-2596: the receipt matched v1 because v2 never left the building', () => {
    const s = sync('POL-H1')
    const g = grn('GRN-1187')
    expect(g.againstVersion).toBe(1)
    expect(I.revisionAt(s, 1).qty).toBe(g.qtyReceived)
    expect(I.latestRevision(s).qty).toBe(650)
    expect(I.quantityGap(s).value).toBe(150)
  })

  it('unacknowledged exposure is ₹1,35,400 across the three lines out of sync', () => {
    const out = poSync.filter((s) => I.syncState(s) !== 'acknowledged')
    expect(out.map((s) => s.poNo).sort()).toEqual(['PO-2596', 'PO-2637', 'PO-2648'])
    const total = I.unacknowledgedExposure(out.map((s) => {
      const it = item(s.itemId)
      return { poNo: s.poNo, gap: I.quantityGap(s).value, rate: it.lastPurchaseRate, uom: it.uom }
    }))
    expect(total.value).toBe(135400)
  })

  it('the flange shortfall costs 16.7 days of cover', () => {
    const s = sync('POL-2')
    const it = item('RM-FLG-304-2')
    expect(I.coverGapDays(I.quantityGap(s).value, it.avgDailyConsumption).value).toBe(16.7)
  })

  it('PO-2648 has been changed three times in 30 days — over the whipsaw limit', () => {
    const c = I.churn(sync('POL-2'), TODAY_INBOUND)
    expect(c.value).toBe(3)
    expect(c.value > P.poChurnLimit).toBe(true)
  })

  it('PO-2637’s notice has gone three days unanswered, past the chase limit', () => {
    expect(I.daysAwaitingAck(sync('POL-3'), TODAY_INBOUND).value).toBe(3)
    expect(3 > P.ackChaseDays).toBe(true)
  })

  it('the change notice names both quantities and never claims to have been sent', () => {
    const s = sync('POL-2')
    const d = I.changeNoticeDraft(s, 'SS 304 flange 2" ANSI 150#', 'nos')
    expect(d).toContain('300 nos  →  450 nos')
    expect(d).toContain('Sanghvi Forgings')
    expect(d).toContain('PO-2648')
  })
})

/* ------------------------------------------------------------------ INB-03 */

describe('INB-03 · everything that left is exactly one of five things', () => {
  const acct = (id: string) => I.challanAccounting(challan(id), grns, P)

  it('returns are derived from closed GRNs, so nothing re-enters stock uninspected', () => {
    expect(acct('JC-2190').returned.value).toBe(1850)   // GRN-1168 + GRN-1173
    expect(acct('JC-2198').returned.value).toBe(0.62)   // GRN-1179
    expect(acct('JC-2186').returned.value).toBe(39.2)   // GRN-1162
    expect(acct('JC-2203').returned.value).toBe(0)
  })

  it('the five parts always sum to what was sent — on every challan', () => {
    for (const c of challans) {
      const a = acct(c.id)
      const sum = a.returned.value + a.inQc.value + a.atVendor.value + a.processLoss.value + a.unaccounted.value
      expect(sum).toBeCloseTo(c.qtySent, 6)
    }
  })

  /* The rule that stops the register lying. Material sitting legitimately at a
     jobworker before its date is AT THE JOBWORKER — reporting it as unaccounted
     would make the headline larger than the total out. */
  it('a challan inside its promised date has nothing unaccounted', () => {
    for (const id of ['JC-2203', 'JC-2205', 'JW-01', 'JW-02']) {
      expect(I.daysLate(challan(id)).value).toBeLessThanOrEqual(0)
      expect(acct(id).unaccounted.value).toBe(0)
      expect(acct(id).atVendor.value).toBe(challan(id).qtySent)
    }
  })

  it('an overdue challan with nothing returned is a chase, not a write-off', () => {
    expect(I.daysLate(challan('JW-03')).value).toBe(3)
    expect(acct('JW-03').returned.value + acct('JW-03').inQc.value).toBe(0)
    expect(acct('JW-03').settling).toBe(false)
    expect(acct('JW-03').unaccounted.value).toBe(0)
    expect(acct('JW-03').atVendor.value).toBe(1.1)
  })

  it('unaccounted never exceeds the material out — the headline cannot outrun the total', () => {
    const out = challans.filter((c) => c.status === 'out')
      .reduce((a, c) => a + acct(c.id).atVendor.value * c.rate, 0)
    const lost = challans.reduce((a, c) => a + acct(c.id).unaccounted.value * c.rate, 0)
    expect(lost).toBeLessThan(out)
    expect(Math.round(out * 100) / 100).toBe(437720)
    expect(Math.round(lost * 100) / 100).toBe(4654)
  })

  it('the plating challan IS settling — overdue and returning short — so 130 nos is missing', () => {
    const c = challan('JC-2190')
    const a = acct('JC-2190')
    expect(I.daysLate(c).value).toBe(14)
    expect(a.settling).toBe(true)
    expect(I.allowedLoss(c).value).toBe(20)              // 2000 × 1%
    expect(a.processLoss.value).toBe(20)
    expect(a.unaccounted.value).toBe(130)
    expect(a.atVendor.value).toBe(0)
    expect(I.valueAt(a.unaccounted.value, c.rate, c.uom, 'x').value).toBe(4654)
  })

  it('a return sitting in inbound QC is never counted as missing', () => {
    // GRN-1190 carries 0.52 MT of JC-2198 back, still open at the gate
    const a = acct('JC-2198')
    expect(a.inQc.value).toBe(0.52)
    expect(a.returned.value).toBe(0.62)
    expect(a.unaccounted.value).toBe(0)
    expect(a.processLoss.value).toBeCloseTo(0.06, 6)     // 1.2 × 5%
    expect(a.atVendor.value).toBe(0)
  })

  it('closing that GRN moves 0.52 MT from "in QC" to "back", and nothing goes missing', () => {
    const closedToo = grns.map((g) =>
      g.grnNo === 'GRN-1190' ? { ...g, status: 'closed' as const, acceptedQty: g.qtyReceived } : g)
    const a = I.challanAccounting(challan('JC-2198'), closedToo, P)
    expect(a.returned.value).toBeCloseTo(1.14, 6)
    expect(a.inQc.value).toBe(0)
    expect(a.unaccounted.value).toBe(0)
  })

  it('the wound-coil challan closed inside its allowance, so nothing is unaccounted', () => {
    const a = acct('JC-2186')
    expect(challan('JC-2186').status).toBe('closed')
    expect(I.allowedLoss(challan('JC-2186')).value).toBe(1.2)
    expect(a.processLoss.value).toBe(0.8)
    expect(a.unaccounted.value).toBe(0)
    expect(a.atVendor.value).toBe(0)
  })

  it('galvanising should return MORE than it took, so its allowance forgives nothing', () => {
    const c = challan('JW-03')
    expect(c.expectedYield).toBeGreaterThan(1)
    expect(I.allowedLoss(c).value).toBeCloseTo(-0.044, 6)
    expect(I.expectedReturn(c).value).toBeCloseTo(1.144, 6)
    // once it settles, a negative allowance must not create a negative write-off
    const settled = { ...c, status: 'closed' as const }
    const a = I.challanAccounting(settled, grns, P)
    expect(a.processLoss.value).toBe(0)
    expect(a.unaccounted.value).toBe(1.1)
  })

  it('the overdue challans, and by how many days against their own floor’s date', () => {
    const late = challans
      .filter((c) => c.status === 'out' && I.daysLate(c).value > 0)
      .map((c) => [c.id, I.daysLate(c).value])
    expect(late).toEqual([['JC-2190', 14], ['JC-2198', 6], ['JW-03', 3]])
  })

  it('JW-03 being 3 days late is the same fact Line Watch already flags', () => {
    expect(challan('JW-03').asOf).toBe('2026-09-07')
    expect(I.daysLate(challan('JW-03')).value).toBe(3)
  })

  it('₹3,41,240 is standing on the fabrication floor’s jobworkers alone', () => {
    const v = challans.filter((c) => c.floor === 'fabrication' && c.status === 'out')
      .reduce((a, c) => a + acct(c.id).atVendor.value * c.rate, 0)
    expect(Math.round(v * 100) / 100).toBe(341240)
  })

  it('Anand Galvanising alone is over the concentration ceiling', () => {
    const rows = challans.map((c) => ({ challan: c, balance: acct(c.id).atVendor.value }))
    const names = [...new Set(challans.filter((c) => c.status === 'out').map((c) => c.jobworkerName))]
    const over = names.filter((n) => I.jobworkerExposure(n, rows).value > P.jobworkerExposureCeiling)
    expect(over).toEqual(['Anand Galvanising'])
    expect(I.jobworkerExposure('Anand Galvanising', rows).value).toBe(293920)
  })

  it('yield counts everything physically back, inspected or not', () => {
    const a = acct('JC-2198')
    expect(I.actualYield(challan('JC-2198'), a.returned.value + a.inQc.value).value).toBe(95)
    expect(challan('JC-2198').expectedYield * 100).toBe(95)
  })

  it('a jobwork return in the queue carries the challan it belongs to', () => {
    const g = grn('GRN-1190')
    expect(g.challanId).toBe('JC-2198')
    expect(challan('JC-2198').itemId).toBe(g.itemId)
  })
})

/* --------------------------------------------------------------- the loop */

describe('the three are one loop, not three screens', () => {
  it('every jobwork return in the register comes back through a GRN', () => {
    const challanIds = new Set(challans.map((c) => c.id))
    for (const g of grns.filter((x) => x.challanId)) expect(challanIds.has(g.challanId!)).toBe(true)
  })

  it('every GRN against a PO line names a line the sync register knows', () => {
    const ids = new Set(poSync.map((s) => s.poLineId))
    for (const g of grns.filter((x) => x.poLineId)) expect(ids.has(g.poLineId!)).toBe(true)
  })

  it('every item in §9.1 has an inspection spec of two to four checks', () => {
    for (const it of S.items) {
      const n = checksFor(it.id).length
      expect(n).toBeGreaterThanOrEqual(2)
      expect(n).toBeLessThanOrEqual(4)
    }
  })

  it('every seeded challan values at its own floor’s last purchase rate', () => {
    for (const c of challans.filter((x) => x.floor === 'heaters')) {
      expect(c.rate).toBe(item(c.itemId).lastPurchaseRate)
    }
  })
})
