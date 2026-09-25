'use client'
import Link from 'next/link'
import { Icon, type IconName } from '@/components/ui/icons'
import { addDays, daysBetween } from '@/lib/domain/calc'
import { shortDate } from '@/lib/domain/format'
import type { Cover, CoverState, JobRing, PromisedOrder, PromiseZone } from '@/lib/workspace/executive'
import type { PlanState } from '@/lib/workspace/plan'

/*
 * The gist's pictures. Small on purpose: six of them share one screen with the
 * tiles, the queues and the stage cards, so each draws one idea in about a
 * hundred and thirty pixels and says the rest in its tooltip.
 *
 * Colour does one job each. Categorical hues name a thing — a material, a place
 * the money sits — and stay with it. Status colours (critical, warn, good) are
 * kept for late, tight and fine, and always come with an icon and a word.
 */

export const tint = (c: string, pct: number) => `color-mix(in srgb, ${c} ${pct}%, white)`

/* ink on the light hues, white on the dark one — never text in the series colour */
const ON = (c: string) => (c === 'var(--cat-3)' ? '#fff' : 'var(--ink)')

/*
 * `c` is the status ink, for icons beside words; `mark` is the fill for a dot
 * or a bar. The warn ink is a brown made for text — as a fill it reads as mud,
 * so marks take it lifted towards amber, still darker than the categorical one.
 */
export const STATUS = {
  critical: { c: 'var(--critical)', mark: 'var(--critical)', soft: 'var(--critical-soft)', icon: 'alert' as IconName },
  warn: { c: 'var(--warn)', mark: 'color-mix(in srgb, var(--warn) 40%, #F59E0B)', soft: 'var(--warn-soft)', icon: 'clock' as IconName },
  good: { c: 'var(--good)', mark: 'color-mix(in srgb, var(--good) 80%, #1BAF7A)', soft: 'var(--good-soft)', icon: 'check' as IconName },
}

/* ---------------------------------------------------------- month columns -- */

/** Six months as columns, this month in full colour and the rest pale. */
export function MonthColumns({ points, fmt, hue }: {
  points: { label: string; value: number; note: string }[]; fmt: (n: number) => string; hue: string
}) {
  const W = 330, H = 124, base = 102, top = 18
  const max = Math.max(...points.map((p) => p.value), 1)
  const slot = W / points.length, bw = Math.min(30, slot * 0.56)
  const empty = points.every((p) => p.value === 0)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-[124px] w-full" role="img"
      aria-label={points.map((p) => `${p.label} ${fmt(p.value)}`).join(', ')}>
      <line x1="0" x2={W} y1={base} y2={base} stroke="var(--line)" />
      <line x1="0" x2={W} y1={(base + top) / 2} y2={(base + top) / 2} stroke="var(--line-soft)" strokeDasharray="3 3" />
      {points.map((p, i) => {
        const last = i === points.length - 1
        const h = p.value > 0 ? Math.max(3, ((base - top) * p.value) / max) : 2
        const x = i * slot + (slot - bw) / 2, y = base - h, r = Math.min(4, h / 2)
        return (
          <g key={p.label}>
            <path d={`M${x},${base} V${y + r} Q${x},${y} ${x + r},${y} H${x + bw - r} Q${x + bw},${y} ${x + bw},${y + r} V${base} Z`}
              fill={p.value > 0 ? (last ? hue : tint(hue, 38)) : 'var(--surface-3)'} />
            {p.value > 0 && (last || p.value === max) && (
              <text x={x + bw / 2} y={y - 5} textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--ink)">{fmt(p.value)}</text>
            )}
            <text x={i * slot + slot / 2} y={H - 6} textAnchor="middle" fontSize="10"
              fontWeight={last ? 700 : 400} fill={last ? 'var(--ink)' : 'var(--ink-3)'}>{p.label}</text>
            <rect x={i * slot} y="0" width={slot} height={H} fill="transparent">
              <title>{`${p.label}: ${fmt(p.value)} · ${p.note}`}</title>
            </rect>
          </g>
        )
      })}
      {empty && <text x={W / 2} y={60} textAnchor="middle" fontSize="11" fill="var(--ink-3)">Nothing dispatched yet</text>}
    </svg>
  )
}

/* ------------------------------------------------------- promise timeline -- */

const ZONE: Record<PromiseZone, keyof typeof STATUS> = { past: 'critical', soon: 'warn', later: 'good' }

/**
 * Every open sales order as a dot on its promise date, sized by what is still
 * to go: late behind the Today line, due this week in the band after it.
 */
export function PromiseTimeline({ orders, today, fmt }: { orders: PromisedOrder[]; today: string; fmt: (n: number) => string }) {
  const W = 330, H = 104, pad = 10, mid = 50
  const first = orders[0]?.promised ?? today, lastP = orders[orders.length - 1]?.promised ?? today
  const start = [addDays(today, -14), first].sort()[0]
  const end = [addDays(today, 21), addDays(lastP, 2)].sort().reverse()[0]
  const span = Math.max(1, daysBetween(start, end))
  const x = (d: string) => pad + ((W - 2 * pad) * daysBetween(start, d)) / span
  const week = addDays(today, 7)
  const max = Math.max(...orders.map((o) => o.value), 1)
  // three lanes, so two orders promised the same day do not sit on each other
  const lanes = [mid, mid - 20, mid + 20]
  const ends = lanes.map(() => -Infinity)
  const dots = orders.map((o) => {
    const r = 4 + 8 * Math.sqrt(o.value / max), cx = x(o.promised)
    const lane = Math.max(0, lanes.findIndex((_, i) => ends[i] < cx - r - 3))
    ends[lane] = cx + r
    return { o, r, cx, cy: lanes[lane] }
  })
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-[104px] w-full" role="img"
      aria-label={orders.map((o) => `${o.no} ${fmt(o.value)} promised ${shortDate(o.promised)}`).join(', ') || 'No open sales order'}>
      <rect x={pad} y="18" width={x(today) - pad} height="64" rx="6" fill={STATUS.critical.soft} />
      <rect x={x(today)} y="18" width={x(week) - x(today)} height="64" fill={STATUS.warn.soft} />
      <rect x={x(week)} y="18" width={W - pad - x(week)} height="64" rx="6" fill={STATUS.good.soft} />
      <line x1={x(today)} x2={x(today)} y1="12" y2="86" stroke="var(--ink)" strokeWidth="1.5" strokeDasharray="3 2" />
      <text x={x(today)} y="9" textAnchor="middle" fontSize="9" fontWeight="700" fill="var(--ink)">Today</text>
      {dots.map(({ o, r, cx, cy }) => (
        <g key={o.id}>
          <circle cx={cx} cy={cy} r={r} fill={STATUS[ZONE[o.zone]].mark} stroke="var(--surface)" strokeWidth="2">
            <title>{`${o.no} · ${o.customer} · ${fmt(o.value)} to send · promised ${shortDate(o.promised)}`}</title>
          </circle>
          {orders.length <= 6 && (
            <text x={cx} y={cy - r - 3} textAnchor="middle" fontSize="8.5" fontWeight="600" fill="var(--ink-2)">{o.no}</text>
          )}
        </g>
      ))}
      <text x={pad} y={H - 4} fontSize="9" fill="var(--ink-3)">{shortDate(start)}</text>
      <text x={x(week)} y={H - 4} textAnchor="middle" fontSize="9" fill="var(--ink-3)">{shortDate(week)}</text>
      <text x={W - pad} y={H - 4} textAnchor="end" fontSize="9" fill="var(--ink-3)">{shortDate(end)}</text>
      {orders.length === 0 && <text x={W / 2} y={mid + 4} textAnchor="middle" fontSize="11" fill="var(--ink-3)">Nothing waiting to go</text>}
    </svg>
  )
}

/* ------------------------------------------------------------------ donut -- */

export function MoneyDonut({ segments, centre, fmt }: {
  segments: { label: string; value: number; color: string }[]; centre: string; fmt: (n: number) => string
}) {
  const total = segments.reduce((a, s) => a + s.value, 0)
  const R = 38, C = 2 * Math.PI * R
  let at = 0
  return (
    <div className="flex items-center gap-3">
      <svg viewBox="0 0 100 100" className="size-[112px] shrink-0" role="img"
        aria-label={segments.map((s) => `${s.label} ${fmt(s.value)}`).join(', ')}>
        <circle cx="50" cy="50" r={R} fill="none" stroke="var(--surface-3)" strokeWidth="16" />
        <g transform="rotate(-90 50 50)">
          {total > 0 && segments.filter((s) => s.value > 0).map((s) => {
            const len = (C * s.value) / total, gap = segments.filter((x) => x.value > 0).length > 1 ? 2 : 0
            const el = (
              <circle key={s.label} cx="50" cy="50" r={R} fill="none" stroke={s.color} strokeWidth="16"
                strokeDasharray={`${Math.max(0, len - gap)} ${C}`} strokeDashoffset={-at}>
                <title>{`${s.label}: ${fmt(s.value)} · ${Math.round((s.value / total) * 100)}%`}</title>
              </circle>
            )
            at += len
            return el
          })}
        </g>
        <text x="50" y="50" textAnchor="middle" fontSize="14" fontWeight="800" fill="var(--ink)">{centre}</text>
        <text x="50" y="62" textAnchor="middle" fontSize="8" fill="var(--ink-3)">in all</text>
      </svg>
      <ul className="min-w-0 flex-1 space-y-[5px]">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-1.5 text-[11.5px]">
            <span aria-hidden className="size-2.5 shrink-0 rounded-[3px]" style={{ background: s.color }} />
            <span className="min-w-0 flex-1 truncate text-ink-2">{s.label}</span>
            <span className={`num shrink-0 font-semibold ${s.value > 0 ? 'text-ink' : 'text-ink-4'}`}>{s.value > 0 ? fmt(s.value) : '—'}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ---------------------------------------------------------------- treemap -- */

interface Box { x: number; y: number; w: number; h: number }

/** Squarified: rows of blocks laid along the shorter side, so no block is a sliver. */
function squarify(values: number[], box: Box): Box[] {
  const total = values.reduce((a, b) => a + b, 0) || 1
  let rest = values.map((v) => (v / total) * box.w * box.h)
  let b = { ...box }
  const out: Box[] = []
  while (rest.length) {
    const side = Math.min(b.w, b.h)
    const worst = (r: number[]) => {
      const s = r.reduce((a, c) => a + c, 0)
      return Math.max((side * side * Math.max(...r)) / (s * s), (s * s) / (side * side * Math.min(...r)))
    }
    let n = 1
    while (n < rest.length && worst(rest.slice(0, n + 1)) <= worst(rest.slice(0, n))) n++
    const row = rest.slice(0, n), s = row.reduce((a, c) => a + c, 0)
    if (b.w >= b.h) {
      const cw = s / b.h
      let y = b.y
      for (const a of row) { out.push({ x: b.x, y, w: cw, h: a / cw }); y += a / cw }
      b = { x: b.x + cw, y: b.y, w: b.w - cw, h: b.h }
    } else {
      const rh = s / b.w
      let x = b.x
      for (const a of row) { out.push({ x, y: b.y, w: a / rh, h: rh }); x += a / rh }
      b = { x: b.x, y: b.y + rh, w: b.w, h: b.h - rh }
    }
    rest = rest.slice(n)
  }
  return out
}

/** Spend as blocks: the bigger the block, the more went on that material. */
export function Treemap({ rows, fmt }: { rows: { label: string; value: number; color: string }[]; fmt: (n: number) => string }) {
  const W = 300, H = 104
  const boxes = squarify(rows.map((r) => r.value), { x: 0, y: 0, w: W, h: H })
  const total = rows.reduce((a, r) => a + r.value, 0) || 1
  return (
    <div>
    <div className="relative h-[104px] w-full" role="img" aria-label={rows.map((r) => `${r.label} ${fmt(r.value)}`).join(', ')}>
      {rows.map((r, i) => {
        const b = boxes[i]
        const roomy = b.w > 64 && b.h > 34
        // too small for the name, still big enough to say how much
        const some = !roomy && b.h > 20 && fmt(r.value).length * 6.5 < b.w - 8
        return (
          <div key={r.label} title={`${r.label}: ${fmt(r.value)} · ${Math.round((r.value / total) * 100)}%`}
            className="absolute p-[1px]"
            style={{ left: `${(b.x / W) * 100}%`, top: `${(b.y / H) * 100}%`, width: `${(b.w / W) * 100}%`, height: `${(b.h / H) * 100}%` }}>
            <div className="flex h-full w-full flex-col justify-end overflow-hidden rounded-[5px] px-1.5 py-1" style={{ background: r.color, color: ON(r.color) }}>
              {roomy && <>
                <span className="truncate text-[10.5px] font-medium leading-tight">{r.label}</span>
                <span className="truncate text-[12px] font-extrabold leading-tight">{fmt(r.value)}</span>
              </>}
              {some && <span className="truncate text-[10.5px] font-bold leading-tight">{fmt(r.value)}</span>}
            </div>
          </div>
        )
      })}
    </div>
    {/* the names, for the blocks too small to carry one */}
    <ul className="mt-1.5 flex h-[14px] gap-x-3 overflow-hidden text-[10.5px] text-ink-2">
      {rows.slice(0, 4).map((r) => (
        <li key={r.label} className="flex min-w-0 items-center gap-1">
          <span aria-hidden className="size-2 shrink-0 rounded-[2px]" style={{ background: r.color }} />
          <span className="max-w-[7rem] truncate">{r.label}</span>
        </li>
      ))}
    </ul>
    </div>
  )
}

/* ------------------------------------------------------------- job rings -- */

const JOB: Record<PlanState, { tone: keyof typeof STATUS | null; word: string }> = {
  late: { tone: 'critical', word: 'Past finish' },
  behind: { tone: 'warn', word: 'Behind' },
  running: { tone: 'good', word: 'On plan' },
  made: { tone: 'good', word: 'Made' },
  not_started: { tone: null, word: 'Not started' },
  unplanned: { tone: null, word: 'No plan' },
  closed: { tone: null, word: 'Closed' },
}

/** Each open job card as a ring: how much of the plan is made. */
export function JobRings({ jobs }: { jobs: JobRing[] }) {
  const R = 22, C = 2 * Math.PI * R
  return (
    <ul className="flex h-[124px] items-center justify-evenly gap-1">
      {jobs.map((j) => {
        const s = JOB[j.state]
        const pct = j.qty ? Math.min(1, j.made / j.qty) : 0
        const color = s.tone ? STATUS[s.tone].mark : 'var(--ink-4)'
        return (
          <li key={j.id} className="min-w-0 max-w-[25%] flex-1">
            <Link href={j.href} title={`${j.no}${j.name ? ` · ${j.name}` : ''}: ${j.made}${j.qty ? ` of ${j.qty}` : ''} made · ${s.word}`}
              className="press flex flex-col items-center rounded-lg py-1 hover:bg-surface-2">
              <svg viewBox="0 0 56 56" className="size-[58px]">
                <circle cx="28" cy="28" r={R} fill="none" stroke="var(--surface-3)" strokeWidth="6"
                  strokeDasharray={j.qty ? undefined : '3 3'} />
                {j.qty ? <circle cx="28" cy="28" r={R} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
                  strokeDasharray={`${C * pct} ${C}`} transform="rotate(-90 28 28)" /> : null}
                <text x="28" y="31.5" textAnchor="middle" fontSize="11" fontWeight="800" fill="var(--ink)">
                  {j.qty ? `${Math.round(pct * 100)}%` : '—'}
                </text>
              </svg>
              <span className="mt-0.5 flex max-w-full items-center gap-0.5 text-[11px] font-bold text-ink">
                {s.tone && <span style={{ color: STATUS[s.tone].c }}><Icon name={STATUS[s.tone].icon} className="size-3 shrink-0" /></span>}
                <span className="truncate">{j.no}</span>
              </span>
              <span className="max-w-full truncate text-[10px] text-ink-3">{j.qty ? `${j.made}/${j.qty}` : s.word}</span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

/* ------------------------------------------------------------ stock cover -- */

const COVER: Record<CoverState, keyof typeof STATUS> = { short: 'critical', tight: 'warn', ok: 'good' }

/** Days each material lasts, with a tick where a new order would land. */
export function CoverBars({ rows }: { rows: Cover[] }) {
  const scale = Math.max(14, ...rows.map((r) => Math.min(r.days, 90)), ...rows.map((r) => 2 * (r.lead ?? 7)))
  return (
    <ul className="flex h-[124px] flex-col justify-center gap-2">
      {rows.map((r) => {
        const s = STATUS[COVER[r.state]]
        return (
          <li key={r.id} className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_3.2rem] items-center gap-2 text-[11.5px]"
            title={`${r.name}: ${r.days} days of stock · ${r.lead ? `the quickest supplier takes ${r.lead} days` : 'nobody quotes it yet'}`}>
            <span className="truncate text-ink-2">{r.name}</span>
            <span className="relative h-2.5 rounded-full bg-surface-3">
              <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.max(3, (Math.min(r.days, scale) / scale) * 100)}%`, background: s.mark }} />
              <span aria-hidden className="absolute -inset-y-1 w-[2px] rounded bg-ink" style={{ left: `${((r.lead ?? 7) / scale) * 100}%` }} />
            </span>
            <span className="flex items-center justify-end gap-0.5 font-semibold text-ink">
              <span style={{ color: s.c }}><Icon name={s.icon} className="size-3 shrink-0" /></span>
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
