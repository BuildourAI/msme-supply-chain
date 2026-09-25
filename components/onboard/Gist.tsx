'use client'
import { useMemo } from 'react'
import Link from 'next/link'
import { Icon, type IconName } from '@/components/ui/icons'
import { Tiles } from '@/components/sourcing/Tiles'
import { CAT, Columns } from '@/components/charts/kit'
import { Donut, RankedBars } from '@/components/charts/exec-charts'
import { useWorkspace } from '@/components/workspace/store'
import { shortDate } from '@/lib/domain/format'
import { BAND_LABEL, type Band } from '@/lib/workspace/decisions'
import {
  GIST_STAGES, compact, gist, monthWord, whenWord, type Goal, type GoalState,
} from '@/lib/workspace/executive'
import type { MetricStage, MetricTone } from '@/lib/workspace/metrics'

/**
 * The owner's gist: the whole business in one look, above the stage tiles.
 *
 * Five money tiles; four pictures of where the money is going; one queue of
 * what needs the owner across every desk; six goals judged against the rules
 * the owner set; the last things written; and a card per stage with its own
 * figures and what is open there. Every tile, row and card is a link into the
 * screen that holds it — the gist decides nothing itself, so nothing here
 * acts on a card; the desks do that.
 *
 * Rendered only once the company has a record to read (see `hasRecords`), and
 * only for the owner's own company — the sample has its own page.
 */
export function Gist() {
  const { workspace, today } = useWorkspace()
  // the set-up wizards below re-render this page on every save; the sums only need to follow the workspace
  const g = useMemo(() => (workspace ? gist(workspace, today) : null), [workspace, today])
  if (!g) return null

  const month = monthWord(today.slice(0, 7))
  const sitsTotal = g.sits.reduce((a, s) => a + s.value, 0)
  const promiseTotal = g.promise.past.value + g.promise.soon.value + g.promise.later.value
  const dispatchedAny = g.dispatched.some((d) => d.value > 0)

  return (
    <div data-gist className="mb-2">
      <Rule title="The business at a glance" note="money in the portal today, at selling value or last purchase price" />
      <div data-gist-tiles><Tiles metrics={g.headlines} columns={5} /></div>

      <div className="mt-3.5 grid items-start gap-3.5 lg:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="grid min-w-0 gap-3.5 sm:grid-cols-2">
          <Card chart="dispatched" title="Dispatched by month" href="/dispatch/notes" link="Delivery challans"
            desc={`Selling value of what left, before GST · ${month} so far`}>
            {dispatchedAny
              ? <Columns title="Dispatched by month, selling value" format={compact}
                points={g.dispatched.map((d) => ({ label: d.label, value: d.value, note: `${d.count} challan${d.count === 1 ? '' : 's'}` }))} />
              : <Empty>Nothing dispatched in the last six months yet. Raise a delivery challan and it shows here.</Empty>}
          </Card>

          <Card chart="sits" title="Where the money sits" desc={`Everything you own or have committed, ${compact(sitsTotal)}`}>
            {sitsTotal > 0
              ? <Donut centre={compact(sitsTotal)} centreSub="in all"
                // a place keeps its colour whether or not it holds anything today
                segments={g.sits.map((s, i) => ({ label: `${s.label} · ${compact(s.value)}`, value: s.value, color: CAT[i] }))
                  .filter((s) => s.value > 0)}
                foot="Material at last purchase price; finished goods at what they cost to make." />
              : <Empty>{g.counted
                ? 'Your stock is counted but has no price yet. A supplier’s rate, or a receipt against a purchase order, gives it one.'
                : 'Nothing on the book yet. Count your stock and it shows here.'}</Empty>}
          </Card>

          <Card chart="spend" title={`Spend by material · ${month}`} href="/sourcing/orders" link="Purchase orders"
            desc={g.spend.basis === 'received'
              ? `What arrived this month, at the price on its purchase order · ${compact(g.spend.total)}`
              : g.spend.basis === 'ordered'
                ? `Nothing has arrived yet this month — what was ordered · ${compact(g.spend.total)}`
                : 'What arrives this month, at the price on its purchase order'}>
            {g.spend.rows.length > 0
              ? <RankedBars rows={g.spend.rows} fmt={compact} />
              : <Empty>No purchase order has been placed or received this month.</Empty>}
          </Card>

          <Card chart="promise" title="Sales orders by promise" href="/dispatch/orders" link="Sales orders"
            desc={`What is still to dispatch, ${compact(promiseTotal)}, by when it was promised`}>
            {promiseTotal > 0 ? (
              <>
                <div className="my-3 flex h-3.5 gap-0.5 overflow-hidden rounded" role="img"
                  aria-label={`Past the promise ${compact(g.promise.past.value)}, due in 7 days ${compact(g.promise.soon.value)}, later ${compact(g.promise.later.value)}`}>
                  {([['past', 'bg-critical'], ['soon', 'bg-warn'], ['later', 'bg-good']] as const).map(([k, bg]) => g.promise[k].value > 0 && (
                    <span key={k} className={`${bg} first:rounded-l last:rounded-r`} style={{ width: `${(g.promise[k].value / promiseTotal) * 100}%` }}
                      title={`${compact(g.promise[k].value)}`} />
                  ))}
                </div>
                <ul className="space-y-1.5 text-[12px] text-ink-2">
                  <PromiseRow icon="alert" tone="text-critical" label="Past the promise" n={g.promise.past.count} value={g.promise.past.value} />
                  <PromiseRow icon="clock" tone="text-warn" label="Due in the next 7 days" n={g.promise.soon.count} value={g.promise.soon.value} />
                  <PromiseRow icon="check" tone="text-good" label="Later" n={g.promise.later.count} value={g.promise.later.value} />
                </ul>
                {g.promise.late.length > 0 && (
                  <ul className="mt-2.5 space-y-1 border-t border-line-soft pt-2 text-[11.5px] text-ink-2">
                    {g.promise.late.slice(0, 2).map((o) => (
                      <li key={o.id} className="flex gap-2">
                        <span className="mono text-ink">{o.no}</span>
                        <span className="min-w-0 truncate">{o.customer}</span>
                        <span className="ml-auto shrink-0 text-ink-3">promised {shortDate(o.promised)} · {compact(o.value)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : <Empty>No sales order is waiting to be sent.</Empty>}
          </Card>

          <section className="rounded-xl border border-line bg-surface p-4 sm:col-span-2" data-activity-list>
            <h3 className="text-[13.5px] font-bold tracking-tight">Recent activity</h3>
            {g.activity.length === 0
              ? <Empty>Nothing written yet.</Empty>
              : (
                <ul className="mt-1.5 grid gap-x-6 sm:grid-cols-2">
                  {g.activity.map((a) => (
                    <li key={`${a.kind}-${a.seq}`} data-activity>
                      <Link href={a.href} className="press flex items-center gap-2.5 rounded-lg py-1.5 text-[12px] leading-snug text-ink-2 hover:bg-surface-2">
                        <span aria-hidden className="grid size-[26px] shrink-0 place-items-center rounded-md bg-surface-2 text-ink-3">
                          <Icon name={a.kind} className="size-3.5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="text-ink">{a.what}</span>
                          {a.who && a.who !== 'unchecked' && <span className="text-ink-3"> · {a.who}</span>}
                        </span>
                        <span className="shrink-0 text-[11px] text-ink-3">{whenWord(a.on, today)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
          </section>
        </div>

        <aside className="grid min-w-0 gap-3.5">
          <section data-needs-you className="rounded-xl border border-line bg-surface p-4">
            <h3 className="flex items-center gap-2 text-[13.5px] font-bold tracking-tight">
              Needs you
              <span className={`mono rounded-full px-1.5 text-[10.5px] font-semibold leading-[18px] ${
                g.needs.total > 0 ? 'bg-critical text-white' : 'bg-good-soft text-good'}`}>{g.needs.total}</span>
              <span className="ml-auto text-[11px] font-normal text-ink-3">across every desk</span>
            </h3>
            <div className="mt-2.5 grid grid-cols-5 gap-1">
              {g.needs.stages.map((s) => (
                <Link key={s.stage} href={s.href} data-needs-stage={s.stage}
                  aria-label={`${s.label}: ${s.count} open`}
                  className="press grid min-w-0 justify-items-center gap-0.5 rounded-lg border border-line px-0.5 py-1.5 text-[10px] tracking-tight text-ink-2 hover:border-accent hover:bg-accent-tint/40">
                  <Icon name={iconOf(s.stage)} className="size-[15px] text-ink-3" />
                  <b className={`text-[15px] font-extrabold ${s.count > 0 ? 'text-ink' : 'text-ink-4'}`}>{s.count}</b>
                  <span className="max-w-full truncate">{s.label}</span>
                </Link>
              ))}
            </div>
            {g.needs.top.length === 0 ? (
              <p className="mt-3 flex items-center gap-2 text-[12.5px] text-good">
                <Icon name="check" className="size-4" /> Nothing waiting on you on any desk.
              </p>
            ) : (
              <ul className="mt-2.5 space-y-1.5">
                {g.needs.top.map(({ d, stage, label }) => (
                  <li key={`${stage}-${d.id}`}>
                    <Link href={d.href} data-needs-card={d.kind}
                      className={`press flex gap-2.5 rounded-lg p-2.5 ${BAND_BG[d.band]}`}>
                      <span aria-hidden className={`grid size-7 shrink-0 place-items-center rounded-md bg-surface ${BAND_ICON[d.band]}`}>
                        <Icon name={iconOf(stage)} className="size-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[12.5px] font-bold leading-snug text-ink">{d.title}</span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-ink-2">
                          {BAND_LABEL[d.band]} · {label}
                          <span className="ml-auto font-semibold text-accent-ink">{d.actLabel} ›</span>
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-xl border border-line bg-surface p-4">
            <h3 className="flex items-center text-[13.5px] font-bold tracking-tight">
              Goals <span className="ml-auto text-[11px] font-normal text-ink-3">from the rules you set</span>
            </h3>
            <ul className="mt-1">
              {g.goals.map((goal) => <GoalRow key={goal.key} goal={goal} />)}
            </ul>
          </section>
        </aside>
      </div>

      <Rule title="Each stage" note="its key figures and what is open there" />
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {g.cards.map((c, i) => (
          <li key={c.stage} data-stage-card={c.stage} style={{ '--i': i } as React.CSSProperties}
            className="anim-fade-up flex min-w-0 flex-col gap-2.5 rounded-xl border border-line bg-surface p-3.5">
            <Link href={c.href} className="flex items-center gap-2.5 text-[14px] font-bold tracking-tight hover:text-accent-ink">
              <span aria-hidden className="grid size-[30px] place-items-center rounded-lg bg-accent-tint text-accent-ink">
                <Icon name={iconOf(c.stage)} className="size-4" />
              </span>
              {c.label}
            </Link>
            <ul className="space-y-1.5">
              {c.figures.map((m) => (
                <li key={m.key} className="grid grid-cols-[7px_minmax(0,1fr)_auto] items-center gap-2 text-[12px] text-ink-2" title={m.how}>
                  <span aria-hidden className={`size-[7px] rounded-full ${m.measured ? DOT[m.tone] : 'bg-surface-3'}`} />
                  <span className="truncate">{m.label}</span>
                  <b className={m.measured ? 'font-bold text-ink' : 'text-[11px] font-normal text-ink-3'}>
                    {m.measured ? m.value : '—'}
                  </b>
                </li>
              ))}
            </ul>
            <div className="border-t border-line-soft pt-2">
              <p className="flex text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">
                Open <span className={`mono ml-auto ${c.open > 0 ? 'text-critical' : 'text-good'}`}>{c.open}</span>
              </p>
              {c.work.length === 0
                ? <p className="mt-1 text-[11.5px] text-ink-3">Nothing waiting here.</p>
                : (
                  <ul className="mt-1 space-y-1">
                    {c.work.map((w, j) => (
                      <li key={j}>
                        <Link href={w.href} className="flex gap-1.5 text-[11.5px] leading-snug text-ink-2 hover:text-ink">
                          <span aria-hidden className="mt-[5px] size-1 shrink-0 rounded-full bg-ink-4" />
                          <span className="line-clamp-2">{w.title}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
            </div>
            <Link href={c.href} className="mt-auto flex items-center gap-1 text-[12px] font-semibold text-accent-ink hover:underline">
              Open {c.label} <Icon name="arrow-right" className="size-3" />
            </Link>
          </li>
        ))}
      </ul>

      <Rule title="Your stages" note="set-up and each desk, as before" />
    </div>
  )
}

const iconOf = (stage: MetricStage): IconName => GIST_STAGES.find((s) => s.stage === stage)!.icon

const BAND_BG: Record<Band, string> = {
  stops: 'bg-critical-soft hover:bg-critical-soft/70',
  costs: 'bg-warn-soft hover:bg-warn-soft/70',
  unfinished: 'bg-surface-2 hover:bg-surface-3',
}
const BAND_ICON: Record<Band, string> = { stops: 'text-critical', costs: 'text-warn', unfinished: 'text-ink-3' }

const DOT: Record<MetricTone, string> = { good: 'bg-good', warn: 'bg-warn', critical: 'bg-critical', neutral: 'bg-ink-4' }

const GOAL: Record<GoalState, { label: string; icon: IconName; cls: string }> = {
  on: { label: 'On track', icon: 'check', cls: 'bg-good-soft text-good' },
  risk: { label: 'At risk', icon: 'alert', cls: 'bg-warn-soft text-warn' },
  off: { label: 'Off track', icon: 'close', cls: 'bg-critical-soft text-critical' },
  none: { label: 'Nothing yet', icon: 'clock', cls: 'bg-surface-3 text-ink-3' },
}

function GoalRow({ goal }: { goal: Goal }) {
  const p = GOAL[goal.state]
  return (
    <li data-goal={goal.key} data-goal-state={goal.state} className="border-t border-line-soft first:border-0">
      <Link href={goal.href} className="press flex items-center gap-2.5 rounded-md py-2 hover:bg-surface-2">
        <span className="min-w-0 flex-1">
          <span className="block text-[12.5px] font-semibold text-ink">{goal.label}</span>
          <span className="block truncate text-[11px] text-ink-3">{goal.detail}</span>
        </span>
        <span className={`inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11.5px] font-semibold ${p.cls}`}>
          <Icon name={p.icon} className="size-3" />{p.label}
        </span>
      </Link>
    </li>
  )
}

function PromiseRow({ icon, tone, label, n, value }: { icon: IconName; tone: string; label: string; n: number; value: number }) {
  return (
    <li className="flex items-center gap-2">
      <Icon name={icon} className={`size-3.5 shrink-0 ${tone}`} />
      <span className="min-w-0 flex-1 truncate">{label} · {n} order{n === 1 ? '' : 's'}</span>
      <span className="num font-semibold text-ink">{compact(value)}</span>
    </li>
  )
}

function Card({ chart, title, desc, href, link, children }: {
  chart: string; title: string; desc: string; href?: string; link?: string; children: React.ReactNode
}) {
  return (
    <section data-chart={chart} className="min-w-0 rounded-xl border border-line bg-surface p-4">
      <h3 className="flex items-center gap-2 text-[13.5px] font-bold tracking-tight">
        {title}
        {href && link && (
          <Link href={href} className="ml-auto inline-flex shrink-0 items-center gap-1 text-[11.5px] font-semibold text-accent-ink hover:underline">
            {link} <Icon name="arrow-right" className="size-3" />
          </Link>
        )}
      </h3>
      <p className="mt-0.5 text-[11.5px] text-ink-3">{desc}</p>
      <div className="mt-2.5">{children}</div>
    </section>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg bg-surface-2 px-3 py-6 text-center text-[12px] text-ink-3">{children}</p>
}

function Rule({ title, note }: { title: string; note?: string }) {
  return (
    <h2 className="mb-2.5 mt-6 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-3">
      <span aria-hidden className="h-px w-4 bg-line" />
      <span className="shrink-0">{title}</span>
      {note && <span className="hidden truncate font-normal normal-case tracking-normal sm:inline">· {note}</span>}
      <span aria-hidden className="h-px flex-1 bg-line" />
    </h2>
  )
}
