'use client'
import { daysBetween } from '@/lib/domain/calc'
import { LOSS_LABEL } from '@/lib/domain/inventory'
import { purchaseGrns } from '@/lib/domain/exec'
import { CAT } from '@/components/charts/kit'
import { CellStrip, Donut, Dumbbell, Evidence, Gauge, Meter, RankedBars, Waterfall, type Cell } from '@/components/charts/exec-charts'
import type { DerivedRow } from '@/lib/domain/derive'
import type { Grn, LossCause } from '@/lib/domain/types'
import { CARRIERS } from '@/lib/seed/exec'

/**
 * One picture per KPI, chosen by what the figure is actually asking the reader.
 *
 * The forms are not interchangeable and were not picked for variety. A ratio
 * against a limit is a meter, because the question is "are we past the line".
 * Quoted lead time against measured lead time is a dumbbell, because the gap IS
 * the finding. Five receipts are five cells, because a bar chart of "4 good, 1
 * late" would hide that the whole sample is five. Cash-to-cash is a waterfall,
 * because one of its three terms has the opposite sign and a stacked bar would
 * bury that.
 *
 * Fifteen of the sixteen KPIs get a chart. Freight per unit shipped does not:
 * it is one assumed rupee figure divided by another assumed count, and there is
 * no shape in it to draw. Inventing one would be the exact dishonesty the
 * provenance chips exist to prevent.
 *
 * Anything illustrative is HATCHED. The dashed card border already says the
 * figure is made up; the hatching says it again inside the chart, where the eye
 * is, so a fabricated bar cannot be mistaken for a measured one at a glance.
 */

export interface ChartCtx {
  grns: Grn[]
  rows: DerivedRow[]
  poLines: { poNo: string; itemId: string; qty: number; promisedDate: string }[]
  today: string
  jobs: { jobNo: string; product: string; status: string }[]
  /** the materials behind the halts — what somebody has to go and chase */
  blocking: string[]
  byCause: { cause: LossCause; gross: number; net: number }[]
  rmValue: number
  wipValue: number
  fgValue: number
  nonUsableValue: number
  dio: number
  dso: number
  dpo: number
  procurementPerPo: number
  holdingRatePct: number
  customerOtifPct: number
  fulfilmentCycleDays: number
  rmaRatePct: number
  /** the measured half of the freight question — inbound, as a share of order value */
  inboundFreightPct: number
}

const short = (s: string, n = 14) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
const rs = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`

export function execCharts(c: ChartCtx): Record<string, React.ReactNode> {
  /* ---------------------------------------------- 1 · inbound procurement */

  const otifGrns = purchaseGrns(c.grns)
  const otifCells: Cell[] = otifGrns.map((g) => {
    const late = daysBetween(g.promisedDate!, g.receivedOn)
    const full = g.qtyReceived >= g.orderedQty!
    return {
      label: g.grnNo.replace(/^GRN-?/i, ''),
      tone: late > 0 ? 'critical' : !full ? 'warn' : 'good',
      detail: `${g.vendorName} · promised ${g.promisedDate}, received ${g.receivedOn} · ${g.qtyReceived} of ${g.orderedQty} ${g.uom}`,
    }
  })

  const otifMisses = otifGrns
    .map((g) => ({ g, late: daysBetween(g.promisedDate!, g.receivedOn), full: g.qtyReceived >= g.orderedQty! }))
    .filter((x) => x.late > 0 || !x.full)
    .map((x) => ({
      k: x.g.grnNo, tone: x.late > 0 ? ('critical' as const) : ('warn' as const),
      v: `${x.g.vendorName} — ${x.late > 0 ? `${x.late} days late` : 'short supplied'}`,
    }))

  const defectRows = c.grns
    .filter((g) => g.status === 'closed' && g.poNo && g.qtyReceived > 0)
    .map((g) => ({
      label: `${short(g.itemName, 20)} · ${g.vendorName}`,
      value: ((g.rejectedQty ?? 0) / g.qtyReceived) * 100,
    }))
    .sort((a, b) => b.value - a.value)

  // By supplier, not by material. Lead time is a promise a company makes, and
  // the person reading this rings a supplier, not a part number. Sorted by the
  // gap so the ones who overrun their own quote group at the top.
  const leadRows = (() => {
    const by = new Map<string, { name: string; quoted: number[]; actual: number[] }>()
    for (const r of c.rows) {
      const e = by.get(r.chosenVendorId) ?? { name: r.chosen.vendor.name, quoted: [], actual: [] }
      e.quoted.push(r.chosen.vendorItem.quotedLeadTimeDays)
      e.actual.push(r.leadTime.value)
      by.set(r.chosenVendorId, e)
    }
    const mean = (xs: number[]) => Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10
    const many = [...by.values()].some((v) => v.actual.length > 1)
    return [...by.values()]
      .map((v) => ({
        label: v.name,
        from: mean(v.quoted),
        to: mean(v.actual),
        sub: many ? `${v.actual.length} item${v.actual.length > 1 ? 's' : ''}` : undefined,
      }))
      .sort((a, b) => (b.to - b.from) - (a.to - a.from) || b.to - a.to)
  })()
  const leadShown = leadRows.slice(0, 6)
  const leadRest = leadRows.length - leadShown.length

  const backlogCells: Cell[] = c.poLines.map((l) => {
    const row = c.rows.find((r) => r.item.id === l.itemId)
    const lateForLine = row != null && l.promisedDate > row.stockoutDate.value
    const pastDue = l.promisedDate < c.today
    return {
      label: l.poNo.replace(/^PO-?/i, ''),
      tone: lateForLine ? 'critical' : pastDue ? 'warn' : 'good',
      detail: lateForLine
        ? `${row!.item.code} lands ${l.promisedDate}, but the material runs out ${row!.stockoutDate.value}`
        : pastDue ? `due ${l.promisedDate} — past due` : `due ${l.promisedDate} — on schedule`,
    }
  })

  const backlogMisses = c.poLines
    .map((l) => ({ l, row: c.rows.find((r) => r.item.id === l.itemId) }))
    .filter((x) => (x.row != null && x.l.promisedDate > x.row.stockoutDate.value) || x.l.promisedDate < c.today)
    .map((x) => ({
      k: x.l.poNo,
      tone: x.row != null && x.l.promisedDate > x.row.stockoutDate.value
        ? ('critical' as const) : ('warn' as const),
      v: x.row != null && x.l.promisedDate > x.row.stockoutDate.value
        ? `${x.row.item.code} runs out ${x.row.stockoutDate.value}, this lands ${x.l.promisedDate}`
        : `due ${x.l.promisedDate}, still open`,
    }))

  /* ------------------------------------------ 2 · warehouse & inventory */

  const dioMax = Math.max(60, Math.ceil((c.dio * 1.15) / 10) * 10)

  // The aggregate hides which shelf the money is on, and that is the only part
  // of it anybody can act on — so the tile carries the top holdings too.
  const stockRows = c.rows
    .map((r) => ({
      label: r.item.code,
      value: r.usable.value * r.item.lastPurchaseRate,
      sub: `${r.usable.value} ${r.item.uom === 'm2' ? 'm²' : r.item.uom} on hand`,
    }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value)
  const stockShown = stockRows.slice(0, 3)
  const stockRest = stockRows.length - stockShown.length

  const jobCells: Cell[] = c.jobs.map((j) => ({
    label: j.jobNo.replace(/^JOB-?/i, ''),
    tone: j.status === 'will_halt' ? 'critical' : j.status === 'at_risk' ? 'warn' : 'good',
    detail: `${j.product} — ${j.status === 'will_halt' ? 'will halt, short of material'
      : j.status === 'at_risk' ? 'at risk, waiting on a jobworker' : 'will run as scheduled'}`,
  }))

  const haltRows = c.jobs
    .filter((j) => j.status !== 'will_run')
    .map((j) => ({
      k: j.jobNo, tone: j.status === 'will_halt' ? ('critical' as const) : ('warn' as const),
      v: `${j.product} — ${j.status === 'will_halt' ? 'short of material' : 'waiting on a jobworker'}`,
    }))

  const blocking = [...new Set(c.blocking)]

  // net of scrap value, because that is the money actually gone. The sub line
  // carries the gross so the two are never confused.
  const causeRows = c.byCause
    .filter((b) => b.net > 0)
    .map((b) => ({
      label: LOSS_LABEL[b.cause], value: b.net,
      sub: b.gross - b.net > 0.5
        ? `${rs(b.gross)} gross · ${rs(b.gross - b.net)} back as scrap`
        : `${rs(b.gross)} gross · nothing recoverable`,
    }))
  const causeShown = causeRows.slice(0, 4)
  const causeRest = causeRows.slice(4)

  /* ----------------------------------------------- 4 · financials, base */

  const rate = c.holdingRatePct / 100
  const holdSegs = [
    { label: `Usable stock · ${rs(c.rmValue * rate)}`, value: c.rmValue * rate, color: CAT[0] },
    { label: `At jobworkers · ${rs(c.wipValue * rate)}`, value: c.wipValue * rate, color: CAT[1] },
    { label: `Cannot be issued · ${rs(c.nonUsableValue * rate)}`, value: c.nonUsableValue * rate, color: CAT[3] },
  ]
  const holdTotal = holdSegs.reduce((a, x) => a + x.value, 0)

  // What this run actually costs, supplier by supplier: the landed value of the
  // order plus the buyer time it takes to raise it. The headline above counts
  // only the buyer time — this says who the money goes to.
  const procRows = (() => {
    const by = new Map<string, { name: string; landed: number; lines: string[] }>()
    for (const r of c.rows.filter((x) => x.reorderQty.value > 0)) {
      const e = by.get(r.chosenVendorId) ?? { name: r.chosen.vendor.name, landed: 0, lines: [] }
      e.landed += r.landedTotal.value
      e.lines.push(r.item.code)
      by.set(r.chosenVendorId, e)
    }
    return [...by.values()]
      .map((v) => ({
        label: v.name,
        value: v.landed + c.procurementPerPo,
        sub: `${v.lines.join(', ')} · ${rs(v.landed)} landed + ${rs(c.procurementPerPo)} buyer time`,
      }))
      .sort((a, b) => b.value - a.value)
  })()

  const total = c.rmValue + c.wipValue + c.fgValue

  return {
    /* 1 · inbound procurement */
    otif: (
      <>
      <CellStrip cells={otifCells} legend={[
        { label: 'on time, in full', tone: 'good' },
        { label: 'short supplied', tone: 'warn' },
        { label: 'late', tone: 'critical' },
      ]} note="one cell per purchase receipt · GRN number below" />
        <Evidence title="the ones that missed" rows={otifMisses} />
      </>
    ),
    defect: <RankedBars rows={defectRows} format="pct" target={2} targetLabel="target 2%" />,
    leadtime: (
      <Dumbbell rows={leadShown} unit="days" fromLabel="quoted" toLabel="measured"
        more={leadRest > 0 ? `+${leadRest} more, all inside their quote` : undefined} />
    ),
    backlog: (
      <>
      <CellStrip cells={backlogCells} legend={[
        { label: 'on schedule', tone: 'good' },
        { label: 'past due', tone: 'warn' },
        { label: 'lands after the line stops', tone: 'critical' },
      ]} note="one cell per open purchase order · PO number below" />
        <Evidence title="the ones in backlog" rows={backlogMisses} />
      </>
    ),

    /* 2 · warehouse & inventory health */
    dio: (
      <>
        <Meter value={c.dio} max={dioMax} target={30} tone={c.dio < 30 ? 'good' : 'critical'}
               unit=" days" targetLabel="target 30 days" />
        <div className="mt-3">
          <RankedBars rows={stockShown} format="money" title="where the stock value sits"
            more={stockRest > 0 ? `+${stockRest} smaller holdings` : undefined} />
        </div>
      </>
    ),
    stockouts: (
      <>
      <CellStrip cells={jobCells} legend={[
        { label: 'will run', tone: 'good' },
        { label: 'at risk', tone: 'warn' },
        { label: 'will halt', tone: 'critical' },
      ]} note="one cell per job scheduled this week · job number below" />
        <Evidence title="the jobs that will not run" rows={haltRows} />
        {blocking.length > 0 && (
          <p className="mt-1.5 text-[10.5px] leading-snug text-ink-3">
            <span className="text-ink-2">Short of:</span>{' '}
            <span className="mono">{blocking.join(', ')}</span> — every halt on the week traces back to
            these, so they are the list to chase.
          </p>
        )}
      </>
    ),
    shrinkage: (
      <RankedBars rows={causeShown} format="money"
        more={causeRest.length > 0
          ? `+${causeRest.length} smaller causes, ${rs(causeRest.reduce((a, r) => a + r.value, 0))} together`
          : undefined} />
    ),
    split: (
      <Donut
        centre={`₹${(total / 100000).toFixed(1)}L`} centreSub="all stock"
        foot={`Two legs measured — ${rs(c.rmValue)} on the shelf and ${rs(c.wipValue)} at jobworkers. The finished-goods leg is assumed, and the ratio is only as good as it.`}
        segments={[
          { label: `Raw material · ${rs(c.rmValue)}`, value: c.rmValue, color: CAT[0] },
          { label: `At jobworkers · ${rs(c.wipValue)}`, value: c.wipValue, color: CAT[1] },
          { label: `Finished goods · ${rs(c.fgValue)}`, value: c.fgValue, color: CAT[2], hatched: true },
        ]} />
    ),

    /* 3 · outbound fulfilment — every one hatched, none of it measured */
    cotif: <Gauge value={c.customerOtifPct} max={100} target={95} tone="critical" hatched
                  targetLabel="target 95%" />,
    cycle: <Gauge value={c.fulfilmentCycleDays} max={20} tone="accent" hatched unit="" dp={1}
                  sub="days, order to loading dock" />,
    // No chart for the headline, said out loud rather than left as a blank
    // space — and the measured half of the same question in its place.
    freightOut: (
      <>
        <p className="rounded border border-dashed border-line bg-surface-2 px-2.5 py-2 text-[11px] leading-relaxed text-ink-3">
          <span className="font-medium text-ink-2">No chart here, deliberately.</span> One assumed rupee
          figure divided by another assumed count has no shape to draw. Drawing one anyway would give an
          invented number the authority of a picture.
        </p>
        <div className="mt-3">
          <p className="mb-1.5 text-[10.5px] uppercase tracking-wide text-ink-3">
            the freight half that IS measured
          </p>
          <Meter value={c.inboundFreightPct} max={5} tone="good" unit="%" />
          <p className="mt-1 text-[10.5px] leading-snug text-ink-3">
            Inbound freight is <span className="num text-ink-2">{c.inboundFreightPct}%</span> of order
            value — a share, not rupees per unit, because these orders are in metres, kilograms and
            pieces.
          </p>
        </div>
      </>
    ),
    carriers: (
      <RankedBars format="pct" hatched rows={
        [...CARRIERS]
          .map((x) => ({
            label: short(x.name, 26),
            value: (x.lateConsignments / x.consignments) * 100,
            sub: `${x.lateConsignments} of ${x.consignments} late · ${x.avgDelayDays} days on average`,
          }))
          .sort((a, b) => b.value - a.value)
      } />
    ),
    rma: <Gauge value={c.rmaRatePct} max={5} target={1.5} tone="critical" hatched targetLabel="target 1.5%" />,

    /* 4 · supply chain financials */
    holding: (
      <Donut segments={holdSegs} centre={rs(holdTotal)} centreSub="a month" />
    ),
    c2c: (
      <Waterfall totalLabel="Cash-to-cash" unit="days" steps={[
        { label: 'Stock sits', value: c.dio, sign: 1, measured: true },
        { label: 'Customers pay', value: c.dso, sign: 1, measured: false },
        { label: 'Supplier credit', value: c.dpo, sign: -1, measured: true },
      ]} />
    ),
    proccost: (
      <RankedBars rows={procRows} format="money" title="what this run costs, by supplier" />
    ),
  }
}
