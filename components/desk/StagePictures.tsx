'use client'
import Link from 'next/link'
import { Icon, type IconName } from '@/components/ui/icons'
import {
  CoverBars, DayStrip, DotRows, Empty, JOB_STATUS, MonthColumns, OwnerCard, Pill, PromiseTimeline, RankedBars, Ring, Spans,
  type DayCell, type SpanRow, type Status,
} from '@/components/charts/owner'
import { StripCard } from '@/components/desk/StageDashboard'
import { daysBetween } from '@/lib/domain/calc'
import { shortDate } from '@/lib/domain/format'
import {
  acceptance, customerScores, firstPassByJob, gateWaits, jobCardsPic, jobSpans, landing, lastReceipts, lossPicture,
  madeByWeek, materialCards, orderCards, orderSpans, punctuality, receivedByMonth, roadRows, shelfByMaterial, shelfVsPromised,
  stockCards, supplierScores, countState, type Landing,
} from '@/lib/workspace/desk-pictures'
import { compact, fyOf, ordersByPromise, stockCover } from '@/lib/workspace/executive'
import { haltsByCause } from '@/lib/workspace/halts'
import { HALT_WORD } from '@/lib/workspace/linewatch'
import type { Workspace } from '@/lib/workspace/types'

/*
 * The four pictures and the strip of cards on each desk's dashboard. Every one
 * reads a function in `lib/workspace/desk-pictures.ts` and draws it with the
 * owner's kit in `components/charts/owner.tsx` — navy for the data, greys for
 * the rest, red / amber / green only for status.
 */

const qty = (n: number) => (Math.abs(n) >= 1000 ? Math.round(n).toLocaleString('en-IN') : String(Math.round(n * 1000) / 1000))
const pct = (n: number) => `${Math.round(n * 10) / 10}%`
const LAND_ICON: Record<Landing['kind'], IconName> = { order: 'truck', gate: 'tray', jobwork: 'share' }

function days(ws: Workspace, today: string, n = 10): DayCell[] {
  return landing(ws, today, n).map((d) => ({
    date: d.date,
    items: d.items.map((i) => ({ key: i.key, icon: LAND_ICON[i.kind], what: i.what, qty: i.qty, note: i.note, status: i.status, href: i.href, title: i.title })),
  }))
}

const fyMonths = (today: string) => Math.max(6, fyOf(today || '2000-04-01').months)

/* ============================================================== SOURCING == */

export function SourcingPictures({ ws, today }: { ws: Workspace; today: string }) {
  const spans = orderSpans(ws, today, 6)
  const open = orderSpans(ws, today, 50).filter((s) => s.open)
  const rows: SpanRow[] = spans.map((s) => ({
    key: s.key, label: s.no, sub: s.vendor.split(' ')[0], from: s.from, to: s.to,
    done: s.open ? Math.min(1, Math.max(0, daysBetween(s.from, today) / Math.max(1, daysBetween(s.from, s.to)))) : null,
    at: s.receivedOn ? { on: s.receivedOn, status: s.status } : undefined,
    overdue: s.open && today > s.to, value: compact(s.value), status: s.open ? (s.lateDays > 0 ? 'critical' : 'none') : s.status,
    href: '/sourcing/orders',
    title: `${s.no} · ${s.vendor} · ordered ${shortDate(s.from)}, promised ${shortDate(s.to)}${s.receivedOn ? `, in ${shortDate(s.receivedOn)}${s.lateDays ? ` — ${s.lateDays}d late` : ' — on time'}` : s.lateDays ? ` — ${s.lateDays}d late` : ''}`,
  }))
  const scores = supplierScores(ws)
  const allDots = scores.flatMap((s) => s.deliveries)
  const byMonth = receivedByMonth(ws, today, fyMonths(today))
  const thisMonth = byMonth[byMonth.length - 1]
  const due = landing(ws, today).reduce((a, d) => a + d.items.length, 0)
  return (
    <>
      <OwnerCard chart="orders" title="Orders with suppliers" href="/sourcing/orders"
        figure={open.length > 0 ? `${open.length} out · ${compact(open.reduce((a, s) => a + s.value, 0))}` : undefined}>
        {rows.length > 0 ? <Spans rows={rows} today={today} labelW={96} valueW={46} /> : <Empty icon="cart" h={150}>No order handed to a supplier yet</Empty>}
      </OwnerCard>
      <OwnerCard chart="suppliers" title="Supplier scorecard" href="/sourcing/suppliers"
        figure={allDots.length > 0 ? `${Math.round((allDots.filter(Boolean).length / allDots.length) * 100)}% on time` : undefined}>
        {scores.length > 0
          ? <DotRows head={['Supplier', 'Deliveries', 'On time', 'Rejected', 'Lead']} rows={scores.map((s) => ({
            key: s.vendorId, label: s.name, dots: s.deliveries, href: '/sourcing/suppliers',
            cells: [
              { text: `${s.onTimePct}%`, status: s.onTimePct >= 90 ? 'good' : s.onTimePct >= 70 ? 'warn' : 'critical' },
              { text: s.rejectedPct == null ? '—' : pct(s.rejectedPct), status: s.rejectedPct != null && s.rejectedPct > 2 ? 'critical' : undefined },
              { text: s.lead == null ? '—' : `${s.lead}d` },
            ],
          }))} />
          : <Empty icon="truck" h={150}>Nothing received yet</Empty>}
      </OwnerCard>
      <OwnerCard chart="received" title="Received" sub={fyMonths(today) === fyOf(today || '2000-04-01').months ? 'this financial year' : 'last 6 months'}
        href="/inbound/receiving" figure={thisMonth?.value ? `${compact(thisMonth.value)} in ${thisMonth.label}` : undefined}>
        <MonthColumns fmt={compact} empty="Nothing received yet"
          points={byMonth.map((m) => ({ label: m.label, value: m.value, note: `${m.count} deliver${m.count === 1 ? 'y' : 'ies'}` }))} />
      </OwnerCard>
      <OwnerCard chart="landing" title="Landing in the next 10 days" href="/inbound/due" figure={due > 0 ? `${due} due` : 'nothing due'}>
        <DayStrip days={days(ws, today)} today={today} />
      </OwnerCard>
    </>
  )
}

const COVER_WORD: Record<string, [Status, string]> = { short: ['critical', 'Order now'], tight: ['warn', 'Tight'], ok: ['good', 'Covered'] }

export function SourcingStrip({ ws, today }: { ws: Workspace; today: string }) {
  return (
    <>
      {materialCards(ws, today).map((m) => {
        const [status, word] = m.state ? COVER_WORD[m.state] : ['none' as Status, 'No daily use']
        const incoming = m.incoming
          ? m.incoming.kind === 'gate' ? `+${qty(m.incoming.qty)} ${m.uom} at the gate` : `+${qty(m.incoming.qty)} ${m.uom} on ${shortDate(m.incoming.on)}`
          : 'none on order'
        return (
          <StripCard key={m.id} status={status} title={m.name} href="/sourcing/materials" foot={incoming} footIcon="truck">
            <div className="flex items-center gap-2">
              <Ring pct={m.days == null ? null : Math.min(1, m.days / 30)} status={status} label={m.days == null ? '—' : `${m.days}d`}
                sub={m.lead ? `lead ${m.lead}d` : undefined} size={54} dashed={m.days == null} />
              <div className="flex min-w-0 flex-col gap-1">
                <span className="truncate text-[10.5px] text-ink-3">{m.supplier ? `${m.supplier.split(' ')[0]}${m.rate ? ` · ₹${m.rate}/${m.uom}` : ''}` : 'no supplier yet'}</span>
                <Pill status={status}>{word}</Pill>
              </div>
            </div>
          </StripCard>
        )
      })}
    </>
  )
}

/* =============================================================== INBOUND == */

export function InboundPictures({ ws, today }: { ws: Workspace; today: string }) {
  const g = gateWaits(ws, today)
  const late = punctuality(ws)
  const acc = acceptance(ws, today)
  const allIn = acc.reduce((a, r) => a + r.accepted + r.rejected, 0)
  const rejected = acc.reduce((a, r) => a + r.rejected, 0)
  const due = landing(ws, today).reduce((a, d) => a + d.items.filter((i) => i.kind !== 'gate').length, 0)
  const maxDays = Math.max(g.overdue + 2, ...g.waiting.map((w) => w.days + 1))
  const X = (d: number) => (d / maxDays) * 100
  return (
    <>
      <OwnerCard chart="gate" title="Time at the gate" href="/inbound/receiving" figure={g.waiting.length ? `${g.waiting.length} waiting` : 'nothing waiting'}>
        <div className="relative h-[150px]">
          <div className="absolute inset-x-0 top-5 flex h-[86px] overflow-hidden rounded-lg">
            <div className="bg-good-soft/70" style={{ width: `${X(g.within)}%` }} />
            <div className="bg-warn-soft/70" style={{ width: `${X(g.overdue) - X(g.within)}%` }} />
            <div className="flex-1 bg-critical-soft/70" />
          </div>
          <span className="absolute top-0 text-[10px] font-semibold text-good" style={{ left: 0 }}>inspect within {g.within} days</span>
          <span className="absolute top-0 text-[10px] font-semibold text-critical" style={{ left: `${X(g.overdue)}%` }}>overdue</span>
          <ul className="absolute inset-x-0 top-7 space-y-1">
            {g.waiting.slice(0, 3).map((w) => (
              <li key={w.id} className="relative h-6">
                <span className="absolute flex max-w-[70%] items-center gap-1.5 whitespace-nowrap" style={{ left: `calc(${X(w.days)}% + 2px)` }} title={`${w.qty} ${w.what} from ${w.vendor}`}>
                  <span className="grid size-6 shrink-0 place-items-center rounded-full border-2 border-surface text-white" style={{ background: w.status === 'critical' ? 'var(--critical)' : w.status === 'warn' ? 'var(--warn-mark)' : 'var(--navy)' }}>
                    <Icon name="tray" className="size-3" />
                  </span>
                  <span className="truncate text-[11px] font-bold">{w.what.split(' ')[0]} · {w.vendor.split(' ')[0]}</span>
                  <span className="shrink-0 text-[10px] text-ink-3">{w.days === 0 ? 'today' : `${w.days}d`}</span>
                </span>
              </li>
            ))}
            {g.waiting.length === 0 && <li className="pt-5 text-center text-[11.5px] text-ink-3">Nothing at the gate</li>}
          </ul>
          <span className="absolute bottom-5 left-0 text-[10px] text-ink-3">{g.sameDay} closed this month</span>
          <div className="absolute inset-x-0 bottom-0 flex justify-between text-[9.5px] text-ink-3">
            {Array.from({ length: maxDays + 1 }, (_, d) => <span key={d}>{d}d</span>)}
          </div>
        </div>
      </OwnerCard>
      <OwnerCard chart="landing" title="Landing in the next 10 days" href="/inbound/due" figure={due > 0 ? `${due} due` : 'nothing due'}>
        <DayStrip days={days(ws, today)} today={today} />
      </OwnerCard>
      <OwnerCard chart="punctual" title="On the promised day?" href="/inbound/receiving"
        figure={late.length ? `${late.filter((l) => l.lateDays <= 0).length} of ${late.length} on time` : undefined}>
        {late.length > 0 ? (
          <ul className="flex min-h-[150px] flex-col justify-center gap-[7px]">
            {late.map((l) => {
              const max = Math.max(5, ...late.map((x) => x.lateDays))
              return (
                <li key={l.key} className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)] items-center gap-2 text-[11.5px]">
                  <span className="truncate"><b>{l.no}</b> <span className="text-ink-3">{l.vendor}</span></span>
                  <span className="relative flex h-3 items-center">
                    <span aria-hidden className="absolute inset-y-[-3px] left-0 w-px bg-ink" />
                    {l.lateDays > 0 ? (
                      <>
                        <span className="h-2 rounded-r-full bg-critical/35" style={{ width: `${(l.lateDays / max) * 75}%` }} />
                        <span className="size-2.5 shrink-0 -translate-x-1 rounded-full bg-critical" />
                        <span className="text-[10.5px] font-bold text-critical">{l.lateDays}d late</span>
                      </>
                    ) : (
                      <>
                        <span className="size-2.5 shrink-0 -translate-x-1 rounded-full bg-good" />
                        <span className="text-[10.5px] font-semibold text-good">{l.lateDays < 0 ? `${-l.lateDays}d early` : 'on the day'}</span>
                      </>
                    )}
                  </span>
                </li>
              )
            })}
          </ul>
        ) : <Empty icon="clock" h={150}>Nothing received against an order yet</Empty>}
      </OwnerCard>
      <OwnerCard chart="accepted" title="Accepted at the gate" sub="this month" href="/inbound/checks"
        figure={allIn > 0 ? `${pct(((allIn - rejected) / allIn) * 100)} accepted` : undefined}>
        {acc.length > 0 ? (
          <ul className="flex min-h-[150px] flex-col justify-center gap-[7px]">
            {acc.slice(0, 5).map((r) => {
              const all = r.accepted + r.rejected
              // a rejection is drawn at least a few pixels wide so it shows beside thousands accepted
              const bad = all > 0 && r.rejected > 0 ? Math.max(4, (r.rejected / all) * 100) : 0
              return (
                <li key={r.id} className="grid grid-cols-[minmax(0,7.4rem)_minmax(0,1fr)_4.2rem] items-center gap-2 text-[11.5px]"
                  title={r.waiting ? `${qty(r.waiting)} ${r.uom} still at the gate` : `${qty(r.accepted)} accepted, ${qty(r.rejected)} rejected`}>
                  <span className="truncate text-ink-2">{r.name}</span>
                  {all > 0 ? (
                    <span className="flex h-2.5 gap-px overflow-hidden rounded-full bg-surface-3">
                      <span className="bg-navy" style={{ width: `${100 - bad}%` }} />
                      {bad > 0 && <span className="bg-critical" style={{ width: `${bad}%` }} />}
                    </span>
                  ) : <span className="h-2.5 rounded-full bg-[repeating-linear-gradient(45deg,var(--surface-3)_0_4px,var(--surface)_4px_8px)]" />}
                  <span className={`num text-right font-bold ${r.rejected ? 'text-critical' : ''}`}>
                    {all > 0 ? (r.rejected ? `${qty(r.rejected)} out` : qty(r.accepted)) : 'at gate'}
                  </span>
                </li>
              )
            })}
          </ul>
        ) : <Empty icon="check" h={150}>Nothing through the gate this month</Empty>}
      </OwnerCard>
    </>
  )
}

export function InboundStrip({ ws, today }: { ws: Workspace; today: string }) {
  return (
    <>
      {lastReceipts(ws, today).map((r) => {
        const status: Status = r.open ? (r.days > ws.policy.inboundQcDays ? 'critical' : 'warn') : r.late ? 'warn' : 'good'
        return (
          <StripCard key={r.id} status={status} title={r.what} href="/inbound/receiving" foot={r.open ? 'at the gate · check it' : `${r.qty} in`} footIcon="tray">
            <div className="flex items-center gap-2">
              <Ring pct={r.open ? Math.min(1, r.days / ws.policy.inboundQcDays) : r.acceptedPct} status={status}
                label={r.open ? `${r.days}d` : `${Math.round((r.acceptedPct ?? 0) * 100)}%`} sub={r.open ? `of ${ws.policy.inboundQcDays} days` : 'accepted'} size={54} />
              <div className="flex min-w-0 flex-col gap-1">
                <span className="truncate text-[10.5px] text-ink-3">{r.vendor.split(' ')[0]} · {shortDate(r.on)}</span>
                <Pill status={status}>{r.open ? 'Waiting' : r.late ? 'In · late' : 'Closed'}</Pill>
              </div>
            </div>
          </StripCard>
        )
      })}
    </>
  )
}

/* ============================================================= INVENTORY == */

export function InventoryPictures({ ws, today }: { ws: Workspace; today: string }) {
  const shelf = shelfByMaterial(ws)
  const cover = stockCover(ws)
  const counts = countState(ws, today)
  const due = counts.reduce((a, c) => a + c.lots.filter((x) => !x).length, 0)
  const lots = counts.reduce((a, c) => a + c.lots.length, 0)
  const loss = lossPicture(ws, today)
  const worst = loss.scrap[0]
  const short = cover.filter((c) => c.state === 'short').length
  return (
    <>
      <OwnerCard chart="shelf" title="What the shelf is worth" href="/inventory/ledger" figure={shelf.length ? compact(shelf.reduce((a, r) => a + r.value, 0)) : undefined}>
        {shelf.length > 0 ? <RankedBars h={150} rows={shelf.slice(0, 5).map((r) => ({ label: r.name, value: r.value, display: compact(r.value) }))} />
          : <Empty icon="boxes" h={150}>Nothing priced on the shelf yet</Empty>}
      </OwnerCard>
      <OwnerCard chart="cover" title="Days of stock" href="/inventory/ledger" figure={cover.length ? (short ? `${short} out before a refill` : 'All covered') : undefined}>
        {cover.length > 0 ? <CoverBars rows={cover} /> : <Empty icon="clock" h={150}>Give a material its daily use</Empty>}
      </OwnerCard>
      <OwnerCard chart="counts" title="Counted in time?" href="/inventory/ledger" figure={lots ? (due ? `${due} of ${lots} lots due` : 'all counted in time') : undefined}>
        {counts.length > 0 ? (
          <div className="flex min-h-[150px] flex-col justify-center">
            <ul className="space-y-[7px]">
              {counts.slice(0, 5).map((c) => {
                const d = c.lots.filter((x) => !x).length
                return (
                  <li key={c.id} className="grid grid-cols-[minmax(0,7.4rem)_minmax(0,1fr)_4rem] items-center gap-2 text-[11.5px]">
                    <span className="truncate text-ink-2">{c.name}</span>
                    <span className="flex flex-wrap gap-1">
                      {c.lots.slice(0, 10).map((ok, i) => <i key={i} className="size-3.5 rounded-[4px]" style={{ background: ok ? 'var(--good)' : 'var(--critical)' }} />)}
                    </span>
                    <span className={`text-right text-[11px] ${d ? 'font-bold text-critical' : 'text-ink-3'}`}>{d ? `${d} due` : 'counted'}</span>
                  </li>
                )
              })}
            </ul>
            <p className="mt-2 flex gap-3 text-[10.5px] text-ink-3">
              <span className="flex items-center gap-1"><i className="size-2.5 rounded-[3px] bg-good" />counted in time</span>
              <span className="flex items-center gap-1"><i className="size-2.5 rounded-[3px] bg-critical" />past its date</span>
              <span className="ml-auto">a square is a lot</span>
            </p>
          </div>
        ) : <Empty icon="hash" h={150}>Nothing counted onto the book yet</Empty>}
      </OwnerCard>
      <OwnerCard chart="loss" title="Loss & scrap" sub="this month" href="/inventory/wastage"
        figure={worst ? (worst.pct > worst.target ? 'over target' : 'within target') : undefined}>
        {!worst && loss.reasons.length === 0 ? <Empty icon="check" h={150}>Nothing issued or lost this month</Empty> : (
        <div className="flex min-h-[150px] items-center gap-3">
          <div className="shrink-0 text-center">
            <div className="num text-[22px] font-extrabold tracking-[-0.02em]">{compact(loss.net)}</div>
            <div className="text-[10.5px] text-ink-3">net loss</div>
            {worst && <div className="mt-1 flex justify-center">
              <Ring pct={worst.target ? Math.min(1, worst.pct / worst.target) : 0} status={worst.pct > worst.target ? 'critical' : 'good'}
                label={pct(worst.pct)} sub={`of ${worst.target}%`} size={64} />
            </div>}
          </div>
          <div className="min-w-0 flex-1 text-[11.5px]">
            <p className="mb-1 text-[9.5px] uppercase tracking-[0.05em] text-ink-3">Where it went</p>
            {loss.reasons.length === 0 && <p className="text-ink-3">Nothing lost this month.</p>}
            <ul className="space-y-1.5">
              {loss.reasons.slice(0, 3).map((r, i) => (
                <li key={i} title={r.what}>
                  <div className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate text-ink-2">{r.what}</span><b className="num shrink-0">{compact(r.value)}</b></div>
                  <span className="mt-0.5 block h-1.5 rounded-full bg-surface-3"><span className="block h-full rounded-full bg-navy" style={{ width: `${(r.value / Math.max(1, loss.reasons[0].value)) * 100}%` }} /></span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        )}
      </OwnerCard>
    </>
  )
}

export function InventoryStrip({ ws, today }: { ws: Workspace; today: string }) {
  return (
    <>
      {stockCards(ws, today).map((s) => {
        const whole = s.usable + s.atJobworker + s.held || 1
        const status: Status = s.due > 0 ? 'critical' : 'good'
        const foot = s.atJobworker > 0 ? `${qty(s.atJobworker)} ${s.uom} at a jobworker`
          : s.incoming ? (s.incoming.kind === 'gate' ? `+${qty(s.incoming.qty)} at the gate` : `+${qty(s.incoming.qty)} on ${shortDate(s.incoming.on)}`) : 'none on order'
        return (
          <StripCard key={s.id} status={status} title={s.name} href={`/inventory/ledger?item=${s.id}`} foot={foot} footIcon={s.atJobworker > 0 ? 'share' : 'truck'}>
            <div className="flex min-w-0 items-baseline gap-1.5">
              <span className="num shrink-0 whitespace-nowrap text-[17px] font-extrabold tracking-[-0.02em]">{qty(s.usable)}<span className="ml-0.5 text-[11px] font-semibold text-ink-3">{s.uom}</span></span>
              <span className="min-w-0 truncate text-[10.5px] text-ink-3">{compact(s.value)} · {s.lots} lot{s.lots === 1 ? '' : 's'}</span>
            </div>
            <span className="my-0.5 flex h-1.5 overflow-hidden rounded-full bg-surface-3" title={`usable ${qty(s.usable)} · at jobworkers ${qty(s.atJobworker)} · held ${qty(s.held)}`}>
              <span className="bg-navy" style={{ width: `${(s.usable / whole) * 100}%` }} />
              <span className="bg-navy/40" style={{ width: `${(s.atJobworker / whole) * 100}%` }} />
              <span className="bg-ink-4" style={{ width: `${(s.held / whole) * 100}%` }} />
            </span>
            <Pill status={status}>{s.due > 0 ? `${s.due} lot${s.due === 1 ? '' : 's'} due a count` : 'Counted'}</Pill>
          </StripCard>
        )
      })}
    </>
  )
}

/* ============================================================ PRODUCTION == */

export function ProductionPictures({ ws, today }: { ws: Workspace; today: string }) {
  const spans = jobSpans(ws, today)
  const rows: SpanRow[] = spans.map((j) => ({
    key: j.key, label: j.no, sub: j.so, from: j.from, to: j.to, done: j.qty ? j.made / j.qty : 0,
    stops: j.halts, overdue: j.state === 'late', status: JOB_STATUS[j.state].status === 'none' ? 'none' : JOB_STATUS[j.state].status,
    value: `${Math.round((j.qty ? j.made / j.qty : 0) * 100)}%`, href: `/production/jobs?card=${j.id}`,
    title: `${j.no} · ${j.product}${j.so ? ` for ${j.so}` : ''}: ${j.made} of ${j.qty} made · ${shortDate(j.from)} to ${shortDate(j.to)} · ${JOB_STATUS[j.state].word}`,
  }))
  const weeks = madeByWeek(ws, today)
  const wmax = Math.max(1, ...weeks.map((w) => Math.max(w.good, w.target)))
  const month = today.slice(0, 7)
  const halts = month ? haltsByCause(ws, month, today).filter((h) => h.days > 0 || h.halts > 0) : []
  const haltDays = halts.reduce((a, h) => a + h.days, 0)
  const fp = firstPassByJob(ws, today)
  const good = fp.reduce((a, r) => a + r.good, 0), bad = fp.reduce((a, r) => a + r.rejected, 0)
  const HALT_ICON: Record<string, IconName> = { material: 'boxes', machine: 'alert', manpower: 'factory', power: 'alert', quality: 'check', jobworker: 'share', other: 'clock' }
  return (
    <>
      <OwnerCard chart="plan" title="Job cards against the plan" href="/production/jobs" figure={rows.length ? `${rows.length} open` : undefined}>
        {rows.length > 0 ? (
          <>
            <Spans rows={rows} today={today} labelW={80} valueW={30} />
            <p className="flex gap-3 text-[10.5px] text-ink-3">
              <span className="flex items-center gap-1"><i className="h-2.5 w-3 bg-[repeating-linear-gradient(45deg,var(--critical)_0_2px,transparent_2px_4px)]" />halted</span>
              <span>bar = plan · solid = made</span>
            </p>
          </>
        ) : <Empty icon="calendar" h={150}>No job card planned yet</Empty>}
      </OwnerCard>
      <OwnerCard chart="weekly" title="Made each week" href="/production/line-watch"
        figure={weeks.length ? `${weeks[weeks.length - 1].good.toLocaleString('en-IN')} this week` : undefined}>
        {weeks.some((w) => w.good || w.target) ? (
          <>
            <div className="flex h-[118px] items-end justify-around gap-3 border-b border-line px-2">
              {weeks.map((w, i) => {
                const last = i === weeks.length - 1
                return (
                  <div key={w.from} className="relative flex h-full flex-1 flex-col items-center justify-end" title={`week from ${w.label}: ${w.good} good, ${w.rejected} rejected · plan ${w.target}`}>
                    <span className="mb-1 text-[10px] font-bold">{w.good ? w.good.toLocaleString('en-IN') : '—'}</span>
                    <span className="w-full max-w-[44px] rounded-t-[4px]" style={{ height: `${(w.good / wmax) * 88}px`, background: last ? 'var(--navy)' : 'color-mix(in srgb, var(--navy) 30%, white)' }} />
                    {w.target > 0 && <span aria-hidden className="absolute inset-x-0 border-t-2 border-dashed border-ink" style={{ bottom: `${(w.target / wmax) * 88}px` }} />}
                  </div>
                )
              })}
            </div>
            <div className="flex justify-around text-[10px] text-ink-3">{weeks.map((w, i) => <span key={w.from} className={i === weeks.length - 1 ? 'font-bold text-ink' : ''}>{w.label}</span>)}</div>
            <p className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-ink-3"><span className="w-3.5 border-t-2 border-dashed border-ink" />what the plan said · each bar is seven days</p>
          </>
        ) : <Empty icon="factory" h={150}>Nothing booked off the floor yet</Empty>}
      </OwnerCard>
      <OwnerCard chart="halts" title="Why the line stopped" sub="this month" href="/production/line-watch?view=halts" figure={haltDays ? `${haltDays} day${haltDays === 1 ? '' : 's'}` : 'no halts'}>
        {halts.length > 0 ? (
          <div className="flex min-h-[150px] items-center gap-4">
            <div className="shrink-0 text-center"><div className="num text-[22px] font-extrabold">{haltDays} days</div><div className="text-[10.5px] text-ink-3">halted</div></div>
            <ul className="min-w-0 flex-1 space-y-2">
              {halts.slice(0, 4).map((h, i) => (
                <li key={h.cause} className="grid grid-cols-[1.5rem_minmax(0,6.5rem)_minmax(0,1fr)_2.2rem] items-center gap-2 text-[11.5px]">
                  <span className="grid size-6 place-items-center rounded-md bg-navy/10 text-navy"><Icon name={HALT_ICON[h.cause] ?? 'clock'} className="size-3.5" /></span>
                  <span className="truncate font-semibold">{HALT_WORD[h.cause]}</span>
                  <span className="h-2.5 rounded-full bg-surface-3"><span className="block h-full rounded-full" style={{ width: `${(h.days / Math.max(1, halts[0].days)) * 100}%`, background: i === 0 ? 'var(--navy)' : 'color-mix(in srgb, var(--navy) 55%, white)' }} /></span>
                  <b className="text-right">{h.days}d</b>
                </li>
              ))}
            </ul>
          </div>
        ) : <Empty icon="check" h={150}>The line has not stopped this month</Empty>}
      </OwnerCard>
      <OwnerCard chart="firstpass" title="Right first time" sub="this month" href="/production/line-watch" figure={bad ? `${bad} rejected` : undefined}>
        {fp.length > 0 ? (
          <div className="flex min-h-[150px] items-center gap-4">
            <Ring pct={good + bad ? good / (good + bad) : 0} status={good + bad && good / (good + bad) >= 0.97 ? 'good' : 'warn'}
              label={pct(good + bad ? (good / (good + bad)) * 100 : 0)} sub="good" size={104} />
            <ul className="min-w-0 flex-1 space-y-2 text-[11.5px]">
              {fp.map((r) => {
                const all = r.good + r.rejected || 1
                const badW = r.rejected ? Math.max(4, (r.rejected / all) * 100) : 0
                return (
                  <li key={r.no} className="grid grid-cols-[2.8rem_minmax(0,1fr)_2.4rem] items-center gap-2" title={`${r.good} good, ${r.rejected} rejected`}>
                    <b>{r.no}</b>
                    <span className="flex h-2.5 gap-px overflow-hidden rounded-full bg-surface-3"><span className="bg-navy" style={{ width: `${100 - badW}%` }} />{badW > 0 && <span className="bg-critical" style={{ width: `${badW}%` }} />}</span>
                    <span className={`text-right ${r.rejected ? 'font-bold text-critical' : 'text-ink-4'}`}>{r.rejected || '—'}</span>
                  </li>
                )
              })}
            </ul>
          </div>
        ) : <Empty icon="check" h={150}>Nothing booked off the floor this month</Empty>}
      </OwnerCard>
    </>
  )
}

export function ProductionStrip({ ws, today }: { ws: Workspace; today: string }) {
  const cards = jobCardsPic(ws, today)
  return (
    <>
      {cards.map((j) => {
        const s = JOB_STATUS[j.state]
        const p = j.qty ? Math.min(1, j.made / j.qty) : null
        const word = j.state === 'behind' && j.gap ? `${j.gap.toLocaleString('en-IN')} behind` : s.word
        const when = j.state === 'not_started' && j.from ? `starts ${shortDate(j.from)}` : j.state === 'late' && j.to ? `was due ${shortDate(j.to)}` : j.to ? `finish ${shortDate(j.to)}` : 'no plan yet'
        return (
          <StripCard key={j.id} status={s.status} title={j.no} icon="factory" href={`/production/jobs?card=${j.id}`} foot={<Pill status={s.status}>{word}</Pill>}>
            <div className="flex items-center gap-2">
              <Ring pct={p} status={s.status} label={p == null ? '—' : `${Math.round(p * 100)}%`} sub="made" size={50} dashed={p == null} />
              <div className="flex min-w-0 flex-col gap-0.5 text-[10.5px]">
                <span className="truncate text-ink-3">{j.product.split(' ')[0]}{j.so ? ` · ${j.so}` : ''}</span>
                <span className="truncate text-[11px] font-semibold">{j.made.toLocaleString('en-IN')}{j.qty ? ` of ${j.qty.toLocaleString('en-IN')}` : ''}</span>
                <span className="truncate text-ink-3">{when}</span>
              </div>
            </div>
          </StripCard>
        )
      })}
      {cards.length < 5 && (
        <li className="min-w-0">
          <Link href="/production/jobs" className="grid h-full min-h-[96px] place-items-center rounded-xl border-[1.5px] border-dashed border-line text-[12px] font-semibold text-ink-3 hover:border-navy/40 hover:text-navy">
            <span className="flex flex-col items-center gap-1"><Icon name="plus" className="size-4" />Open a job card</span>
          </Link>
        </li>
      )}
    </>
  )
}

/* ============================================================== DISPATCH == */

export function DispatchPictures({ ws, today }: { ws: Workspace; today: string }) {
  const p = ordersByPromise(ws, today)
  const promiseTotal = p.past.value + p.soon.value + p.later.value
  const road = roadRows(ws, today)
  const moving = road.filter((r) => !r.delivered && r.status !== 'warn').length
  const unbooked = road.filter((r) => r.status === 'warn').length
  const cust = customerScores(ws, today)
  const dots = cust.flatMap((c) => c.dots)
  const shelf = shelfVsPromised(ws)
  const ready = shelf.reduce((a, r) => a + Math.min(r.onShelf, r.promised), 0)
  const wanted = shelf.reduce((a, r) => a + r.promised, 0)
  return (
    <>
      <OwnerCard chart="promise" title="Sales orders by promise" href="/dispatch/orders" figure={promiseTotal ? `${compact(promiseTotal)} to send` : undefined}>
        <PromiseTimeline orders={p.orders} today={today} fmt={compact} totals={{ past: p.past.value, soon: p.soon.value, later: p.later.value }} />
      </OwnerCard>
      <OwnerCard chart="road" title="On the road" href="/dispatch/consignments"
        figure={road.length ? [moving ? `${moving} moving` : '', unbooked ? `${unbooked} not booked` : ''].filter(Boolean).join(' · ') || 'all delivered' : undefined}>
        {road.length > 0 ? (
          <ul className="flex min-h-[150px] flex-col justify-center gap-2.5">
            {road.map((r) => {
              const done = !!r.delivered
              const tone = r.status === 'critical' ? 'var(--critical)' : done ? 'var(--good)' : 'var(--navy)'
              return (
                <li key={r.key} title={`${r.no} to ${r.customer}${r.carrier ? ` with ${r.carrier}` : ''} · left ${shortDate(r.left)}${r.due ? ` · promised ${shortDate(r.due)}` : ''}`}>
                  <div className="flex items-baseline gap-1.5 text-[11px]">
                    <b>{r.no}</b><span className="min-w-0 flex-1 truncate text-ink-3">{r.customer}{r.carrier ? ` · ${r.carrier.split(' ')[0]}` : ''}</span>
                    <span className={`shrink-0 font-semibold ${r.status === 'warn' ? 'text-warn' : r.status === 'critical' ? 'text-critical' : done ? 'text-good' : 'text-ink'}`}>
                      {r.word.replace(/(\d{4}-\d{2}-\d{2})/, (d) => shortDate(d))}
                    </span>
                  </div>
                  <div className="relative mt-1 h-1.5 rounded-full bg-surface-3" style={r.status === 'warn' ? { background: 'repeating-linear-gradient(90deg, var(--surface-3) 0 6px, transparent 6px 10px)' } : undefined}>
                    {r.progress > 0 && <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${r.progress * 100}%`, background: tone }} />}
                    {!done && r.progress > 0 && (
                      <span className="absolute top-1/2 grid size-5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-surface text-white" style={{ left: `${r.progress * 100}%`, background: tone }}>
                        <Icon name="truck" className="size-2.5" />
                      </span>
                    )}
                    {done && <span className="absolute right-0 top-1/2 grid size-4 -translate-y-1/2 place-items-center rounded-full text-white" style={{ background: tone }}><Icon name="check" className="size-2.5" /></span>}
                  </div>
                </li>
              )
            })}
          </ul>
        ) : <Empty icon="truck" h={150}>Nothing has left yet</Empty>}
      </OwnerCard>
      <OwnerCard chart="customers" title="Deliveries by customer" href="/dispatch/consignments"
        figure={dots.length ? `${dots.filter(Boolean).length} of ${dots.length} on time, in full` : undefined}>
        {cust.length > 0 ? (
          <div className="flex min-h-[150px] flex-col justify-center">
            <DotRows head={['Customer', 'Deliveries', 'OTIF', '', '']} rows={cust.map((c) => ({
              key: c.id, label: c.name, dots: c.dots, href: '/dispatch/consignments',
              cells: [{ text: `${c.pct}%`, status: c.pct >= 95 ? 'good' : c.pct >= 70 ? 'warn' : 'critical' }, { text: '' }, { text: '' }],
            }))} />
            <p className="mt-2 flex gap-3 text-[10.5px] text-ink-3">
              <span className="flex items-center gap-1"><i className="size-2.5 rounded-full bg-good" />on time, in full</span>
              <span className="flex items-center gap-1"><i className="size-2.5 rounded-full bg-critical" />late or part-sent</span>
            </p>
          </div>
        ) : <Empty icon="check" h={150}>Nothing delivered yet</Empty>}
      </OwnerCard>
      <OwnerCard chart="shelf" title="Shelf against promises" href="/dispatch/orders" figure={wanted ? `${ready.toLocaleString('en-IN')} of ${wanted.toLocaleString('en-IN')} ready` : undefined}>
        {shelf.length > 0 ? (
          <ul className="flex min-h-[150px] flex-col justify-center gap-3">
            {shelf.slice(0, 4).map((r) => (
              <li key={r.id}>
                <div className="flex items-baseline gap-2 text-[11.5px]">
                  <span className="min-w-0 flex-1 truncate font-semibold">{r.name}</span>
                  <span className="shrink-0 text-[11px] text-ink-3"><b className="text-ink">{r.onShelf.toLocaleString('en-IN')}</b> on the shelf · <b className="text-ink">{r.promised.toLocaleString('en-IN')}</b> promised</span>
                </div>
                <span className="mt-1 block h-3 rounded-full bg-surface-3">
                  <span className="block h-full rounded-full bg-navy" style={{ width: `${r.promised ? Math.min(100, (r.onShelf / r.promised) * 100) : 100}%` }} />
                </span>
              </li>
            ))}
          </ul>
        ) : <Empty icon="boxes" h={150}>No finished stock or open order yet</Empty>}
      </OwnerCard>
    </>
  )
}

const ZONE_STATUS: Record<string, Status> = { past: 'critical', soon: 'warn', later: 'good' }

export function DispatchStrip({ ws, today }: { ws: Workspace; today: string }) {
  return (
    <>
      {orderCards(ws, today).map((o) => {
        const s = ZONE_STATUS[o.zone]
        const f = o.ordered ? o.sent / o.ordered : 0
        const late = o.zone === 'past' ? Math.max(1, daysBetween(o.promised, today)) : 0
        const word = late ? `${late}d late` : o.zone === 'soon' ? 'Due this week' : 'On track'
        return (
          <StripCard key={o.id} status={s} title={o.no} icon="doc" href="/dispatch/orders"
            foot={<><Pill status={s}>{word}</Pill>{o.noJob && <span className="truncate text-ink-3">no job card</span>}</>}>
            <div className="flex items-center gap-2">
              <Ring pct={f} status={s} label={`${Math.round(f * 100)}%`} sub="sent" size={50} />
              <div className="flex min-w-0 flex-col gap-0.5 text-[10.5px]">
                <span className="truncate text-ink-3">{o.customer}</span>
                <span className="truncate text-[11px] font-semibold">{compact(o.left)} to go</span>
                <span className="truncate text-ink-3">promised {shortDate(o.promised)}</span>
              </div>
            </div>
          </StripCard>
        )
      })}
    </>
  )
}
