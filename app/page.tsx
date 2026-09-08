'use client'
import Link from 'next/link'
import { PageHeader } from '@/components/shell/PageHeader'
import { Card, Pill, StatusPill } from '@/components/ui/bits'
import { KpiTile } from '@/components/desk/KpiRow'
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

const causeRows = (() => {
  const m = new Map<string, number>()
  for (const b of blockedStock) m.set(b.cause, (m.get(b.cause) ?? 0) + b.value)
  return [...m.entries()].map(([k, v]) => ({ label: CAUSE_LABEL[k], value: v })).sort((a, b) => b.value - a.value)
})()

export default function Page() {
  const decide = rows.filter(needsDecision)
  const { intakeCounts: ic } = useDesk()
  const halting = lw.jobs.filter((j) => j.status.value === 'will_halt').length
  const risky = lw.jobs.filter((j) => j.status.value === 'at_risk').length
  const pace = [...lw.materials].sort((a, b) => a.coverDays.value - b.coverDays.value)[0]
  const overdue = lw.jobwork.filter((j) => j.dueBack < lw.today)
  return (
    <>
      <PageHeader eyebrow="Level 1 · end-to-end material view" title="Executive Dashboard"
        meta={<>
          <Pill mono>{longDate(seed.today)}</Pill>
          <Pill tone="accent">Stage 1 live · Stages 2–5 scoped</Pill>
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

      <div className="mb-4 grid gap-3 lg:grid-cols-2">
        <Card index={5} title="Actual delivery time, last six receipts" live
          annotation="lead time is measured, never quoted"
          sub="§5 · the trailing average of six real receipts is what drives every reorder point">
          <div className="p-4">
            <LineChart series={leadSeries} yLabel="Days from order to receipt"
              xLabels={['−6', '−5', '−4', '−3', '−2', 'last']}
              reference={{ value: 12, label: 'MgO reorder point runs on 12 days' }} />
            <div className="mt-2"><Legend items={leadSeries.map((s) => ({ label: s.label, color: s.color }))} /></div>
            <p className="mt-2.5 text-[12px] leading-relaxed text-ink-3">
              A vendor’s quoted lead time is a promise; this is the record. Where the two disagree,
              the record wins — that is why a material can show twenty days of cover and still be a
              stockout.
            </p>
          </div>
        </Card>

        <Card index={6} title="Blocked capital by cause" live annotation={`${lakh(blockedTotal)} across ${blockedStock.length} lots`}
          sub="§8.4 · age tells you how bad it is, cause tells you what to do about it">
          <div className="p-4">
            <BarRows rows={causeRows} format="lakh" colorMode="categorical" />
            <p className="mt-3 text-[12px] leading-relaxed text-ink-3">
              MOQ forced is the largest single cause. That is a conversation with a vendor about
              splitting minimum order quantities — not a software change.
            </p>
          </div>
        </Card>
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
    </>
  )
}
