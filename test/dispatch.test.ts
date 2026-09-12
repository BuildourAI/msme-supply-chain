/**
 * Stage 5 · Dispatch.
 *
 * The load-bearing assertions are the two that keep this stage honest against
 * the rest of the build: the three customer orders §8.5 already publishes must
 * multiply out to exactly the values Line Watch shows, and a despatch note must
 * never take a finished-goods balance below zero. Everything else is the
 * arithmetic behind the five executive figures that used to be assumptions.
 */
import { describe, expect, it } from 'vitest'
import * as DSP from '@/lib/domain/dispatch'
import {
  carriers, consignments, customers, despatchNotes, fgItems, fgOpening, fgProduction,
  fgReturns, orderLines, rmas, TODAY_DISPATCH,
} from '@/lib/seed/dispatch'
import { salesOrders } from '@/lib/seed/linewatch'

const T = TODAY_DISPATCH
const fg = (id: string) => fgItems.find((f) => f.id === id)!
const movements = [...fgOpening, ...fgProduction, ...fgReturns, ...DSP.despatchMovements(despatchNotes)]
const orderedOn = (soNo: string) => orderLines.filter((l) => l.soNo === soNo).reduce((a, l) => a + l.qty, 0)
const sentOn = (soNo: string) =>
  despatchNotes.filter((n) => n.soNo === soNo).reduce((a, n) => a + n.lines.reduce((b, l) => b + l.qty, 0), 0)

const rows: DSP.ConsignmentRow[] = consignments.map((c) => {
  const note = despatchNotes.find((n) => n.dnNo === c.dnNo)!
  const onNote = note.lines.reduce((a, l) => a + l.qty, 0)
  return {
    consignment: c, note,
    carrier: carriers.find((x) => x.id === c.carrierId)!,
    customer: customers.find((x) => x.id === note.customerId)!,
    delivered: !!c.deliveredOn,
    onTime: c.deliveredOn ? c.deliveredOn <= c.promisedDate : false,
    inFull: onNote >= orderedOn(note.soNo),
    drift: 0, late: false, transitDays: null,
  }
})

/* ------------------------------------------------------------------ masters */

describe('the masters the stage could not exist without', () => {
  it('every product a job builds has an identity — code, unit, cost', () => {
    for (const f of fgItems) {
      expect(f.code.length).toBeGreaterThan(3)
      expect(f.uom).toBeTruthy()
      expect(f.standardCost).toBeGreaterThan(0)
      expect(f.builtBy.length).toBeGreaterThan(0)
    }
  })

  it('every order line points at a real finished good', () => {
    for (const l of orderLines) expect(fgItems.some((f) => f.id === l.fgId)).toBe(true)
  })

  it('every despatch note points at a real customer and a real order', () => {
    for (const n of despatchNotes) {
      expect(customers.some((c) => c.id === n.customerId)).toBe(true)
      expect(orderLines.some((l) => l.soNo === n.soNo)).toBe(true)
    }
  })

  it('every consignment belongs to a despatch note', () => {
    for (const c of consignments) expect(despatchNotes.some((n) => n.dnNo === c.dnNo)).toBe(true)
  })
})

/* ------------------------------------------------------------------ DSP-01 */

describe('DSP-01 · the outbound gate', () => {
  it('the three §8.5 orders multiply out to exactly the values Line Watch publishes', () => {
    for (const o of salesOrders) {
      const lines = orderLines.filter((l) => l.soNo === o.soNo)
      expect(lines.length).toBeGreaterThan(0)
      expect(DSP.orderValue(lines, o.soNo).value).toBe(o.value)
    }
  })

  it('a despatch note posts one movement per line, signed out', () => {
    const m = DSP.despatchMovements(despatchNotes)
    expect(m.length).toBe(despatchNotes.reduce((a, n) => a + n.lines.length, 0))
    for (const x of m) {
      expect(x.qty).toBeLessThan(0)
      expect(x.kind).toBe('despatch')
      expect(x.sourceRef).toMatch(/^DN-/)
    }
  })

  it('despatched quantity ties to the movements out, to the unit', () => {
    const fromNotes = despatchNotes.reduce((a, n) => a + n.lines.reduce((b, l) => b + l.qty, 0), 0)
    const fromMovements = DSP.despatchMovements(despatchNotes).reduce((a, m) => a + Math.abs(m.qty), 0)
    expect(fromMovements).toBe(fromNotes)
  })

  it('no finished good is despatched into a negative balance', () => {
    for (const f of fgItems) expect(DSP.fgBalance(movements, f).value as number).toBeGreaterThanOrEqual(0)
  })

  it('a balance is the sum of its movements and nothing else', () => {
    for (const f of fgItems) {
      const mine = movements.filter((m) => m.fgId === f.id)
      const sum = Math.round(mine.reduce((a, m) => a + m.qty, 0) * 1e6) / 1e6
      expect(DSP.fgBalance(movements, f).value).toBe(sum)
    }
  })

  it('nothing is despatched beyond what was ordered', () => {
    for (const soNo of new Set(despatchNotes.map((n) => n.soNo))) {
      expect(sentOn(soNo)).toBeLessThanOrEqual(orderedOn(soNo))
    }
  })

  it('a part shipment leaves a balance the order book can state', () => {
    const partial = despatchNotes.find((n) => n.soNo === 'SO-2288')!
    const pending = DSP.pendingQty('SO-2288', orderedOn('SO-2288'), sentOn('SO-2288'), 'nos')
    expect(pending.value).toBe(orderedOn('SO-2288') - partial.lines[0].qty)
    expect(pending.value as number).toBeGreaterThan(0)
  })

  it('every despatch names who authorised the goods out', () => {
    for (const n of despatchNotes) expect(n.authorisedBy.trim().length).toBeGreaterThan(3)
  })
})

/* ------------------------------------------------------------------ DSP-03 */

describe('DSP-03 · the OTIF that used to be an assumption', () => {
  it('counts only consignments that have actually landed', () => {
    const d = DSP.customerOtif(rows)
    const delivered = rows.filter((r) => r.delivered).length
    expect(d.inputs.find((i) => i.name === 'delivered consignments')?.value).toBe(delivered)
    expect(d.inputs.find((i) => i.name === 'still in transit')?.value).toBe(rows.length - delivered)
  })

  it('is on time AND in full — a part shipment that arrived early still fails', () => {
    const early = rows.find((r) => r.delivered && r.onTime && !r.inFull)
    expect(early).toBeTruthy()
    const good = rows.filter((r) => r.delivered && r.onTime && r.inFull).length
    const settled = rows.filter((r) => r.delivered).length
    expect(DSP.customerOtif(rows).value).toBe(Math.round((good / settled) * 1000) / 10)
  })

  it('a consignment in transit is excluded rather than counted on time', () => {
    const withoutTransit = rows.filter((r) => r.delivered)
    expect(DSP.customerOtif(rows).value).toBe(DSP.customerOtif(withoutTransit).value)
  })

  it('every delivered date carries the name of whoever confirmed it', () => {
    for (const c of consignments) {
      if (c.deliveredOn) expect((c.confirmedBy ?? '').length).toBeGreaterThan(3)
    }
  })

  it('freight per unit divides the carriers own bills by units actually shipped', () => {
    const freight = consignments.reduce((a, c) => a + c.freight, 0)
    const units = despatchNotes.reduce((a, n) => a + n.lines.reduce((b, l) => b + l.qty, 0), 0)
    expect(DSP.freightPerUnit(rows).value).toBe(Math.round((freight / units) * 100) / 100)
  })

  it('cycle time measures order taken to goods gone', () => {
    const d = DSP.cycleTime([
      { takenOn: '2026-08-01', despatchedOn: '2026-08-11', soNo: 'SO-X' },
      { takenOn: '2026-08-01', despatchedOn: '2026-08-05', soNo: 'SO-Y' },
    ])
    expect(d.value).toBe(7)
  })
})

/* ------------------------------------------------------------------ DSP-04 */

describe('DSP-04 · a return with an owner and a deadline', () => {
  it('no return is bigger than the despatch it came from', () => {
    for (const r of rmas) {
      const n = despatchNotes.find((x) => x.dnNo === r.dnNo)!
      expect(r.qty).toBeLessThanOrEqual(n.lines.reduce((a, l) => a + l.qty, 0))
    }
  })

  it('every return has an owner and a date it can be late against', () => {
    for (const r of rmas) {
      expect(r.owner.trim().length).toBeGreaterThan(3)
      expect(r.dueBy > r.raisedOn).toBe(true)
    }
  })

  it('a return that is back names the gate it came through', () => {
    for (const r of rmas) {
      if (r.state !== 'authorised') expect(r.grnRef).toBeTruthy()
    }
  })

  it('the rate counts authorisations raised, not goods physically back', () => {
    const raised = rmas.reduce((a, r) => a + r.qty, 0)
    const shipped = despatchNotes.reduce((a, n) => a + n.lines.reduce((b, l) => b + l.qty, 0), 0)
    expect(DSP.rmaRate(raised, shipped).value).toBe(Math.round((raised / shipped) * 10000) / 100)
    // one of the two is still open, so counting only what is back would understate it
    expect(rmas.some((r) => r.state === 'authorised')).toBe(true)
  })

  it('an open authorisation past its date is overdue on the run date', () => {
    const open = rmas.filter((r) => r.state === 'authorised')
    expect(open.some((r) => r.dueBy < T)).toBe(true)
  })

  it('a return is valued at what it cost to build, never at the selling price', () => {
    const r = rmas[0]
    expect(DSP.rmaValue(r, fg(r.fgId)).value).toBe(r.qty * fg(r.fgId).standardCost)
  })
})

/* ------------------------------------------------- the figures that changed */

describe('what this stage took off the assumption ledger', () => {
  it('customer OTIF is now a count rather than a stored percentage', () => {
    const d = DSP.customerOtif(rows)
    expect(d.formula).not.toMatch(/assumed/i)
    expect(d.inputs.some((i) => i.name === 'on time and in full')).toBe(true)
  })

  it('the finished-goods leg of the stock split is a real balance', () => {
    const total = fgItems.reduce((a, f) => a + (DSP.fgBalance(movements, f).value as number) * f.standardCost, 0)
    expect(total).toBeGreaterThan(0)
    // every rupee of it traces to a movement with a document behind it
    for (const m of movements) expect(m.sourceRef.length).toBeGreaterThan(2)
  })

  it('despatched value is at cost, and every note contributes to it', () => {
    const d = DSP.despatchedValue(despatchNotes, (id) => fgItems.find((f) => f.id === id))
    expect(d.inputs.length).toBe(despatchNotes.length)
    const byHand = despatchNotes.reduce((a, n) =>
      a + n.lines.reduce((b, l) => b + l.qty * fg(l.fgId).standardCost, 0), 0)
    expect(d.value).toBe(byHand)
  })
})
