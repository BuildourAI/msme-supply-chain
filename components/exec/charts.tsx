'use client'
import { daysBetween } from '@/lib/domain/calc'
import { LOSS_LABEL } from '@/lib/domain/inventory'
import { purchaseGrns } from '@/lib/domain/exec'
import { CAT } from '@/components/charts/kit'
import { CellStrip, Donut, Dumbbell, Meter, RankedBars, Waterfall, type Cell } from '@/components/charts/exec-charts'
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

  const defectRows = c.grns
    .filter((g) => g.status === 'closed' && g.poNo && g.qtyReceived > 0)
    .map((g) => ({
      label: short(g.itemName, 22),
      value: ((g.rejectedQty ?? 0) / g.qtyReceived) * 100,
      sub: `${g.grnNo} · ${g.rejectedQty ?? 0} of ${g.qtyReceived} ${g.uom} rejected`,
    }))
    .sort((a, b) => b.value - a.value)

  // sorted by the gap, not by item code: the pattern the chart exists to show is
  // that the slippage clusters, and an alphabetical order scatters it
  const leadRows = c.rows
    .map((r) => ({
      label: r.item.code,
      from: r.chosen.vendorItem.quotedLeadTimeDays,
      to: r.leadTime.value,
    }))
    .sort((a, b) => (b.to - b.from) - (a.to - a.from))

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

  /* ------------------------------------------ 2 · warehouse & inventory */

  const dioMax = Math.max(60, Math.ceil((c.dio * 1.15) / 10) * 10)

  const jobCells: Cell[] = c.jobs.map((j) => ({
    label: j.jobNo.replace(/^JOB-?/i, ''),
    tone: j.status === 'will_halt' ? 'critical' : j.status === 'at_risk' ? 'warn' : 'good',
    detail: `${j.product} — ${j.status === 'will_halt' ? 'will halt, short of material'
      : j.status === 'at_risk' ? 'at risk, waiting on a jobworker' : 'will run as scheduled'}`,
  }))

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

  /* ----------------------------------------------- 4 · financials, base */

  const rate = c.holdingRatePct / 100
  const holdRows = [
    { label: 'Usable stock', value: c.rmValue * rate, sub: `${c.holdingRatePct}% of ${rs(c.rmValue)}` },
    { label: 'At jobworkers', value: c.wipValue * rate, sub: `${c.holdingRatePct}% of ${rs(c.wipValue)} — their shed, our money` },
    { label: 'Stock you cannot use', value: c.nonUsableValue * rate, sub: `${c.holdingRatePct}% of ${rs(c.nonUsableValue)} — same rent, no return` },
  ].sort((a, b) => b.value - a.value)

  const poCells: Cell[] = (() => {
    const byVendor = new Map<string, { name: string; lines: string[] }>()
    for (const r of c.rows.filter((x) => x.reorderQty.value > 0)) {
      const e = byVendor.get(r.chosenVendorId) ?? { name: r.chosen.vendor.name, lines: [] }
      e.lines.push(r.item.code)
      byVendor.set(r.chosenVendorId, e)
    }
    return [...byVendor.values()].map((v) => ({
      label: short(v.name.split(/[ ,]/)[0], 10),
      tone: 'accent' as const,
      detail: `${v.name} · ${v.lines.length} line${v.lines.length > 1 ? 's' : ''} (${v.lines.join(', ')}) · ₹${c.procurementPerPo} of buyer time`,
    }))
  })()

  const total = c.rmValue + c.wipValue + c.fgValue

  return {
    /* 1 · inbound procurement */
    otif: (
      <CellStrip cells={otifCells} legend={[
        { label: 'on time, in full', tone: 'good' },
        { label: 'short supplied', tone: 'warn' },
        { label: 'late', tone: 'critical' },
      ]} note="one cell per purchase receipt · GRN number below" />
    ),
    defect: <RankedBars rows={defectRows} format="pct" target={2} targetLabel="target 2%" />,
    leadtime: <Dumbbell rows={leadRows} unit="days" fromLabel="quoted" toLabel="measured" />,
    backlog: (
      <CellStrip cells={backlogCells} legend={[
        { label: 'on schedule', tone: 'good' },
        { label: 'past due', tone: 'warn' },
        { label: 'lands after the line stops', tone: 'critical' },
      ]} note="one cell per open purchase order · PO number below" />
    ),

    /* 2 · warehouse & inventory health */
    dio: <Meter value={c.dio} max={dioMax} target={30} tone={c.dio < 30 ? 'good' : 'critical'}
                unit=" days" targetLabel="target 30 days" />,
    stockouts: (
      <CellStrip cells={jobCells} legend={[
        { label: 'will run', tone: 'good' },
        { label: 'at risk', tone: 'warn' },
        { label: 'will halt', tone: 'critical' },
      ]} note="one cell per job scheduled this week · job number below" />
    ),
    shrinkage: <RankedBars rows={causeRows} format="money" />,
    split: (
      <Donut
        centre={`₹${(total / 100000).toFixed(1)}L`} centreSub="all stock"
        segments={[
          { label: 'Raw material on the shelf', value: c.rmValue, color: CAT[0] },
          { label: 'Work in progress — at jobworkers', value: c.wipValue, color: CAT[1] },
          { label: 'Finished goods (assumed)', value: c.fgValue, color: CAT[2], hatched: true },
        ]} />
    ),

    /* 3 · outbound fulfilment — every one hatched, none of it measured */
    cotif: <Meter value={c.customerOtifPct} max={100} target={95} tone="critical" hatched
                  targetLabel="target 95%" />,
    cycle: <Meter value={c.fulfilmentCycleDays} max={20} tone="accent" hatched unit=" days" />,
    // the one KPI with no chart, said out loud rather than left as a blank space
    freightOut: (
      <p className="rounded border border-dashed border-line bg-surface-2 px-2.5 py-2 text-[11px] leading-relaxed text-ink-3">
        <span className="font-medium text-ink-2">No chart here, deliberately.</span> One assumed rupee
        figure divided by another assumed count has no shape to draw. Drawing one anyway would give an
        invented number the authority of a picture.
      </p>
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
    rma: <Meter value={c.rmaRatePct} max={5} target={1.5} tone="critical" hatched targetLabel="target 1.5%" />,

    /* 4 · supply chain financials */
    holding: <RankedBars rows={holdRows} format="money" />,
    c2c: (
      <Waterfall totalLabel="Cash-to-cash" unit="days" steps={[
        { label: 'Stock sits', value: c.dio, sign: 1, measured: true },
        { label: 'Customers pay', value: c.dso, sign: 1, measured: false },
        { label: 'Supplier credit', value: c.dpo, sign: -1, measured: true },
      ]} />
    ),
    proccost: (
      <CellStrip cells={poCells} legend={[{ label: `one draft PO · ₹${c.procurementPerPo} of buyer time each`, tone: 'accent' }]} />
    ),
  }
}
