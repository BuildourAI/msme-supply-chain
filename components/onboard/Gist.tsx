'use client'
import { useMemo } from 'react'
import Link from 'next/link'
import { Icon, type IconName } from '@/components/ui/icons'
import { CAT } from '@/components/charts/kit'
import { useWorkspace } from '@/components/workspace/store'
import { longDate } from '@/lib/domain/format'
import type { Band } from '@/lib/workspace/decisions'
import {
  GIST_STAGES, compact, gist, monthWord, whenWord,
  type Activity, type Goal, type GoalState, type StageCard, type WorkQueue,
} from '@/lib/workspace/executive'
import type { Metric, MetricStage, MetricTone } from '@/lib/workspace/metrics'
import { CoverBars, JobRings, MoneyDonut, MonthColumns, PromiseTimeline, STATUS, Treemap, tint } from './gist-charts'

/**
 * The owner's gist: the whole business on one screen, above the stage tiles.
 *
 * A band with who and when; five money tiles; six pictures — what left, what
 * is promised, where the money is, what was bought, the job cards, how long
 * the shelf lasts; one line per kind of work waiting on the owner; the goals
 * against the owner's own rules; the last few things written; and a card per
 * stage. On a laptop it fits without scrolling. Every tile, line and card opens
 * the screen that holds it — the gist decides nothing itself.
 *
 * Rendered only once the company has a record to read (see `hasRecords`), and
 * only for the owner's own company — the sample has its own page.
 */

/* a colour per stage, the same wherever that stage shows its icon */
const STAGE_HUE: Record<MetricStage, string> = {
  sourcing: CAT[0], inbound: CAT[2], inventory: CAT[3], production: CAT[1], dispatch: CAT[4],
}
const TILE_HUE: Record<string, string> = {
  orderBook: CAT[1], dispatchedValue: CAT[0], onOrder: CAT[2], stockValue: CAT[3], atJobworkers: CAT[4],
}
const TILE_ICON: Record<string, IconName> = {
  orderBook: 'cash', dispatchedValue: 'truck', onOrder: 'cart', stockValue: 'boxes', atJobworkers: 'share',
}
const TILE_HREF: Record<string, string> = {
  orderBook: '/dispatch/orders', dispatchedValue: '/dispatch/notes', onOrder: '/sourcing/orders',
  stockValue: '/inventory/ledger', atJobworkers: '/inventory/jobwork',
}
const ACT_STAGE: Record<Activity['kind'], MetricStage> = {
  cart: 'sourcing', tray: 'inbound', hash: 'inventory', boxes: 'inventory', share: 'inventory',
  factory: 'production', alert: 'production', cash: 'dispatch', doc: 'dispatch', truck: 'dispatch',
}
const iconOf = (stage: MetricStage): IconName => GIST_STAGES.find((s) => s.stage === stage)!.icon
/* a hue deepened enough to draw an icon on its own tint */
const deep = (c: string) => `color-mix(in srgb, ${c} 78%, black)`

export function Gist() {
  const { workspace, today } = useWorkspace()
  // the set-up wizards below re-render this page on every save; the sums only need to follow the workspace
  const g = useMemo(() => (workspace ? gist(workspace, today) : null), [workspace, today])
  if (!g || !workspace) return null

  const month = monthWord(today.slice(0, 7))
  const sitsTotal = g.sits.reduce((a, s) => a + s.value, 0)
  const promiseTotal = g.promise.past.value + g.promise.soon.value + g.promise.later.value
  const thisMonth = g.dispatched[g.dispatched.length - 1]?.value ?? 0
  // a material keeps its colour from the materials list, not from where it ranks this month
  const matHue = (label: string) => {
    const i = workspace.items.findIndex((it) => it.name === label)
    return i < 0 ? 'var(--ink-4)' : CAT[i % CAT.length]
  }
  const judged = g.goals.filter((x) => x.state !== 'none')
  const short = g.cover.filter((c) => c.state === 'short').length
  const tight = g.cover.filter((c) => c.state === 'tight').length

  return (
    <div data-gist className="mx-auto mb-8 w-full max-w-[90rem]">
      <header className="relative overflow-hidden rounded-2xl px-4 py-3 text-white sm:px-5"
        style={{ background: 'linear-gradient(118deg, color-mix(in srgb, var(--cat-3) 55%, black) 0%, var(--cat-3) 48%, var(--cat-1) 100%)' }}>
        <span aria-hidden className="absolute -right-10 -top-16 size-44 rounded-full bg-white/10" />
        <span aria-hidden className="absolute -bottom-20 right-40 size-36 rounded-full bg-white/5" />
        <div className="relative flex flex-wrap items-center gap-x-3.5 gap-y-2">
          <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/15">
            <Icon name="factory" className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="mono truncate text-[10.5px] uppercase tracking-wider text-white/75">{workspace.company.name}</p>
            <h1 className="text-[21px] font-extrabold leading-tight tracking-[-0.02em]">Welcome, {workspace.owner.name}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
            <Chip icon="bell">
              {g.needs.total > 0 && <span aria-hidden className="size-2 rounded-full bg-[#FF6B57]" />}
              {g.needs.total} need{g.needs.total === 1 ? 's' : ''} you
            </Chip>
            {judged.length > 0 && (
              <Chip icon="star">{judged.filter((x) => x.state === 'on').length} of {judged.length} goals on track</Chip>
            )}
            <Chip icon="calendar" date>{longDate(today)}</Chip>
          </div>
        </div>
      </header>

      <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div data-gist-tiles className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:col-start-1 xl:row-start-1 xl:grid-cols-5 [&>:nth-child(5)]:col-span-2 sm:[&>:nth-child(5)]:col-span-1">
          {g.headlines.map((m, i) => <Tile key={m.key} m={m} i={i} />)}
        </div>

        {/* On a laptop the right column is as tall as the left and no taller:
            its content sits in an absolute box, so the tiles, pictures and
            stage cards set the height and the activity list takes what is left. */}
        <aside className="relative min-w-0 xl:col-start-2 xl:row-span-3 xl:row-start-1">
          <div className="flex flex-col gap-3 md:grid md:grid-cols-3 xl:absolute xl:inset-0 xl:flex xl:flex-col">
            <Queues total={g.needs.total} queues={g.needs.queues} />
            <Goals goals={g.goals} />
            <ActivityList items={g.activity} today={today} />
          </div>
        </aside>

        <div className="grid gap-3 sm:grid-cols-2 xl:col-start-1 xl:row-start-2 xl:grid-cols-3">
          <Card chart="dispatched" icon="truck" hue={CAT[0]} title="Dispatched" href="/dispatch/notes"
            figure={thisMonth > 0 ? `${compact(thisMonth)} in ${month}` : undefined}>
            <MonthColumns hue={CAT[0]} fmt={compact}
              points={g.dispatched.map((d) => ({ label: d.label, value: d.value, note: `${d.count} challan${d.count === 1 ? '' : 's'}` }))} />
          </Card>

          <Card chart="promise" icon="calendar" hue={CAT[4]} title="Orders by promise" href="/dispatch/orders"
            figure={promiseTotal > 0 ? `${compact(promiseTotal)} to send` : undefined}>
            <PromiseTimeline orders={g.promise.orders} today={today} fmt={compact} />
            <ul className="mt-0.5 flex flex-wrap justify-between gap-x-2 text-[11px]">
              {([['critical', 'Late', g.promise.past.value], ['warn', '7 days', g.promise.soon.value], ['good', 'Later', g.promise.later.value]] as const)
                .map(([tone, word, v]) => (
                  <li key={word} className="flex items-center gap-1 whitespace-nowrap">
                    <span style={{ color: STATUS[tone].c }}><Icon name={STATUS[tone].icon} className="size-3" /></span>
                    <span className="text-ink-3">{word}</span>
                    <b className="num font-bold text-ink">{compact(v)}</b>
                  </li>
                ))}
            </ul>
          </Card>

          <Card chart="sits" icon="cash" hue={CAT[1]} title="Where your money is"
            figure={sitsTotal > 0 ? compact(sitsTotal) : g.counted ? 'Stock has no price yet' : undefined}>
            <MoneyDonut centre={compact(sitsTotal)} fmt={compact}
              segments={g.sits.map((s, i) => ({ label: s.label, value: s.value, color: CAT[i] }))} />
          </Card>

          <Card chart="spend" icon="cart" hue={CAT[2]} title={`Spend · ${month}`} href="/sourcing/orders"
            figure={g.spend.total > 0 ? `${compact(g.spend.total)} ${g.spend.basis === 'ordered' ? 'ordered' : 'received'}` : undefined}>
            {g.spend.rows.length > 0
              ? <Treemap fmt={compact} rows={g.spend.rows.map((r) => ({ ...r, color: matHue(r.label) }))} />
              : <Empty icon="cart">No purchase this month</Empty>}
          </Card>

          <Card chart="jobs" icon="factory" hue={CAT[1]} title="Job cards" href="/production/jobs"
            figure={g.jobs.length > 0 ? `${g.jobs.length} open` : undefined}>
            {g.jobs.length > 0 ? <JobRings jobs={g.jobs} /> : <Empty icon="factory">No job card open</Empty>}
          </Card>

          <Card chart="cover" icon="boxes" hue={CAT[3]} title="Days of stock" href="/inventory/ledger"
            figure={g.cover.length > 0 ? (short > 0 ? `${short} out before a refill` : tight > 0 ? `${tight} getting tight` : 'All covered') : undefined}>
            {g.cover.length > 0 ? <CoverBars rows={g.cover} /> : <Empty icon="boxes">Give a material its daily use</Empty>}
          </Card>
        </div>

        <ul className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:col-start-1 xl:row-start-3 xl:grid-cols-5">
          {g.cards.map((c, i) => <StageTile key={c.stage} c={c} i={i} />)}
        </ul>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ bits -- */

function Chip({ icon, date, children }: { icon: IconName; date?: boolean; children: React.ReactNode }) {
  return (
    <span data-gist-date={date ? '' : undefined}
      className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-2.5 py-1.5 text-[12px] font-semibold backdrop-blur-sm">
      <Icon name={icon} className="size-3.5 opacity-80" />{children}
    </span>
  )
}

function Tile({ m, i }: { m: Metric; i: number }) {
  const hue = TILE_HUE[m.key] ?? CAT[0]
  return (
    <Link href={m.href ?? TILE_HREF[m.key] ?? '/'} data-gist-tile={m.key} title={m.how}
      style={{ background: tint(hue, 9), borderColor: tint(hue, 28), '--i': i } as React.CSSProperties}
      className="anim-fade-up press flex min-w-0 items-center gap-2.5 rounded-xl border px-3 py-2 transition-shadow hover:shadow-md sm:gap-3">
      <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full sm:size-10"
        style={{ background: tint(hue, 24), color: deep(hue) }}>
        <Icon name={TILE_ICON[m.key] ?? 'activity'} className="size-4 sm:size-5" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[11.5px] font-medium text-ink-2">{m.label}</span>
        <span className={`block truncate leading-tight ${m.measured ? 'text-[21px] font-extrabold tracking-[-0.02em] text-ink' : 'py-0.5 text-[14px] font-semibold text-ink-3'}`}>
          {m.value}
        </span>
        <span className={`flex items-center gap-1 text-[11px] ${m.tone === 'warn' ? 'font-semibold text-warn' : 'text-ink-3'}`}>
          {m.tone === 'warn' && <Icon name="alert" className="size-3 shrink-0" />}
          <span className="truncate">{m.measured ? m.sub : m.how}</span>
        </span>
      </span>
    </Link>
  )
}

function Card({ chart, icon, hue, title, figure, href, children }: {
  chart: string; icon: IconName; hue: string; title: string; figure?: string; href?: string; children: React.ReactNode
}) {
  const head = (
    <>
      <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-md" style={{ background: tint(hue, 18), color: deep(hue) }}>
        <Icon name={icon} className="size-3.5" />
      </span>
      <span className="truncate">{title}</span>
      {figure && <span className="ml-auto shrink-0 truncate text-[11.5px] font-semibold text-ink-2">{figure}</span>}
      {href && <Icon name="chevron" className={`size-3.5 shrink-0 text-ink-4 ${figure ? '' : 'ml-auto'}`} />}
    </>
  )
  return (
    <section data-chart={chart} className="flex min-w-0 flex-col gap-1.5 rounded-xl border border-line bg-surface p-3">
      {href
        ? <Link href={href} className="flex items-center gap-2 text-[12.5px] font-bold tracking-tight hover:text-accent-ink">{head}</Link>
        : <h3 className="flex items-center gap-2 text-[12.5px] font-bold tracking-tight">{head}</h3>}
      <div className="min-w-0">{children}</div>
    </section>
  )
}

function Empty({ icon, children }: { icon: IconName; children: React.ReactNode }) {
  return (
    <div className="grid h-[124px] place-items-center rounded-lg border border-dashed border-line bg-surface-2/50 text-center">
      <div>
        <Icon name={icon} className="mx-auto size-6 text-ink-4" />
        <p className="mt-1 text-[11.5px] text-ink-3">{children}</p>
      </div>
    </div>
  )
}

function StageIcon({ stage, size = 'sm' }: { stage: MetricStage; size?: 'sm' | 'md' }) {
  const hue = STAGE_HUE[stage]
  return (
    <span aria-hidden className={`grid shrink-0 place-items-center ${size === 'md' ? 'size-7 rounded-lg' : 'size-[22px] rounded-md'}`}
      style={{ background: tint(hue, 20), color: deep(hue) }}>
      <Icon name={iconOf(stage)} className={size === 'md' ? 'size-4' : 'size-3'} />
    </span>
  )
}

const PILL: Record<Band, string> = {
  stops: 'bg-critical text-white',
  costs: 'bg-warn-soft text-warn',
  unfinished: 'bg-surface-3 text-ink-2',
}

function Section({ icon, hue, title, aside, children, className = '', ...rest }: {
  icon: IconName; hue: string; title: React.ReactNode; aside?: React.ReactNode; children: React.ReactNode; className?: string
} & Omit<React.HTMLAttributes<HTMLElement>, 'title'>) {
  return (
    <section className={`min-w-0 rounded-xl border border-line bg-surface p-3 ${className}`} {...rest}>
      <h3 className="flex items-center gap-2 text-[12.5px] font-bold tracking-tight">
        <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-md" style={{ background: tint(hue, 18), color: deep(hue) }}>
          <Icon name={icon} className="size-3.5" />
        </span>
        {title}
        {aside && <span className="ml-auto text-[11px] font-normal text-ink-3">{aside}</span>}
      </h3>
      {children}
    </section>
  )
}

function Queues({ total, queues }: { total: number; queues: WorkQueue[] }) {
  const room = 6
  const shown = queues.length > room ? queues.slice(0, room - 1) : queues
  const more = queues.length - shown.length
  return (
    <Section data-needs-you icon="bell" hue="var(--critical)" className="shrink-0"
      title={<>Work queues <span className={`mono rounded-full px-1.5 text-[10.5px] leading-[18px] ${total > 0 ? 'bg-critical text-white' : 'bg-good-soft text-good'}`}>{total}</span></>}
      aside="across every desk">
      {queues.length === 0
        ? <p className="mt-2 flex items-center gap-2 text-[12.5px] font-semibold text-good"><Icon name="check" className="size-4" /> All clear on every desk</p>
        : (
          <ul className="mt-1.5">
            {shown.map((w) => (
              <li key={w.kind} data-queue={w.kind}>
                <Link href={w.href} title={`${w.count} on the ${w.stage} dashboard`}
                  className="press flex h-[27px] items-center gap-2 rounded-md px-1 text-[12px] hover:bg-surface-2">
                  <StageIcon stage={w.stage} />
                  <span className="min-w-0 flex-1 truncate text-ink">{w.label}</span>
                  <span className={`mono min-w-[22px] rounded-full px-1.5 text-center text-[11px] font-bold leading-[18px] ${PILL[w.band]}`}>{w.count}</span>
                  <Icon name="chevron" className="size-3 shrink-0 text-ink-4" />
                </Link>
              </li>
            ))}
            {more > 0 && <li className="pl-9 pt-0.5 text-[11px] text-ink-3">and {more} more on the desks</li>}
          </ul>
        )}
    </Section>
  )
}

const GOAL: Record<GoalState, { label: string; icon: IconName; cls: string }> = {
  on: { label: 'On track', icon: 'check', cls: 'bg-good-soft text-good' },
  risk: { label: 'At risk', icon: 'alert', cls: 'bg-warn-soft text-warn' },
  off: { label: 'Off track', icon: 'close', cls: 'bg-critical-soft text-critical' },
  none: { label: 'No data', icon: 'clock', cls: 'bg-surface-2 text-ink-3' },
}

function Goals({ goals }: { goals: Goal[] }) {
  return (
    <Section icon="star" hue={CAT[3]} title="Goals" aside="your own rules" className="shrink-0">
      <ul className="mt-1.5">
        {goals.map((goal) => {
          const p = GOAL[goal.state]
          return (
            <li key={goal.key} data-goal={goal.key} data-goal-state={goal.state}>
              <Link href={goal.href} title={goal.detail}
                className="press flex h-[26px] items-center gap-2 rounded-md px-1 text-[12px] hover:bg-surface-2">
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-semibold text-ink">{goal.label}</span> <span className="text-ink-3">{goal.target}</span>
                </span>
                <span className={`inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-px text-[11px] font-semibold ${p.cls}`}>
                  <Icon name={p.icon} className="size-3" />{p.label}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </Section>
  )
}

function ActivityList({ items, today }: { items: Activity[]; today: string }) {
  return (
    <Section data-activity-list icon="activity" hue={CAT[0]} title="Recent activity" className="xl:min-h-0 xl:flex-1 xl:overflow-hidden">
      {items.length === 0
        ? <p className="mt-2 text-[12px] text-ink-3">Nothing written yet.</p>
        : (
          <ul className="mt-1.5">
            {items.map((a) => {
              const hue = STAGE_HUE[ACT_STAGE[a.kind]]
              return (
                <li key={`${a.kind}-${a.seq}`} data-activity>
                  <Link href={a.href} title={a.who ? `${a.what} · ${a.who}` : a.what}
                    className="press flex h-[30px] items-center gap-2 rounded-md px-1 text-[12px] hover:bg-surface-2">
                    <span aria-hidden className="grid size-[22px] shrink-0 place-items-center rounded-full"
                      style={{ background: tint(hue, 20), color: deep(hue) }}>
                      <Icon name={a.kind} className="size-3" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-ink">{a.what}</span>
                    <span className="shrink-0 text-[11px] text-ink-3">{whenWord(a.on, today)}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
    </Section>
  )
}

const DOT: Record<MetricTone, string> = { good: 'bg-good', warn: 'bg-warn', critical: 'bg-critical', neutral: 'bg-ink-4' }

function StageTile({ c, i }: { c: StageCard; i: number }) {
  const hue = STAGE_HUE[c.stage]
  const stops = c.work.some((w) => w.band === 'stops')
  return (
    <li data-stage-card={c.stage} style={{ '--i': i, borderTopColor: hue } as React.CSSProperties}
      className="anim-fade-up flex min-w-0 flex-col gap-1.5 rounded-xl border border-t-[3px] border-line bg-surface p-3">
      <Link href={c.href} className="flex items-center gap-2 text-[13px] font-bold tracking-tight hover:text-accent-ink">
        <StageIcon stage={c.stage} size="md" />
        <span className="min-w-0 flex-1 truncate">{c.label}</span>
        <span data-stage-open={c.open} title={`${c.open} open`}
          className={`mono min-w-[22px] rounded-full px-1.5 text-center text-[11px] font-bold leading-[18px] ${
            c.open === 0 ? 'bg-good-soft text-good' : stops ? 'bg-critical text-white' : 'bg-warn-soft text-warn'}`}>{c.open}</span>
      </Link>
      <ul className="space-y-1">
        {c.figures.map((m) => (
          <li key={m.key} className="flex items-center gap-1.5 text-[11.5px]" title={m.how}>
            <span aria-hidden className={`size-[7px] shrink-0 rounded-full ${m.measured ? DOT[m.tone] : 'bg-surface-3'}`} />
            <span className="min-w-0 flex-1 truncate text-ink-2">{m.label}</span>
            <b className={m.measured ? 'shrink-0 font-bold text-ink' : 'shrink-0 font-normal text-ink-4'}>{m.measured ? m.value : '—'}</b>
          </li>
        ))}
      </ul>
      <ul className="mt-auto space-y-0.5 border-t border-line-soft pt-1.5">
        {c.work.length === 0
          ? <li className="flex items-center gap-1 text-[11px] font-semibold text-good"><Icon name="check" className="size-3" /> Nothing open</li>
          : c.work.map((w) => (
            <li key={w.kind}>
              <Link href={w.href} className="flex items-center gap-1.5 text-[11px] text-ink-2 hover:text-ink">
                <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${w.band === 'stops' ? 'bg-critical' : w.band === 'costs' ? 'bg-warn' : 'bg-ink-4'}`} />
                <span className="min-w-0 flex-1 truncate">{w.label}</span>
                <b className="shrink-0 text-ink">{w.count}</b>
              </Link>
            </li>
          ))}
      </ul>
    </li>
  )
}
