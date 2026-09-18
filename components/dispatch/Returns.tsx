'use client'
import { useEffect, useState } from 'react'
import { Button, Card, Pill } from '@/components/ui/bits'
import { Dialog } from '@/components/ui/Dialog'
import { HeadFilter, HeadSort } from '@/components/ui/HeadFilter'
import { Icon, type IconName } from '@/components/ui/icons'
import { Num } from '@/components/ui/Num'
import { daysBetween } from '@/lib/domain/calc'
import { num, shortDate } from '@/lib/domain/format'
import type { RmaRow } from '@/lib/domain/dispatch'
import { Note } from '@/components/ui/Note'
import { useDispatch } from './store'

/**
 * DSP-04 · reverse logistics.
 *
 * Half of this was already built and nobody noticed: the INB-01 gate takes
 * goods in against a spec, and a customer return is goods coming in. What was
 * missing is the record that says a return is EXPECTED — with an owner and a
 * deadline — so that a return stops being a phone call somebody remembers.
 *
 * The authorisation is therefore deliberately thin. It does not re-implement
 * inspection, it does not decide a refund, and it does not touch the customer's
 * account. It says: these goods, this many, this reason, this person, by this
 * date. Everything after that is machinery that already exists.
 */
function AuthoriseDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { consignmentRows, authoriseReturn } = useDispatch()
  const delivered = consignmentRows.filter((r) => r.delivered)
  const [dnNo, setDnNo] = useState('')
  const [qty, setQty] = useState('1')
  const [reason, setReason] = useState('')

  useEffect(() => {
    if (!open) return
    setDnNo(delivered[0]?.note.dnNo ?? ''); setQty('1'); setReason('')
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null
  const row = delivered.find((r) => r.note.dnNo === dnNo)
  const shipped = row ? row.note.lines.reduce((a, l) => a + l.qty, 0) : 0
  const n = Number(qty) || 0
  const ok = !!row && n > 0 && n <= shipped && reason.trim().length > 4

  return (
    <Dialog open onClose={onClose} title="Authorise a return"
      sub="An owner and a deadline — the half of reverse logistics this build was missing">
      <div className="space-y-3 px-4 py-4">
        <label className="block text-[12.5px]">
          <span className="block text-ink-2">Against which despatch</span>
          <select value={dnNo} onChange={(e) => setDnNo(e.target.value)}
            className="mt-1 w-full rounded-md border border-line bg-surface px-2 py-1.5 text-[12.5px] outline-none focus:border-accent">
            {delivered.map((r) => (
              <option key={r.note.dnNo} value={r.note.dnNo}>
                {r.note.dnNo} — {r.customer.name}, delivered {r.consignment.deliveredOn}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-[12.5px]">
          <span className="block text-ink-2">
            Quantity coming back {row && <span className="text-ink-3">({num(shipped, 0)} went out)</span>}
          </span>
          <input type="number" step="1" min={1} value={qty} onChange={(e) => setQty(e.target.value)}
            className="num mt-1 w-full rounded-md border border-line bg-surface px-2 py-1.5 outline-none focus:border-accent" />
        </label>
        <label className="block text-[12.5px]">
          <span className="block text-ink-2">Reason</span>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
            placeholder="Dented in transit · wrong variant · failed at the customer's incoming check"
            className="mt-1 w-full rounded-md border border-line bg-surface px-2 py-1.5 text-[12.5px] outline-none focus:border-accent" />
        </label>
        {n > shipped && (
          <p className="rounded-md border border-critical/30 bg-critical-soft px-3 py-2 text-[12px] text-critical">
            More than went out on that note. {num(shipped, 0)} were despatched.
          </p>
        )}
        <p className="text-[11.5px] leading-relaxed text-ink-3">
          The goods come home through the inbound gate, with the same spec checks a purchase gets. This
          record exists so that somebody owns the return and there is a date it can be late against.
        </p>
      </div>
      <footer className="flex items-center gap-2 border-t border-line-soft px-4 py-3">
        <Button onClick={onClose}>Not now</Button>
        <span className="ml-auto" />
        <Button variant="primary" disabled={!ok}
          onClick={() => { authoriseReturn(row!, n, reason.trim()); onClose() }}>
          Authorise the return
        </Button>
      </footer>
    </Dialog>
  )
}
/* ------------------------------------------------------------ the RMA row -- */

/**
 * Where the return actually is, in one badge.
 *
 * `Status` used to be a pill repeating in a sentence what the columns beside it
 * already said, with the GRN printed a second time three cells along. It is one
 * badge now: a glyph so the state is findable down the column, the word beside
 * it because a colour never carries a meaning on its own, and — once the goods
 * are physically back — the gate reference they came in through, which is the
 * proof and belongs on the face rather than in a fold.
 */
type RmaState = 'closed' | 'received' | 'overdue' | 'authorised'

const stateOf = (r: RmaRow): RmaState =>
  r.rma.state === 'closed' ? 'closed'
    : r.rma.state === 'received' ? 'received'
      : r.overdue ? 'overdue' : 'authorised'

const RMA_STATE_LABEL: Record<RmaState, string> = {
  closed: 'Back in stock',
  received: 'Received at the gate',
  overdue: 'Authorised, overdue',
  authorised: 'Authorised, not back yet',
}

/** a count of days that reads right at one of them */
const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`

function RmaRowView({ r, today, open, onToggle }: {
  r: RmaRow; today: string; open: boolean; onToggle: () => void
}) {
  const { receiveReturn } = useDispatch()
  const st = stateOf(r)
  const pastDue = daysBetween(r.rma.dueBy, today)

  return (
    <tbody className={`border-b border-line-soft ${
      open ? 'bg-surface-2/60' : st === 'overdue' ? 'bg-critical-soft/25' : ''}`}>
      <tr onClick={onToggle} className={`cursor-pointer transition-colors ${open ? '' : 'hover:bg-surface-2'}`}>
        <td className="py-1 pl-2 pr-1">
          <button type="button" aria-expanded={open}
            onClick={(e) => { e.stopPropagation(); onToggle() }}
            title={`${open ? 'Hide' : 'Show'} why these goods are coming back`}
            className="press flex size-5 items-center justify-center rounded text-ink-3 hover:text-ink">
            <Icon name="chevron" className={`size-3.5 transition-transform duration-200 ${open ? 'rotate-90' : ''}`} />
            <span className="sr-only">{open ? 'Hide' : 'Show'} the detail for {r.rma.rmaNo}</span>
          </button>
        </td>

        <td className="mono whitespace-nowrap py-1 pr-2 text-[11.5px]">{r.rma.rmaNo}</td>

        <td className="max-w-[12rem] py-1 pr-2">
          <span className="block truncate" title={r.customer.name}>{r.customer.name}</span>
        </td>

        <td className="py-1 pr-2">
          <span className="flex items-baseline gap-1.5 whitespace-nowrap">
            <span className="text-ink-2">{r.fg.name}</span>
            <span className="mono text-[10.5px] text-ink-3">{r.fg.code}</span>
          </span>
        </td>

        <td className="num whitespace-nowrap py-1 pl-4 pr-2 text-right">{num(r.rma.qty, 0)} {r.fg.uom}</td>

        <td className="num whitespace-nowrap py-1 pl-4 pr-2 text-right">
          <Num d={r.value} format="money" size="sm" />
        </td>

        <td className="max-w-[9rem] py-1 pr-2">
          <span className="block truncate text-ink-2" title={`${r.rma.owner} owns this return`}>
            {r.rma.owner}
          </span>
        </td>

        <td className={`mono whitespace-nowrap py-1 pr-2 text-[11px] ${
          st === 'overdue' ? 'text-critical' : 'text-ink-3'}`}>
          {shortDate(r.rma.dueBy)}
        </td>

        {/* where the goods are: promised back, past the promise, at the gate, or on the shelf */}
        <td className="whitespace-nowrap py-1 pl-4 pr-2">
          {st === 'closed' ? (
            <span className="inline-flex items-center gap-1.5"
              title={`Booked in through ${r.rma.grnRef} on ${shortDate(r.rma.receivedOn!)} — checked against the spec and back on the shelf.`}>
              <Icon name="check" className="size-3.5 shrink-0 text-good" />
              <span className="text-ink-2">back in stock</span>
              <span className="mono text-[10.5px] text-ink-3">{r.rma.grnRef}</span>
            </span>
          ) : st === 'received' ? (
            <span className="inline-flex items-center gap-1.5"
              title={`Through the inbound gate on ${r.rma.grnRef}, getting the same spec checks a purchase does.`}>
              <Icon name="tray" className="size-3.5 shrink-0 text-accent-ink" />
              <span className="text-ink-2">at the gate</span>
              <span className="mono text-[10.5px] text-ink-3">{r.rma.grnRef}</span>
            </span>
          ) : st === 'overdue' ? (
            <span className="inline-flex items-center gap-1.5"
              title={`Authorised ${shortDate(r.rma.raisedOn)}, due back ${shortDate(r.rma.dueBy)} — and nobody has chased it.`}>
              <Icon name="alert" className="size-3.5 shrink-0 text-critical" />
              <span className="text-critical">overdue</span>
              <span className="num text-critical">{pastDue} d past</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5"
              title="Authorised and inside its deadline — expected back, with somebody's name on it.">
              <Icon name="clock" className="size-3.5 shrink-0 text-warn" />
              <span className="text-ink-2">not back yet</span>
            </span>
          )}
        </td>

        <td className="w-full whitespace-nowrap py-1 pr-2 text-right" onClick={(e) => e.stopPropagation()}>
          {r.rma.state === 'authorised' && (
            <Button size="sm" onClick={() => receiveReturn(r)}>Book in at the gate</Button>
          )}
        </td>
      </tr>

      <tr hidden={!open}>
        <td colSpan={10} className="px-3 pb-2.5 pt-0.5">
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-ink-3">
            <span>Went out on <span className="mono">{r.rma.dnNo}</span></span>
            <span>Against <span className="mono">{r.rma.soNo}</span></span>
            <span>Authorised <span className="mono">{shortDate(r.rma.raisedOn)}</span> by {r.rma.owner}</span>
            <span className="num">{days(r.daysOut)} out</span>
            {r.rma.receivedOn && (
              <span>Back <span className="mono">{shortDate(r.rma.receivedOn)}</span> through{' '}
                <span className="mono">{r.rma.grnRef}</span></span>
            )}
          </p>

          <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-2">
            <span className="text-ink">Reason:</span> {r.rma.reason}.{' '}
            {st === 'closed' ? (
              <>Booked in against the spec at the inbound gate, so the quantity is stock again and the
              reason is attached to the product rather than to a phone call.</>
            ) : st === 'received' ? (
              <>At the gate now, going through the same checks a purchase gets. It becomes stock when
              that receipt closes, not when it arrives in the yard.</>
            ) : st === 'overdue' ? (
              <>Promised back by {shortDate(r.rma.dueBy)} and {days(pastDue)} past it. That is the state a
              phone call cannot hold, which is exactly why the authorisation carries a date.</>
            ) : (
              <>Due back by {shortDate(r.rma.dueBy)}, with {r.rma.owner} accountable for it. Valued at
              what it cost to build, never at what it was sold for — a return is not a lost sale until
              somebody refunds it.</>
            )}
          </p>
        </td>
      </tr>
    </tbody>
  )
}

type RmaFilterKey = 'customer' | 'state'
type RmaSortCol = 'value' | 'due'

export function ReturnsRegister() {
  const { rmaRows, rmaRate, shippedUnits, today } = useDispatch()
  const [open, setOpen] = useState(false)
  const [filters, setFilters] = useState<Partial<Record<RmaFilterKey, string>>>({})
  const [sort, setSort] = useState<{ col: RmaSortCol; dir: 'asc' | 'desc' } | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)

  const setF = (k: RmaFilterKey, v?: string) => setFilters((f) => ({ ...f, [k]: v }))
  const clear = () => setFilters({})
  const active = Object.values(filters).filter(Boolean).length

  const matches = (r: RmaRow, f: Partial<Record<RmaFilterKey, string>>) =>
    (!f.customer || r.customer.id === f.customer) &&
    (!f.state || stateOf(r) === f.state)

  const all = rmaRows.filter((r) => matches(r, filters))
  if (sort) {
    const d = sort.dir === 'asc' ? 1 : -1
    all.sort((a, b) => sort.col === 'value'
      ? ((a.value.value as number) - (b.value.value as number)) * d
      : a.rma.dueBy.localeCompare(b.rma.dueBy) * d)
  }
  const shown = all.slice(0, 14)

  /* The deadline starts with the soonest, because that is the one somebody has
     to chase; money starts with the dearest. A third click restores the
     register's own order, newest authorisation first. */
  const toggleSort = (col: RmaSortCol) => setSort((s) => {
    const natural: 'asc' | 'desc' = col === 'value' ? 'desc' : 'asc'
    if (s?.col !== col) return { col, dir: natural }
    if (s.dir === natural) return { col, dir: natural === 'asc' ? 'desc' : 'asc' }
    return null
  })

  /* Each option is counted with its own filter lifted and the others still on,
     so no choice in a menu leads to an empty table. */
  const others = (k: RmaFilterKey) => rmaRows.filter((r) => matches(r, { ...filters, [k]: undefined }))
  const countWhere = (k: RmaFilterKey, pred: (r: RmaRow) => boolean) => others(k).filter(pred).length

  const customerOptions = Array.from(new Map(rmaRows.map((r) => [r.customer.id, r.customer])).values())
    .map((c) => ({ value: c.id, label: c.name,
      meta: `${countWhere('customer', (r) => r.customer.id === c.id)} returns` }))
    .filter((o) => !o.meta.startsWith('0 '))
  const stateOptions = (['overdue', 'authorised', 'received', 'closed'] as RmaState[])
    .map((v) => ({ value: v, label: RMA_STATE_LABEL[v],
      meta: `${countWhere('state', (r) => stateOf(r) === v)} returns` }))
    .filter((o) => !o.meta.startsWith('0 '))

  const openOnes = rmaRows.filter((r) => r.rma.state !== 'closed')
  const overdueOnes = rmaRows.filter((r) => stateOf(r) === 'overdue')

  const chip = (v: RmaState | 'open', label: string, n: number, icon: IconName,
                tone: 'critical' | 'warn' | 'neutral') => {
    if (n === 0) return null
    const on = v !== 'open' && filters.state === v
    return (
      <button key={v} type="button"
        onClick={() => setF('state', v === 'open' ? 'authorised' : on ? undefined : v)}
        aria-pressed={on}
        title={on ? 'Showing only these returns — click for every return' : `Show only the ${label} returns`}
        className={`press inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
          on ? 'border-accent bg-accent-soft text-accent-ink'
          : tone === 'critical' ? 'border-critical/40 bg-critical-soft text-ink-2 hover:border-critical'
          : tone === 'warn' ? 'border-warn/40 bg-warn-soft text-ink-2 hover:border-warn'
          : 'border-line text-ink-2 hover:bg-surface-2'}`}>
        <Icon name={icon} className="size-3 shrink-0" />
        {n} {label}
      </button>
    )
  }

  return (
    <Card index={0} title="Return authorisations" live
      sub="A return with an owner and a deadline, instead of a phone call"
      actions={<>
        <span className="text-[12px] text-ink-3">
          RMA rate <Num d={rmaRate} format="raw" dp={2} suffix="%" tone={(rmaRate.value as number) > 1 ? 'warn' : 'good'} />
          {' '}on {num(shippedUnits, 0)} shipped
        </span>
        <Button size="sm" variant="primary" onClick={() => setOpen(true)}>Authorise a return</Button>
      </>}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 px-3 pb-1.5 pt-2.5">
        {chip('overdue', 'overdue', overdueOnes.length, 'alert', 'critical')}
        {chip('authorised', 'open', openOnes.length - overdueOnes.length, 'clock', 'warn')}
        {openOnes.length === 0 && <Pill tone="good">nothing outstanding</Pill>}
        <Pill tone="neutral" mono>valued at cost, never at the selling price</Pill>
        {active > 0 && (
          <button type="button" onClick={clear}
            className="press text-[11px] text-ink-3 underline underline-offset-2 hover:text-ink">
            Show every return
          </button>
        )}
        <span className="mono ml-auto text-[10.5px] text-ink-3">
          showing {shown.length} of {rmaRows.length}
        </span>
      </div>

      <div className="scroll-x relative overflow-x-auto px-3 pb-2">
        <table className="w-full min-w-[56rem] border-collapse text-[12px]">
          <thead>
            <tr className="mono border-b border-line text-left text-[9.5px] uppercase tracking-wider text-ink-3">
              <th className="w-6 py-1 pl-2 pr-1" />
              <th className="whitespace-nowrap py-1 pr-2 font-normal">RMA</th>
              <th className="whitespace-nowrap py-1 pr-2 font-normal">
                <HeadFilter label="Customer" options={customerOptions} value={filters.customer}
                  onPick={(v) => setF('customer', v)} allLabel="Every customer"
                  allMeta={`${others('customer').length} returns`} className="uppercase tracking-wider" />
              </th>
              <th className="whitespace-nowrap py-1 pr-2 font-normal">Product</th>
              <th className="whitespace-nowrap py-1 pl-4 pr-2 text-right font-normal">Qty</th>
              <th className="whitespace-nowrap py-1 pl-4 pr-2 text-right font-normal">
                <HeadSort label="Value ₹" active={sort?.col === 'value'} dir={sort?.dir ?? 'desc'}
                  onSort={() => toggleSort('value')} title="Sort by what the return is worth at cost"
                  className="uppercase tracking-wider" />
              </th>
              <th className="whitespace-nowrap py-1 pr-2 font-normal">Owner</th>
              <th className="whitespace-nowrap py-1 pr-2 font-normal">
                <HeadSort label="Due back" active={sort?.col === 'due'} dir={sort?.dir ?? 'asc'}
                  onSort={() => toggleSort('due')} title="Sort by the deadline the customer was given"
                  className="uppercase tracking-wider" />
              </th>
              <th className="whitespace-nowrap py-1 pl-4 pr-2 font-normal">
                <HeadFilter label="Status" options={stateOptions} value={filters.state}
                  onPick={(v) => setF('state', v)} allLabel="Every return"
                  allMeta={`${others('state').length} returns`} className="uppercase tracking-wider" />
              </th>
              <th className="w-full whitespace-nowrap py-1 pr-2 text-right font-normal">Action</th>
            </tr>
          </thead>

          {shown.map((r) => (
            <RmaRowView key={r.rma.id} r={r} today={today} open={openId === r.rma.id}
              onToggle={() => setOpenId(openId === r.rma.id ? null : r.rma.id)} />
          ))}
        </table>

        {shown.length === 0 && (
          <p className="px-1 py-4 text-center text-[12.5px] text-ink-2">
            No return matches that. <button type="button" onClick={clear}
              className="text-accent-ink underline underline-offset-2">Show every return</button>
          </p>
        )}
      </div>

      <Note foot label="Half of this was already built">
        {all.length > shown.length && `${all.length - shown.length} older returns not shown. `}
        Goods coming back are goods
        coming in, and the inbound gate has taken those against a spec since INB-01. What was missing is
        the authorisation: a named owner, a date it can be late against, and a reason that survives the
        phone call. The rate is counted on authorisations raised rather than on goods physically back, so
        a return nobody has chased still shows up in it. Open a row for the reason, the despatch it went
        out on and the gate it came home through.
      </Note>
      <AuthoriseDialog open={open} onClose={() => setOpen(false)} />
    </Card>
  )
}
