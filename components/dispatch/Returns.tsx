'use client'
import { useEffect, useState } from 'react'
import { Button, Card, Pill, StatusPill } from '@/components/ui/bits'
import { Dialog } from '@/components/ui/Dialog'
import { Num } from '@/components/ui/Num'
import { money, num, shortDate } from '@/lib/domain/format'
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

export function ReturnsRegister() {
  const { rmaRows, rmaRate, shippedUnits, receiveReturn } = useDispatch()
  const [open, setOpen] = useState(false)
  const openOnes = rmaRows.filter((r) => r.rma.state !== 'closed')
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
      <div className="scroll-x overflow-x-auto">
        <table className="w-full min-w-[58rem] border-collapse text-[12.5px]">
          <thead className="bg-surface-2">
            <tr className="text-[11px] uppercase tracking-wide text-ink-3">
              {['RMA', 'Customer', 'Against', 'Product', 'Qty', 'Value', 'Reason', 'Owner', 'Due back', 'Status', ''].map((h, i) => (
                <th key={h || i} className={`whitespace-nowrap border-b border-line px-3 py-2 font-medium ${
                  i === 4 || i === 5 ? 'text-right' : 'text-left'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rmaRows.map((r) => (
              <tr key={r.rma.id} className="border-b border-line-soft">
                <td className="mono whitespace-nowrap px-3 py-2 text-[11.5px]">{r.rma.rmaNo}</td>
                <td className="px-3 py-2">{r.customer.name}</td>
                <td className="mono px-3 py-2 text-[11px] text-ink-3">{r.rma.dnNo}</td>
                <td className="mono px-3 py-2 text-[11px] text-ink-3">{r.fg.code}</td>
                <td className="num px-3 py-2 text-right">{num(r.rma.qty, 0)}</td>
                <td className="num px-3 py-2 text-right"><Num d={r.value} format="money" /></td>
                <td className="px-3 py-2 text-ink-2">{r.rma.reason}</td>
                <td className="px-3 py-2 text-ink-2">{r.rma.owner}</td>
                <td className={`whitespace-nowrap px-3 py-2 ${r.overdue ? 'text-critical' : 'text-ink-3'}`}>
                  {shortDate(r.rma.dueBy)}
                </td>
                <td className="whitespace-nowrap px-3 py-2">
                  {r.rma.state === 'closed'
                    ? <StatusPill tone="good" label="Back in stock" explain={`Booked in through ${r.rma.grnRef}`} />
                    : r.rma.state === 'received'
                      ? <StatusPill tone="accent" label="Received at the gate" explain={`Through ${r.rma.grnRef}`} />
                      : r.overdue
                        ? <StatusPill tone="critical" label="Overdue" explain={`Authorised ${r.rma.raisedOn}, due back ${r.rma.dueBy}`} />
                        : <StatusPill tone="warn" label="Authorised, not back" />}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  {r.rma.state === 'authorised' && (
                    <Button size="sm" onClick={() => receiveReturn(r)}>Book in at the gate</Button>
                  )}
                  {r.rma.grnRef && <span className="mono text-[10.5px] text-ink-3">{r.rma.grnRef}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-line-soft px-4 py-2.5">
        <Pill tone={openOnes.length ? 'warn' : 'good'}>
          {openOnes.length ? `${openOnes.length} open` : 'nothing outstanding'}
        </Pill>
        <Pill tone="neutral" mono>valued at cost, never at the selling price</Pill>
      </div>
      <p className="border-t border-line-soft px-4 py-3 text-[11.5px] leading-relaxed text-ink-3">
        <strong className="text-ink">Half of this was already built.</strong> Goods coming back are goods
        coming in, and the inbound gate has taken those against a spec since INB-01. What was missing is
        the authorisation: a named owner, a date it can be late against, and a reason that survives the
        phone call. The rate is counted on authorisations raised rather than on goods physically back, so
        a return nobody has chased still shows up in it.
      </p>
      <AuthoriseDialog open={open} onClose={() => setOpen(false)} />
    </Card>
  )
}
