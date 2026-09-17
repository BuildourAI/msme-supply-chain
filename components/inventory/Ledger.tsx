'use client'
import { useEffect, useState } from 'react'
import { Button, Card, StatusPill } from '@/components/ui/bits'
import { Dialog } from '@/components/ui/Dialog'
import { HeadFilter, HeadSort } from '@/components/ui/HeadFilter'
import { Icon, type IconName } from '@/components/ui/icons'
import { Num } from '@/components/ui/Num'
import { money, num, qtyText, shortDate } from '@/lib/domain/format'
import { Note } from '@/components/ui/Note'
import { useInventory, type LotRow } from './store'

const USABILITY_LABEL: Record<string, string> = {
  usable: 'Usable', qc_hold: 'QC hold', damaged: 'Damaged', expired: 'Expired',
}

/* A state is a glyph and a word, never a glyph alone — §10. The glyph is what
   you find the row by; the word is what tells you what you found. */
const USABILITY_MARK: Record<string, { icon: IconName; cls: string }> = {
  usable: { icon: 'check', cls: 'text-good' },
  qc_hold: { icon: 'lock', cls: 'text-warn' },
  damaged: { icon: 'alert', cls: 'text-critical' },
  expired: { icon: 'clock', cls: 'text-warn' },
}

/* ------------------------------------------------------------- the counting */

function CountSheet() {
  const { counting, startCount, recordCount, policy } = useInventory()
  const [counted, setCounted] = useState('')
  const [note, setNote] = useState('')
  useEffect(() => { if (counting) { setCounted(String(counting.balance.value)); setNote('') } }, [counting])
  if (!counting) return null

  const r = counting
  const n = Number(counted)
  const ok = Number.isFinite(n) && n >= 0
  const variance = Math.round((n - r.balance.value) * 1000) / 1000
  const pct = r.balance.value === 0 ? 0 : Math.abs(variance / r.balance.value) * 100
  const overTol = pct > policy.countTolerancePct[r.cls]
  const needsNote = variance !== 0

  return (
    <Dialog open onClose={() => startCount(null)}
      title={`Count ${r.item.name}`}
      sub={`${r.lot.batchNo} · class ${r.cls}, counted every ${policy.countCadenceDays[r.cls]} days`}>
      <div className="space-y-3 px-4 py-4">
        <div className="rounded-md border border-line bg-surface-2 p-3">
          <p className="mono text-[10px] uppercase tracking-wider text-ink-3">The book says</p>
          <p className="num mt-0.5 text-[20px]">{num(r.balance.value, 3)} <span className="text-[13px] text-ink-3">{r.uom}</span></p>
          <p className="mt-0.5 text-[11.5px] text-ink-3">
            Last confirmed {shortDate(r.lastConfirmed.value)}, {r.sinceConfirmed.value} day
            {r.sinceConfirmed.value === 1 ? '' : 's'} ago.
          </p>
        </div>

        <label className="block text-[12.5px]">
          <span className="block text-ink-2">What is on the rack?</span>
          <input type="number" step="0.001" min={0} value={counted} onChange={(e) => setCounted(e.target.value)}
            className="num mt-1 w-36 rounded-md border border-line bg-surface px-2 py-1 outline-none focus:border-accent" />
          <span className="mono ml-2 text-[11.5px] text-ink-3">{r.uom}</span>
        </label>

        {variance !== 0 && ok && (
          <p className={`rounded-md border p-2.5 text-[12px] leading-relaxed text-ink-2 ${
            overTol ? 'border-critical/30 bg-critical-soft' : 'border-warn/30 bg-warn-soft'}`}>
            {variance > 0 ? 'Surplus' : 'Shortage'} of{' '}
            <strong className="text-ink">{qtyText(Math.abs(variance), r.uom)}</strong> —{' '}
            {num(pct, 2)}% against a class {r.cls} tolerance of {policy.countTolerancePct[r.cls]}%.
            {overTol && ' That is outside tolerance, so it escalates as well as posting.'}
            {variance < 0 && ' A shortage also lands on the loss ledger with a cause.'}
            {' '}The old balance is not overwritten — the variance posts as its own movement.
          </p>
        )}
        {variance === 0 && ok && (
          <p className="rounded-md border border-good/30 bg-good-soft p-2.5 text-[12px] leading-relaxed text-ink-2">
            Agreed with the book. Nothing moves, but the balance is confirmed as of today — which is the
            difference between a number you believe and a number you have checked.
          </p>
        )}

        <label className="block text-[12.5px]">
          <span className="block text-ink-2">
            Note {needsNote ? '' : <span className="text-ink-3">(optional)</span>}
          </span>
          <input value={note} onChange={(e) => setNote(e.target.value)}
            placeholder={variance < 0 ? 'Loose stock, no bin card' : variance > 0 ? 'Found behind the pallet' : 'Counted with the bin card'}
            className="mt-1 w-full rounded-md border border-line bg-surface px-2 py-1.5 outline-none focus:border-accent" />
        </label>

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={() => startCount(null)}>Cancel</Button>
          <Button variant="primary" disabled={!ok || (needsNote && note.trim().length < 3)}
            title={needsNote && note.trim().length < 3 ? 'A variance needs a note saying what you found' : undefined}
            onClick={() => recordCount(r, n, note.trim())}>
            Post the count
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

/* ------------------------------------------------------------ write-off ---- */

function WriteOffSheet({ row, onClose }: { row: LotRow | null; onClose: () => void }) {
  const { writeOff } = useInventory()
  const [qty, setQty] = useState('')
  const [note, setNote] = useState('')
  useEffect(() => { if (row) { setQty(String(row.balance.value)); setNote('') } }, [row])
  if (!row) return null
  const n = Number(qty)
  const ok = Number.isFinite(n) && n > 0 && n <= row.balance.value && note.trim().length > 3
  return (
    <Dialog open onClose={onClose} title={`Write off ${row.item.name}`}
      sub={`${row.lot.batchNo} · ${USABILITY_LABEL[row.lot.usability]} · ${row.lot.usabilityReason ?? ''}`}>
      <div className="space-y-3 px-4 py-4">
        <label className="block text-[12.5px]">
          <span className="block text-ink-2">Quantity to write off</span>
          <input type="number" step="0.001" min={0} max={row.balance.value} value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="num mt-1 w-36 rounded-md border border-line bg-surface px-2 py-1 outline-none focus:border-accent" />
          <span className="mono ml-2 text-[11.5px] text-ink-3">{row.uom} of {num(row.balance.value, 3)}</span>
        </label>
        <p className="rounded-md border border-critical/30 bg-critical-soft p-2.5 text-[12px] leading-relaxed text-ink-2">
          This costs <strong className="text-ink">{money((Number(qty) || 0) * row.item.lastPurchaseRate)}</strong> at
          the valuation basis. The quantity leaves the balance as a write-off movement and lands on the
          loss ledger as spoilage in store, with your reason attached.
        </p>
        <label className="block text-[12.5px]">
          <span className="block text-ink-2">Why is it being written off?</span>
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="Re-drying failed · beyond shelf life · damaged past repair"
            className="mt-1 w-full rounded-md border border-line bg-surface px-2 py-1.5 outline-none focus:border-accent" />
        </label>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="danger" disabled={!ok}
            onClick={() => { writeOff(row, n, note.trim()); onClose() }}>
            Write off {money((Number(qty) || 0) * row.item.lastPurchaseRate)}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

/* ------------------------------------------------------------- the tables -- */

/**
 * The stock ledger, as one line per lot.
 *
 * The question this table answers first is narrow — what is on the rack, is it
 * usable, what is it worth, is the figure trusted — so that is what a row shows,
 * on one line, with the actions that belong to it on the same line. Why a lot is
 * held, which documents built the balance, how often its class is counted: those
 * are one click down, on the row they belong to.
 *
 * The filters live in the headings rather than in a bar above them, because a
 * control on the column it filters says the column is filterable. The chips
 * above the table stay as the quick way in — they set the same filters, so the
 * two never disagree.
 *
 * Nothing is filtered out by default: the held and damaged lots are the ones
 * worth meeting first, so they are in the list from the start, tinted and
 * glyphed rather than hidden behind a control you would have to know to press.
 */
type FilterKey = 'material' | 'cls' | 'state' | 'confirmed'
type SortCol = 'lot' | 'value'

export function StockLedger() {
  const { stockRows, select, startCount, staleValue, accuracy, policy } = useInventory()
  const [writing, setWriting] = useState<LotRow | null>(null)
  const [filters, setFilters] = useState<Partial<Record<FilterKey, string>>>({})
  const [sort, setSort] = useState<{ col: SortCol; dir: 'asc' | 'desc' } | null>(null)
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const stale = stockRows.filter((r) => r.stale)

  const setF = (k: FilterKey, v?: string) => setFilters((f) => ({ ...f, [k]: v }))
  const clear = () => { setFilters({}); setQuery('') }
  const active = Object.values(filters).filter(Boolean).length + (query.trim() ? 1 : 0)

  const q = query.trim().toLowerCase()
  const matches = (r: LotRow) =>
    (!filters.material || r.item.id === filters.material) &&
    (!filters.cls || r.cls === filters.cls) &&
    (!filters.state || r.lot.usability === filters.state) &&
    (!filters.confirmed || (filters.confirmed === 'stale' ? r.stale : !r.stale)) &&
    (!q || `${r.item.code} ${r.item.name} ${r.lot.batchNo} ${r.lot.usabilityReason ?? ''}`.toLowerCase().includes(q))

  const shown = stockRows.filter(matches)
  if (sort) {
    const d = sort.dir === 'asc' ? 1 : -1
    shown.sort((a, b) => sort.col === 'value'
      ? (a.value.value - b.value.value) * d
      : a.lot.batchNo.localeCompare(b.lot.batchNo) * d)
  }

  /* Three states, in the order a reader expects: the way round that column is
     usually wanted, then the other way, then back to the ledger's own order.
     Money starts dearest-first; a batch number starts A to Z. */
  const toggleSort = (col: SortCol) => setSort((s) => {
    const natural: 'asc' | 'desc' = col === 'value' ? 'desc' : 'asc'
    if (s?.col !== col) return { col, dir: natural }
    if (s.dir === natural) return { col, dir: natural === 'asc' ? 'desc' : 'asc' }
    return null
  })

  /* every option says what it will show, counted off the other filters that are
     already on — a menu that offers a choice leading to an empty table is a
     menu that made you click to find that out */
  const others = (k: FilterKey) => stockRows.filter((r) => {
    const f = { ...filters, [k]: undefined }
    return (!f.material || r.item.id === f.material) && (!f.cls || r.cls === f.cls) &&
      (!f.state || r.lot.usability === f.state) &&
      (!f.confirmed || (f.confirmed === 'stale' ? r.stale : !r.stale)) &&
      (!q || `${r.item.code} ${r.item.name} ${r.lot.batchNo}`.toLowerCase().includes(q))
  })

  const materialOptions = Array.from(new Map(stockRows.map((r) => [r.item.id, r.item])).values())
    .map((it) => ({
      value: it.id, label: it.name,
      meta: `${others('material').filter((r) => r.item.id === it.id).length} lots`,
    }))
    .filter((o) => !o.meta.startsWith('0 '))
  const classOptions = (['A', 'B', 'C'] as const).map((c) => ({
    value: c, label: `Class ${c} · counted every ${policy.countCadenceDays[c]} days`,
    meta: `${others('cls').filter((r) => r.cls === c).length} lots`,
  })).filter((o) => !o.meta.startsWith('0 '))
  const stateOptions = (['usable', 'qc_hold', 'damaged', 'expired'] as const).map((u) => ({
    value: u, label: USABILITY_LABEL[u],
    meta: `${others('state').filter((r) => r.lot.usability === u).length} lots`,
  })).filter((o) => !o.meta.startsWith('0 '))
  const confirmedOptions = [
    { value: 'fresh', label: 'Inside its counting cadence', meta: `${others('confirmed').filter((r) => !r.stale).length} lots` },
    { value: 'stale', label: 'Past its cadence — unconfirmed', meta: `${others('confirmed').filter((r) => r.stale).length} lots` },
  ].filter((o) => !o.meta.startsWith('0 '))

  const chip = (k: FilterKey, v: string, label: string, n: number,
                tone: 'critical' | 'warn' | 'neutral', icon?: IconName) => (
    <button key={`${k}-${v}`} type="button" onClick={() => setF(k, filters[k] === v ? undefined : v)}
      aria-pressed={filters[k] === v}
      title={filters[k] === v ? 'Showing only these lots — click for every lot' : `Show only the ${label} lots`}
      className={`press inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
        filters[k] === v ? 'border-accent bg-accent-soft text-accent-ink'
        : tone === 'critical' ? 'border-critical/40 bg-critical-soft text-ink-2 hover:border-critical'
        : tone === 'warn' ? 'border-warn/40 bg-warn-soft text-ink-2 hover:border-warn'
        : 'border-line text-ink-2 hover:bg-surface-2'}`}>
      {icon && <Icon name={icon} className="size-3 shrink-0" />}
      {n} {label}
    </button>
  )

  return (
    <>
      <Card index={1} title="Stock truth" live
        sub="INV-01 · every quantity is the sum of its movements — click a lot for why it is where it is"
        actions={<span className="flex flex-wrap gap-x-4 text-[12px] text-ink-3">
          <span>Record accuracy <Num d={accuracy} format="raw" dp={1} suffix="%" /></span>
          <span>Unconfirmed <Num d={staleValue} format="money"
            tone={staleValue.value > 0 ? 'warn' : 'good'} /></span>
        </span>}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 px-3 pb-1.5 pt-2.5">
          <label className="relative shrink-0">
            <Icon name="search" className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-ink-4" />
            <input value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Search" aria-label="Search materials and lots"
              className="w-32 rounded-md border border-line bg-surface-2 py-1 pl-7 pr-2 text-[12px] outline-none focus:border-accent" />
          </label>
          {chip('state', 'qc_hold', 'on QC hold', stockRows.filter((r) => r.lot.usability === 'qc_hold').length, 'warn', 'lock')}
          {chip('state', 'damaged', 'damaged', stockRows.filter((r) => r.lot.usability === 'damaged').length, 'critical', 'alert')}
          {chip('confirmed', 'stale', 'unconfirmed', stale.length, 'warn', 'clock')}
          {active > 0 && (
            <button type="button" onClick={clear}
              className="press text-[11px] text-ink-3 underline underline-offset-2 hover:text-ink">
              Show every lot
            </button>
          )}
          <span className="mono ml-auto text-[10.5px] text-ink-3">
            showing {shown.length} of {stockRows.length}
          </span>
        </div>

        <div className="scroll-x relative overflow-x-auto px-3 pb-2">
          <table className="w-full min-w-[62rem] border-collapse text-[12px]">
            <thead>
              <tr className="mono border-b border-line text-left text-[9.5px] uppercase tracking-wider text-ink-3">
                <th className="w-6 py-1 pl-2 pr-1" />
                <th className="whitespace-nowrap py-1 pr-2 font-normal">
                  <HeadFilter label="Material" options={materialOptions} value={filters.material}
                    onPick={(v) => setF('material', v)} allLabel="Every material"
                    allMeta={`${others('material').length} lots`} className="uppercase tracking-wider" />
                </th>
                <th className="whitespace-nowrap py-1 pr-2 font-normal">
                  <HeadSort label="Lot" active={sort?.col === 'lot'} dir={sort?.dir ?? 'asc'}
                    onSort={() => toggleSort('lot')} title="Sort by batch number"
                    className="uppercase tracking-wider" />
                </th>
                <th className="whitespace-nowrap py-1 pr-2 font-normal">
                  <HeadFilter label="Class" options={classOptions} value={filters.cls}
                    onPick={(v) => setF('cls', v)} allLabel="Every class"
                    allMeta={`${others('cls').length} lots`} className="uppercase tracking-wider" />
                </th>
                <th className="whitespace-nowrap py-1 pr-2 font-normal">
                  <HeadFilter label="State" options={stateOptions} value={filters.state}
                    onPick={(v) => setF('state', v)} allLabel="Every state"
                    allMeta={`${others('state').length} lots`} className="uppercase tracking-wider" />
                </th>
                <th className="whitespace-nowrap py-1 pl-4 pr-2 text-right font-normal"
                  title="Not sortable on purpose: these lots are held in metres, tonnes, kilograms and pieces, and ranking 340 m against 620 nos would be arithmetic on nothing. Sort by value instead.">
                  Balance
                </th>
                <th className="whitespace-nowrap py-1 pl-4 pr-2 text-right font-normal">
                  <HeadSort label="Value ₹" active={sort?.col === 'value'} dir={sort?.dir ?? 'desc'}
                    onSort={() => toggleSort('value')}
                    title="Sort by what the lot is worth — balance at last purchase rate, ex-freight"
                    className="uppercase tracking-wider" />
                </th>
                <th className="whitespace-nowrap py-1 pr-2 text-center font-normal">Docs</th>
                <th className="whitespace-nowrap py-1 pr-2 font-normal">
                  <HeadFilter label="Confirmed" options={confirmedOptions} value={filters.confirmed}
                    onPick={(v) => setF('confirmed', v)} allLabel="Confirmed or not"
                    allMeta={`${others('confirmed').length} lots`} className="uppercase tracking-wider" />
                </th>
                <th className="w-full whitespace-nowrap py-1 pr-2 text-right font-normal">Action</th>
              </tr>
            </thead>

            {shown.map((r) => {
              const good = r.lot.usability === 'usable'
              const mark = USABILITY_MARK[r.lot.usability] ?? USABILITY_MARK.usable
              const open = openId === r.lot.id
              const toggle = () => setOpenId(open ? null : r.lot.id)
              return (
                <tbody key={r.lot.id} className={`border-b border-line-soft ${
                  open ? 'bg-surface-2/60' : good ? '' : 'bg-warn-soft/25'}`}>
                  <tr onClick={toggle} className={`cursor-pointer transition-colors ${open ? '' : 'hover:bg-surface-2'}`}>
                    <td className="py-1 pl-2 pr-1">
                      <button type="button" aria-expanded={open}
                        onClick={(e) => { e.stopPropagation(); toggle() }}
                        title={`${open ? 'Hide' : 'Show'} what is behind ${r.lot.batchNo}`}
                        className="press flex size-5 items-center justify-center rounded text-ink-3 hover:text-ink">
                        <Icon name="chevron" className={`size-3.5 transition-transform duration-200 ${open ? 'rotate-90' : ''}`} />
                        <span className="sr-only">{open ? 'Hide' : 'Show'} the detail for {r.lot.batchNo}</span>
                      </button>
                    </td>

                    <td className="max-w-[24rem] py-1 pr-2">
                      <span className="flex items-baseline gap-1.5">
                        <span className="min-w-0 truncate" title={r.item.name}>{r.item.name}</span>
                        <span className="mono shrink-0 text-[10.5px] text-ink-3">{r.item.code}</span>
                      </span>
                    </td>

                    <td className="mono whitespace-nowrap py-1 pr-2 text-[11px] text-ink-2">{r.lot.batchNo}</td>

                    <td className="whitespace-nowrap py-1 pr-2">
                      <span className="mono text-[11px] text-ink-3"
                        title={`Class ${r.cls} — counted every ${policy.countCadenceDays[r.cls]} days, tolerance ${policy.countTolerancePct[r.cls]}%`}>
                        {r.cls}
                      </span>
                    </td>

                    <td className="whitespace-nowrap py-1 pr-2">
                      <span className="inline-flex items-center gap-1.5" title={r.lot.usabilityReason ?? undefined}>
                        <Icon name={mark.icon} className={`size-3.5 shrink-0 ${mark.cls}`} />
                        <span className={good ? 'text-ink-3' : 'text-ink-2'}>{USABILITY_LABEL[r.lot.usability]}</span>
                      </span>
                    </td>

                    <td className="num whitespace-nowrap py-1 pl-4 pr-2 text-right">
                      <Num d={r.balance} format="raw" dp={3} suffix={` ${r.uom}`} size="sm" />
                    </td>

                    <td className="num whitespace-nowrap py-1 pl-4 pr-2 text-right">
                      <Num d={r.value} format="money" size="sm" tone={good ? undefined : 'warn'} />
                    </td>

                    <td className="py-1 pr-2 text-center">
                      <button type="button" onClick={(e) => { e.stopPropagation(); select(r.lot.id) }}
                        aria-label={`${r.movements.length} documents behind ${r.lot.batchNo}`}
                        title={`Every document behind this balance — ${r.movements.length} of them`}
                        className="press inline-flex items-center gap-1 rounded text-[11.5px] text-accent-ink hover:underline">
                        <Icon name="doc" className="size-3.5 shrink-0" />
                        <span className="num">{r.movements.length}</span>
                      </button>
                    </td>

                    <td className="whitespace-nowrap py-1 pr-2">
                      {r.stale ? (
                        <span className="inline-flex items-center gap-1 text-[11.5px] text-warn"
                          title={`Last confirmed ${shortDate(r.lastConfirmed.value)}. Class ${r.cls} wants a count every ${policy.countCadenceDays[r.cls]} days.`}>
                          <Icon name="clock" className="size-3.5 shrink-0" />
                          <span className="num">{r.sinceConfirmed.value}d</span>
                          <span>unconfirmed</span>
                        </span>
                      ) : (
                        <span className="text-[11.5px] text-ink-3">
                          <span className="mono">{shortDate(r.lastConfirmed.value)}</span> · {r.sinceConfirmed.value}d
                        </span>
                      )}
                    </td>

                    <td className="whitespace-nowrap py-1 pr-2 text-right" onClick={(e) => e.stopPropagation()}>
                      <span className="inline-flex gap-1.5">
                        <Button size="sm" onClick={() => startCount(r.lot.id)}>Count</Button>
                        {!good && (
                          <Button size="sm" variant="ghost" onClick={() => setWriting(r)}>Write off</Button>
                        )}
                      </span>
                    </td>
                  </tr>

                  <tr hidden={!open}>
                    <td colSpan={10} className="px-3 pb-2.5 pt-0.5">
                      <p className="flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-ink-3">
                        <span>
                          Valued <Num d={r.value} format="money" size="sm" /> at last purchase rate, ex-freight
                        </span>
                        <span>
                          Class {r.cls} · counted every {policy.countCadenceDays[r.cls]} days ·
                          tolerance {policy.countTolerancePct[r.cls]}%
                        </span>
                        <span>Last confirmed <span className="mono">{shortDate(r.lastConfirmed.value)}</span></span>
                        <span>{r.counts.length} count{r.counts.length === 1 ? '' : 's'} on file</span>
                        <button type="button" onClick={() => select(r.lot.id)}
                          className="press text-accent-ink underline underline-offset-2 hover:no-underline">
                          See the {r.movements.length} documents behind this balance
                        </button>
                      </p>

                      {r.lot.usabilityReason && (
                        <p className={`mt-1.5 rounded-md border p-2 text-[12px] leading-relaxed text-ink-2 ${
                          r.lot.usability === 'damaged' ? 'border-critical/30 bg-critical-soft' : 'border-warn/30 bg-warn-soft'}`}>
                          <strong className="text-ink">{USABILITY_LABEL[r.lot.usability]}.</strong>{' '}
                          {r.lot.usabilityReason}. It stays on the books at{' '}
                          {money(r.value.value)} and out of cover until somebody decides what happens to it.
                        </p>
                      )}

                      {r.stale && (
                        <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-2">
                          Nobody has physically confirmed this balance for{' '}
                          <Num d={r.sinceConfirmed} format="days" dp={0} size="sm" suffix=" days" tone="warn" />,
                          past the {policy.countCadenceDays[r.cls]}-day cadence for class {r.cls}. That does not
                          make it wrong — it makes it unverified, which is a different thing.
                        </p>
                      )}
                    </td>
                  </tr>
                </tbody>
              )
            })}
          </table>

          {shown.length === 0 && (
            <p className="px-1 py-4 text-center text-[12.5px] text-ink-2">
              No lot matches that. <button type="button" onClick={clear}
                className="text-accent-ink underline underline-offset-2">Show every lot</button>
            </p>
          )}
        </div>

        {stale.length > 0 && (
          <Note foot label="Which balances are past their counting cadence">
            <strong className="text-ink">
              {stale.length === 1 ? 'One balance is' : `${stale.length} balances are`} past the counting
              cadence for their class
            </strong>{' '}
            — {money(staleValue.value)} of stock nobody has physically confirmed. That is not stock that is
            wrong; it is stock that is unverified, and knowing the difference is the whole of “live and
            accurate”. Count one and watch the figure move.
            {stale.every((r) => r.lot.usability !== 'usable') && (
              <> It is also, exactly, the non-usable total on the Sourcing Desk — not a coincidence worth
              hiding: the lots nobody counts are the lots nobody can use. They sit in a corner, never come
              up on a job, and so never get looked at.</>
            )}
          </Note>
        )}
      </Card>

      <CountSheet />
      <WriteOffSheet row={writing} onClose={() => setWriting(null)} />
    </>
  )
}

export function CountHistory() {
  const { countRows, accuracy, policy } = useInventory()
  return (
    <Card index={2} title="Cycle counts" live
      sub="A variance is posted, never overwritten — so “how often is the book right” becomes answerable">
      <div className="scroll-x overflow-x-auto">
        <table className="w-full min-w-[44rem] border-collapse text-[12.5px]">
          <thead className="bg-surface-2">
            <tr className="text-[11px] uppercase tracking-wide text-ink-3">
              {['Count', 'Date', 'Material', 'Counted', 'Book', 'Variance', 'Against tolerance'].map((h, i) => (
                <th key={h} className={`whitespace-nowrap border-b border-line px-3 py-2 font-medium ${
                  i >= 3 && i <= 5 ? 'text-right' : 'text-left'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {countRows.map((r) => (
              <tr key={r.count.id} className="border-b border-line-soft">
                <td className="mono whitespace-nowrap px-3 py-2 text-[11.5px]">{r.count.id}</td>
                <td className="whitespace-nowrap px-3 py-2 text-ink-3">{shortDate(r.count.on)}</td>
                <td className="px-3 py-2">
                  <span className="mono text-[11px] text-ink-3">{r.item.code}</span>
                  {r.count.note && <span className="block text-[11px] italic text-ink-3">“{r.count.note}”</span>}
                </td>
                <td className="num px-3 py-2 text-right">{num(r.count.countedQty, 3)}</td>
                <td className="num px-3 py-2 text-right text-ink-3">{num(r.count.bookQty, 3)}</td>
                <td className={`num px-3 py-2 text-right ${r.variance.value === 0 ? 'text-ink-3' : r.variance.value > 0 ? 'text-good' : 'text-critical'}`}>
                  <Num d={r.variance} format="raw" dp={3} />
                </td>
                <td className="px-3 py-2">
                  {r.variance.value === 0
                    ? <StatusPill tone="good" label="Agreed with the book" />
                    : r.overTolerance
                      ? <StatusPill tone="critical" label={`Outside the ${policy.countTolerancePct[r.cls]}% class ${r.cls} tolerance`} />
                      : <StatusPill tone="warn" label={`Inside the ${policy.countTolerancePct[r.cls]}% class ${r.cls} tolerance`} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Note foot label="What “record accuracy” measures, and what it does not">
        Record accuracy is {num(accuracy.value, 1)}% — counts that came in inside their class tolerance,
        over counts taken. It is deliberately not “is the stock right”, which nobody can answer. It is
        “how often is the book right when somebody checks”, which is measurable and which moves.
      </Note>
    </Card>
  )
}
