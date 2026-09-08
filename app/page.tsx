'use client'
import Link from 'next/link'
import { PageHeader } from '@/components/shell/PageHeader'
import { Card, Pill, StatusPill } from '@/components/ui/bits'
import { KpiTile } from '@/components/desk/KpiRow'
import { Num } from '@/components/ui/Num'
import { BarRows, CAT, LineChart, Legend } from '@/components/charts/kit'
import { buildRows, deskKpis, needsDecision, type SeedBundle } from '@/lib/domain/derive'
import { buildLineWatch } from '@/lib/domain/linewatch'
import { DEFAULT_POLICY, VALUATION_BASIS } from '@/lib/domain/policy'
import { blockedStock, CAUSE_LABEL } from '@/lib/seed/blocked'
import { reviewQueue, supplierDocuments } from '@/lib/seed/intake'
import * as S from '@/lib/seed/sourcing'
import { daysBetween } from '@/lib/domain/calc'
import { lakh, longDate, STATUS_LABEL, STATUS_TONE } from '@/lib/domain/format'
import type { Derived } from '@/lib/domain/types'
import { useDesk } from '@/components/desk/store'
import { useInventory } from '@/components/inventory/store'
import { useInbound } from '@/components/inbound/store'
import * as X from '@/lib/domain/exec'
import { ASSUMPTIONS, A } from '@/lib/seed/exec'
import { AssumptionLedger, ExecSection, ProvenanceChip } from '@/components/exec/Section'
import { execCharts } from '@/components/exec/charts'

const seed: SeedBundle = {
  today: S.TODAY_SOURCING, items: S.items, vendors: S.vendors, vendorItems: S.vendorItems,
  stockLots: S.stockLots, poLines: S.poLines, receipts: S.receipts,
}
const rows = buildRows(seed, DEFAULT_POLICY)
const kpis = deskKpis(rows)
const lw = buildLineWatch()

const blockedTotal = blockedStock.reduce((a, b) => a + b.value, 0)
const revenueAtRisk = lw.salesOrders.reduce((a, s) => a + s.value, 0)

const D = (value: number, label: string, formula: string, inputs: Derived['inputs'], unit?: string, note?: string): Derived =>
  ({ value, label, formula, inputs, unit, note })

const blockedD = D(blockedTotal, 'Blocked capital', 'Σ blocked_stock.value', 
  blockedStock.map((b) => ({ name: b.itemCode, value: b.value, unit: '₹' })), '₹',
  'Usable material bought for the wrong job — a different population from non-usable stock.')

const revenueD = D(revenueAtRisk, 'Revenue at risk',
  'Σ sales_order.value where the order depends on a material that is short',
  lw.salesOrders.map((s) => ({ name: `${s.soNo} · ${s.customer}`, value: s.value, unit: '₹', source: `promised ${s.promisedDate}` })), '₹',
  'Only orders whose materials are actually short. A healthy material puts nothing at risk.')

const intakeD = D(supplierDocuments.length, 'Supplier documents', 'count(supplier_document)',
  [{ name: 'auto-filed', value: supplierDocuments.length - reviewQueue.length },
   { name: 'in review', value: reviewQueue.length }])

/** Six actual receipts for the three lines that need a decision — §5's lead-time rule, drawn. */
const leadSeries = ['EL-TUB-INC85', 'RM-MGO-EG', 'RM-NCR-8020'].map((code, i) => {
  const r = rows.find((x) => x.item.code === code)!
  const rc = S.receipts.filter((x) => x.itemId === code && x.vendorId === r.chosenVendorId)
  return { label: r.item.code, color: CAT[i], points: rc.map((x) => daysBetween(x.orderedOn, x.receivedOn)) }
})

const quotedFor = (vendorId: string, itemId: string) =>
  S.vendorItems.find((v) => v.vendorId === vendorId && v.itemId === itemId)?.quotedLeadTimeDays ?? 0
const onTime = X.onTimeRate(S.receipts, quotedFor)

const causeRows = (() => {
  const m = new Map<string, number>()
  for (const b of blockedStock) m.set(b.cause, (m.get(b.cause) ?? 0) + b.value)
  return [...m.entries()].map(([k, v]) => ({ label: CAUSE_LABEL[k], value: v })).sort((a, b) => b.value - a.value)
})()

export default function Page() {
  const decide = rows.filter(needsDecision)
  const { intakeCounts: ic, kpis: deskKpi } = useDesk()
  const { lossRows, stockRows, offcutRows, netLoss, byCause } = useInventory()
  const { grns, challanRows } = useInbound()
  const halting = lw.jobs.filter((j) => j.status.value === 'will_halt').length
  const risky = lw.jobs.filter((j) => j.status.value === 'at_risk').length
  const pace = [...lw.materials].sort((a, b) => a.coverDays.value - b.coverDays.value)[0]
  const overdue = lw.jobwork.filter((j) => j.dueBack < lw.today)

  /* ---- the four sections, live off the same data the modules render ---- */
  const rateOf = (id: string) => S.items.find((i) => i.id === id)?.lastPurchaseRate ?? 0
  const usableValue = rows.reduce((a, r) => a + r.usable.value * r.item.lastPurchaseRate, 0)
  const jobworkValue = challanRows
    .filter((c) => c.challan.status === 'out')
    .reduce((a, c) => a + c.valueOut.value, 0)
  const movements = stockRows.flatMap((r) => r.movements)
  const blockingMaterials = [...new Set(lw.jobs.flatMap((j) => j.status.blocking))]

  const inbound = [
    X.supplierOtif(grns),
    X.supplierDefectRate(grns),
    X.avgLeadTime(rows),
    X.poBacklog(rows, S.poLines, seed.today),
  ]
  const dioKpi = X.daysInventoryOutstanding(rows)
  const warehouse = [
    dioKpi,
    X.stockoutRisk(halting, risky, lw.jobs.length, blockingMaterials),
    X.shrinkageAndWaste(lossRows.map((l) => l.loss), movements, rateOf),
    X.stockSplit(
      usableValue, jobworkValue, A.finishedGoodsValue,
      rows.filter((r) => r.usable.value > 0).slice(0, 4).map((r) => ({
        name: r.item.code, value: Math.round(r.usable.value * r.item.lastPurchaseRate), unit: '₹',
      })),
      challanRows.filter((c) => c.challan.status === 'out').map((c) => ({
        name: c.challan.challanNo, value: Math.round(c.valueOut.value), unit: '₹',
        source: `at ${c.challan.jobworkerName}`,
      })),
    ),
  ]
  const outbound = [
    X.customerOtif(lw.salesOrders),
    X.fulfilmentCycle(),
    X.carrierDelays(),
    X.rmaRate(),
  ]
  const financial = [
    X.holdingCost(usableValue, deskKpi.nonUsableValue.value, jobworkValue),
    X.outboundFreightPerUnit(),
    X.cashToCash(dioKpi.d.value, S.vendors[0].paymentTermsDays),
    X.procurementCost(deskKpi.draftPoCount, rows.length),
  ]
  const inFreight = X.inboundFreight(rows)

  /* One picture per KPI, off the same figures the tiles quote — never a second
     computation of the same thing, which is how a chart and its headline drift
     apart. Freight per unit shipped is deliberately left unillustrated. */
  const charts = execCharts({
    grns, rows, poLines: S.poLines, today: seed.today,
    jobs: lw.jobs.map((j) => ({ jobNo: j.job.jobNo, product: j.job.product, status: j.status.value })),
    byCause,
    rmValue: usableValue, wipValue: jobworkValue, fgValue: A.finishedGoodsValue,
    nonUsableValue: deskKpi.nonUsableValue.value,
    dio: dioKpi.d.value, dso: A.dsoDays, dpo: S.vendors[0].paymentTermsDays,
    procurementPerPo: A.procurementCostPerPo,
    holdingRatePct: A.holdingRatePctPerMonth,
    customerOtifPct: A.customerOtifPct,
    fulfilmentCycleDays: A.fulfilmentCycleDays,
    rmaRatePct: A.rmaRatePct,
  })
  const all16 = [...inbound, ...warehouse, ...outbound, ...financial]
  const mix = {
    derived: all16.filter((k) => k.provenance === 'derived').length,
    part: all16.filter((k) => k.provenance === 'part').length,
    illustrative: all16.filter((k) => k.provenance === 'illustrative').length,
  }

  return (
    <>
      <PageHeader eyebrow="Level 1 · end-to-end material view" title="Executive Dashboard"
        meta={<>
          <Pill mono>{longDate(seed.today)}</Pill>
          <Pill tone="accent">Stage 1 live · Stages 2–5 scoped</Pill>
          <Pill tone="good" title="Computed from this build’s own data.">{mix.derived} measured</Pill>
          <Pill tone="warn" title="A measured base figure times a stated assumption.">{mix.part} part measured</Pill>
          <Pill tone="neutral" title="Nothing here measures it — §2 puts Stage 5 out of scope.">{mix.illustrative} illustrative</Pill>
        </>} />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <KpiTile index={0} label="Lines needing a decision" d={kpis.linesNeedingDecision} format="int" tone="critical"
          caption="3 at risk · 1 late on timing · target zero surprises" />
        <KpiTile index={1} label="Cash to release" d={kpis.toRelease} format="lakh" tone="accent"
          caption={`across ${kpis.draftPoCount} draft POs · ${kpis.heldCount} held by the guardrail`} />
        <KpiTile index={2} label="Blocked capital" d={blockedD} format="lakh" tone="warn"
          caption={`${blockedStock.length} lots · MOQ forced is the top cause`} />
        <KpiTile index={3} label="Stock you cannot use" d={kpis.nonUsableValue} format="money" tone="warn"
          caption={`on hand, not issuable · at ${VALUATION_BASIS}`} />
        <KpiTile index={4} label="Revenue at risk" d={revenueD} format="lakh" tone="critical"
          caption="3 customer orders behind short materials" />
      </div>

      <p className="mb-4 max-w-4xl rounded-lg border border-line bg-surface p-3.5 text-[12.5px] leading-relaxed text-ink-2">
        <strong className="text-ink">Every figure below says where it came from.</strong> A{' '}
        <ProvenanceChip p="derived" /> number is computed from this build’s own data and opens into its
        arithmetic. A <ProvenanceChip p="part" /> number is a measured base times a stated assumption.
        An <ProvenanceChip p="illustrative" /> number is made up, and the tile says what would have to
        start being recorded to make it real — §2 puts Stage 5 out of scope, so every outbound figure
        is illustrative by construction. Sixteen figures where some are measured and some are assumed,
        with nothing to tell them apart, would be worse than eight measured ones. The charts say it
        again where the eye actually goes: <strong className="text-ink">a hatched fill is a made-up
        number</strong>, a solid one is measured.
      </p>

      <div className="mb-4 space-y-3">
        <ExecSection no={1} index={0} title="Inbound procurement" kpis={inbound} charts={charts}
          blurb="Supplier efficiency and risk — whether the people you buy from can be relied on to keep the line fed">
          <p className="border-t border-line-soft px-4 py-3 text-[12px] leading-relaxed text-ink-2">
            <strong className="text-ink">Two different promises, and the gap between them is the point.</strong>{' '}
            OTIF above is measured against the date written on the purchase order — a promise a person
            made. Measured instead against the lead time each vendor quotes in their price list, across
            every seeded receipt — all 27 supplier–item pairs, six receipts each — only{' '}
            <Num d={onTime} format="raw" dp={1} suffix="%" /> arrived inside it. A supplier who quotes
            nine days and takes twelve is on time against neither, and that is precisely why §5 forbids
            using a quoted lead time to compute a reorder point. Both halves of OTIF together are only
            measurable on the five receipts carrying a promised date and an ordered quantity, and that
            thinness is itself a finding: most factories cannot compute OTIF at all, because the
            promise was never written down.
          </p>
        </ExecSection>

        <ExecSection no={2} index={1} title="Warehouse & inventory health" kpis={warehouse} charts={charts}
          blurb="Whether the cash is rotting on shelves, or the line is about to stop" />

        <ExecSection no={3} index={2} title="Outbound fulfilment" kpis={outbound} charts={charts}
          blurb="Delivery to customers — scoped but not built, so every figure here is illustrative">
          <p className="border-t border-line-soft px-4 py-3 text-[12px] leading-relaxed text-ink-2">
            <strong className="text-ink">Nothing in this build ships anything.</strong> §2 scopes it to
            Stage 1 plus the shop-floor read of Stages 3–4, so there is no despatch table, no carrier
            record and no returns route. These four are shown as the shape of the answer rather than the
            answer — and the one real thing on this row is underneath the headline: the customer orders
            Line Watch can already see are at risk, because a material behind them is genuinely short.
          </p>
        </ExecSection>

        <ExecSection no={4} index={3} title="Supply chain financials" kpis={financial} charts={charts}
          blurb="Cash flow and cost — every supply-chain decision lands on the runway">
          <p className="border-t border-line-soft px-4 py-3 text-[12px] leading-relaxed text-ink-2">
            <strong className="text-ink">The freight half that IS measured:</strong> inbound freight on
            this run is <Num d={inFreight} format="raw" dp={2} suffix="% of order value" /> — ₹11,200
            against ₹4,55,100 of orders. It is quoted as a share rather than rupees per unit because
            these orders are in metres, kilograms and pieces, and dividing one rupee total by the sum of
            those would be arithmetic on nothing. Freight is one of the five components of landed cost
            (§5), which is why the cheapest quoted rate is so often not the cheapest material.
          </p>
        </ExecSection>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Card index={7} title="What needs a decision today" sub="From the Sourcing Desk run R-0902">
          <ul className="divide-y divide-line-soft">
            {decide.map((r) => (
              <li key={r.item.id} className="px-4 py-2.5">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="mono text-[11.5px] text-ink-3">{r.item.code}</span>
                  <span className="text-[12.5px]">{r.item.name}</span>
                  <span className="ml-auto">
                    <StatusPill label={STATUS_LABEL[r.status.value]} tone={STATUS_TONE[r.status.value]} />
                  </span>
                </div>
                <p className="mt-0.5 text-[11.5px] text-ink-3">{r.status.note}</p>
              </li>
            ))}
          </ul>
          <div className="border-t border-line-soft px-4 py-2.5">
            <Link href="/sourcing/desk" className="text-[12px] font-medium text-accent hover:underline">
              Open the Sourcing Desk →
            </Link>
          </div>
        </Card>

        <Card index={8} title="On the floor" sub="Line Watch · Mon 7 September">
          <div className="space-y-2.5 p-4">
            <p className="text-[13px] leading-relaxed text-ink-2">
              The line runs for <strong className="text-ink">{lw.tiles.lineRunsFor.value.toFixed(1)} days</strong> before
              the {pace.m.name.toLowerCase()} stops it. {halting + risky} of {lw.jobs.length} jobs this week will not run
              as scheduled — {halting} short of material, {risky} waiting on{' '}
              {overdue.map((j) => `${j.vendorName}, ${daysBetween(j.dueBack, lw.today)} days late`).join('; ')}.
            </p>
            <ul className="space-y-1">
              {lw.jobs.filter((j) => j.status.value !== 'will_run').map((j) => (
                <li key={j.job.jobNo} className="flex flex-wrap items-baseline gap-x-2 text-[12px]">
                  <span className="mono">{j.job.jobNo}</span>
                  <span className="text-ink-2">{j.job.product}</span>
                  <span className="ml-auto">
                    <StatusPill label={j.status.value === 'will_halt' ? 'Will halt' : 'At risk'}
                      tone={j.status.value === 'will_halt' ? 'critical' : 'warn'} />
                  </span>
                </li>
              ))}
            </ul>
            <Link href="/production/line-watch" className="inline-block text-[12px] font-medium text-accent hover:underline">
              Open Line Watch →
            </Link>
          </div>
        </Card>

        <Card index={9} title="Supplier intake" sub="SRC-02 · one inbox, one WhatsApp number">
          <div className="p-4">
            <p className="figure text-[30px] leading-none">
              {ic.total}<span className="text-[15px] font-normal text-ink-3"> documents</span>
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Pill tone="good">{ic.auto} auto-filed</Pill>
              <Pill tone={ic.review ? 'warn' : 'good'}>{ic.review} in review</Pill>
              {ic.escalated > 0 && <Pill tone="critical">{ic.escalated} escalated</Pill>}
            </div>
            <p className="mt-3 text-[12.5px] leading-relaxed text-ink-2">
              Ships first, because it needs no historical data and no ERP — only an inbox — and it
              produces the price history the landed-cost comparison runs on.
            </p>
            <Link href="/sourcing/desk#intake" className="mt-2 inline-block text-[12px] font-medium text-accent hover:underline">
              Review the queue →
            </Link>
          </div>
        </Card>
      </div>

      <AssumptionLedger assumptions={ASSUMPTIONS} />
    </>
  )
}
