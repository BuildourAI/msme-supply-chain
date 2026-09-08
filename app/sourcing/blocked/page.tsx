'use client'
import { useState } from 'react'
import { PageHeader } from '@/components/shell/PageHeader'
import { Card, Pill, StatusPill } from '@/components/ui/bits'
import { Donut, RankedBars } from '@/components/charts/exec-charts'
import { CAT } from '@/components/charts/kit'
import { useDesk } from '@/components/desk/store'
import { AGE_LABEL, blockedStock, CAUSE_LABEL, ROUTE_LABEL } from '@/lib/seed/blocked'
import { lakh, money, num } from '@/lib/domain/format'
import { TODAY_SOURCING } from '@/lib/seed/sourcing'
import { daysBetween } from '@/lib/domain/calc'

/**
 * SRC-04 on its own page.
 *
 * §8.4 is the whole design: "the cause column is the point — if MOQ is the top
 * cause the fix is a vendor negotiation, not a software change." So the page is
 * built around cause and age as two views of one total, with an owner, a route
 * out and a deadline on every lot. A pile of money with no name against it is
 * a report; a pile with an owner and a date is a task list.
 *
 * The other half of SRC-04 is preventive and lives on the desk: the guardrail
 * that holds any new order which would push cover past its ceiling. This page
 * shows what the guardrail is for.
 */

const ROUTE_TONE: Record<string, 'good' | 'warn' | 'critical' | 'accent'> = {
  return: 'good', resell: 'accent', alternate: 'warn', scrap: 'critical',
}

type By = 'cause' | 'age' | 'route' | 'owner'

const GROUPS: { id: By; label: string; key: keyof (typeof blockedStock)[number]; labels?: Record<string, string> }[] = [
  { id: 'cause', label: 'By cause', key: 'cause', labels: CAUSE_LABEL },
  { id: 'age', label: 'By age', key: 'ageBucket', labels: AGE_LABEL },
  { id: 'route', label: 'By route out', key: 'route', labels: ROUTE_LABEL },
  { id: 'owner', label: 'By owner', key: 'owner' },
]

export default function Page() {
  const [by, setBy] = useState<By>('cause')
  const { kpis } = useDesk()
  const total = blockedStock.reduce((a, b) => a + b.value, 0)

  const g = GROUPS.find((x) => x.id === by)!
  const grouped = (() => {
    const m = new Map<string, { value: number; lots: number }>()
    for (const b of blockedStock) {
      const k = String(b[g.key])
      const e = m.get(k) ?? { value: 0, lots: 0 }
      m.set(k, { value: e.value + b.value, lots: e.lots + 1 })
    }
    return [...m.entries()]
      .map(([k, v]) => ({ label: g.labels?.[k] ?? k, value: v.value, lots: v.lots }))
      .sort((a, b) => b.value - a.value)
  })()

  const ageSegs = (['0_90', '90_180', 'over_180'] as const).map((k, i) => ({
    label: `${AGE_LABEL[k]} · ${lakh(blockedStock.filter((b) => b.ageBucket === k).reduce((a, b) => a + b.value, 0))}`,
    value: blockedStock.filter((b) => b.ageBucket === k).reduce((a, b) => a + b.value, 0),
    color: CAT[i === 0 ? 2 : i === 1 ? 3 : 1],
  }))

  // A deadline is only worth printing if somebody can still miss it.
  const overdue = blockedStock.filter((b) => b.deadline < TODAY_SOURCING)
  const soon = blockedStock
    .filter((b) => b.deadline >= TODAY_SOURCING && daysBetween(TODAY_SOURCING, b.deadline) <= 45)
    .sort((a, b) => a.deadline.localeCompare(b.deadline))

  return (
    <>
      <PageHeader eyebrow="Stage 1 · Sourcing & procurement" title="Blocked capital"
        meta={<>
          <Pill tone="accent">SRC-04</Pill>
          <Pill tone="warn">{lakh(total)} across {blockedStock.length} lots</Pill>
          <Pill tone="critical">{lakh(blockedStock.filter((b) => b.ageBucket === 'over_180').reduce((a, b) => a + b.value, 0))} over 180 days</Pill>
        </>} />

      <p className="mb-3 max-w-4xl text-[13px] leading-relaxed text-ink-2">
        <strong className="text-ink">This is usable material bought for the wrong job.</strong> It is a
        different population from the {money(kpis.nonUsableValue.value)} of stock that cannot be issued
        at all — that material is damaged, expired or held in QC; this material is perfectly good and
        simply has nowhere to go. One is not a subset of the other, and adding them together would
        double-count nothing while hiding both.
      </p>

      <div className="mb-3 grid items-start gap-3 lg:grid-cols-[1fr_1.3fr]">
        <Card index={0} title="How old the money is" sub="age tells you how bad it is">
          <div className="p-3.5">
            <Donut segments={ageSegs} centre={lakh(total)} centreSub="blocked"
              foot={`${lakh(ageSegs[2].value)} has been sitting for more than six months. At the 1.8% a month it costs to hold, that pile alone is running up about ${money(ageSegs[2].value * 0.018)} a month in rent, insurance and stopped capital.`} />

            {/* what the age actually costs, bucket by bucket — the number that
                turns "old stock" into a figure somebody will act on */}
            <table className="mt-3 w-full border-t border-line-soft text-[11.5px]">
              <thead>
                <tr className="text-ink-3">
                  {['Age', 'Lots', 'Value', 'Costs a month to hold'].map((h, i) => (
                    <th key={h} className={`border-b border-line-soft py-1.5 font-medium ${i ? 'text-right' : 'text-left'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(['0_90', '90_180', 'over_180'] as const).map((k) => {
                  const lots = blockedStock.filter((b) => b.ageBucket === k)
                  const v = lots.reduce((a, b) => a + b.value, 0)
                  return (
                    <tr key={k} className="border-b border-line-soft last:border-b-0">
                      <td className="py-1.5 text-ink-2">{AGE_LABEL[k]}</td>
                      <td className="num py-1.5 text-right">{lots.length}</td>
                      <td className="num py-1.5 text-right font-medium">{lakh(v)}</td>
                      <td className={`num py-1.5 text-right ${k === 'over_180' ? 'text-critical' : 'text-ink-2'}`}>
                        {money(v * 0.018)}
                      </td>
                    </tr>
                  )
                })}
                <tr className="border-t border-line">
                  <td className="py-1.5 font-medium">All of it</td>
                  <td className="num py-1.5 text-right font-medium">{blockedStock.length}</td>
                  <td className="num py-1.5 text-right font-medium">{lakh(total)}</td>
                  <td className="num py-1.5 text-right font-medium">{money(total * 0.018)}</td>
                </tr>
              </tbody>
            </table>
            <p className="mt-1.5 text-[10.5px] leading-relaxed text-ink-3">
              The holding rate is the one assumption on this page — 1.8% a month, the middle of the
              ordinary range for a rented industrial shed, and the same figure the executive dashboard
              uses. Everything else here is measured.
            </p>
          </div>
        </Card>

        <Card index={1} title="What put it there" sub="cause tells you what to do about it"
          actions={<div className="flex flex-wrap gap-1">
            {GROUPS.map((x) => (
              <button key={x.id} type="button" onClick={() => setBy(x.id)}
                aria-pressed={by === x.id}
                className={`rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
                  by === x.id ? 'border-accent bg-accent-soft text-accent' : 'border-line text-ink-2 hover:bg-surface-2'}`}>
                {x.label}
              </button>
            ))}
          </div>}>
          <div className="p-3.5">
            <RankedBars format="money"
              rows={grouped.map((x) => ({
                label: x.label, value: x.value,
                sub: `${x.lots} lot${x.lots === 1 ? '' : 's'} · ${Math.round((x.value / total) * 100)}% of the total`,
              }))} />
            <p className="mt-3 rounded-md border border-line bg-surface-2 p-2.5 text-[12px] leading-relaxed text-ink-2">
              {by === 'cause' && (
                <><strong className="text-ink">MOQ forced is the top cause at {lakh(grouped[0].value)}.</strong>{' '}
                That is a vendor negotiation — a smaller minimum, or a shared order with another buyer —
                not a software change. Spec change is second, and that is a design-release
                discipline. Neither is fixed by a screen, which is exactly why this column exists.</>
              )}
              {by === 'age' && (
                <><strong className="text-ink">{lakh(grouped[0].value)} sits in the {grouped[0].label.toLowerCase()} bucket.</strong>{' '}
                Age is the pressure gauge and cause is the wrench. Sorting by age tells you which lots
                have already had every chance; sorting by cause tells you which conversation stops
                the next one arriving.</>
              )}
              {by === 'route' && (
                <><strong className="text-ink">Every lot has a way out already chosen.</strong> Return
                to the vendor is the cheapest and the rarest, because the window closes fast. Use on an
                alternate job recovers the most value; scrap is the admission that nothing else worked
                — {lakh(grouped.find((x) => x.label === ROUTE_LABEL.scrap)?.value ?? 0)} of this pile
                is already there.</>
              )}
              {by === 'owner' && (
                <><strong className="text-ink">Nothing here is owned by “the company”.</strong> Design
                releases caused the spec changes, sales caused the cancellations, and buying caused the
                over-buys and the MOQ commitments. A pile of money with a person’s name against it gets
                cleared; a pile without one gets reported on every month for a year.</>
              )}
            </p>
          </div>
        </Card>
      </div>

      <div className="mb-3 grid items-start gap-3 lg:grid-cols-3">
        <Card index={2} className="lg:col-span-2" title="Deadlines that are actually near"
          sub={`${overdue.length} already past · ${soon.length} inside 45 days`}>
          <ul className="divide-y divide-line-soft">
            {[...overdue, ...soon].slice(0, 7).map((b) => {
              const late = b.deadline < TODAY_SOURCING
              const days = Math.abs(daysBetween(TODAY_SOURCING, b.deadline))
              return (
                <li key={b.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-4 py-2">
                  <span className="mono w-24 shrink-0 text-[11px] text-ink-3">{b.itemCode}</span>
                  <span className="min-w-0 flex-1 truncate text-[12.5px]">{b.itemName}</span>
                  <span className="num shrink-0 text-[12.5px] font-medium">{lakh(b.value)}</span>
                  <span className="shrink-0 text-[11.5px] text-ink-2">{b.owner}</span>
                  <span className={`mono shrink-0 text-[11px] ${late ? 'text-critical' : 'text-warn'}`}>
                    {late ? `${days} days past ${b.deadline}` : `${days} days left`}
                  </span>
                </li>
              )
            })}
          </ul>
          <p className="border-t border-line-soft px-4 py-2 text-[11px] leading-relaxed text-ink-3">
            Only lots whose deadline is past or inside 45 days are listed — a date eleven months out is
            not a task. The two return-to-vendor lots are the urgent ones: that window shuts and the
            money converts from recoverable into a resale problem.
          </p>
        </Card>

        <Card index={3} title="The other half of SRC-04" sub="this page is the cure; the desk is the prevention">
          <div className="space-y-2 p-3.5 text-[12px] leading-relaxed text-ink-2">
            <p>
              <strong className="text-ink">Every lot here was once an approval.</strong> Somebody bought
              a legitimate quantity for a legitimate reason and the job changed, or the minimum order
              was four times what the job needed.
            </p>
            <p>
              So the same system holds the next one: an order that would push cover past its ceiling for
              that item class is held on the desk, with the arithmetic shown. It is never blocked — a
              person can release it with a written reason, and the reason is stored against the line.
            </p>
            <p className="text-ink-3">
              Override, never block. A guardrail that cannot be overridden gets worked around within a
              week, and then it is measuring nothing.
            </p>
            <a href="/sourcing/desk#blocked"
               className="inline-block pt-0.5 text-[12px] font-medium text-accent hover:underline">
              See the guardrail on the desk →
            </a>
          </div>
        </Card>
      </div>

      <Card index={4} title={`All ${blockedStock.length} lots`}
        sub="with an owner, a route out and a date — sorted by value">
        <div className="scroll-x overflow-auto">
          <table className="w-full min-w-[46rem] border-collapse text-[11.5px]">
            <thead className="bg-surface-2">
              <tr className="text-ink-3">
                {['Material', 'Qty', 'Value', 'Age', 'Cause', 'Route out', 'Owner', 'Deadline'].map((h) => (
                  <th key={h} className="whitespace-nowrap border-b border-line px-3 py-1.5 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...blockedStock].sort((a, b) => b.value - a.value).map((b) => (
                <tr key={b.id} className="border-b border-line-soft hover:bg-surface-2">
                  <td className="px-3 py-1.5">
                    <span className="mono block text-[10.5px] text-ink-3">{b.itemCode}</span>
                    <span className="block max-w-[18rem] truncate">{b.itemName}</span>
                  </td>
                  <td className="num whitespace-nowrap px-3 py-1.5">{num(b.qty, b.qty < 10 ? 2 : 0)} {b.uom}</td>
                  <td className="num whitespace-nowrap px-3 py-1.5 font-medium">{lakh(b.value)}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-ink-2">{AGE_LABEL[b.ageBucket]}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-ink-2">{CAUSE_LABEL[b.cause]}</td>
                  <td className="whitespace-nowrap px-3 py-1.5">
                    <StatusPill label={ROUTE_LABEL[b.route]} tone={ROUTE_TONE[b.route]} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-ink-2">{b.owner}</td>
                  <td className={`mono whitespace-nowrap px-3 py-1.5 ${
                    b.deadline < TODAY_SOURCING ? 'text-critical' : 'text-ink-3'}`}>{b.deadline}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-line-soft px-3 py-2 text-[11.5px] leading-relaxed text-ink-3">
          Both marginals foot to {lakh(total)} — by age and by cause — which is the check that says the
          cross-tab is a real one rather than two separate stories about the same pile.
        </p>
      </Card>
    </>
  )
}
