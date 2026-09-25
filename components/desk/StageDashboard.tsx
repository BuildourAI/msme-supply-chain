'use client'
import Link from 'next/link'
import { Icon, type IconName } from '@/components/ui/icons'
import { NavyDisc, STATUS, type Status } from '@/components/charts/owner'
import { Tiles } from '@/components/sourcing/Tiles'
import { useWorkspace } from '@/components/workspace/store'
import { BAND_LABEL, byBand, type Act, type Band, type Decision, type DecisionKind } from '@/lib/workspace/decisions'
import { whenWord, type Activity } from '@/lib/workspace/executive'
import type { Metric } from '@/lib/workspace/metrics'

/**
 * A desk's dashboard, in the owner's colours.
 *
 * The same frame on all five desks, so a person who has learnt one has learnt
 * them all: a navy band saying which desk and how much is waiting, the desk's
 * own figures in a row, four pictures of its records, a strip of cards for the
 * things it looks after, and on the right what is waiting on you — one line
 * and one button each — with the last few things written underneath.
 *
 * On a laptop it is one screen. The right-hand column is as tall as the left
 * and no taller: what is waiting takes the room it needs and scrolls if a band
 * is opened out, and the recent list takes what is left. On a phone the
 * waiting list comes straight after the figures, because it is the work.
 *
 * Colour follows `components/charts/owner.tsx`: navy and greys, with red,
 * amber and green only where something is late, tight or fine.
 */
export function StageDashboard({ stage, icon, chips, actions, metrics, pictures, strip, waiting, recent }: {
  stage: string
  icon: IconName
  chips: React.ReactNode
  actions: React.ReactNode
  metrics: Metric[]
  pictures: React.ReactNode
  strip?: React.ReactNode
  waiting: React.ReactNode
  recent: React.ReactNode
}) {
  const { workspace } = useWorkspace()
  return (
    <div className="anim-page mx-auto w-full max-w-[90rem]">
      <header data-desk-band className="flex flex-wrap items-center gap-x-3.5 gap-y-2 rounded-2xl bg-gradient-to-r from-navy-deep to-navy px-4 py-2.5 text-white sm:px-5">
        <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/12">
          <Icon name={icon} className="size-[18px]" />
        </span>
        <div className="min-w-0">
          <p className="mono truncate text-[10px] uppercase tracking-wider text-white/70">{workspace?.company.name}</p>
          <h1 className="text-[20px] font-extrabold leading-tight tracking-[-0.02em]">{stage}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">{chips}{actions}</div>
      </header>

      {metrics.length > 0 && <div className="mt-2.5"><Tiles metrics={metrics} columns="row" /></div>}

      <div className="mt-2.5 grid gap-2.5 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <aside className="relative min-w-0 xl:col-start-2 xl:row-start-1">
          <div className="flex flex-col gap-2.5 xl:absolute xl:inset-0">
            {waiting}
            {recent}
          </div>
        </aside>
        <div className="min-w-0 space-y-2.5 xl:col-start-1 xl:row-start-1">
          <div className="grid gap-2.5 md:grid-cols-2">{pictures}</div>
          {strip && <ul className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-5">{strip}</ul>}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ band -- */

export function BandChip({ icon, alert, children }: { icon?: IconName; alert?: boolean; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/12 px-2.5 py-1.5 text-[12px] font-semibold">
      {alert && <span aria-hidden className="size-2 rounded-full bg-[#FF6B57]" />}
      {icon && <Icon name={icon} className="size-3.5 opacity-80" />}
      {children}
    </span>
  )
}

export function BandButton({ icon, onClick, primary, children }: { icon: IconName; onClick: () => void; primary?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={`press inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold ${
        primary ? 'bg-accent text-on-accent hover:brightness-95' : 'bg-white text-ink hover:bg-white/90'}`}>
      <Icon name={icon} className="size-3.5" />
      {children}
    </button>
  )
}

/* ---------------------------------------------------------- waiting list -- */

/**
 * What each row is about, as a picture.
 *
 * Chosen for the noun rather than the verb — a late order and an order to send
 * are both a cart, because both are that order. Reading a band by shape only
 * works if the shapes mean the thing rather than the action.
 */
export const KIND: Record<DecisionKind, IconName> = {
  'at-risk': 'boxes',
  late: 'truck',
  unsourced: 'boxes',
  flip: 'scale',
  stale: 'scale',
  unfiled: 'doc',
  undecided: 'scale',
  unordered: 'cart',
  'no-qty': 'cart',
  unsent: 'cart',
  'no-reply': 'doc',
  // the gate's: a lorry is a tray at the gate, an order a cart, a jobworker a shed
  'to-receive': 'tray',
  'at-gate': 'tray',
  'qc-overdue': 'clock',
  spike: 'alert',
  'not-told': 'cart',
  'awaiting-ack': 'cart',
  churn: 'cart',
  'lands-late': 'truck',
  'challan-overdue': 'factory',
  'challan-unaccounted': 'factory',
  'over-ceiling': 'cash',
  'challan-gst': 'calendar',
  // the store's
  'count-due': 'hash',
  'no-rack': 'columns',
  'negative-stock': 'alert',
  'count-variance': 'scale',
  'held-long': 'tray',
  'scrap-unsold': 'cash',
  'scrap-over': 'alert',
  'remnant-aged': 'clock',
  'remnant-covers': 'cart',
  'cut-below-plan': 'scissors',
  // the floor's
  'job-halted': 'alert',
  'job-will-halt': 'boxes',
  'job-at-risk': 'clock',
  'job-behind': 'activity',
  'job-late': 'calendar',
  'no-plan': 'factory',
  'no-bom': 'doc',
  // the shipping bay's
  'order-late': 'truck',
  'order-at-risk': 'alert',
  'order-short-stock': 'boxes',
  'order-no-style': 'factory',
  'note-no-carrier': 'truck',
  'note-eway': 'doc',
  'delivery-due': 'clock',
  'carrier-late': 'scale',
  'return-overdue': 'undo',
}

const SHOW = 3

const BAND_EDGE: Record<Band, string> = { stops: 'var(--critical)', costs: 'var(--warn-mark)', unfinished: 'var(--ink-4)' }

/**
 * What is waiting on you, one decision a line: what it is about, the sentence
 * cut to the width of the column (the whole of it in the tooltip), and the one
 * thing you do — with the real alternative beside it, as quietly as before.
 * The band is the coloured edge; the words say which band it is.
 */
export function WaitingList({ rows, onAct, showAll, onShowAll, clear }: {
  rows: Decision[]
  onAct: (d: Decision, act: Act) => void
  showAll: Set<Band>
  onShowAll: (b: Band) => void
  clear?: string
}) {
  return (
    <section data-waiting className="flex min-h-0 shrink flex-col rounded-xl border border-line bg-surface p-3">
      <h2 className="flex shrink-0 items-center gap-2 text-[12.5px] font-bold tracking-tight">
        <Icon name="bell" className="size-4 text-navy" />
        Waiting on you
        <span className={`mono rounded-full px-1.5 text-[10.5px] leading-[18px] ${rows.length > 0 ? 'bg-critical text-white' : 'bg-good-soft text-good'}`}>{rows.length}</span>
        <span className="ml-auto text-[11px] font-normal text-ink-3">one tap each</span>
      </h2>
      {rows.length === 0 ? (
        <div className="mt-2 flex items-start gap-2.5 rounded-lg bg-good-soft/50 px-3 py-3">
          <Icon name="check" className="mt-0.5 size-4 shrink-0 text-good" />
          <div>
            <p className="text-[12.5px] font-bold">Nothing needs you</p>
            <p className="mt-0.5 text-[11.5px] leading-snug text-ink-2">{clear ?? 'Every price is decided, every order is out, and nothing is late.'}</p>
          </div>
        </div>
      ) : (
        <div className="-mr-1 mt-1 min-h-0 overflow-y-auto pr-1">
          {byBand(rows).map((g) => {
            const open = showAll.has(g.band)
            const shown = open ? g.rows : g.rows.slice(0, SHOW)
            const rest = g.rows.length - shown.length
            return (
              <section key={g.band}>
                <h3 className="mb-1 mt-2 flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.06em] text-ink-3">
                  <span aria-hidden className="size-[7px] rounded-full" style={{ background: BAND_EDGE[g.band] }} />
                  {BAND_LABEL[g.band]}
                  <span className="mono ml-auto">{g.rows.length}</span>
                </h3>
                <ul className="space-y-1">
                  {shown.map((d) => (
                    <li key={d.id} title={`${d.title} — ${d.detail}`}
                      className="rounded-lg border-l-[3px] bg-surface-2 py-1.5 pl-2 pr-1.5" style={{ borderLeftColor: BAND_EDGE[g.band] }}>
                      <div className="flex items-center gap-2">
                        <NavyDisc icon={KIND[d.kind]} size="sm" />
                        <span className="min-w-0 flex-1 truncate text-[12px] font-bold">{d.title}</span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 pl-[30px]">
                        <span className="min-w-0 flex-1 truncate text-[10.5px] text-ink-3">{d.detail}</span>
                        <Acts d={d} onAct={onAct} />
                      </div>
                    </li>
                  ))}
                </ul>
                {rest > 0 && (
                  <button type="button" onClick={() => onShowAll(g.band)}
                    className="press mt-0.5 rounded-md px-1 py-0.5 text-[11px] text-ink-3 hover:text-ink">
                    and {rest} more
                  </button>
                )}
              </section>
            )
          })}
        </div>
      )}
    </section>
  )
}

/** The thing to do, and the real alternative — a link when it only opens a screen. */
function Acts({ d, onAct }: { d: Decision; onAct: (d: Decision, act: Act) => void }) {
  const main = 'press shrink-0 rounded-md bg-navy px-2 py-1 text-[11px] font-semibold text-white hover:bg-navy-deep'
  return (
    <span className="flex shrink-0 items-center gap-0.5">
      {d.alt && (
        <button type="button" onClick={() => onAct(d, d.alt!.act)}
          className="press rounded-md px-1.5 py-1 text-[11px] text-ink-3 hover:text-ink">
          {d.alt.label}
        </button>
      )}
      {d.act === 'open'
        ? <Link href={d.href} className={main}>{d.actLabel}</Link>
        : <button type="button" onClick={() => onAct(d, d.act)} className={main}>{d.actLabel}</button>}
    </span>
  )
}

/* ---------------------------------------------------------------- recent -- */

export function RecentList({ title, items, today }: { title: string; items: Activity[]; today: string }) {
  return (
    <section data-recent className="flex min-h-[7.5rem] flex-1 flex-col overflow-hidden rounded-xl border border-line bg-surface p-3">
      <h2 className="flex items-center gap-2 text-[12.5px] font-bold tracking-tight">
        <Icon name="activity" className="size-4 text-navy" />{title}
      </h2>
      {items.length === 0
        ? <p className="mt-2 text-[12px] text-ink-3">Nothing written here yet.</p>
        : (
          <ul className="mt-1">
            {items.map((a) => (
              <li key={`${a.kind}-${a.seq}`}>
                <Link href={a.href} title={a.who ? `${a.what} · ${a.who}` : a.what}
                  className="press flex h-[28px] items-center gap-2 rounded-md px-1 text-[12px] hover:bg-surface-2">
                  <span aria-hidden className="grid size-[22px] shrink-0 place-items-center rounded-full bg-surface-2 text-ink-3">
                    <Icon name={a.kind} className="size-3" />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{a.what}</span>
                  <span className="shrink-0 text-[11px] text-ink-3">{whenWord(a.on, today)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
    </section>
  )
}

/* ----------------------------------------------------------------- strip -- */

/** One card in the strip under the pictures: a thing the desk looks after, with its state. */
export function StripCard({ status, title, icon, href, children, foot, footIcon }: {
  status: Status; title: string; icon?: IconName; href?: string; children: React.ReactNode; foot?: React.ReactNode; footIcon?: IconName
}) {
  const edge = status === 'none' ? 'var(--line)' : STATUS[status].mark
  const body = (
    <>
      <span className="flex items-center gap-1.5 truncate text-[12.5px] font-bold">
        {icon && <Icon name={icon} className="size-3.5 shrink-0 text-navy" />}
        <span className="truncate">{title}</span>
      </span>
      <div className="mt-1 min-w-0">{children}</div>
      {foot && (
        <span className="mt-auto flex items-center gap-1 truncate border-t border-line-soft pt-1.5 text-[10.5px] text-ink-2">
          {footIcon && <Icon name={footIcon} className="size-3 shrink-0 text-ink-3" />}
          <span className="flex min-w-0 items-center gap-1.5 truncate">{foot}</span>
        </span>
      )}
    </>
  )
  const cls = 'flex h-full min-w-0 flex-col gap-1 overflow-hidden rounded-xl border border-t-[3px] border-line bg-surface px-2.5 py-2'
  return (
    <li className="min-w-0">
      {href
        ? <Link href={href} className={`${cls} hover:border-navy/40`} style={{ borderTopColor: edge }}>{body}</Link>
        : <div className={cls} style={{ borderTopColor: edge }}>{body}</div>}
    </li>
  )
}
