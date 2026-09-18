'use client'
import { useEffect, useState } from 'react'
import { Button, Card } from '@/components/ui/bits'
import { Dialog } from '@/components/ui/Dialog'
import { HeadFilter, HeadSort } from '@/components/ui/HeadFilter'
import { Num } from '@/components/ui/Num'
import { Sparkbars } from '@/components/ui/Sparkbars'
import { Icon, type IconName } from '@/components/ui/icons'
import { ICON_BG, TONE_WORD } from '@/components/exec/Section'
import { daysBetween } from '@/lib/domain/calc'
import { money, num, shortDate } from '@/lib/domain/format'
import type { ConsignmentRow } from '@/lib/domain/dispatch'
import { Note } from '@/components/ui/Note'
import { useDispatch } from './store'
/**
 * DSP-03 · the consignment.
 *
 * The record that makes customer OTIF computable at all. Before it, despatched
 * and delivered were the same event as far as the system was concerned, so the
 * dashboard carried an assumed percentage with a note admitting as much.
 *
 * The hard part is not the schema, it is that nobody in the source set records
 * a delivered date today. So the confirmation asks who says so and how — a date
 * with no name on it is a guess with a timestamp.
 */
function DeliveryDialog() {
  const { deliveringRow, showDelivery, markDelivered, today } = useDispatch()
  const [on, setOn] = useState(today)
  const [by, setBy] = useState('')

  useEffect(() => {
    if (!deliveringRow) return
    setOn(today); setBy('')
  }, [deliveringRow, today])

  if (!deliveringRow) return null
  const r = deliveringRow
  const ok = on.length === 10 && by.trim().length > 2
  const drift = on > r.consignment.promisedDate

  return (
    <Dialog open onClose={() => showDelivery(null)} title={`Confirm delivery · ${r.note.dnNo}`}
      sub={`${r.customer.name} · ${r.carrier.name} · ${r.consignment.lrNo} · promised ${shortDate(r.consignment.promisedDate)}`}>
      <div className="space-y-3 px-4 py-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-[12.5px]">
            <span className="block text-ink-2">Delivered on</span>
            <input type="date" value={on} onChange={(e) => setOn(e.target.value)} data-autofocus
              className="num mt-1 w-full rounded-md border border-line bg-surface px-2 py-1.5 outline-none focus:border-accent" />
          </label>
          <label className="block text-[12.5px]">
            <span className="block text-ink-2">Confirmed by, and how</span>
            <input value={by} onChange={(e) => setBy(e.target.value)} placeholder="Signed POD, stores gate"
              className="mt-1 w-full rounded-md border border-line bg-surface px-2 py-1.5 text-[12.5px] outline-none focus:border-accent" />
          </label>
        </div>
        {drift && (
          <p className="rounded-md border border-warn/30 bg-warn-soft px-3 py-2 text-[12px] leading-relaxed text-warn">
            That is after the date this customer was given. It will count against customer OTIF, which is
            the point — a late delivery nobody records is a late delivery that never happened.
          </p>
        )}
        <p className="text-[11.5px] leading-relaxed text-ink-3">
          A delivered date with nobody&rsquo;s name against it is a guess. This field is not optional,
          because the figure it feeds is the one the owner will be asked about.
        </p>
      </div>
      <footer className="flex items-center gap-2 border-t border-line-soft px-4 py-3">
        <Button onClick={() => showDelivery(null)}>Not now</Button>
        <span className="ml-auto" />
        <Button variant="primary" disabled={!ok} onClick={() => markDelivered(r, on, by.trim())}>
          Record the delivery
        </Button>
      </footer>
    </Dialog>
  )
}

export function OtifStrip() {
  const { otif, cycleTime, freightPerUnit, inTransit } = useDispatch()
  const cells = [
    { label: 'Customer OTIF', d: otif, format: 'raw' as const, dp: 1, suffix: '%', icon: 'check' as IconName,
      caption: 'delivered on time and in full', tone: (otif.value as number) >= 95 ? 'good' as const : 'critical' as const },
    { label: 'Order to dock', d: cycleTime, format: 'raw' as const, dp: 1, suffix: 'days', icon: 'clock' as IconName,
      caption: 'order taken to goods gone', tone: 'neutral' as const },
    { label: 'Freight per unit', d: freightPerUnit, format: 'money' as const, dp: 2, suffix: undefined, icon: 'cash' as IconName,
      caption: 'carrier bills ÷ units shipped', tone: 'neutral' as const },
    { label: 'Still in transit', d: { value: inTransit.length, label: 'Consignments in transit', formula: 'consignments with no confirmed delivery date',
        inputs: inTransit.map((r) => ({ name: r.note.dnNo, value: r.consignment.promisedDate, source: `${r.carrier.name} · ${r.customer.name}${r.late ? ' — already past the promise' : ''}` })),
        note: 'Excluded from OTIF rather than counted as on time, which is the usual way that figure gets flattered.' },
      format: 'int' as const, dp: 0, suffix: undefined, icon: 'truck' as IconName,
      caption: `${inTransit.filter((r) => r.late).length} already past the promise`,
      tone: inTransit.some((r) => r.late) ? 'warn' as const : 'neutral' as const },
  ]
  return (
    <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {cells.map((c, i) => (
        <div key={c.label} style={{ '--i': i } as React.CSSProperties}
             className="anim-fade-up lift kpi relative flex flex-col rounded-lg border p-3">
          <Sparkbars d={c.d} className="absolute right-3 top-3 w-12 opacity-90" />
          {/* the tone rides the icon square, not the figure: a 30px number in
              status red reads as an alarm even when the status is "on target" */}
          <span aria-hidden className={`grid size-7 shrink-0 place-items-center rounded-md ${ICON_BG[c.tone]}`}>
            <Icon name={c.icon} className="size-4" />
          </span>
          <span className="mono mt-2 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-ink-3">
            <span className="truncate">{c.label}</span>
            {/* §10 — a status colour always arrives with the word that explains it */}
            {TONE_WORD[c.tone] && (
              <span className={`shrink-0 rounded-full px-1.5 text-[9px] font-semibold leading-[15px] ${ICON_BG[c.tone]}`}>
                {TONE_WORD[c.tone]}
              </span>
            )}
          </span>
          <span className="mt-0.5 block">
            <Num d={c.d} format={c.format} dp={c.dp} suffix={c.suffix} size="display" />
          </span>
          <span className="mt-1 block text-[11.5px] leading-snug text-ink-2">{c.caption}</span>
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------- the consignment row */

/**
 * The verdict, in one badge.
 *
 * `Against promise` and `Status` were two columns that between them asked one
 * question with five answers, and answered it twice — a signed drift in one and
 * a pill repeating the same fact in words in the other. They are one column
 * now. The glyph makes a verdict findable down a column of ten; the word beside
 * it carries the meaning, because a colour and a shape never do that alone; and
 * the figure says by how much, which is the part that decides whether to ring
 * the carrier.
 */
type Verdict = 'otif' | 'late' | 'short' | 'overdue' | 'transit'

const verdictOf = (r: ConsignmentRow): Verdict =>
  !r.delivered ? (r.late ? 'overdue' : 'transit')
    : !r.onTime ? 'late'
      : r.inFull ? 'otif' : 'short'

/** what the filter menu offers — the full sentence, not the badge's short word */
const VERDICT_LABEL: Record<Verdict, string> = {
  otif: 'On time and in full',
  late: 'Delivered late',
  short: 'On time, part shipment',
  overdue: 'Overdue in transit',
  transit: 'Still in transit',
}

/**
 * The mode, as a glyph beside the carrier's name. It is decorative on purpose:
 * the name is what identifies the row, and the mode is on the cell title, in
 * the filter option and spelled out in the row's own detail. A part load and a
 * surface express miss a promise for different reasons, which is worth seeing
 * down the column without reading four words on every line.
 */
const MODE_ICON: Record<string, IconName> = {
  'Part load': 'boxes',
  'Surface express': 'arrow-right',
  'Own tempo': 'truck',
}

/** a count of days that reads right at one of them */
const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`

function ConsignmentRowView({ r, today, open, onToggle }: {
  r: ConsignmentRow; today: string; open: boolean; onToggle: () => void
}) {
  const { showDelivery } = useDispatch()
  const v = verdictOf(r)
  const pastDue = daysBetween(r.consignment.promisedDate, today)
  const mode = r.carrier.mode

  return (
    <tbody className={`border-b border-line-soft ${
      open ? 'bg-surface-2/60' : v === 'overdue' ? 'bg-critical-soft/25' : ''}`}>
      <tr onClick={onToggle} className={`cursor-pointer transition-colors ${open ? '' : 'hover:bg-surface-2'}`}>
        <td className="py-1 pl-2 pr-1">
          <button type="button" aria-expanded={open}
            onClick={(e) => { e.stopPropagation(); onToggle() }}
            title={`${open ? 'Hide' : 'Show'} the carrier reference and who signed for it`}
            className="press flex size-5 items-center justify-center rounded text-ink-3 hover:text-ink">
            <Icon name="chevron" className={`size-3.5 transition-transform duration-200 ${open ? 'rotate-90' : ''}`} />
            <span className="sr-only">{open ? 'Hide' : 'Show'} the detail for {r.note.dnNo}</span>
          </button>
        </td>

        <td className="mono whitespace-nowrap py-1 pr-2 text-[11.5px]">{r.note.dnNo}</td>

        <td className="max-w-[12rem] py-1 pr-2">
          <span className="block truncate" title={r.customer.name}>{r.customer.name}</span>
        </td>

        <td className="py-1 pr-2">
          <span className="flex items-center gap-1.5 whitespace-nowrap" title={`${r.carrier.name} — ${mode.toLowerCase()}`}>
            <Icon name={MODE_ICON[mode] ?? 'truck'} className="size-3.5 shrink-0 text-ink-3" />
            <span className="text-ink-2">{r.carrier.name}</span>
          </span>
        </td>

        <td className="mono whitespace-nowrap py-1 pr-2 text-[11px] text-ink-3">
          {shortDate(r.consignment.promisedDate)}
        </td>

        <td className="mono whitespace-nowrap py-1 pr-2 text-[11px]">
          {r.delivered
            ? <span className="text-ink-2">{shortDate(r.consignment.deliveredOn!)}</span>
            : <span className="text-ink-4">not yet</span>}
        </td>

        <td className="num whitespace-nowrap py-1 pl-4 pr-2 text-right">{money(r.consignment.freight)}</td>

        {/* on time and in full are two tests — this column keeps them apart */}
        <td className="whitespace-nowrap py-1 pl-4 pr-2">
          {v === 'otif' ? (
            <span className="inline-flex items-center gap-1.5"
              title={`Delivered on ${shortDate(r.consignment.deliveredOn!)} against a promise of ${shortDate(r.consignment.promisedDate)}, with the whole ordered quantity on the note.`}>
              <Icon name="check" className="size-3.5 shrink-0 text-good" />
              <span className="text-ink-2">on time, in full</span>
              <span className="num text-ink-3">
                {r.drift === 0 ? 'on the day' : `${-r.drift} d early`}
              </span>
            </span>
          ) : v === 'late' ? (
            <span className="inline-flex items-center gap-1.5"
              title={`Delivered ${r.drift} days after the date this customer was given — it counts against customer OTIF.`}>
              <Icon name="alert" className="size-3.5 shrink-0 text-critical" />
              <span className="text-critical">delivered late</span>
              <span className="num text-critical">+{r.drift} d</span>
            </span>
          ) : v === 'short' ? (
            <span className="inline-flex items-center gap-1.5"
              title="Arrived by the promised date, but the order was not complete on this note — not an OTIF success.">
              <Icon name="alert" className="size-3.5 shrink-0 text-warn" />
              <span className="text-ink-2">part shipment</span>
              <span className="num text-ink-3">on time</span>
            </span>
          ) : v === 'overdue' ? (
            <span className="inline-flex items-center gap-1.5"
              title={`Past the promised date with no delivery confirmed. Counted as neither on time nor late until it lands.`}>
              <Icon name="clock" className="size-3.5 shrink-0 text-critical" />
              <span className="text-critical">overdue</span>
              <span className="num text-critical">{pastDue} d past</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5"
              title="Still out, still inside the promise. Excluded from OTIF rather than counted as on time.">
              <Icon name="truck" className="size-3.5 shrink-0 text-ink-3" />
              <span className="text-ink-2">in transit</span>
              <span className="num text-ink-3">due {shortDate(r.consignment.promisedDate)}</span>
            </span>
          )}
        </td>

        <td className="w-full whitespace-nowrap py-1 pr-2 text-right" onClick={(e) => e.stopPropagation()}>
          {!r.delivered && (
            <Button size="sm" variant="primary" onClick={() => showDelivery(r.note.dnNo)}>Confirm delivery</Button>
          )}
        </td>
      </tr>

      <tr hidden={!open}>
        <td colSpan={9} className="px-3 pb-2.5 pt-0.5">
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-ink-3">
            <span>Carrier reference <span className="mono">{r.consignment.lrNo}</span></span>
            <span>{r.carrier.name} — {mode.toLowerCase()}</span>
            <span>Against <span className="mono">{r.note.soNo}</span></span>
            <span>Left the bay <span className="mono">{shortDate(r.note.despatchedOn)}</span></span>
            {r.transitDays !== null && <span className="num">{days(r.transitDays)} in transit</span>}
            <span><span className="num">{num(r.note.weightKg, 1)}</span> kg</span>
            {r.consignment.confirmedBy && <span>Confirmed by {r.consignment.confirmedBy}</span>}
          </p>

          <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-2">
            {v === 'otif' ? (
              <>Both tests passed: it arrived by the date the customer was given, and the whole ordered
              quantity was on the note. This is the only shape that counts as an OTIF success.</>
            ) : v === 'late' ? (
              <>The promise was {shortDate(r.consignment.promisedDate)} and it arrived
              {' '}{shortDate(r.consignment.deliveredOn!)} — {days(r.drift)} out. Late against the promise,
              whatever quantity was on the note, so it fails OTIF on the first test.</>
            ) : v === 'short' ? (
              <>It arrived by the promised date, so the timing test passed. The order was not complete on
              this note, so the in-full test did not — and averaging the two into one comfortable number
              is exactly how a flattered OTIF is built.</>
            ) : v === 'overdue' ? (
              <>Promised {shortDate(r.consignment.promisedDate)}, {days(pastDue)} ago, and nobody has
              confirmed it arrived. It counts as neither on time nor late: an unconfirmed delivery is a
              missing observation, not a success.</>
            ) : (
              <>Out with the carrier and still inside the promise. It joins the OTIF figure the day
              somebody confirms it landed, and not before.</>
            )}
          </p>
        </td>
      </tr>
    </tbody>
  )
}

type ConsFilterKey = 'customer' | 'carrier' | 'verdict'
type ConsSortCol = 'promised' | 'freight'

export function ConsignmentRegister() {
  const { consignmentRows, today } = useDispatch()
  const [filters, setFilters] = useState<Partial<Record<ConsFilterKey, string>>>({})
  const [sort, setSort] = useState<{ col: ConsSortCol; dir: 'asc' | 'desc' } | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)

  const setF = (k: ConsFilterKey, v?: string) => setFilters((f) => ({ ...f, [k]: v }))
  const clear = () => setFilters({})
  const active = Object.values(filters).filter(Boolean).length

  const matches = (r: ConsignmentRow, f: Partial<Record<ConsFilterKey, string>>) =>
    (!f.customer || r.customer.id === f.customer) &&
    (!f.carrier || r.carrier.id === f.carrier) &&
    (!f.verdict || verdictOf(r) === f.verdict)

  const all = consignmentRows.filter((r) => matches(r, filters))
  if (sort) {
    const d = sort.dir === 'asc' ? 1 : -1
    all.sort((a, b) => sort.col === 'freight'
      ? (a.consignment.freight - b.consignment.freight) * d
      : a.consignment.promisedDate.localeCompare(b.consignment.promisedDate) * d)
  }
  const shown = all.slice(0, 14)

  /* Three states, in the order a reader expects: the way round that column is
     usually wanted, then the other way, then back to the register's own order.
     A promise starts with the oldest, because that is where the trouble is;
     money starts with the dearest bill. */
  const toggleSort = (col: ConsSortCol) => setSort((s) => {
    const natural: 'asc' | 'desc' = col === 'freight' ? 'desc' : 'asc'
    if (s?.col !== col) return { col, dir: natural }
    if (s.dir === natural) return { col, dir: natural === 'asc' ? 'desc' : 'asc' }
    return null
  })

  /* Each option is counted with its own filter lifted and the others still on,
     so no choice in a menu leads to an empty table. */
  const others = (k: ConsFilterKey) => consignmentRows.filter((r) => matches(r, { ...filters, [k]: undefined }))
  const countWhere = (k: ConsFilterKey, pred: (r: ConsignmentRow) => boolean) => others(k).filter(pred).length

  const customerOptions = Array.from(new Map(consignmentRows.map((r) => [r.customer.id, r.customer])).values())
    .map((c) => ({ value: c.id, label: c.name,
      meta: `${countWhere('customer', (r) => r.customer.id === c.id)} consignments` }))
    .filter((o) => !o.meta.startsWith('0 '))
  const carrierOptions = Array.from(new Map(consignmentRows.map((r) => [r.carrier.id, r.carrier])).values())
    .map((c) => ({ value: c.id, label: `${c.name} — ${c.mode.toLowerCase()}`,
      meta: `${countWhere('carrier', (r) => r.carrier.id === c.id)} consignments` }))
    .filter((o) => !o.meta.startsWith('0 '))
  const verdictOptions = (['overdue', 'transit', 'late', 'short', 'otif'] as Verdict[])
    .map((v) => ({ value: v, label: VERDICT_LABEL[v],
      meta: `${countWhere('verdict', (r) => verdictOf(r) === v)} consignments` }))
    .filter((o) => !o.meta.startsWith('0 '))

  const chip = (v: Verdict, label: string, icon: IconName, tone: 'critical' | 'warn' | 'neutral') => {
    const n = consignmentRows.filter((r) => verdictOf(r) === v).length
    if (n === 0) return null
    return (
      <button key={v} type="button" onClick={() => setF('verdict', filters.verdict === v ? undefined : v)}
        aria-pressed={filters.verdict === v}
        title={filters.verdict === v ? 'Showing only these consignments — click for every one' : `Show only the ${label} consignments`}
        className={`press inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
          filters.verdict === v ? 'border-accent bg-accent-soft text-accent-ink'
          : tone === 'critical' ? 'border-critical/40 bg-critical-soft text-ink-2 hover:border-critical'
          : tone === 'warn' ? 'border-warn/40 bg-warn-soft text-ink-2 hover:border-warn'
          : 'border-line text-ink-2 hover:bg-surface-2'}`}>
        <Icon name={icon} className="size-3 shrink-0" />
        {n} {label}
      </button>
    )
  }

  return (
    <Card index={0} title="Consignments" live
      sub="A carrier, a promised date and a delivered date — the three facts customer OTIF needs">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 px-3 pb-1.5 pt-2.5">
        {chip('overdue', 'overdue', 'clock', 'critical')}
        {chip('transit', 'in transit', 'truck', 'neutral')}
        {chip('late', 'delivered late', 'alert', 'critical')}
        {chip('short', 'part shipment', 'alert', 'warn')}
        {active > 0 && (
          <button type="button" onClick={clear}
            className="press text-[11px] text-ink-3 underline underline-offset-2 hover:text-ink">
            Show every consignment
          </button>
        )}
        <span className="mono ml-auto text-[10.5px] text-ink-3">
          showing {shown.length} of {consignmentRows.length}
        </span>
      </div>

      <div className="scroll-x relative overflow-x-auto px-3 pb-2">
        <table className="w-full min-w-[58rem] border-collapse text-[12px]">
          <thead>
            <tr className="mono border-b border-line text-left text-[9.5px] uppercase tracking-wider text-ink-3">
              <th className="w-6 py-1 pl-2 pr-1" />
              <th className="whitespace-nowrap py-1 pr-2 font-normal">Note</th>
              <th className="whitespace-nowrap py-1 pr-2 font-normal">
                <HeadFilter label="Customer" options={customerOptions} value={filters.customer}
                  onPick={(v) => setF('customer', v)} allLabel="Every customer"
                  allMeta={`${others('customer').length} consignments`} className="uppercase tracking-wider" />
              </th>
              <th className="whitespace-nowrap py-1 pr-2 font-normal">
                <HeadFilter label="Carrier" options={carrierOptions} value={filters.carrier}
                  onPick={(v) => setF('carrier', v)} allLabel="Every carrier"
                  allMeta={`${others('carrier').length} consignments`} className="uppercase tracking-wider" />
              </th>
              <th className="whitespace-nowrap py-1 pr-2 font-normal">
                <HeadSort label="Promised" active={sort?.col === 'promised'} dir={sort?.dir ?? 'asc'}
                  onSort={() => toggleSort('promised')} title="Sort by the date the customer was given"
                  className="uppercase tracking-wider" />
              </th>
              <th className="whitespace-nowrap py-1 pr-2 font-normal">Delivered</th>
              <th className="whitespace-nowrap py-1 pl-4 pr-2 text-right font-normal">
                <HeadSort label="Freight ₹" active={sort?.col === 'freight'} dir={sort?.dir ?? 'desc'}
                  onSort={() => toggleSort('freight')} title="Sort by what the carrier billed"
                  className="uppercase tracking-wider" />
              </th>
              <th className="whitespace-nowrap py-1 pl-4 pr-2 font-normal">
                <HeadFilter label="Against the promise" options={verdictOptions} value={filters.verdict}
                  onPick={(v) => setF('verdict', v)} allLabel="Every consignment"
                  allMeta={`${others('verdict').length} consignments`} className="uppercase tracking-wider" />
              </th>
              <th className="w-full whitespace-nowrap py-1 pr-2 text-right font-normal">Action</th>
            </tr>
          </thead>

          {shown.map((r) => (
            <ConsignmentRowView key={r.consignment.id} r={r} today={today}
              open={openId === r.consignment.id}
              onToggle={() => setOpenId(openId === r.consignment.id ? null : r.consignment.id)} />
          ))}
        </table>

        {shown.length === 0 && (
          <p className="px-1 py-4 text-center text-[12.5px] text-ink-2">
            No consignment matches that. <button type="button" onClick={clear}
              className="text-accent-ink underline underline-offset-2">Show every consignment</button>
          </p>
        )}
      </div>

      <Note foot label="On time and in full are two different failures">
        {all.length > shown.length && `${all.length - shown.length} older consignments not shown. `}
        A consignment that arrives by the promised date against a part shipment is not an OTIF success,
        and this table keeps the two apart instead of averaging them into one comfortable number. A
        consignment still in transit counts as neither until it lands. Open a row for the carrier
        reference, the days in transit and the name of whoever watched the goods arrive — that last
        fact is the one no client in the source set records today, and it is the whole reason the
        figure used to be illustrative.
      </Note>
      <DeliveryDialog />
    </Card>
  )
}

export function CarrierTable() {
  const { carrierRows } = useDispatch()
  return (
    <Card index={1} className="mt-3" title="Delays by carrier" live
      sub="Which logistics partner actually costs you the promise">
      <div className="scroll-x overflow-x-auto">
        <table className="w-full min-w-[46rem] border-collapse text-[12.5px]">
          <thead className="bg-surface-2">
            <tr className="text-[11px] uppercase tracking-wide text-ink-3">
              {['Carrier', 'Mode', 'Shipped', 'Delivered', 'Late', 'Mean drift', 'Freight billed', 'Per kg'].map((h, i) => (
                <th key={h} className={`whitespace-nowrap border-b border-line px-3 py-2 font-medium ${
                  i >= 2 ? 'text-right' : 'text-left'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {carrierRows.map((r) => (
              <tr key={r.carrier.id} className="border-b border-line-soft">
                <td className="px-3 py-2">{r.carrier.name}</td>
                <td className="px-3 py-2 text-ink-2">{r.carrier.mode}</td>
                <td className="num px-3 py-2 text-right">{r.shipped}</td>
                <td className="num px-3 py-2 text-right text-ink-2">{r.delivered}</td>
                <td className={`num px-3 py-2 text-right ${r.late > 0 ? 'text-critical' : 'text-ink-3'}`}>{r.late}</td>
                <td className="num px-3 py-2 text-right">
                  <Num d={r.drift} format="raw" dp={1} suffix="d"
                       tone={(r.drift.value as number) > 0 ? 'critical' : 'good'} />
                </td>
                <td className="num px-3 py-2 text-right">{money(r.freight)}</td>
                <td className="num px-3 py-2 text-right text-ink-2">
                  {r.weightKg > 0 ? money(r.freight / r.weightKg, 2) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Note foot label="Read the count beside the drift before acting">
        Read the count beside the drift before acting on it. One late consignment out of
        {' '}{num(carrierRows.reduce((a, r) => a + r.shipped, 0), 0)} across every carrier is an
        incident; the same carrier late repeatedly is a conversation about the rate.
      </Note>
    </Card>
  )
}
