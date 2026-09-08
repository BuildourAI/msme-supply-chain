/**
 * §9 is the contract. "Use verbatim. It reconciles — a client who checks one number
 * against another finds them consistent, and that is when they start believing the
 * rest." These are those checks, run against the same functions the UI renders.
 */
import { describe, expect, it } from 'vitest'
import { buildRows, deskKpis, needsDecision, type SeedBundle } from '@/lib/domain/derive'
import { DEFAULT_POLICY } from '@/lib/domain/policy'
import * as S from '@/lib/seed/sourcing'
import { blockedStock } from '@/lib/seed/blocked'
import { resolveAlias, reviewQueue, seededAliases, supplierDocuments } from '@/lib/seed/intake'

const seed: SeedBundle = {
  today: S.TODAY_SOURCING,
  items: S.items, vendors: S.vendors, vendorItems: S.vendorItems,
  stockLots: S.stockLots, poLines: S.poLines, receipts: S.receipts,
}
const rows = buildRows(seed, DEFAULT_POLICY)
const row = (code: string) => rows.find((r) => r.item.code === code)!
const kpis = deskKpis(rows)

describe('§5 · reorder point = avg_daily_consumption × vendor_lead_time + safety_stock', () => {
  const expected: Record<string, number> = {
    'EL-TUB-INC85': 620, 'RM-CRC-120': 1.6, 'RM-MGO-EG': 480, 'RM-NCR-8020': 74.1,
    'HW-GLD-M20': 1150, 'CM-TRB-2W': 900, 'SN-RTD-6150': 140, 'RM-FLG-304-2': 252,
    'IN-MWL-050': 468,
  }
  for (const [code, rop] of Object.entries(expected)) {
    it(`${code} → ${rop}`, () => expect(row(code).reorderPoint.value).toBe(rop))
  }
})

describe('§5 · lead time is the trailing mean of the last six ACTUAL receipts', () => {
  const expected: Record<string, number> = {
    'EL-TUB-INC85': 9, 'RM-CRC-120': 7, 'RM-MGO-EG': 12, 'RM-NCR-8020': 11,
    'HW-GLD-M20': 8, 'CM-TRB-2W': 10, 'SN-RTD-6150': 6, 'RM-FLG-304-2': 14,
    'IN-MWL-050': 9,
  }
  for (const [code, lt] of Object.entries(expected)) {
    it(`${code} → ${lt} days from 6 receipts`, () => {
      const r = row(code)
      expect(r.leadTime.value).toBe(lt)
      expect(r.leadTime.inputs.filter((i) => i.name.startsWith('receipt'))).toHaveLength(6)
    })
  }
})

describe('§5 · true position = usable + in_transit + open_po_qty', () => {
  const expected: Record<string, number> = {
    'EL-TUB-INC85': 340, 'RM-CRC-120': 2.4, 'RM-MGO-EG': 610, 'RM-NCR-8020': 38,
    'HW-GLD-M20': 1620, 'CM-TRB-2W': 410, 'SN-RTD-6150': 320, 'RM-FLG-304-2': 396,
    'IN-MWL-050': 690,
  }
  for (const [code, tp] of Object.entries(expected)) {
    it(`${code} → ${tp}`, () => expect(row(code).truePosition.value).toBe(tp))
  }
})

describe('§6 · status is judged on two axes — quantity AND timing', () => {
  const expected: Record<string, string> = {
    'EL-TUB-INC85': 'at_risk', 'RM-CRC-120': 'open_po_covers', 'RM-MGO-EG': 'at_risk_late',
    'RM-NCR-8020': 'at_risk', 'HW-GLD-M20': 'open_po_covers', 'CM-TRB-2W': 'at_risk',
    'SN-RTD-6150': 'covered', 'RM-FLG-304-2': 'open_po_covers', 'IN-MWL-050': 'covered',
  }
  for (const [code, st] of Object.entries(expected)) {
    it(`${code} → ${st}`, () => expect(row(code).status.value).toBe(st))
  }

  it('MgO is at_risk_late: position 610 vs ROP 480, stock out 10 Sep, PO-2611 lands 19 Sep', () => {
    const r = row('RM-MGO-EG')
    expect(r.truePosition.value).toBe(610)
    expect(r.reorderPoint.value).toBe(480)
    expect(r.stockoutDate.value).toBe('2026-09-10')
    expect(r.earliestInboundEta).toBe('2026-09-19')
  })

  it('at_risk_late produces Expedite, not a new purchase order', () =>
    expect(row('RM-MGO-EG').reorderQty.value).toBe(0))
})

describe('§5 · reorder quantity rounds up to the MOQ, and only when at_risk', () => {
  const expected: Record<string, number> = {
    'EL-TUB-INC85': 1000, 'RM-NCR-8020': 100, 'CM-TRB-2W': 5000,
    'RM-CRC-120': 0, 'RM-MGO-EG': 0, 'HW-GLD-M20': 0,
    'SN-RTD-6150': 0, 'RM-FLG-304-2': 0, 'IN-MWL-050': 0,
  }
  for (const [code, q] of Object.entries(expected)) {
    it(`${code} → ${q}`, () => expect(row(code).reorderQty.value).toBe(q))
  }
})

describe('§8.4 · the coverage guardrail holds CM-TRB-2W and nothing else', () => {
  it('MOQ 5,000 against a net need of 1,420', () => {
    const r = row('CM-TRB-2W')
    const netNeed = r.reorderPoint.value + DEFAULT_POLICY.cycleDays[r.item.itemClass] * r.item.avgDailyConsumption - r.truePosition.value
    expect(netNeed).toBe(1420)
  })
  it('pushes coverage to 2.91 months against a 2.0 ceiling', () =>
    expect(row('CM-TRB-2W').coverageAfterMonths.value).toBe(2.91))
  it('→ held', () => expect(row('CM-TRB-2W').held.value).toBe(true))
  it('and it is the only held line', () =>
    expect(rows.filter((r) => r.held.value).map((r) => r.item.code)).toEqual(['CM-TRB-2W']))
})

describe('§9.1 · landed cost reconciles for all 27 quotes', () => {
  const expected: Record<string, number> = {
    'EL-TUB-INC85|Nirmal Alloy Tubes': 224.40, 'EL-TUB-INC85|Sanghvi Special Metals': 232.70,
    'EL-TUB-INC85|Deccan Tube & Alloy': 226.10,
    'RM-CRC-120|Mahalaxmi Steel': 64950, 'RM-CRC-120|Krishna Metals': 67080,
    'RM-CRC-120|Gujarat Sheet Co.': 64990,
    'RM-MGO-EG|Nirmal Minerals': 151.20, 'RM-MGO-EG|Bharat Refractories': 153.80,
    'RM-MGO-EG|Deccan Ceramics': 157.70,
    'RM-NCR-8020|Bharat Nichrome Ind.': 1252, 'RM-NCR-8020|Sanghvi Alloys': 1276,
    'RM-NCR-8020|Precision Wire Co.': 1372,
    'HW-GLD-M20|Krishna Electricals': 37.60, 'HW-GLD-M20|Gujarat Hardware': 39.70,
    'HW-GLD-M20|Nirmal Traders': 39.40,
    'CM-TRB-2W|Krishna Ceramics': 21.10, 'CM-TRB-2W|Deccan Insulators': 22.10,
    'CM-TRB-2W|Bharat Ceramic Works': 23.20,
    'SN-RTD-6150|Precision Sensors': 421.80, 'SN-RTD-6150|Krishna Instruments': 423.30,
    'SN-RTD-6150|Deccan Controls': 447.60,
    'RM-FLG-304-2|Sanghvi Forgings': 504.50, 'RM-FLG-304-2|Gujarat Flange Works': 510.00,
    'RM-FLG-304-2|Nirmal Forge': 511.50,
    'IN-MWL-050|Bharat Insulations': 170.40, 'IN-MWL-050|Krishna Thermal': 171.00,
    'IN-MWL-050|Deccan Insulations': 176.70,
  }
  it('every quote', () => {
    const actual: Record<string, number> = {}
    for (const r of rows) for (const q of r.quotes) actual[`${r.item.code}|${q.vendor.name}`] = q.landedPerUnit.value
    expect(actual).toEqual(expected)
  })
})

describe('§8.3 · the recommendation is argmin(landed cost), never a stored flag', () => {
  it('matches every RECOMMENDED marking in §9.1', () => {
    const expected: Record<string, string> = {
      'EL-TUB-INC85': 'Nirmal Alloy Tubes', 'RM-CRC-120': 'Mahalaxmi Steel',
      'RM-MGO-EG': 'Nirmal Minerals', 'RM-NCR-8020': 'Bharat Nichrome Ind.',
      'HW-GLD-M20': 'Krishna Electricals', 'CM-TRB-2W': 'Krishna Ceramics',
      'SN-RTD-6150': 'Precision Sensors', 'RM-FLG-304-2': 'Sanghvi Forgings',
      'IN-MWL-050': 'Bharat Insulations',
    }
    const actual = Object.fromEntries(rows.map((r) => [r.item.code, r.chosen.vendor.name]))
    expect(actual).toEqual(expected)
  })

  it('landed cost overturns the cheapest quoted rate on 6 lines, confirms it on 3', () => {
    expect(rows.filter((r) => r.flipsVendor)).toHaveLength(6)
    expect(rows.filter((r) => !r.flipsVendor).map((r) => r.item.code))
      .toEqual(['RM-NCR-8020', 'HW-GLD-M20', 'CM-TRB-2W'])
  })

  it('the teaching case: Sanghvi quotes ₹206 against ₹212 and lands ₹8,300 higher on 1,000 m', () => {
    const r = row('EL-TUB-INC85')
    const sanghvi = r.quotes.find((q) => q.vendor.name === 'Sanghvi Special Metals')!
    const nirmal = r.quotes.find((q) => q.vendor.name === 'Nirmal Alloy Tubes')!
    expect(sanghvi.vendorItem.rate).toBeLessThan(nirmal.vendorItem.rate)
    expect(sanghvi.landedPerUnit.value).toBe(232.70)
    expect(nirmal.landedPerUnit.value).toBe(224.40)
    expect(Math.round((sanghvi.landedPerUnit.value - nirmal.landedPerUnit.value) * 1000)).toBe(8300)
  })
})

describe('§9.1 · the expected aggregates', () => {
  it('4 lines need a decision', () => {
    expect(kpis.linesNeedingDecision.value).toBe(4)
    expect(rows.filter(needsDecision).map((r) => r.item.code))
      .toEqual(['EL-TUB-INC85', 'RM-MGO-EG', 'RM-NCR-8020', 'CM-TRB-2W'])
  })
  it('₹4.55 L to release across 3 POs', () => {
    expect(kpis.toRelease.value).toBe(455100)
    expect(kpis.draftPoCount).toBe(3)
  })
  it('non-usable ₹29,308, on the last-purchase-price basis (§13-1)', () => {
    expect(kpis.nonUsableValue.value).toBe(29308)
  })
  it('and it foots line by line', () => {
    const perLine = Object.fromEntries(
      rows.filter((r) => r.nonUsable.value > 0).map((r) => [r.item.code, r.nonUsableValue.value]))
    expect(perLine).toEqual({
      'EL-TUB-INC85': 5512, 'RM-CRC-120': 7368, 'RM-MGO-EG': 6390, 'RM-NCR-8020': 3833.60,
      'HW-GLD-M20': 1432, 'CM-TRB-2W': 356.40, 'SN-RTD-6150': 2472, 'RM-FLG-304-2': 1944,
    })
  })
})

describe('§11 · guardrail invariants', () => {
  it('non-usable stock is never counted in true position', () => {
    for (const r of rows) {
      expect(r.truePosition.value).toBe(
        Math.round((r.usable.value + r.inTransit.value + r.openPoQty.value) * 1000) / 1000)
    }
  })
  it('cover runs on usable stock alone', () => {
    for (const r of rows) {
      if (r.item.avgDailyConsumption > 0) {
        expect(r.coverDays.value).toBeCloseTo(r.usable.value / r.item.avgDailyConsumption, 2)
      }
    }
  })
  it('every derived figure carries a formula and its substituted inputs', () => {
    for (const r of rows) {
      for (const d of [r.reorderPoint, r.truePosition, r.reorderQty, r.landedTotal, r.coverageAfterMonths]) {
        expect(d.formula.length).toBeGreaterThan(0)
        expect(d.inputs.length).toBeGreaterThan(0)
      }
    }
  })
})

describe('§7 · changing the supplier re-prices the line without moving the reorder logic', () => {
  const alt = buildRows(seed, DEFAULT_POLICY, { 'EL-TUB-INC85': row('EL-TUB-INC85').quotes[2].vendor.id })
  const before = row('EL-TUB-INC85')
  const after = alt.find((r) => r.item.code === 'EL-TUB-INC85')!

  it('the landed total changes', () =>
    expect(after.landedTotal.value).not.toBe(before.landedTotal.value))
  it('the reorder point, quantity and status do not', () => {
    expect(after.reorderPoint.value).toBe(before.reorderPoint.value)
    expect(after.reorderQty.value).toBe(before.reorderQty.value)
    expect(after.status.value).toBe(before.status.value)
  })
  it('the cash-to-release tile moves, the lines-needing-a-decision tile does not', () => {
    const k2 = deskKpis(alt)
    expect(k2.toRelease.value).not.toBe(kpis.toRelease.value)
    expect(k2.linesNeedingDecision.value).toBe(kpis.linesNeedingDecision.value)
  })
  it('and the premium over the recommendation is named', () =>
    expect(after.premiumPerUnit!.value).toBeGreaterThan(0))
})

describe('§9.1 · blocked capital foots on both marginals', () => {
  it('₹18.4 L in total', () => expect(blockedStock.reduce((a, b) => a + b.value, 0)).toBe(1_840_000))
  it('by age: 0–90 ₹6.2 L · 90–180 ₹5.1 L · 180+ ₹7.1 L', () => {
    const by = (k: string) => blockedStock.filter((b) => b.ageBucket === k).reduce((a, b) => a + b.value, 0)
    expect([by('0_90'), by('90_180'), by('over_180')]).toEqual([620_000, 510_000, 710_000])
  })
  it('by cause: MOQ ₹5.8 L · spec ₹4.6 L · over-buy ₹3.9 L · cancelled ₹2.4 L · wrong ₹1.7 L', () => {
    const by = (k: string) => blockedStock.filter((b) => b.cause === k).reduce((a, b) => a + b.value, 0)
    expect(['moq_forced', 'spec_change', 'over_buy', 'cancelled_order', 'wrong_purchase'].map(by))
      .toEqual([580_000, 460_000, 390_000, 240_000, 170_000])
  })
})

describe('§9.1 · intake — 14 documents, 11 auto-filed, 3 in review', () => {
  it('counts come from document status, not subtraction', () => {
    expect(supplierDocuments).toHaveLength(14)
    expect(supplierDocuments.filter((d) => d.status === 'auto')).toHaveLength(11)
    expect(supplierDocuments.filter((d) => d.status === 'pending')).toHaveLength(3)
    expect(reviewQueue).toHaveLength(3)
  })
  it('the teaching case is in the queue with a suggested match and a confidence', () => {
    const l = reviewQueue.find((x) => x.rawItemText === 'TERMINAL BLK CERAMIC 2WAY 30A')!
    expect(l.suggestedItemId).toBe('CM-TRB-2W')
    expect(l.confidence).toBeGreaterThan(0.5)
  })
})

describe('§8.2 · a confirmed alias resolves that vendor’s spelling from then on', () => {
  it('a repeat of a confirmed spelling resolves without review', () => {
    expect(resolveAlias(seededAliases, 'Nirmal Minerals', 'MAGNESIUM OXIDE ELECT GRADE')).toBe('RM-MGO-EG')
    expect(resolveAlias(seededAliases, 'Nirmal Minerals', 'magnesium oxide elect. grade')).toBe('RM-MGO-EG')
  })
  it('the same words from a different vendor still go to a person', () =>
    expect(resolveAlias(seededAliases, 'Deccan Ceramics', 'MAGNESIUM OXIDE ELECT GRADE')).toBeNull())
  it('the teaching case resolves once accepted', () => {
    const after = [...seededAliases, { itemId: 'CM-TRB-2W', vendorName: 'Krishna Ceramics', rawText: 'TERMINAL BLK CERAMIC 2WAY 30A' }]
    expect(resolveAlias(after, 'Krishna Ceramics', 'TERMINAL BLK CERAMIC 2WAY 30A')).toBe('CM-TRB-2W')
  })
})

describe('§11 · the sign-off triggers the data can evaluate', () => {
  it('no recommended line is above its last purchase price', () => {
    for (const r of rows) expect(r.aboveLastPurchase.value).toBe(false)
  })
  it('choosing a vendor whose RATE is above the last-bought price flags it', () => {
    // Deccan quotes ₹219 against a last purchase of ₹212 → flagged.
    // Sanghvi quotes ₹206 — dearer landed, cheaper rate — → not flagged. The trigger is the rate (§11).
    const deccan = row('EL-TUB-INC85').quotes.find((q) => q.vendor.name === 'Deccan Tube & Alloy')!.vendor.id
    const sanghvi = row('EL-TUB-INC85').quotes.find((q) => q.vendor.name === 'Sanghvi Special Metals')!.vendor.id
    const withDeccan = buildRows(seed, DEFAULT_POLICY, { 'EL-TUB-INC85': deccan })
    const withSanghvi = buildRows(seed, DEFAULT_POLICY, { 'EL-TUB-INC85': sanghvi })
    expect(withDeccan.find((r) => r.item.code === 'EL-TUB-INC85')!.aboveLastPurchase.value).toBe(true)
    expect(withSanghvi.find((r) => r.item.code === 'EL-TUB-INC85')!.aboveLastPurchase.value).toBe(false)
  })
  it('the element tube order is above the owner’s ₹2 L threshold; the nichrome one is not', () => {
    expect(row('EL-TUB-INC85').needsOwnerSignoff.value).toBe(true)
    expect(row('RM-NCR-8020').needsOwnerSignoff.value).toBe(false)
  })
})

describe('§5 · a quoted lead time is a promise; the receipts are the record', () => {
  it('at least one recommended vendor quotes shorter than it delivers', () => {
    const drift = rows.map((r) => r.leadTime.value - r.chosen.vendorItem.quotedLeadTimeDays)
    expect(Math.max(...drift)).toBeGreaterThan(0)
  })
  it('and the reorder point still runs on the receipts, never the quote', () => {
    for (const r of rows) {
      expect(r.reorderPoint.value)
        .toBe(Math.round((r.item.avgDailyConsumption * r.leadTime.value + r.item.safetyStock) * 1000) / 1000)
    }
  })
})

/* ========================================================================== */
/*  §9.2 · Line Watch — the owner's floor view                                */
/* ========================================================================== */

import { buildLineWatch } from '@/lib/domain/linewatch'

const lw = buildLineWatch()
const mat = (id: string) => lw.materials.find((m) => m.m.id === id)!
const job = (no: string) => lw.jobs.find((j) => j.job.jobNo === no)!

describe('§9.2 · production cover and the owner’s three states', () => {
  const expected: Record<string, [number, string]> = {
    'HW-HNG-180': [3.5, 'stop'], 'SM-CRCA-16': [4.0, 'stop'], 'PT-PC-7035': [7.5, 'watch'],
    'RM-ANG-405': [8.38, 'watch'], 'RM-ZNC-999': [16.0, 'watch'], 'SL-GSK-105': [12.92, 'fine'],
    'SM-SS304-12': [17.78, 'fine'], 'HW-GLD-M20': [23.72, 'fine'],
  }
  for (const [id, [cover, status]] of Object.entries(expected)) {
    it(`${id} → ${cover} days, ${status}`, () => {
      expect(mat(id).coverDays.value).toBeCloseTo(cover, 1)
      expect(mat(id).status.value).toBe(status)
    })
  }
  it('zinc is the teaching case: 16 days of cover on a 15-day lead is still not safe', () => {
    expect(mat('RM-ZNC-999').coverDays.value).toBe(16)
    expect(mat('RM-ZNC-999').status.value).toBe('watch')
  })
})

describe('§6 · job status distinguishes a stockout from a late jobworker', () => {
  it('JOB-4468 → Will run', () => expect(job('JOB-4468').status.value).toBe('will_run'))
  it('JOB-4471 → Will halt, short of the hinge', () => {
    expect(job('JOB-4471').status.value).toBe('will_halt')
    expect(job('JOB-4471').status.blocking).toEqual(['Concealed hinge 180° SS'])
  })
  it('JOB-4473 → Will run', () => expect(job('JOB-4473').status.value).toBe('will_run'))
  it('JOB-4476 → Will run', () => expect(job('JOB-4476').status.value).toBe('will_run'))
  it('JOB-4479 → Will halt, short of both CRCA and the hinge', () => {
    expect(job('JOB-4479').status.value).toBe('will_halt')
    expect(job('JOB-4479').status.blocking).toHaveLength(2)
  })
  it('JOB-4482 → At risk: zinc is at the galvaniser and overdue, not out of stock', () => {
    expect(job('JOB-4482').status.value).toBe('at_risk')
    expect(job('JOB-4482').status.blocking).toEqual([])
    expect(job('JOB-4482').status.lateJw).toEqual(['Zinc ingot 99.99%'])
  })
})

describe('§9.2 · the expected tiles', () => {
  it('the line runs for 3.5 days', () =>
    expect(lw.tiles.lineRunsFor.value).toBeCloseTo(3.54, 2))
  it('3 of 6 jobs stopping', () => {
    expect(lw.tiles.jobsStopping.value).toBe(3)
    expect(lw.jobs).toHaveLength(6)
  })
  it('₹7.60 L cash needed', () => expect(lw.tiles.cashNeeded.value).toBe(760000))
  it('₹36,516 unusable across 5 materials', () => {
    expect(lw.tiles.unusableValue.value).toBe(36516)
    expect(lw.tiles.unusableLotCount).toBe(5)
  })
})

describe('§8.5 · owner-screen rules', () => {
  it('customer orders appear only on at-risk materials', () => {
    expect(mat('HW-HNG-180').atRiskOrders.map((s) => s.soNo)).toEqual(['SO-2291', 'SO-2304'])
    expect(mat('RM-ZNC-999').atRiskOrders.map((s) => s.soNo)).toEqual(['SO-2311'])
    for (const d of lw.healthy) expect(d.atRiskOrders).toEqual([])
  })
  it('materials sort by which stops the line first', () =>
    expect(lw.needsAttention.map((d) => d.m.id))
      .toEqual(['HW-HNG-180', 'SM-CRCA-16', 'PT-PC-7035', 'RM-ANG-405', 'RM-ZNC-999']))
  it('Anand Galvanising is flagged overdue', () =>
    expect(mat('RM-ZNC-999').overdueJobwork).toBe(true))
  it('jobwork stock is neither on the shelf nor consumed — never in cover', () => {
    const z = mat('RM-ZNC-999')
    expect(z.m.withJobworker).toBe(1.10)
    expect(z.coverDays.value).toBe(C_round(z.m.usable / z.m.floorPerDay))
  })
})

function C_round(n: number) { return Math.round(n * 100) / 100 }
