'use client'
import { PageHeader } from '@/components/shell/PageHeader'
import { Card, Pill, StatusPill } from '@/components/ui/bits'
import { buildRows, deskKpis, needsDecision, type SeedBundle } from '@/lib/domain/derive'
import { buildLineWatch } from '@/lib/domain/linewatch'
import { DEFAULT_POLICY } from '@/lib/domain/policy'
import { blockedStock } from '@/lib/seed/blocked'
import { reviewQueue, supplierDocuments } from '@/lib/seed/intake'
import * as S from '@/lib/seed/sourcing'
import { lakh, money, num } from '@/lib/domain/format'

const seed: SeedBundle = {
  today: S.TODAY_SOURCING, items: S.items, vendors: S.vendors, vendorItems: S.vendorItems,
  stockLots: S.stockLots, poLines: S.poLines, receipts: S.receipts,
}
const rows = buildRows(seed, DEFAULT_POLICY)
const kpis = deskKpis(rows)
const lw = buildLineWatch()
const row = (c: string) => rows.find((r) => r.item.code === c)!

interface Check { group: string; label: string; source: string; expected: string; actual: string }

const eq = (c: Check) => c.expected === c.actual

const blockedByAge = (b: string) =>
  blockedStock.filter((x) => x.ageBucket === b).reduce((a, x) => a + x.value, 0)
const blockedByCause = (c: string) =>
  blockedStock.filter((x) => x.cause === c).reduce((a, x) => a + x.value, 0)

const CHECKS: Check[] = [
  // ---- §5 reorder points
  ...([['EL-TUB-INC85', 620], ['RM-CRC-120', 1.6], ['RM-MGO-EG', 480], ['RM-NCR-8020', 74.1],
       ['HW-GLD-M20', 1150], ['CM-TRB-2W', 900], ['SN-RTD-6150', 140], ['RM-FLG-304-2', 252],
       ['IN-MWL-050', 468]] as [string, number][]).map(([c, v]) => ({
    group: 'Reorder points (§5)', label: c, source: 'avg_daily_consumption × vendor_lead_time + safety_stock',
    expected: String(v), actual: String(row(c).reorderPoint.value),
  })),

  // ---- §6 statuses
  ...([['EL-TUB-INC85', 'at_risk'], ['RM-CRC-120', 'open_po_covers'], ['RM-MGO-EG', 'at_risk_late'],
       ['RM-NCR-8020', 'at_risk'], ['HW-GLD-M20', 'open_po_covers'], ['CM-TRB-2W', 'at_risk'],
       ['SN-RTD-6150', 'covered'], ['RM-FLG-304-2', 'open_po_covers'], ['IN-MWL-050', 'covered']] as [string, string][])
    .map(([c, v]) => ({
      group: 'Status, on quantity and timing (§6)', label: c, source: 'the four-state rule',
      expected: v, actual: row(c).status.value,
    })),

  // ---- §5 reorder quantities
  ...([['EL-TUB-INC85', 1000], ['RM-NCR-8020', 100], ['CM-TRB-2W', 5000], ['RM-MGO-EG', 0]] as [string, number][])
    .map(([c, v]) => ({
      group: 'Reorder quantity (§5)', label: c, source: 'ceil((ROP + CYCLE_DAYS × avg − position) / moq) × moq',
      expected: num(v, 0), actual: num(row(c).reorderQty.value, 0),
    })),

  // ---- §9.1 aggregates
  { group: 'Sourcing Desk aggregates (§9.1)', label: 'Lines needing a decision', source: 'count(at_risk or at_risk_late)',
    expected: '4', actual: String(kpis.linesNeedingDecision.value) },
  { group: 'Sourcing Desk aggregates (§9.1)', label: 'Cash to release', source: 'Σ landed_total where reorder_qty > 0',
    expected: money(455100), actual: money(kpis.toRelease.value) },
  { group: 'Sourcing Desk aggregates (§9.1)', label: 'Draft POs', source: 'distinct suppliers across those lines',
    expected: '3', actual: String(kpis.draftPoCount) },
  { group: 'Sourcing Desk aggregates (§9.1)', label: 'Non-usable stock', source: 'Σ qty × last_purchase_rate',
    expected: money(29308), actual: money(kpis.nonUsableValue.value) },
  { group: 'Sourcing Desk aggregates (§9.1)', label: 'Supplier documents', source: 'intake counts',
    expected: '14 · 11 auto · 3 in review',
    actual: `${supplierDocuments.length} · ${supplierDocuments.length - reviewQueue.length} auto · ${reviewQueue.length} in review` },

  // ---- §8.4 guardrail
  { group: 'Coverage guardrail (§8.4)', label: 'CM-TRB-2W net need', source: 'ROP + CYCLE_DAYS × avg − true position',
    expected: num(1420, 0),
    actual: num(row('CM-TRB-2W').reorderPoint.value + 15 * row('CM-TRB-2W').item.avgDailyConsumption - row('CM-TRB-2W').truePosition.value, 0) },
  { group: 'Coverage guardrail (§8.4)', label: 'CM-TRB-2W coverage after receipt', source: '(usable + transit + open + reorder) / avg / 30',
    expected: '2.91', actual: String(row('CM-TRB-2W').coverageAfterMonths.value) },
  { group: 'Coverage guardrail (§8.4)', label: 'Lines held', source: 'reorder_qty > 0 AND coverage > ceiling',
    expected: 'CM-TRB-2W', actual: rows.filter((r) => r.held.value).map((r) => r.item.code).join(', ') },

  // ---- §8.3 landed cost
  { group: 'Landed cost (§8.3)', label: 'Nirmal Alloy Tubes, element tube', source: 'rate + freight + GST + term + rejection',
    expected: money(224.40, 2), actual: money(row('EL-TUB-INC85').quotes.find((q) => q.vendor.name === 'Nirmal Alloy Tubes')!.landedPerUnit.value, 2) },
  { group: 'Landed cost (§8.3)', label: 'Sanghvi Special Metals, element tube', source: 'the lowest quoted rate, ₹206',
    expected: money(232.70, 2), actual: money(row('EL-TUB-INC85').quotes.find((q) => q.vendor.name === 'Sanghvi Special Metals')!.landedPerUnit.value, 2) },
  { group: 'Landed cost (§8.3)', label: 'Premium on a 1,000 m order', source: '(232.70 − 224.40) × 1000',
    expected: money(8300),
    actual: money(Math.round((row('EL-TUB-INC85').quotes.find((q) => q.vendor.name === 'Sanghvi Special Metals')!.landedPerUnit.value
      - row('EL-TUB-INC85').quotes[0].landedPerUnit.value) * 1000)) },
  { group: 'Landed cost (§8.3)', label: 'Comparisons that flip the vendor', source: 'argmin(landed) ≠ argmin(rate)',
    expected: '6 of 9', actual: `${rows.filter((r) => r.flipsVendor).length} of ${rows.length}` },

  // ---- §9.1 blocked capital, both marginals
  { group: 'Blocked capital (§9.1)', label: 'Total', source: 'Σ blocked_stock.value', expected: lakh(1840000), actual: lakh(blockedStock.reduce((a, b) => a + b.value, 0)) },
  { group: 'Blocked capital (§9.1)', label: 'By age', source: '0–90 · 90–180 · over 180',
    expected: '₹6.20 L · ₹5.10 L · ₹7.10 L',
    actual: [blockedByAge('0_90'), blockedByAge('90_180'), blockedByAge('over_180')].map((v) => lakh(v)).join(' · ') },
  { group: 'Blocked capital (§9.1)', label: 'By cause', source: 'MOQ · spec · over-buy · cancelled · wrong',
    expected: '₹5.80 L · ₹4.60 L · ₹3.90 L · ₹2.40 L · ₹1.70 L',
    actual: ['moq_forced', 'spec_change', 'over_buy', 'cancelled_order', 'wrong_purchase'].map((c) => lakh(blockedByCause(c))).join(' · ') },

  // ---- §9.2 Line Watch
  { group: 'Line Watch (§9.2)', label: 'The line runs for', source: 'min(usable / floor_consumption_per_day)',
    expected: '3.5 days', actual: `${lw.tiles.lineRunsFor.value.toFixed(1)} days` },
  { group: 'Line Watch (§9.2)', label: 'Jobs stopping this week', source: 'count(outcome ≠ Will run)',
    expected: '3 of 6', actual: `${lw.tiles.jobsStopping.value} of ${lw.jobs.length}` },
  { group: 'Line Watch (§9.2)', label: 'Cash needed for reorders', source: 'Σ reorder_qty × rate + freight',
    expected: lakh(760000), actual: lakh(lw.tiles.cashNeeded.value) },
  { group: 'Line Watch (§9.2)', label: 'Stock you cannot use', source: 'Σ (qc + damaged + expired) × rate',
    expected: money(36516), actual: money(lw.tiles.unusableValue.value) },
  { group: 'Line Watch (§9.2)', label: 'Materials with unusable stock', source: 'count',
    expected: '5', actual: String(lw.tiles.unusableLotCount) },
  { group: 'Line Watch (§9.2)', label: 'JOB-4471', source: 'blocking materials → Will halt',
    expected: 'Will halt · Concealed hinge 180° SS',
    actual: `${lw.jobs.find((j) => j.job.jobNo === 'JOB-4471')!.status.value === 'will_halt' ? 'Will halt' : '—'} · ${lw.jobs.find((j) => j.job.jobNo === 'JOB-4471')!.status.blocking.join(', ')}` },
  { group: 'Line Watch (§9.2)', label: 'JOB-4482', source: 'no shortage, but an overdue jobworker → At risk',
    expected: 'At risk · Zinc ingot 99.99%',
    actual: `${lw.jobs.find((j) => j.job.jobNo === 'JOB-4482')!.status.value === 'at_risk' ? 'At risk' : '—'} · ${lw.jobs.find((j) => j.job.jobNo === 'JOB-4482')!.status.lateJw.join(', ')}` },
]

export default function Page() {
  const pass = CHECKS.filter(eq).length
  const groups = [...new Set(CHECKS.map((c) => c.group))]

  return (
    <>
      <PageHeader eyebrow="Honesty check" title="Reconciliation report"
        meta={<>
          <Pill tone={pass === CHECKS.length ? 'good' : 'critical'}>
            {pass} of {CHECKS.length} reconcile
          </Pill>
          <Pill mono>run in your browser, not baked in</Pill>
        </>} />

      <p className="mb-4 max-w-3xl text-[13.5px] leading-relaxed text-ink-2">
        Every figure quoted in the design document, recomputed live from the seed data by the same
        functions the dashboards render. Nothing here is a stored expected value — if a formula
        changes, this page goes red before anyone notices on a dashboard. It is the reason a client
        who checks one number against another finds them consistent.
      </p>

      <div className="space-y-3">
        {groups.map((g) => {
          const items = CHECKS.filter((c) => c.group === g)
          const ok = items.filter(eq).length
          return (
            <Card key={g} title={g}
              actions={<StatusPill label={`${ok} of ${items.length}`} tone={ok === items.length ? 'good' : 'critical'} />}>
              <div className="scroll-x overflow-x-auto">
                <table className="w-full min-w-[46rem] border-collapse text-[12.5px]">
                  <thead className="bg-surface-2">
                    <tr className="text-[11px] uppercase tracking-wide text-ink-3">
                      {['', 'Check', 'How it is derived', 'Design document says', 'This build computes'].map((h, i) => (
                        <th key={i} className="whitespace-nowrap border-b border-line px-3 py-1.5 text-left font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((c, i) => {
                      const good = eq(c)
                      return (
                        <tr key={i} className="anim-fade-in border-b border-line-soft last:border-0">
                          <td className="px-3 py-1.5">
                            <span aria-label={good ? 'reconciles' : 'does not reconcile'}
                              className={`inline-block size-2 rounded-full ${good ? 'bg-good' : 'bg-critical'}`} />
                          </td>
                          <td className="mono whitespace-nowrap px-3 py-1.5">{c.label}</td>
                          <td className="px-3 py-1.5 text-[11.5px] text-ink-3">{c.source}</td>
                          <td className="num whitespace-nowrap px-3 py-1.5 text-ink-2">{c.expected}</td>
                          <td className={`num whitespace-nowrap px-3 py-1.5 font-medium ${good ? '' : 'text-critical'}`}>
                            {c.actual}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )
        })}
      </div>

      <Card className="mt-3" title="Three things the design document left open, and how they were closed">
        <ol className="divide-y divide-line-soft">
          {[
            ['Valuation basis was undefined (§13-1)',
             'The prototypes valued stock at the cheapest current quote, which §13 itself calls wrong. The basis is recoverable from the data: non-usable quantity × the recommended vendor’s base rate sums to exactly the ₹29,308 §9.1 states, where landed cost gives ₹30,871.40 and the cheapest quote ₹28,769.00. So the basis is last purchase price, ex-freight — and it is applied everywhere stock is valued, on both screens.'],
            ['Line Watch quoted totals but no unit rates (§9.2)',
             'One consistent, realistic rate set reproduces both stated totals exactly — ₹36,516 of unusable stock and ₹7.60 L of cash needed. Those rates are in the seed and both totals are asserted above.'],
            ['Lead time was a stored number, which §5 forbids',
             '§5 calls it non-negotiable that lead time is the trailing average of the last six actual receipts, never the vendor’s quoted figure. Six receipt records per supplier are seeded and every lead time on every screen is computed from them — click one to see the six dates it averages.'],
          ].map(([h, b]) => (
            <li key={h} className="px-4 py-3">
              <h3 className="text-[13.5px]">{h}</h3>
              <p className="mt-1 max-w-4xl text-[12.5px] leading-relaxed text-ink-2">{b}</p>
            </li>
          ))}
        </ol>
      </Card>
    </>
  )
}
