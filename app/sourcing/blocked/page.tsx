'use client'
import { useEffect, useRef, useState } from 'react'
import { PageHeader } from '@/components/shell/PageHeader'
import { Card, Pill, StatusPill } from '@/components/ui/bits'
import { Icon } from '@/components/ui/icons'
import { Donut, RankedBars } from '@/components/charts/exec-charts'
import { SEQ } from '@/components/charts/kit'
import { useDesk } from '@/components/desk/store'
import { Note } from '@/components/ui/Note'
import { AGE_LABEL, blockedStock, CAUSE_LABEL, ROUTE_LABEL } from '@/lib/seed/blocked'
import { lakh, money, num } from '@/lib/domain/format'
import { TODAY_SOURCING } from '@/lib/seed/sourcing'
import { daysBetween } from '@/lib/domain/calc'
import { StageGate } from '@/components/onboard/StageGate'

/**
 * SRC-04 on its own page.
 *
 * §8.4 is the whole design: "the cause column is the point — if MOQ is the top
 * cause the fix is a vendor negotiation, not a software change." So the page is
 * built around cause and age as two views of one total, with an owner, a route
 * out and a deadline on every lot. A pile of money with no name against it is
 * a report; a pile with an owner and a date is a task list.
 *
 * The register is the point of the screen, so it comes second, under the two
 * summaries that explain it and above the two panels that comment on it. It
 * used to sit fifth, a thousand pixels down, under a card of prose.
 *
 * And the two summaries drive it. A chart beside a table of the same rows is a
 * filter waiting to be wired: click "MOQ forced" and the register shows those
 * three lots, with the Cause heading saying so. The headings filter and sort on
 * their own too, so the same question can be asked from either end.
 *
 * The other half of SRC-04 is preventive and lives on the desk: the guardrail
 * that holds any new order which would push cover past its ceiling. This page
 * shows what the guardrail is for.
 */

const ROUTE_TONE: Record<string, 'good' | 'warn' | 'critical' | 'accent'> = {
  return: 'good', resell: 'accent', alternate: 'warn', scrap: 'critical',
}

type By = 'cause' | 'age' | 'route' | 'owner'
type Col = 'age' | 'cause' | 'route' | 'owner'
type SortCol = 'item' | 'value' | 'deadline'

const GROUPS: { id: By; label: string; key: keyof (typeof blockedStock)[number]; labels?: Record<string, string> }[] = [
  { id: 'cause', label: 'By cause', key: 'cause', labels: CAUSE_LABEL },
  { id: 'age', label: 'By age', key: 'ageBucket', labels: AGE_LABEL },
  { id: 'route', label: 'By route out', key: 'route', labels: ROUTE_LABEL },
  { id: 'owner', label: 'By owner', key: 'owner' },
]

/** which lot field each filterable column reads, and how it is worded */
const COLS: Record<Col, { label: string; key: keyof (typeof blockedStock)[number]; labels?: Record<string, string> }> = {
  age: { label: 'Age', key: 'ageBucket', labels: AGE_LABEL },
  cause: { label: 'Cause', key: 'cause', labels: CAUSE_LABEL },
  route: { label: 'Route out', key: 'route', labels: ROUTE_LABEL },
  owner: { label: 'Owner', key: 'owner' },
}

/** the label the grouping chips produce → the column that label filters */
const GROUP_COL: Record<By, Col> = { cause: 'cause', age: 'age', route: 'route', owner: 'owner' }

/** how many days away a deadline is, said the way a person would say it */
function due(deadline: string) {
  const d = daysBetween(TODAY_SOURCING, deadline)
  if (d < 0) return { text: `${Math.abs(d)}d past`, tone: 'text-critical' }
  if (d <= 45) return { text: `in ${d}d`, tone: 'text-warn' }
  return { text: `in ${d}d`, tone: 'text-ink-4' }
}

/**
 * A column heading that filters its own column.
 *
 * The register is fifteen rows of eight columns, and every question a person
 * brings to it — whose lots, which route, how old — is a value in one of those
 * columns. Putting the filter in the heading means the question is asked where
 * the answer is read, and the heading says which value is chosen rather than a
 * chip strip somewhere above saying it on the column's behalf.
 */
function HeadFilter({ col, value, onPick, counts, open, setOpen }: {
  col: Col
  value?: string
  onPick: (v?: string) => void
  /** every value that occurs, with what it is worth — a filter that says what it will show */
  counts: { raw: string; label: string; lots: number; value: number }[]
  open: boolean
  setOpen: (v: boolean) => void
}) {
  const box = useRef<HTMLTableCellElement>(null)
  const c = COLS[col]

  // same dismissal as the supplier listbox on the desk: a click anywhere else
  // and Escape both close it, so it never sits open over the row being read
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open, setOpen])

  const chosen = value ? (c.labels?.[value] ?? value) : null

  return (
    <th ref={box} scope="col" className="relative whitespace-nowrap border-b border-line px-3 py-1.5 text-left font-medium">
      <button type="button" onClick={() => setOpen(!open)}
        aria-haspopup="listbox" aria-expanded={open}
        title={chosen ? `${c.label}: showing only ${chosen}` : `Filter by ${c.label.toLowerCase()}`}
        className={`press -my-1.5 inline-flex items-center gap-1 rounded py-1.5 transition-colors hover:text-ink ${
          chosen ? 'font-semibold text-accent-ink' : 'text-ink-3'}`}>
        {chosen && <Icon name="filter" className="size-3 shrink-0" />}
        <span>{chosen ?? c.label}</span>
        <Icon name="chevron" className={`size-2.5 shrink-0 rotate-90 transition-transform ${open ? '-rotate-90' : ''}`} />
      </button>

      {open && (
        <div role="listbox" aria-label={c.label}
          className="anim-drop absolute left-2 top-full z-30 mt-1 min-w-[13rem] overflow-hidden rounded-md border border-line bg-surface p-1 shadow-xl">
          <button type="button" role="option" aria-selected={!value}
            onClick={() => { onPick(undefined); setOpen(false) }}
            className={`flex w-full items-baseline gap-2 rounded-md px-2 py-1 text-left text-[11.5px] transition-colors hover:bg-surface-2 ${
              !value ? 'font-medium text-accent-ink' : 'text-ink-2'}`}>
            All
            <span className="num ml-auto text-[10.5px] text-ink-3">{blockedStock.length} lots</span>
          </button>
          {counts.map((o) => (
            <button key={o.raw} type="button" role="option" aria-selected={value === o.raw}
              onClick={() => { onPick(value === o.raw ? undefined : o.raw); setOpen(false) }}
              className={`flex w-full items-baseline gap-2 rounded-md px-2 py-1 text-left text-[11.5px] transition-colors hover:bg-surface-2 ${
                value === o.raw ? 'font-medium text-accent-ink' : 'text-ink-2'}`}>
              <span className="truncate">{o.label}</span>
              <span className="num ml-auto shrink-0 text-[10.5px] text-ink-3">{o.lots} · {lakh(o.value)}</span>
            </button>
          ))}
        </div>
      )}
    </th>
  )
}

/** A column heading that sorts its own column — the desk's arrow, same rules. */
function HeadSort({ col, label, sort, setSort, right }: {
  col: SortCol; label: string
  sort: { col: SortCol; dir: 'asc' | 'desc' }
  setSort: (s: { col: SortCol; dir: 'asc' | 'desc' }) => void
  right?: boolean
}) {
  const active = sort.col === col
  return (
    <th scope="col" className={`whitespace-nowrap border-b border-line px-3 py-1.5 font-medium ${right ? 'text-right' : 'text-left'}`}>
      <button type="button"
        onClick={() => setSort({ col, dir: active && sort.dir === 'desc' ? 'asc' : 'desc' })}
        title={`Sort by ${label.toLowerCase()}`}
        className={`press -my-1.5 inline-flex items-center gap-1 rounded py-1.5 transition-colors hover:text-ink ${
          active ? 'font-semibold text-ink' : 'text-ink-3'}`}>
        {label}
        <span aria-hidden className={active ? 'text-accent-ink' : 'opacity-25'}>
          {active && sort.dir === 'asc' ? '↑' : '↓'}
        </span>
      </button>
    </th>
  )
}

function PageBody() {
  const [by, setBy] = useState<By>('cause')
  const [filters, setFilters] = useState<Partial<Record<Col, string>>>({})
  const [sort, setSort] = useState<{ col: SortCol; dir: 'asc' | 'desc' }>({ col: 'value', dir: 'desc' })
  const [query, setQuery] = useState('')
  const [openCol, setOpenCol] = useState<Col | null>(null)
  const { kpis } = useDesk()
  const total = blockedStock.reduce((a, b) => a + b.value, 0)

  const g = GROUPS.find((x) => x.id === by)!
  const grouped = (() => {
    const m = new Map<string, { value: number; lots: number; raw: string }>()
    for (const b of blockedStock) {
      const k = String(b[g.key])
      const e = m.get(k) ?? { value: 0, lots: 0, raw: k }
      m.set(k, { value: e.value + b.value, lots: e.lots + 1, raw: k })
    }
    return [...m.entries()]
      .map(([k, v]) => ({ raw: k, label: g.labels?.[k] ?? k, value: v.value, lots: v.lots }))
      .sort((a, b) => b.value - a.value)
  })()

  /** every value in a column, with its lots and its money — what the filter list shows */
  const optionsFor = (col: Col) => {
    const c = COLS[col]
    const m = new Map<string, { lots: number; value: number }>()
    for (const b of blockedStock) {
      const k = String(b[c.key])
      const e = m.get(k) ?? { lots: 0, value: 0 }
      m.set(k, { lots: e.lots + 1, value: e.value + b.value })
    }
    return [...m.entries()]
      .map(([raw, v]) => ({ raw, label: c.labels?.[raw] ?? raw, ...v }))
      .sort((a, b) => b.value - a.value)
  }

  const q = query.trim().toLowerCase()
  const rows = blockedStock
    .filter((b) => (Object.entries(filters) as [Col, string][])
      .every(([col, v]) => !v || String(b[COLS[col].key]) === v))
    .filter((b) => !q || b.itemCode.toLowerCase().includes(q) || b.itemName.toLowerCase().includes(q))
    .sort((a, b) => {
      const d = sort.col === 'value' ? a.value - b.value
        : sort.col === 'deadline' ? a.deadline.localeCompare(b.deadline)
        : a.itemCode.localeCompare(b.itemCode)
      return sort.dir === 'desc' ? -d : d
    })
  const shownValue = rows.reduce((a, b) => a + b.value, 0)
  const active = Object.values(filters).some(Boolean) || q.length > 0

  /** one filter state, set from the chart or from the heading — they agree */
  const pickFromChart = (label: string) => {
    const col = GROUP_COL[by]
    const hit = grouped.find((x) => x.label === label)
    if (!hit) return
    setFilters((f) => ({ ...f, [col]: f[col] === hit.raw ? undefined : hit.raw }))
  }
  const pickedLabel = (() => {
    const v = filters[GROUP_COL[by]]
    return v ? grouped.find((x) => x.raw === v)?.label : undefined
  })()

  const ageSegs = (['0_90', '90_180', 'over_180'] as const).map((k, i) => ({
    label: `${AGE_LABEL[k]} · ${lakh(blockedStock.filter((b) => b.ageBucket === k).reduce((a, b) => a + b.value, 0))}`,
    value: blockedStock.filter((b) => b.ageBucket === k).reduce((a, b) => a + b.value, 0),
    // age is an order, not three kinds: one navy, darker the longer it has sat
    color: SEQ[i === 0 ? 0 : i === 1 ? 1 : 3],
  }))

  // A deadline is only worth printing if somebody can still miss it.
  const overdue = blockedStock.filter((b) => b.deadline < TODAY_SOURCING)
  const soon = blockedStock
    .filter((b) => b.deadline >= TODAY_SOURCING && daysBetween(TODAY_SOURCING, b.deadline) <= 45)
    .sort((a, b) => a.deadline.localeCompare(b.deadline))

  const NOTE_LABEL: Record<By, string> = {
    cause: 'What the top cause actually needs — and it is not a screen',
    age: 'What age tells you and what cause tells you',
    route: 'Why every lot already has a way out chosen',
    owner: 'Why every pile here has a person against it',
  }

  return (
    <>
      <PageHeader eyebrow="Stage 1 · Sourcing & procurement" title="Blocked capital"
        meta={<>
          <Pill tone="accent">SRC-04</Pill>
          <Pill tone="warn">{lakh(total)} across {blockedStock.length} lots</Pill>
          <Pill tone="critical">{lakh(blockedStock.filter((b) => b.ageBucket === 'over_180').reduce((a, b) => a + b.value, 0))} over 180 days</Pill>
        </>} />

      <Note label="What this screen does" className="mb-3">
        <strong className="text-ink">This is usable material bought for the wrong job.</strong> It is a
        different population from the {money(kpis.nonUsableValue.value)} of stock that cannot be issued
        at all — that material is damaged, expired or held in QC; this material is perfectly good and
        simply has nowhere to go. One is not a subset of the other, and adding them together would
        double-count nothing while hiding both.
      </Note>

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
          </div>
          <Note foot label="The one assumption on this page">
            The holding rate is the one assumption on this page — 1.8% a month, the middle of the
            ordinary range for a rented industrial shed, and the same figure the executive dashboard
            uses. Everything else here is measured.
          </Note>
        </Card>

        <Card index={1} title="What put it there" sub="cause tells you what to do about it — click a bar to filter the register"
          actions={<div className="flex flex-wrap gap-1">
            {GROUPS.map((x) => (
              <button key={x.id} type="button" onClick={() => setBy(x.id)}
                aria-pressed={by === x.id}
                className={`rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
                  by === x.id ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line text-ink-2 hover:bg-surface-2'}`}>
                {x.label}
              </button>
            ))}
          </div>}>
          <div className="p-3.5">
            <RankedBars format="money" onPick={pickFromChart} picked={pickedLabel}
              rows={grouped.map((x) => ({
                label: x.label, value: x.value,
                sub: `${x.lots} lot${x.lots === 1 ? '' : 's'} · ${Math.round((x.value / total) * 100)}% of the total`,
              }))} />
          </div>
          <Note foot label={NOTE_LABEL[by]}>
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
          </Note>
        </Card>
      </div>

      {/* the register: the thing a person actually works from, so it comes
          before the panels that comment on it rather than a screen below them */}
      <Card index={2} className="mb-3" title={`All ${blockedStock.length} lots`}
        sub="with an owner, a route out and a date · filter and sort from the column headings"
        actions={
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <label className="relative shrink-0">
              <Icon name="search" className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-ink-4" />
              <input value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="Search" aria-label="Search lots"
                className="w-36 rounded-md border border-line bg-surface-2 py-1 pl-7 pr-2 text-[12px] outline-none focus:border-accent" />
            </label>
            <span className="mono text-[10.5px] text-ink-3">
              showing {rows.length} of {blockedStock.length} · {lakh(shownValue)}
            </span>
            {active && (
              <button type="button"
                onClick={() => { setFilters({}); setQuery('') }}
                className="press rounded-full border border-line px-2 py-0.5 text-[11px] text-ink-2 transition-colors hover:bg-surface-2">
                Clear filters
              </button>
            )}
          </div>
        }>
        <div className="scroll-x overflow-auto">
          <table className="w-full min-w-[46rem] border-collapse text-[11.5px]">
            <thead className="bg-surface-2">
              <tr className="text-ink-3">
                <HeadSort col="item" label="Material" sort={sort} setSort={setSort} />
                <th scope="col" className="whitespace-nowrap border-b border-line px-3 py-1.5 text-left font-medium"
                    title="Not sortable: these lots are counted in tonnes, metres, kilograms and pieces, and ranking them against each other would be arithmetic on nothing.">
                  Qty
                </th>
                <HeadSort col="value" label="Value" sort={sort} setSort={setSort} />
                {(['age', 'cause', 'route', 'owner'] as const).map((c) => (
                  <HeadFilter key={c} col={c} value={filters[c]} counts={optionsFor(c)}
                    open={openCol === c} setOpen={(v) => setOpenCol(v ? c : null)}
                    onPick={(val) => setFilters((f) => ({ ...f, [c]: val }))} />
                ))}
                <HeadSort col="deadline" label="Deadline" sort={sort} setSort={setSort} />
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => {
                const d = due(b.deadline)
                return (
                  <tr key={b.id} className="anim-fade-in border-b border-line-soft hover:bg-surface-2">
                    <td className="px-3 py-1.5">
                      <span className="mono block text-[10.5px] text-ink-3">{b.itemCode}</span>
                      <span className="block max-w-[18rem] truncate" title={b.itemName}>{b.itemName}</span>
                    </td>
                    <td className="num whitespace-nowrap px-3 py-1.5">{num(b.qty, b.qty < 10 ? 2 : 0)} {b.uom}</td>
                    <td className="num whitespace-nowrap px-3 py-1.5 font-medium">{lakh(b.value)}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-ink-2">{AGE_LABEL[b.ageBucket]}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-ink-2">{CAUSE_LABEL[b.cause]}</td>
                    <td className="whitespace-nowrap px-3 py-1.5">
                      <StatusPill label={ROUTE_LABEL[b.route]} tone={ROUTE_TONE[b.route]} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-ink-2">{b.owner}</td>
                    {/* the date, and how far away it is — a person reads the
                        second one and acts on it, the first one is the record */}
                    <td className="whitespace-nowrap px-3 py-1.5">
                      <span className={`mono block ${b.deadline < TODAY_SOURCING ? 'text-critical' : 'text-ink-3'}`}>{b.deadline}</span>
                      <span className={`mono block text-[10px] ${d.tone}`}>{d.text}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {rows.length === 0 && (
          <p className="px-4 py-3 text-[12px] text-ink-2">
            No lots match that.{' '}
            <button type="button" onClick={() => { setFilters({}); setQuery('') }}
              className="font-medium text-accent-ink hover:underline">
              Show all {blockedStock.length} →
            </button>
          </p>
        )}

        <Note foot label={`Why both marginals foot to ${lakh(total)}`}>
          Both marginals foot to {lakh(total)} — by age and by cause — which is the check that says the
          cross-tab is a real one rather than two separate stories about the same pile. Filtering the
          register never changes that total; it changes which part of it you are looking at, and the
          figure beside the search box says which part.
        </Note>
      </Card>

      <div className="grid items-start gap-3 lg:grid-cols-3">
        <Card index={3} className="lg:col-span-2" title="Deadlines that are actually near"
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
          <Note foot label="Why only these are listed">
            Only lots whose deadline is past or inside 45 days are listed — a date eleven months out is
            not a task. The two return-to-vendor lots are the urgent ones: that window shuts and the
            money converts from recoverable into a resale problem.
          </Note>
        </Card>

        <Card index={4} title="The other half of SRC-04" sub="this page is the cure; the desk is the prevention">
          <div className="p-3.5 text-[12px] leading-relaxed text-ink-2">
            <p>
              <strong className="text-ink">This page is the cure; the desk is the prevention.</strong>{' '}
              An order that would push cover past its ceiling for that item class is held there, with
              the arithmetic shown — never blocked, because a guardrail that cannot be overridden gets
              worked around within a week.
            </p>
            <a href="/sourcing/desk#guardrail"
               className="mt-1.5 inline-block text-[12px] font-medium text-accent-ink hover:underline">
              See the guardrail on the desk →
            </a>
          </div>
          <Note foot label="Every lot here was once an approval">
            <p>
              <strong className="text-ink">Every lot here was once an approval.</strong> Somebody bought
              a legitimate quantity for a legitimate reason and the job changed, or the minimum order
              was four times what the job needed.
            </p>
            <p className="mt-2">
              So the same system holds the next one: an order that would push cover past its ceiling for
              that item class is held on the desk, with the arithmetic shown. It is never blocked — a
              person can release it with a written reason, and the reason is stored against the line.
            </p>
            <p className="mt-2 text-ink-3">
              Override, never block. A guardrail that cannot be overridden gets worked around within a
              week, and then it is measuring nothing.
            </p>
          </Note>
        </Card>
      </div>
    </>
  )
}

export default function Page() {
  return <StageGate sample="the Sourcing dashboard"><PageBody /></StageGate>
}
