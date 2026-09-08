/**
 * The three Inventory systems. The load-bearing assertion is the first one: the
 * ledger has to close at §9.1's lot quantities exactly, on every lot, or the
 * Sourcing Desk and this stage are telling two different stories about the same
 * material.
 */
import { describe, expect, it } from 'vitest'
import * as V from '@/lib/domain/inventory'
import { DEFAULT_POLICY } from '@/lib/domain/policy'
import {
  classOf, cuts, cycleCounts, LEDGER_FROM, losses, ledgerLots, movements,
  offcutBands, MIN_USABLE_REMNANT, scrapRemnantQty, TODAY_INVENTORY, usableRemnantQty,
} from '@/lib/seed/inventory'
import * as S from '@/lib/seed/sourcing'
import { grns } from '@/lib/seed/inbound'
import { challans } from '@/lib/seed/inbound'

const P = DEFAULT_POLICY
const T = TODAY_INVENTORY
const mv = (lotId: string) => movements.filter((m) => m.lotId === lotId)
const bal = (lotId: string) => Math.round(mv(lotId).reduce((a, m) => a + m.qty, 0) * 1e6) / 1e6
const item = (id: string) => S.items.find((i) => i.id === id)!
const cut = (id: string) => cuts.find((c) => c.id === id)!

/* ------------------------------------------------------------------ INV-01 */

describe('INV-01 · a quantity is a balance, not a stored number', () => {
  it('every §9.1 lot closes at exactly the quantity §9.1 states', () => {
    for (const lot of S.stockLots) expect(bal(lot.id)).toBe(lot.qty)
  })

  it('every offcut band closes at exactly the quantity §9.1 states', () => {
    for (const o of S.offcuts) {
      const band = offcutBands.find((b) => b.itemId === o.itemId)!
      expect(bal(band.lotId)).toBe(o.qty)
    }
  })

  it('no opening balance is negative — an impossible history fails loudly', () => {
    for (const lot of ledgerLots) {
      const opening = mv(lot.id).find((m) => m.kind === 'opening')!
      expect(opening.qty).toBeGreaterThanOrEqual(0)
      expect(opening.on).toBe(LEDGER_FROM)
    }
  })

  it('every lot has exactly one opening movement, and it is the earliest', () => {
    for (const lot of ledgerLots) {
      const mine = mv(lot.id)
      expect(mine.filter((m) => m.kind === 'opening')).toHaveLength(1)
      const earliest = [...mine].sort((a, b) => a.on.localeCompare(b.on))[0]
      expect(earliest.kind).toBe('opening')
    }
  })

  it('no movement exists without a source document', () => {
    for (const m of movements) {
      expect(m.sourceRef.length).toBeGreaterThan(0)
      if (m.kind !== 'opening') expect(m.source).not.toBe('opening')
    }
  })

  it('every GRN a movement cites is a real receipt from the Inbound seed', () => {
    const known = new Set(grns.map((g) => g.grnNo))
    for (const m of movements.filter((x) => x.source === 'grn')) {
      expect(known.has(m.sourceRef)).toBe(true)
    }
  })

  it('every challan a movement cites is a real challan from the jobwork register', () => {
    const known = new Set(challans.map((c) => c.id))
    for (const m of movements.filter((x) => x.source === 'challan')) {
      expect(known.has(m.sourceRef)).toBe(true)
    }
  })

  it('the receipts posted match what the closed GRNs actually accepted', () => {
    for (const g of grns.filter((x) => x.status === 'closed' && x.acceptedQty != null)) {
      const posted = movements.filter((m) => m.source === 'grn' && m.sourceRef === g.grnNo)
      if (posted.length === 0) continue
      const total = Math.round(posted.reduce((a, m) => a + m.qty, 0) * 1e6) / 1e6
      // a receipt splits into the accepted lot and, where there was one, the rejected lot
      expect(total).toBe(g.qtyReceived)
    }
  })

  it('an open GRN has posted nothing — a receipt exists only once a GRN closes', () => {
    for (const g of grns.filter((x) => x.status === 'open')) {
      expect(movements.filter((m) => m.sourceRef === g.grnNo)).toHaveLength(0)
    }
  })

  it('the balance carries the whole document trail as its derivation', () => {
    const d = V.lotBalance(mv('L-001'), 'm')
    expect(d.value).toBe(340)
    expect(d.inputs).toHaveLength(mv('L-001').length)
    expect(d.formula).toContain('Σ movement.qty')
  })

  it('count variance is counted minus book, and posts as its own movement', () => {
    const cc = cycleCounts.find((c) => c.id === 'CC-01')!
    expect(V.countVariance(cc, 'm').value).toBe(-13)
    const posted = movements.find((m) => m.source === 'count' && m.sourceRef === 'CC-01')!
    expect(posted.kind).toBe('count_adjust')
    expect(posted.qty).toBe(-13)
  })

  it('every cycle count has the movement it caused, and they agree', () => {
    for (const c of cycleCounts) {
      const posted = movements.filter((m) => m.source === 'count' && m.sourceRef === c.id)
      const variance = Math.round((c.countedQty - c.bookQty) * 1e6) / 1e6
      if (variance === 0) { expect(posted).toHaveLength(0); continue }
      expect(posted).toHaveLength(1)
      expect(posted[0].qty).toBe(variance)
    }
  })

  it('the counts that reconcile are the ones inside their class tolerance', () => {
    const over = cycleCounts.filter((c) => V.isCountOverTolerance(c, classOf(c.itemId), P))
    expect(over.map((c) => c.id)).toEqual(['CC-01'])
  })

  it('record accuracy is counts inside tolerance over counts taken', () => {
    const a = V.recordAccuracy(cycleCounts.map((c) => ({ count: c, cls: classOf(c.itemId) })), P)
    expect(a.value).toBe(87.5)   // 7 of 8
  })

  it('a balance nobody has touched past its class cadence reads as unconfirmed', () => {
    // L-016, SS flange damaged, has nothing but its opening
    const conf = V.lastConfirmed(mv('L-016'), [], T)
    const since = V.daysSinceConfirmed(conf.value, T)
    expect(V.isStale(since.value, classOf('RM-FLG-304-2'), P)).toBe(true)
    // L-003 moved on 29 Aug and was counted on 1 Sep — well inside class A's 7 days
    const fresh = V.lastConfirmed(mv('L-003'), cycleCounts.filter((c) => c.lotId === 'L-003'), T)
    expect(V.isStale(V.daysSinceConfirmed(fresh.value, T).value, 'A', P)).toBe(false)
  })
})

/* ------------------------------------------------------------------ INV-02 */

describe('INV-02 · a remnant is stock, not a list beside it', () => {
  it('every cut balances: input = parts + kerf + Σ remnants', () => {
    for (const c of cuts) expect(V.cutBalances(c)).toBe(true)
  })

  it('a remnant at or above the minimum is stock; below it, it is scrap at the cut', () => {
    const c = cut('CUT-2138')
    expect(MIN_USABLE_REMNANT['EL-TUB-INC85']).toBe(0.5)
    expect(usableRemnantQty(c)).toBe(7.5)      // 1.8 + 3×1.5 + 1.2
    expect(scrapRemnantQty(c)).toBe(0.7)       // 2 × 0.35, under the minimum
  })

  it('the usable remnants of each cut are the quantity posted to the offcut band', () => {
    for (const c of cuts) {
      const usable = usableRemnantQty(c)
      const posted = movements
        .filter((m) => m.kind === 'offcut_in' && m.sourceRef === c.id)
        .reduce((a, m) => a + m.qty, 0)
      expect(Math.round(posted * 1e6) / 1e6).toBe(usable)
    }
  })

  it('the material a cut consumed is issued off the lot it came from', () => {
    for (const c of cuts) {
      const issued = movements.find((m) => m.kind === 'issue' && m.sourceRef === c.id)!
      expect(issued.lotId).toBe(c.lotId)
      expect(issued.qty).toBe(-c.inputQty)
    }
  })

  it('yield is measured against the nest plan, not against nothing', () => {
    const c = cut('CUT-2143')
    expect(V.cutYield(c).value).toBe(90)          // 54 of 60
    expect(V.plannedYield(c).value).toBeCloseTo(93.33, 2)
    expect(V.yieldShortfall(c).value).toBeCloseTo(3.33, 2)
    expect(V.yieldShortfall(c).value > P.yieldTolerancePct).toBe(true)
  })

  it('the cuts that came in below the nest plan', () => {
    const below = cuts.filter((c) => V.yieldShortfall(c).value > P.yieldTolerancePct)
    expect(below.map((c) => c.id).sort()).toEqual(['CUT-2143', 'CUT-2151'])
  })

  it('piece counts are derived from the band size, never stored twice', () => {
    const band = offcutBands.find((b) => b.lotId === 'OC-TUB-A')!
    expect(V.remnantPieces(bal('OC-TUB-A'), band.avgPieceSize).value).toBe(41)  // 62 ÷ 1.5
  })

  it('the repurchase check nets remnants off what the desk wants to buy', () => {
    // the desk raises 1,000 m of element tube; 62 m is already on Rack B-4
    const d = V.remnantMatch(1000, bal('OC-TUB-A'), item('EL-TUB-INC85').lastPurchaseRate, 'm')
    expect(d.value).toBe(13144)   // 62 × ₹212
  })

  it('a match never claims more than either side has', () => {
    expect(V.remnantMatch(10, 62, 212, 'm').value).toBe(2120)   // need is the binding side
    expect(V.remnantMatch(1000, 62, 212, 'm').value).toBe(13144)
  })

  it('the register holds ₹27,086 of material already owned', () => {
    const v = S.offcuts.reduce((a, o) => a + o.qty * item(o.itemId).lastPurchaseRate, 0)
    expect(Math.round(v * 100) / 100).toBe(27086)
  })
})

/* ------------------------------------------------------------------ INV-03 */

describe('INV-03 · every loss has a cause and a rupee value', () => {
  const withRates = losses.map((l) => ({ loss: l, rate: item(l.itemId).lastPurchaseRate }))

  it('no loss is recorded without a cause and a source document', () => {
    for (const l of losses) {
      expect(V.LOSS_LABEL[l.cause]).toBeTruthy()
      expect(l.sourceRef.length).toBeGreaterThan(0)
    }
  })

  it('a cut posts both its kerf and its undersized drops to the loss ledger', () => {
    for (const c of cuts) {
      const mine = losses.filter((l) => l.sourceRef === c.id)
      const kerf = mine.find((l) => l.cause === 'cut_kerf')
      const scrap = mine.find((l) => l.cause === 'cut_offcut_scrap')
      if (c.kerfQty > 0) expect(kerf?.qty).toBe(c.kerfQty)
      if (scrapRemnantQty(c) > 0) expect(scrap?.qty).toBe(scrapRemnantQty(c))
    }
  })

  /* The property that keeps the two ledgers honest: a loss either carries its own
     movement or names a component of one already posted. Never both. */
  it('a loss that moves stock has its movement; one that does not, does not', () => {
    for (const l of losses) {
      const own = movements.filter((m) => m.source === 'loss' && m.sourceRef === l.id)
      if (l.cause === 'store_spoilage') expect(own.length).toBe(1)
      if (!V.CAUSE_MOVES_STOCK[l.cause]) expect(own.length).toBe(0)
    }
  })

  it('the whole loss ledger sitting alongside the stock ledger changes no balance', () => {
    // the assertion that matters: §9.1 still reconciles with INV-03 in place
    for (const lot of S.stockLots) expect(bal(lot.id)).toBe(lot.qty)
  })

  it('net loss is what it cost less what the scrap comes back for', () => {
    const gross = withRates.reduce((a, r) => a + r.loss.qty * r.rate, 0)
    const rec = withRates.reduce((a, r) => a + r.loss.qty * r.loss.recoveryRate, 0)
    const d = V.netLoss(withRates)
    expect(d.value).toBe(Math.round((gross - rec) * 100) / 100)
    expect(d.value).toBeLessThan(Math.round(gross * 100) / 100)
  })

  it('fired ceramic and wet MgO are dead loss; nichrome and steel are not', () => {
    const ceramic = losses.find((l) => l.id === 'LS-01')!
    expect(ceramic.recoveryRate).toBe(0)
    const wire = losses.find((l) => l.id === 'LS-05')!
    expect(wire.recoveryRate).toBeGreaterThan(0)
  })

  it('the two marginals are the same records, so their totals agree', () => {
    const byCause = V.lossByCause(withRates).reduce((a, c) => a + c.net, 0)
    const items = [...new Set(losses.map((l) => l.itemId))]
    const byItem = items.reduce((a, id) =>
      a + V.netLoss(withRates.filter((r) => r.loss.itemId === id)).value, 0)
    expect(Math.round(byCause * 100) / 100).toBe(Math.round(byItem * 100) / 100)
    expect(Math.round(byCause * 100) / 100).toBe(V.netLoss(withRates).value)
  })

  it('scrap percentage is derived from the ledgers, not stored', () => {
    const issued = movements
      .filter((m) => m.itemId === 'CM-TRB-2W' && (m.kind === 'issue' || m.kind === 'jobwork_out'))
      .reduce((a, m) => a + Math.abs(m.qty), 0)
    const lost = losses.filter((l) => l.itemId === 'CM-TRB-2W').reduce((a, l) => a + l.qty, 0)
    const d = V.scrapPct(lost, issued, 'nos')
    expect(issued).toBe(5630)
    expect(lost).toBe(113)            // 67 scrapped at the gate + 46 on the floor
    expect(d.value).toBe(2.01)
    expect(d.formula).toContain('Σ loss_qty ÷ Σ issued_qty')
  })

  it('a percentage against material ISSUED, so a quiet month does not flatter it', () => {
    expect(V.scrapPct(10, 100, 'kg').value).toBe(10)
    expect(V.scrapPct(10, 1000, 'kg').value).toBe(1)
  })

  it('unrealised recovery is scrap booked but not collected', () => {
    const d = V.unrealisedRecovery(withRates, T, P)
    const unsold = withRates.filter((r) => r.loss.recoveryRate > 0 && !r.loss.soldOn)
    expect(d.value).toBe(Math.round(unsold.reduce((a, r) => a + r.loss.qty * r.loss.recoveryRate, 0) * 100) / 100)
    expect(d.value).toBeGreaterThan(0)
  })

  it('the one loss already sold is not counted as still in the bin', () => {
    const sold = losses.find((l) => l.soldOn)!
    const d = V.unrealisedRecovery(withRates, T, P)
    expect(d.inputs.some((i) => String(i.name).includes(sold.id))).toBe(false)
  })
})

/* --------------------------------------------------------------- the loop */

describe('one ledger, three readings', () => {
  it('the offcut bands cover exactly the items §9.1 lists offcuts for', () => {
    expect(offcutBands.map((b) => b.itemId).sort()).toEqual(S.offcuts.map((o) => o.itemId).sort())
  })

  it('every movement kind in the seed has a label the UI can render', () => {
    for (const m of movements) expect(V.MOVEMENT_LABEL[m.kind]).toBeTruthy()
    for (const m of movements) expect(V.SOURCE_LABEL[m.source]).toBeTruthy()
  })

  it('the jobwork movements match the challans the register knows about', () => {
    const out = movements.filter((m) => m.kind === 'jobwork_out')
    for (const m of out) {
      const c = challans.find((x) => x.id === m.sourceRef)!
      expect(Math.abs(m.qty)).toBe(c.qtySent)
    }
  })

  it('and the returns match what those challans actually got back', () => {
    const back = movements.filter((m) => m.kind === 'jobwork_return')
    for (const m of back) {
      const g = grns.find((x) => x.grnNo === m.sourceRef)!
      expect(m.qty).toBe(g.acceptedQty)
    }
  })
})
