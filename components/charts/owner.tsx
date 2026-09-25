'use client'
import Link from 'next/link'
import { Icon, type IconName } from '@/components/ui/icons'
import { addDays, daysBetween } from '@/lib/domain/calc'
import { shortDate } from '@/lib/domain/format'
import type { Cover, CoverState, JobRing, PromisedOrder, PromiseZone } from '@/lib/workspace/executive'
import type { PlanState } from '@/lib/workspace/plan'

/*
 * The owner's pictures — the Welcome page and every desk's dashboard.
 *
 * One hue does the work. Navy draws the data, a lighter navy the rest of a
 * series, greys the tracks and the words; red, amber and green appear only for
 * status, and always beside an icon and a word. A material or a place the money
 * sits is named by its label, never by a colour of its own, so there is no key
 * to learn and nothing that reads as decoration. What Indian manufacturers read
 * every day — Tally, Busy, Excel — looks like this; a colour per tile reads as
 * noise.
 *
 * Each picture is small on purpose: several share a screen, so each draws one
 * idea in about a hundred and thirty pixels and says the rest in its tooltip.
 */

export type Status = 'critical' | 'warn' | 'good' | 'none'

/* `c` is the ink for an icon or a word; `mark` the fill of a dot or a bar */
export const STATUS: Record<Status, { c: string; mark: string; soft: string; icon: IconName }> = {
  critical: { c: 'var(--critical)', mark: 'var(--critical)', soft: 'var(--critical-soft)', icon: 'alert' },
  warn: { c: 'var(--warn)', mark: 'var(--warn-mark)', soft: 'var(--warn-soft)', icon: 'clock' },
  good: { c: 'var(--good)', mark: 'var(--good)', soft: 'var(--good-soft)', icon: 'check' },
  none: { c: 'var(--ink-3)', mark: 'var(--ink-4)', soft: 'var(--surface-2)', icon: 'clock' },
}

const NAVY = 'var(--navy)'
const NAVY_SOFT = 'color-mix(in srgb, var(--navy) 30%, white)'
const NAVY_MID = 'color-mix(in srgb, var(--navy) 55%, white)'

/* ---------------------------------------------------------------- chrome -- */

/** A navy disc holding an icon — the same on every card, so it says "what", never "how bad". */
export function NavyDisc({ icon, size = 'md' }: { icon: IconName; size?: 'sm' | 'md' | 'lg' }) {
  const box = size === 'lg' ? 'size-10 rounded-xl' : size === 'md' ? 'size-7 rounded-lg' : 'size-[22px] rounded-md'
  const glyph = size === 'lg' ? 'size-5' : size === 'md' ? 'size-3.5' : 'size-3'
  return (
    <span aria-hidden className={`grid shrink-0 place-items-center bg-navy/10 text-navy ${box}`}>
      <Icon name={icon} className={glyph} />
    </span>
  )
}

/** A status word with its icon, in a pill. */
export function Pill({ status, small, children }: { status: Status; small?: boolean; children: React.ReactNode }) {
  const s = STATUS[status]
  return (
    <span className={`inline-flex max-w-full shrink-0 items-center truncate rounded-md py-px font-bold ${small ? 'gap-0.5 px-1 text-[10px]' : 'gap-1 px-1.5 text-[10.5px]'}`}
      style={{ color: s.c, background: s.soft }}>
      <Icon name={s.icon} className="size-3 shrink-0" />{children}
    </span>
  )
}

/** One picture on a card: a title, a quiet note beside it, the one figure it adds up to. */
export function OwnerCard({ chart, title, sub, figure, href, children, className = '' }: {
  chart: string; title: string; sub?: string; figure?: string; href?: string; children: React.ReactNode; className?: string
}) {
  const head = (
    <>
      <span className="truncate text-[12.5px] font-bold tracking-tight">{title}</span>
      {sub && <span className="hidden shrink-0 truncate text-[10.5px] font-medium text-ink-3 sm:inline">{sub}</span>}
      {figure && <span className="ml-auto shrink-0 truncate text-[12px] font-bold text-ink">{figure}</span>}
      {href && <Icon name="chevron" className={`size-3.5 shrink-0 text-ink-4 ${figure ? '' : 'ml-auto'}`} />}
    </>
  )
  return (
    <section data-chart={chart} className={`flex min-w-0 flex-col gap-1.5 rounded-xl border border-line bg-surface px-3 py-2.5 ${className}`}>
      {href
        ? <Link href={href} className="flex items-baseline gap-2 hover:text-navy">{head}</Link>
        : <h3 className="flex items-baseline gap-2">{head}</h3>}
      <div className="min-w-0">{children}</div>
    </section>
  )
}

/** Nothing to draw yet — what would fill it, in a few words. */
export function Empty({ icon, children, h = 124 }: { icon: IconName; children: React.ReactNode; h?: number }) {
  return (
    <div className="grid place-items-center rounded-lg border border-dashed border-line bg-surface-2/40 text-center" style={{ height: h }}>
      <div>
        <Icon name={icon} className="mx-auto size-6 text-ink-4" />
        <p className="mt-1 text-[11.5px] text-ink-3">{children}</p>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------- month columns -- */

/** Months as columns: this one solid navy, the rest light, each labelled. */
export function MonthColumns({ points, fmt, empty = 'Nothing yet' }: {
  points: { label: string; value: number; note: string }[]; fmt: (n: number) => string; empty?: string
}) {
  const W = 330, H = 124, base = 102, top = 18
  const max = Math.max(...points.map((p) => p.value), 1)
  const slot = W / points.length, bw = Math.min(30, slot * 0.58)
  const none = points.every((p) => p.value === 0)
  // with many months only the last and the biggest keep their number on top
  const crowded = points.length > 7
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-[124px] w-full" role="img"
      aria-label={points.map((p) => `${p.label} ${fmt(p.value)}`).join(', ')}>
      <line x1="0" x2={W} y1={base} y2={base} stroke="var(--line)" />
      {points.map((p, i) => {
        const last = i === points.length - 1
        const h = p.value > 0 ? Math.max(3, ((base - top) * p.value) / max) : 2
        const x = i * slot + (slot - bw) / 2, y = base - h, r = Math.min(4, h / 2)
        const label = p.value > 0 && (last || !crowded || p.value === max)
        return (
          <g key={p.label}>
            <path d={`M${x},${base} V${y + r} Q${x},${y} ${x + r},${y} H${x + bw - r} Q${x + bw},${y} ${x + bw},${y + r} V${base} Z`}
              fill={p.value > 0 ? (last ? NAVY : NAVY_SOFT) : 'var(--surface-3)'} />
            {label && (
              <text x={x + bw / 2} y={y - 5} textAnchor="middle" fontSize={last ? 10 : 9}
                fontWeight={last ? 800 : 500} fill={last ? 'var(--ink)' : 'var(--ink-3)'}>{fmt(p.value)}</text>
            )}
            <text x={i * slot + slot / 2} y={H - 6} textAnchor="middle" fontSize="10"
              fontWeight={last ? 700 : 400} fill={last ? 'var(--ink)' : 'var(--ink-3)'}>{p.label}</text>
            <rect x={i * slot} y="0" width={slot} height={H} fill="transparent">
              <title>{`${p.label}: ${fmt(p.value)} · ${p.note}`}</title>
            </rect>
          </g>
        )
      })}
      {none && <text x={W / 2} y={60} textAnchor="middle" fontSize="11" fill="var(--ink-3)">{empty}</text>}
    </svg>
  )
}

/* ------------------------------------------------------- promise timeline -- */

const ZONE: Record<PromiseZone, Status> = { past: 'critical', soon: 'warn', later: 'good' }

/**
 * Every open sales order as a dot on its promise date, sized by what is still
 * to go, coloured only by whether the promise is broken, close or clear.
 */
export function PromiseTimeline({ orders, today, fmt, totals }: {
  orders: PromisedOrder[]; today: string; fmt: (n: number) => string
  totals: { past: number; soon: number; later: number }
}) {
  const W = 330, H = 104, pad = 8, mid = 54
  const first = orders[0]?.promised ?? today, lastP = orders[orders.length - 1]?.promised ?? today
  const start = [addDays(today, -14), first].sort()[0]
  const end = [addDays(today, 21), addDays(lastP, 2)].sort().reverse()[0]
  const span = Math.max(1, daysBetween(start, end))
  const x = (d: string) => pad + ((W - 2 * pad) * daysBetween(start, d)) / span
  const max = Math.max(...orders.map((o) => o.value), 1)
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-[104px] w-full" role="img"
        aria-label={orders.map((o) => `${o.no} ${fmt(o.value)} promised ${shortDate(o.promised)}`).join(', ') || 'No open sales order'}>
        <rect x={pad} y="20" width={Math.max(0, x(today) - pad)} height="66" rx="6" fill="var(--surface-2)" />
        <text x={(pad + x(today)) / 2} y="34" textAnchor="middle" fontSize="9" fill="var(--ink-3)">past the promise</text>
        <line x1={pad} x2={W - pad} y1={mid} y2={mid} stroke="var(--line)" />
        <line x1={x(today)} x2={x(today)} y1="12" y2="90" stroke="var(--ink)" strokeWidth="1.4" strokeDasharray="3 2" />
        <text x={x(today)} y="9" textAnchor="middle" fontSize="9" fontWeight="700" fill="var(--ink)">Today</text>
        <line x1={x(addDays(today, 7))} x2={x(addDays(today, 7))} y1={mid - 5} y2={mid + 5} stroke="var(--ink-4)" />
        {orders.map((o, k) => {
          const r = 4.5 + 9 * Math.sqrt(o.value / max), cx = x(o.promised)
          // neighbours a few days apart take turns above and below
          const ly = k % 2 ? mid - r - 5 : mid + r + 11
          return (
            <g key={o.id}>
              <circle cx={cx} cy={mid} r={r} fill={STATUS[ZONE[o.zone]].mark} stroke="var(--surface)" strokeWidth="2">
                <title>{`${o.no} · ${o.customer} · ${fmt(o.value)} to send · promised ${shortDate(o.promised)}`}</title>
              </circle>
              {orders.length <= 8 && (
                <text x={cx} y={ly} textAnchor="middle" fontSize="9" fontWeight="700" fill="var(--ink-2)">{o.no}</text>
              )}
            </g>
          )
        })}
        <text x={pad} y={H - 2} fontSize="9" fill="var(--ink-3)">{shortDate(start)}</text>
        <text x={x(addDays(today, 7))} y={H - 2} textAnchor="middle" fontSize="9" fill="var(--ink-3)">{shortDate(addDays(today, 7))}</text>
        <text x={W - pad} y={H - 2} textAnchor="end" fontSize="9" fill="var(--ink-3)">{shortDate(end)}</text>
        {orders.length === 0 && <text x={W / 2} y={mid + 4} textAnchor="middle" fontSize="11" fill="var(--ink-3)">Nothing waiting to go</text>}
      </svg>
      <ul className="mt-0.5 flex flex-wrap justify-between gap-x-2 text-[11px]">
        {([['critical', 'Late', totals.past], ['warn', 'This week', totals.soon], ['good', 'Later', totals.later]] as const).map(([st, word, v]) => (
          <li key={word} className="flex items-center gap-1 whitespace-nowrap">
            <span style={{ color: STATUS[st].mark }}><Icon name={STATUS[st].icon} className="size-3" /></span>
            <span className="text-ink-3">{word}</span>
            <b className="num font-bold text-ink">{fmt(v)}</b>
          </li>
        ))}
      </ul>
    </>
  )
}

/* ---------------------------------------------------------- ranked bars -- */

/**
 * Things ranked by size, one navy bar each — the biggest solid, the rest
 * lighter. The label names each one, so no colour has to.
 */
export function RankedBars({ rows, h = 124 }: {
  rows: { label: string; value: number; display: string; href?: string }[]; h?: number
}) {
  const max = Math.max(...rows.map((r) => r.value), 1)
  return (
    <ul className="flex flex-col justify-center gap-[7px]" style={{ minHeight: h }}>
      {rows.map((r, i) => {
        const bar = (
          <>
            <span className="truncate text-ink-2">{r.label}</span>
            <span className="relative h-2.5 rounded-full bg-surface-3">
              <span className="absolute inset-y-0 left-0 rounded-full"
                style={{ width: `${r.value > 0 ? Math.max(2, (r.value / max) * 100) : 0}%`, background: i === 0 ? NAVY : NAVY_MID }} />
            </span>
            <span className={`num text-right font-bold ${r.value > 0 ? 'text-ink' : 'text-ink-4'}`}>{r.value > 0 ? r.display : '—'}</span>
          </>
        )
        const cls = 'grid grid-cols-[minmax(0,7.4rem)_minmax(0,1fr)_4rem] items-center gap-2 text-[11.5px]'
        return (
          <li key={r.label}>
            {r.href ? <Link href={r.href} className={`${cls} rounded hover:bg-surface-2`}>{bar}</Link> : <div className={cls}>{bar}</div>}
          </li>
        )
      })}
    </ul>
  )
}

/* ------------------------------------------------------------------ ring -- */

/** A share, closed — made against planned, sent against ordered, accepted against arrived. */
export function Ring({ pct, status, label, sub, size = 58, dashed = false }: {
  pct: number | null; status: Status; label: string; sub?: string; size?: number; dashed?: boolean
}) {
  const R = 22, C = 2 * Math.PI * R
  return (
    <svg viewBox="0 0 56 56" style={{ width: size, height: size }} className="shrink-0" aria-hidden>
      <circle cx="28" cy="28" r={R} fill="none" stroke="var(--surface-3)" strokeWidth="6" strokeDasharray={dashed ? '3 3' : undefined} />
      {pct != null && pct > 0 && (
        <circle cx="28" cy="28" r={R} fill="none" stroke={STATUS[status].mark} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={`${C * Math.min(1, pct)} ${C}`} transform="rotate(-90 28 28)" />
      )}
      <text x="28" y={sub ? 29 : 32} textAnchor="middle" fontSize={label.length > 4 ? 10 : 11.5} fontWeight="800" fill="var(--ink)">{label}</text>
      {sub && <text x="28" y="39" textAnchor="middle" fontSize="7.5" fill="var(--ink-3)">{sub}</text>}
    </svg>
  )
}

/* ------------------------------------------------------------- job rings -- */

export const JOB_STATUS: Record<PlanState, { status: Status; word: string }> = {
  late: { status: 'critical', word: 'Past finish' },
  behind: { status: 'warn', word: 'Behind' },
  running: { status: 'good', word: 'On plan' },
  made: { status: 'good', word: 'Made' },
  not_started: { status: 'none', word: 'Not started' },
  unplanned: { status: 'none', word: 'No plan' },
  closed: { status: 'none', word: 'Closed' },
}

/** Each open job card as a ring: how much of the plan is made. */
export function JobRings({ jobs }: { jobs: JobRing[] }) {
  return (
    <ul className="flex h-[124px] items-center justify-evenly gap-1">
      {jobs.map((j) => {
        const s = JOB_STATUS[j.state]
        const pct = j.qty ? Math.min(1, j.made / j.qty) : null
        return (
          <li key={j.id} className="min-w-0 max-w-[25%] flex-1">
            <Link href={j.href} title={`${j.no}${j.name ? ` · ${j.name}` : ''}: ${j.made}${j.qty ? ` of ${j.qty}` : ''} made · ${s.word}`}
              className="press flex flex-col items-center gap-0.5 rounded-lg py-1 hover:bg-surface-2">
              <Ring pct={pct} status={s.status} label={pct == null ? '—' : `${Math.round(pct * 100)}%`} dashed={pct == null} />
              <span className="max-w-full truncate text-[11px] font-bold text-ink">{j.no}</span>
              <span className="max-w-full truncate text-[10px] text-ink-3">{j.qty ? `${j.made.toLocaleString('en-IN')}/${j.qty.toLocaleString('en-IN')}` : s.word}</span>
              <Pill status={s.status} small>{s.word}</Pill>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

/* ------------------------------------------------------------ stock cover -- */

const COVER: Record<CoverState, Status> = { short: 'critical', tight: 'warn', ok: 'good' }

/** Days each material lasts, with a tick where a new order would land. */
export function CoverBars({ rows }: { rows: Cover[] }) {
  const scale = Math.max(14, ...rows.map((r) => Math.min(r.days, 90)), ...rows.map((r) => 2 * (r.lead ?? 7)))
  return (
    <ul className="flex min-h-[124px] flex-col justify-center gap-[6px]">
      {rows.map((r) => {
        const s = STATUS[COVER[r.state]]
        return (
          <li key={r.id} className="grid grid-cols-[minmax(0,7.4rem)_minmax(0,1fr)_3.2rem] items-center gap-2 text-[11.5px]"
            title={`${r.name}: ${r.days} days of stock · ${r.lead ? `the quickest supplier takes ${r.lead} days` : 'nobody quotes it yet'}`}>
            <span className="truncate text-ink-2">{r.name}</span>
            <span className="relative h-2.5 rounded-full bg-surface-3">
              <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.max(3, (Math.min(r.days, scale) / scale) * 100)}%`, background: s.mark }} />
              <span aria-hidden className="absolute -inset-y-1 w-[2px] rounded bg-ink" style={{ left: `${((r.lead ?? 7) / scale) * 100}%` }} />
            </span>
            <span className="flex items-center justify-end gap-0.5 font-bold" style={{ color: s.c }}>
              <Icon name={s.icon} className="size-3 shrink-0" />
              <span className="num">{r.days >= 100 ? '99+' : r.days}d</span>
            </span>
          </li>
        )
      })}
      <li className="flex items-center gap-1.5 pt-0.5 text-[10.5px] text-ink-3">
        <span aria-hidden className="h-3 w-[2px] rounded bg-ink" /> when a new order would land
      </li>
    </ul>
  )
}

/* ------------------------------------------------------------- day strip -- */

export interface DayCell {
  date: string
  items: { key: string; icon: IconName; what: string; qty: string; note?: string; status?: Status; href?: string; title?: string }[]
}

/** The next days as a strip of little calendar pages, with what lands on each. */
export function DayStrip({ days, today }: { days: DayCell[]; today: string }) {
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return (
    <div className="grid h-[142px] gap-1" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
      {days.map((d) => {
        const wd = WD[new Date(`${d.date}T00:00:00Z`).getUTCDay()]
        const isToday = d.date === today
        // two on a day: each keeps its disc and name, the note stays in the tooltip
        const tight = d.items.length > 1
        return (
          <div key={d.date} className={`flex min-w-0 flex-col items-center gap-1 overflow-hidden rounded-lg px-0.5 py-1 ${isToday ? 'bg-surface outline outline-2 -outline-offset-2 outline-navy' : 'bg-surface-2'}`}>
            <span className="text-center text-[9.5px] leading-tight text-ink-3">{wd}<b className="block text-[13px] text-ink">{Number(d.date.slice(8))}</b></span>
            {d.items.slice(0, 2).map((it) => {
              const st = it.status && it.status !== 'none' ? STATUS[it.status] : null
              const body = (
                <span title={it.title}
                  className="flex w-full min-w-0 flex-col items-center gap-px rounded-md border bg-surface px-0.5 py-1 text-center"
                  style={{ borderColor: st ? st.mark : 'color-mix(in srgb, var(--navy) 30%, white)' }}>
                  <span className="grid size-5 place-items-center rounded-full text-white" style={{ background: st ? st.mark : 'var(--navy)' }}>
                    <Icon name={it.icon} className="size-3" />
                  </span>
                  <b className="max-w-full truncate text-[9.5px] leading-tight">{it.what}</b>
                  {tight ? null : it.note
                    ? <small className="max-w-full truncate text-[9px] font-bold leading-tight" style={{ color: st ? st.c : 'var(--ink)' }}>{it.note}</small>
                    : <small className="max-w-full truncate text-[9px] leading-tight text-ink-3">{it.qty}</small>}
                </span>
              )
              return it.href ? <Link key={it.key} href={it.href} className="flex w-full min-w-0">{body}</Link> : <span key={it.key} className="flex w-full min-w-0">{body}</span>
            })}
            {d.items.length > 2 && <small className="text-[9.5px] text-ink-3">+{d.items.length - 2}</small>}
          </div>
        )
      })}
    </div>
  )
}

/* ----------------------------------------------------------------- spans -- */

export interface SpanRow {
  key: string
  label: string
  sub?: string
  from: string
  to: string
  /** 0–1 of the span that is done, drawn solid from the start */
  done?: number | null
  /** where it stands now: a dot at a day, in its status */
  at?: { on: string; status: Status }
  /** stretches it stood still — halts */
  stops?: { from: string; to: string }[]
  /** past its end and not finished: dashed on to today */
  overdue?: boolean
  value?: string
  status: Status
  href?: string
  title?: string
}

/**
 * Things that run between two days — purchase orders from order to promised
 * date, job cards from planned start to finish — against a Today line.
 */
export function Spans({ rows, today, labelW = 92, valueW = 0, h }: {
  rows: SpanRow[]; today: string; labelW?: number; valueW?: number; h?: number
}) {
  const days = rows.flatMap((r) => [r.from, r.to, r.at?.on ?? r.from])
  const start = [addDays(today, -3), ...days].sort()[0]
  const end = [addDays(today, 7), ...days].sort().reverse()[0]
  const W = 400, x0 = labelW, x1 = W - valueW - 6
  const span = Math.max(1, daysBetween(start, end))
  const X = (d: string) => x0 + ((x1 - x0) * daysBetween(start, d)) / span
  const rowH = 18, top = 18
  const H = h ?? top + rows.length * rowH + 16
  const ticks = [start, addDays(start, Math.round(span / 3)), addDays(start, Math.round((2 * span) / 3)), end]
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" style={{ height: 'auto' }} role="img"
      aria-label={rows.map((r) => `${r.label} ${shortDate(r.from)} to ${shortDate(r.to)}`).join(', ')}>
      <defs>
        <pattern id="halt-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="2.4" height="5" fill="var(--critical)" />
        </pattern>
      </defs>
      <line x1={X(today)} x2={X(today)} y1="12" y2={top + rows.length * rowH} stroke="var(--ink)" strokeWidth="1.3" strokeDasharray="3 2" />
      <text x={X(today)} y="9" textAnchor="middle" fontSize="9" fontWeight="700" fill="var(--ink)">Today</text>
      {rows.map((r, k) => {
        const y = top + k * rowH + 8
        const a = X(r.from), b = Math.max(X(r.to), a + 3)
        const st = STATUS[r.status]
        const body = (
          <g>
            <title>{r.title ?? `${r.label}${r.sub ? ` · ${r.sub}` : ''}: ${shortDate(r.from)} to ${shortDate(r.to)}`}</title>
            <text x="0" y={y + 3.5} fontSize="10.5" fontWeight="700" fill="var(--ink)">{r.label}</text>
            {r.sub && <text x={Math.min(labelW - 4, 7 * r.label.length + 6)} y={y + 3.5} fontSize="10" fill="var(--ink-3)">{r.sub}</text>}
            <rect x={a} y={y - 4} width={b - a} height="8" rx="4" fill={r.status === 'none' ? 'var(--surface-3)' : NAVY_SOFT} />
            {r.done != null && r.done > 0 && (
              <rect x={a} y={y - 4} width={Math.max(4, (b - a) * Math.min(1, r.done))} height="8" rx="4" fill={NAVY} />
            )}
            {r.stops?.map((s, i) => (
              <rect key={i} x={X(s.from)} y={y - 7} width={Math.max(3, X(s.to) - X(s.from))} height="14" rx="2" fill="url(#halt-hatch)" />
            ))}
            {r.overdue && <line x1={b} x2={X(today)} y1={y} y2={y} stroke="var(--critical)" strokeWidth="2" strokeDasharray="2 2" />}
            {r.at
              ? <circle cx={X(r.at.on)} cy={y} r="4.5" fill={STATUS[r.at.status].mark} stroke="var(--surface)" strokeWidth="1.5" />
              : <circle cx={b} cy={y} r="4" fill="var(--surface)" stroke={r.status === 'none' ? 'var(--ink-4)' : NAVY} strokeWidth="2" />}
            {r.value && <text x={W} y={y + 3.5} textAnchor="end" fontSize="10.5" fontWeight="700" fill={r.status === 'critical' ? st.c : 'var(--ink)'}>{r.value}</text>}
          </g>
        )
        return r.href ? <a key={r.key} href={r.href}>{body}</a> : <g key={r.key}>{body}</g>
      })}
      {ticks.map((t, i) => (
        <text key={i} x={X(t)} y={H - 3} textAnchor={i === 0 ? 'start' : i === 3 ? 'end' : 'middle'} fontSize="9" fill="var(--ink-3)">{shortDate(t)}</text>
      ))}
    </svg>
  )
}

/* ------------------------------------------------------------- dot rows -- */

/**
 * One row per supplier or customer: a dot per delivery, green on time and red
 * late, then the figures that say how they are doing.
 */
export function DotRows({ head, rows }: {
  head: string[]
  rows: { key: string; label: string; dots: boolean[]; cells: { text: string; status?: Status }[]; href?: string }[]
}) {
  const cols = 'grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_repeat(3,minmax(0,.55fr))]'
  return (
    <div className="text-[11.5px]">
      <div className={`grid ${cols} h-[18px] items-center gap-2 text-[9.5px] uppercase tracking-[0.05em] text-ink-3`}>
        {head.map((h, i) => <span key={h} className={i > 1 ? 'text-right' : ''}>{h}</span>)}
      </div>
      {rows.map((r) => {
        const body = (
          <>
            <span className="truncate font-semibold">{r.label}</span>
            <span className="flex gap-[3px] overflow-hidden">
              {r.dots.map((ok, i) => <i key={i} className="size-[9px] shrink-0 rounded-full" style={{ background: ok ? 'var(--good)' : 'var(--critical)' }} />)}
            </span>
            {r.cells.map((c, i) => (
              <span key={i} className="num truncate text-right font-bold" style={{ color: c.status ? STATUS[c.status].c : 'var(--ink-2)' }}>{c.text}</span>
            ))}
          </>
        )
        const cls = `grid ${cols} h-[25px] items-center gap-2 border-t border-line-soft`
        return r.href ? <Link key={r.key} href={r.href} className={`${cls} hover:bg-surface-2`}>{body}</Link> : <div key={r.key} className={cls}>{body}</div>
      })}
    </div>
  )
}
