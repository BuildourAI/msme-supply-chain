'use client'
import { useEffect, useState } from 'react'
import { Button, Card, StatusPill } from '@/components/ui/bits'
import { Dialog } from '@/components/ui/Dialog'
import { Num } from '@/components/ui/Num'
import { money, num, shortDate } from '@/lib/domain/format'
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
    { label: 'Customer OTIF', d: otif, format: 'raw' as const, dp: 1, suffix: '%',
      caption: 'delivered on time and in full', tone: (otif.value as number) >= 95 ? 'good' as const : 'critical' as const },
    { label: 'Order to dock', d: cycleTime, format: 'raw' as const, dp: 1, suffix: 'days',
      caption: 'order taken to goods gone', tone: 'neutral' as const },
    { label: 'Freight per unit', d: freightPerUnit, format: 'money' as const, dp: 2, suffix: undefined,
      caption: 'carrier bills ÷ units shipped', tone: 'neutral' as const },
    { label: 'Still in transit', d: { value: inTransit.length, label: 'Consignments in transit', formula: 'consignments with no confirmed delivery date',
        inputs: inTransit.map((r) => ({ name: r.note.dnNo, value: r.consignment.promisedDate, source: `${r.carrier.name} · ${r.customer.name}${r.late ? ' — already past the promise' : ''}` })),
        note: 'Excluded from OTIF rather than counted as on time, which is the usual way that figure gets flattered.' },
      format: 'int' as const, dp: 0, suffix: undefined,
      caption: `${inTransit.filter((r) => r.late).length} already past the promise`,
      tone: inTransit.some((r) => r.late) ? 'warn' as const : 'neutral' as const },
  ]
  return (
    <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {cells.map((c, i) => (
        <div key={c.label} style={{ '--i': i, '--tile-c': `var(--tile-${(i % 6) + 1})` } as React.CSSProperties}
             className="anim-fade-up lift glass-tile rounded-lg border px-3 py-2">
          <span className="mono block text-[9.5px] uppercase tracking-wider text-ink-2">{c.label}</span>
          <span className="mt-0.5 block">
            <Num d={c.d} format={c.format} dp={c.dp} suffix={c.suffix} size="display"
                 tone={c.tone === 'neutral' ? undefined : c.tone} />
          </span>
          <span className="block text-[10.5px] leading-tight text-ink-2">{c.caption}</span>
        </div>
      ))}
    </div>
  )
}

export function ConsignmentRegister() {
  const { consignmentRows, showDelivery } = useDispatch()
  return (
    <Card index={0} title="Consignments" live
      sub="A carrier, a promised date and a delivered date — the three facts customer OTIF needs">
      <div className="scroll-x overflow-x-auto">
        <table className="w-full min-w-[62rem] border-collapse text-[12.5px]">
          <thead className="bg-surface-2">
            <tr className="text-[11px] uppercase tracking-wide text-ink-3">
              {['Note', 'Customer', 'Carrier', 'LR number', 'Promised', 'Delivered', 'Against promise', 'Freight', 'Status', ''].map((h, i) => (
                <th key={h || i} className={`whitespace-nowrap border-b border-line px-3 py-2 font-medium ${
                  i === 6 || i === 7 ? 'text-right' : 'text-left'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {consignmentRows.map((r) => (
              <tr key={r.consignment.id} className="border-b border-line-soft">
                <td className="mono whitespace-nowrap px-3 py-2 text-[11.5px]">{r.note.dnNo}</td>
                <td className="px-3 py-2">{r.customer.name}</td>
                <td className="px-3 py-2 text-ink-2">
                  {r.carrier.name}
                  <span className="mono block text-[10px] text-ink-2">{r.carrier.mode}</span>
                </td>
                <td className="mono px-3 py-2 text-[11px] text-ink-3">{r.consignment.lrNo}</td>
                <td className="whitespace-nowrap px-3 py-2 text-ink-3">{shortDate(r.consignment.promisedDate)}</td>
                <td className="whitespace-nowrap px-3 py-2">
                  {r.delivered
                    ? <>
                        {shortDate(r.consignment.deliveredOn!)}
                        <span className="mono block text-[10px] text-ink-2">{r.consignment.confirmedBy}</span>
                      </>
                    : <span className="text-ink-3">not yet</span>}
                </td>
                <td className={`num whitespace-nowrap px-3 py-2 text-right ${
                  !r.delivered ? 'text-ink-3' : r.drift > 0 ? 'text-critical' : 'text-good'}`}>
                  {r.delivered ? (r.drift > 0 ? `+${r.drift} d late` : r.drift < 0 ? `${-r.drift} d early` : 'on the day') : '—'}
                </td>
                <td className="num px-3 py-2 text-right">{money(r.consignment.freight)}</td>
                <td className="whitespace-nowrap px-3 py-2">
                  {!r.delivered
                    ? r.late
                      ? <StatusPill tone="critical" label="Overdue in transit" explain="Past the promised date with no delivery confirmed" />
                      : <StatusPill tone="warn" label="In transit" />
                    : r.onTime && r.inFull
                      ? <StatusPill tone="good" label="On time, in full" />
                      : !r.onTime
                        ? <StatusPill tone="critical" label="Delivered late" />
                        : <StatusPill tone="warn" label="On time, part shipment" explain="Arrived by the promised date, but the order was not complete on this note" />}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  {!r.delivered && (
                    <Button size="sm" variant="primary" onClick={() => showDelivery(r.note.dnNo)}>Confirm delivery</Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-line-soft px-4 py-3 text-[11.5px] leading-relaxed text-ink-3">
        <strong className="text-ink">On time and in full are two different failures.</strong> A
        consignment that arrives by the promised date against a part shipment is not an OTIF success,
        and this table keeps the two apart instead of averaging them into one comfortable number. A
        consignment still in transit counts as neither until it lands.
      </p>
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
      <p className="border-t border-line-soft px-4 py-3 text-[11.5px] leading-relaxed text-ink-3">
        Read the count beside the drift before acting on it. One late consignment out of
        {' '}{num(carrierRows.reduce((a, r) => a + r.shipped, 0), 0)} across every carrier is an
        incident; the same carrier late repeatedly is a conversation about the rate.
      </p>
    </Card>
  )
}
