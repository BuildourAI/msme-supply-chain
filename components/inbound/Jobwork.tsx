'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button, Card, Pill, StatusPill } from '@/components/ui/bits'
import { Dialog } from '@/components/ui/Dialog'
import { Num } from '@/components/ui/Num'
import { money, num, qtyText, shortDate } from '@/lib/domain/format'
import { useInbound, type ChallanRow } from './store'

/**
 * The accounting bar. Everything that left the gate is exactly one of five
 * things, and the five sum to the quantity sent — so "where is my material" is
 * answered by looking, not by asking.
 */
function AccountingBar({ row }: { row: ChallanRow }) {
  const sent = row.challan.qtySent
  const a = row.acct
  const pct = (n: number) => (sent > 0 ? (n / sent) * 100 : 0)
  const segs = [
    { label: 'Back, in stock', qty: a.returned.value, cls: 'bg-good' },
    { label: 'Back, in inbound QC', qty: a.inQc.value, cls: 'bg-accent/50' },
    { label: 'At the jobworker', qty: a.atVendor.value, cls: 'bg-accent' },
    { label: 'Allowed process loss', qty: a.processLoss.value, cls: 'bg-ink-3/40' },
    { label: 'Unaccounted', qty: a.unaccounted.value, cls: 'bg-critical' },
  ].filter((s) => s.qty > 0.0001)

  return (
    <div className="mt-2">
      <div className="flex h-4 w-full overflow-hidden rounded-[3px] bg-surface-3">
        {segs.map((s, i) => (
          <div key={s.label} style={{ width: `${pct(s.qty)}%`, '--i': i } as React.CSSProperties}
               title={`${s.label} — ${qtyText(s.qty, row.challan.uom)}`}
               className={`anim-reveal h-full ${s.cls}`} />
        ))}
      </div>
      <ul className="mt-1.5 flex flex-wrap gap-x-3.5 gap-y-1 text-[11px]">
        {segs.map((s) => (
          <li key={s.label} className="flex items-center gap-1.5 text-ink-3">
            <span aria-hidden className={`size-2 rounded-[2px] ${s.cls}`} />
            {s.label} <span className="num text-ink-2">{num(s.qty, 3)} {row.challan.uom}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ----------------------------------------------------------- the dialogs --- */

function ReturnDialog({ row, onClose }: { row: ChallanRow | null; onClose: () => void }) {
  const { recordReturn } = useInbound()
  const [qty, setQty] = useState('')
  useEffect(() => { if (row) setQty(String(row.acct.atVendor.value + row.acct.unaccounted.value)) }, [row])
  if (!row) return null
  const n = Number(qty)
  const ok = Number.isFinite(n) && n > 0
  const outstanding = row.acct.atVendor.value + row.acct.unaccounted.value
  const over = n > outstanding
  return (
    <Dialog open onClose={onClose} title={`Book in a return · ${row.challan.challanNo}`}
      sub={`${row.challan.jobworkerName} · ${row.challan.process.toLowerCase()} · ${qtyText(outstanding, row.challan.uom)} still out`}>
      <div className="space-y-3 px-4 py-4">
        <label className="block text-[12.5px]">
          <span className="block text-ink-2">Quantity coming back</span>
          <input type="number" step="0.001" value={qty} onChange={(e) => setQty(e.target.value)}
            className="num mt-1 w-36 rounded-md border border-line bg-surface px-2 py-1 outline-none focus:border-accent" />
          <span className="mono ml-2 text-[11.5px] text-ink-3">{row.challan.uom}</span>
        </label>
        {over && (
          <p className="text-[11.5px] text-warn">
            That is more than the balance. Galvanising legitimately returns more weight than it took;
            anything else is worth a second look before you book it.
          </p>
        )}
        <p className="rounded-md border border-line bg-surface-2 p-2.5 text-[12px] leading-relaxed text-ink-2">
          This does <strong className="text-ink">not</strong> put the material back into usable stock.
          It raises a GRN and puts it in the receiving queue, where it goes through the same inspection
          as a purchase. Outsourced work gets the same gate — nothing bypasses QC because it is ours.
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!ok}
            onClick={() => { recordReturn(row, n); onClose() }}>
            Raise the GRN
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

function CloseDialog({ row, onClose }: { row: ChallanRow | null; onClose: () => void }) {
  const { closeChallan } = useInbound()
  const [reason, setReason] = useState('')
  useEffect(() => { setReason('') }, [row])
  if (!row) return null
  const lost = row.acct.unaccounted.value
  return (
    <Dialog open onClose={onClose} title={`Close challan ${row.challan.challanNo}`}
      sub={`${row.challan.jobworkerName} · ${row.challan.process.toLowerCase()}`}>
      <div className="space-y-3 px-4 py-4">
        {lost > 0 ? (
          <p className="rounded-md border border-critical/30 bg-critical-soft p-3 text-[12.5px] leading-relaxed text-ink-2">
            Closing this writes off <strong className="text-ink">{qtyText(lost, row.challan.uom)}</strong> —{' '}
            <strong className="text-ink">{money(row.valueLost.value)}</strong> — as unaccounted. That is
            material that left the gate, is not back, and is not explained by the process. It goes on the
            trail against your name and your reason.
          </p>
        ) : (
          <p className="rounded-md border border-good/30 bg-good-soft p-3 text-[12.5px] leading-relaxed text-ink-2">
            Everything that left is back or inside the allowed process loss for{' '}
            {row.challan.process.toLowerCase()}. This closes clean.
          </p>
        )}
        <label className="block text-[12.5px]">
          <span className="block text-ink-2">Reason for closing</span>
          <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder={lost > 0
              ? 'Agreed with the jobworker as scrap · written off after a physical count · disputed and settled'
              : 'Job complete, all parts returned'}
            className="mt-1 w-full rounded-md border border-line bg-surface px-2 py-1.5 outline-none focus:border-accent" />
        </label>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant={lost > 0 ? 'danger' : 'primary'} disabled={reason.trim().length < 4}
            title={reason.trim().length < 4 ? 'A close needs a written reason' : undefined}
            onClick={() => { closeChallan(row, reason.trim()); onClose() }}>
            {lost > 0 ? `Close and write off ${money(row.valueLost.value)}` : 'Close the challan'}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

function ExtendDialog({ row, onClose }: { row: ChallanRow | null; onClose: () => void }) {
  const { extendDue } = useInbound()
  const [date, setDate] = useState('')
  const [reason, setReason] = useState('')
  useEffect(() => { if (row) { setDate(row.challan.dueBack); setReason('') } }, [row])
  if (!row) return null
  const ok = date > row.challan.dueBack && reason.trim().length > 3
  return (
    <Dialog open onClose={onClose} title={`Re-agree the return date · ${row.challan.challanNo}`}
      sub={`Promised ${shortDate(row.challan.dueBack)} · ${row.late.value > 0
        ? `${row.late.value} day${row.late.value === 1 ? '' : 's'} ago`
        : `${-row.late.value} day${row.late.value === -1 ? '' : 's'} to go`}`}>
      <div className="space-y-3 px-4 py-4">
        <label className="block text-[12.5px]">
          <span className="block text-ink-2">New date, agreed with {row.challan.jobworkerName}</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            className="mono mt-1 rounded-md border border-line bg-surface px-2 py-1 outline-none focus:border-accent" />
        </label>
        <label className="block text-[12.5px]">
          <span className="block text-ink-2">What did they say?</span>
          <input value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="Called 02/09 — plating line down, promised Friday"
            className="mt-1 w-full rounded-md border border-line bg-surface px-2 py-1.5 outline-none focus:border-accent" />
        </label>
        <p className="text-[12px] leading-relaxed text-ink-3">
          The original date stays on the record. A re-agreed date is not the same as an on-time return,
          and the jobworker’s history has to keep saying so.
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!ok}
            onClick={() => { extendDue(row, date, reason.trim()); onClose() }}>
            Record the new date
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

function ChaseNote() {
  const { chaseRow, showChase } = useInbound()
  const [copied, setCopied] = useState(false)
  useEffect(() => { setCopied(false) }, [chaseRow?.challan.id])
  if (!chaseRow) return null
  return (
    <Dialog open wide onClose={() => showChase(null)}
      title={`Chase note · ${chaseRow.challan.challanNo}`}
      sub={`Drafted for ${chaseRow.challan.jobworkerName} — the system never sends it (§11)`}>
      <div className="px-4 py-4">
        <pre className="mono max-h-[38vh] overflow-auto whitespace-pre-wrap rounded-md border border-line bg-surface-2 p-3 text-[12px] leading-relaxed text-ink-2">
{chaseRow.chase}
        </pre>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="primary"
            onClick={async () => {
              try { await navigator.clipboard.writeText(chaseRow.chase); setCopied(true) } catch { setCopied(false) }
            }}>
            {copied ? 'Copied ✓' : 'Copy the text'}
          </Button>
          <Button variant="ghost" onClick={() => showChase(null)}>Close</Button>
        </div>
      </div>
    </Dialog>
  )
}

/* ----------------------------------------------------------- the register -- */

function ChallanCard({ row, onReturn, onClose, onExtend }: {
  row: ChallanRow; onReturn: () => void; onClose: () => void; onExtend: () => void
}) {
  const { showChase } = useInbound()
  const c = row.challan
  const late = row.late.value
  const closed = c.status === 'closed'

  return (
    <li className={`anim-fade-up lift rounded-lg border bg-surface p-3.5 ${
      row.overdue ? 'border-critical/40' : closed ? 'border-line-soft' : 'border-line'}`}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="mono text-[12.5px] font-medium">{c.challanNo}</span>
        <span className="text-[13px]">{c.itemName}</span>
        <span className="mono text-[11px] text-ink-3">{qtyText(c.qtySent, c.uom)} sent</span>
        <span className="ml-auto">
          {closed ? (
            <StatusPill tone={row.acct.unaccounted.value > 0 ? 'warn' : 'good'}
              label={row.acct.unaccounted.value > 0 ? 'Closed — written off' : 'Closed — fully accounted'} />
          ) : (
            <StatusPill tone={row.overdue ? 'critical' : row.acct.returned.value + row.acct.inQc.value > 0 ? 'accent' : 'neutral'}
              label={row.overdue
                ? `Overdue by ${late} day${late === 1 ? '' : 's'}`
                : row.acct.returned.value + row.acct.inQc.value > 0 ? 'Part returned' : `Due back ${shortDate(c.dueBack)}`}
              explain={`Promised ${c.dueBack}, judged against ${c.asOf}.`} />
          )}
        </span>
      </div>

      <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px] text-ink-3">
        <span className="font-medium text-ink-2">{c.jobworkerName}</span>
        <span>{c.process}</span>
        <span>sent {shortDate(c.sentOn)}</span>
        <span>due {shortDate(c.dueBack)}</span>
        {c.purpose && <span>for {c.purpose}</span>}
      </p>

      <AccountingBar row={row} />

      <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[12px]">
        <span className="text-ink-3">
          With the jobworker <Num d={row.acct.atVendor} format="raw" dp={3} suffix={` ${c.uom}`} />
          {' · '}<Num d={row.valueOut} format="money" />
        </span>
        {row.acct.inQc.value > 0 && (
          <span className="text-ink-3">
            Back, in QC <Num d={row.acct.inQc} format="raw" dp={3} suffix={` ${c.uom}`} tone="accent" />
          </span>
        )}
        <span className="text-ink-3">
          Yield so far <Num d={row.yielded} format="raw" dp={1} suffix="%" />
          <span className="ml-1 text-[11px]">of {num(c.expectedYield * 100, 1)}% expected</span>
        </span>
        {row.acct.unaccounted.value > 0 && (
          <span className="text-ink-3">
            Unaccounted <Num d={row.acct.unaccounted} format="raw" dp={3} suffix={` ${c.uom}`} tone="critical" />
            {' · '}<Num d={row.valueLost} format="money" tone="critical" />
          </span>
        )}
      </div>

      {row.acct.unaccounted.value > 0 && !closed && (
        <p className="mt-2 rounded-md border border-critical/30 bg-critical-soft p-2.5 text-[12px] leading-relaxed text-ink-2">
          <strong className="text-ink">{qtyText(row.acct.unaccounted.value, c.uom)} is unaccounted.</strong>{' '}
          {qtyText(c.qtySent, c.uom)} went out, {qtyText(row.acct.returned.value + row.acct.inQc.value, c.uom)} has come
          back, {c.process.toLowerCase()} accounts for {qtyText(row.acct.processLoss.value, c.uom)} — and{' '}
          {c.jobworkerName} stopped returning {late} days past the date. Nobody at this factory could have
          told you that before, because the challan book stops at “sent”.
        </p>
      )}

      {row.overdue && !row.acct.settling && (
        <p className="mt-2 rounded-md border border-warn/30 bg-warn-soft p-2.5 text-[12px] leading-relaxed text-ink-2">
          <strong className="text-ink">Overdue, but nothing is missing yet.</strong> The whole{' '}
          {qtyText(row.acct.atVendor.value, c.uom)} is still with {c.jobworkerName} and none of it has come
          back, so this is a chase, not a write-off. It only becomes unaccounted once they start returning
          short, or once you close the challan.
        </p>
      )}

      {!closed && (
        <div className="mt-2.5 flex flex-wrap gap-2">
          <Button size="sm" variant="primary" onClick={onReturn}>Book in a return</Button>
          {row.overdue && <Button size="sm" onClick={() => showChase(c.id)}>Draft a chase note</Button>}
          {row.overdue && <Button size="sm" onClick={onExtend}>Re-agree the date</Button>}
          <Button size="sm" variant={row.acct.unaccounted.value > 0 ? 'danger' : 'default'} onClick={onClose}>
            Close the challan
          </Button>
        </div>
      )}
      {closed && c.closedOn && (
        <p className="mt-2 text-[11.5px] text-ink-3">Closed {shortDate(c.closedOn)}.</p>
      )}
    </li>
  )
}

export function JobworkRegister() {
  const { challanRows, jobworkTotal, unaccountedTotal, jobworkers, policy } = useInbound()
  const [returning, setReturning] = useState<ChallanRow | null>(null)
  const [closing, setClosing] = useState<ChallanRow | null>(null)
  const [extending, setExtending] = useState<ChallanRow | null>(null)

  const heaters = challanRows.filter((r) => r.challan.floor === 'heaters')
  const fabrication = challanRows.filter((r) => r.challan.floor === 'fabrication')
  const overdue = challanRows.filter((r) => r.overdue)

  const section = (rows: ChallanRow[]) => (
    <ul className="space-y-3">
      {rows.map((r, i) => (
        <div key={r.challan.id} style={{ '--i': Math.min(i, 5) } as React.CSSProperties}>
          <ChallanCard row={r}
            onReturn={() => setReturning(r)} onClose={() => setClosing(r)} onExtend={() => setExtending(r)} />
        </div>
      ))}
    </ul>
  )

  return (
    <>
      <Card index={1} title="Challan ledger" live
        sub="INB-03 · everything that left the gate, split five ways — and the five always sum to what went out"
        actions={<span className="flex flex-wrap gap-x-4 text-[12px] text-ink-3">
          <span>Out at jobworkers <Num d={jobworkTotal} format="money" /></span>
          <span>Unaccounted <Num d={unaccountedTotal} format="money"
            tone={unaccountedTotal.value > 0 ? 'critical' : 'good'} /></span>
        </span>}>
        <div className="p-4">
          {overdue.length > 0 && (
            <p className="mb-3 rounded-md border border-critical/30 bg-critical-soft p-3 text-[12.5px] leading-relaxed text-ink-2">
              <strong className="text-ink">
                {overdue.length === 1 ? 'One challan is' : `${overdue.length} challans are`} past the
                promised return date
              </strong>{' '}
              — {overdue.map((r) => `${r.challan.challanNo} (${r.late.value}d)`).join(', ')}. That material
              is neither on the shelf nor consumed, so it counts as neither, and none of it is cover (§11).
              Overdue is not the same as missing: a challan only reports material unaccounted once it closes,
              or once the jobworker starts returning short.
            </p>
          )}

          <p className="mono mb-2 text-[10px] uppercase tracking-wider text-ink-3">
            Heater factory · §9.1 · as of {shortDate(heaters[0]?.challan.asOf ?? '')}
          </p>
          {section(heaters)}

          <p className="mono mb-2 mt-5 text-[10px] uppercase tracking-wider text-ink-3">
            Fabrication floor · §9.2 · as of {shortDate(fabrication[0]?.challan.asOf ?? '')}
          </p>
          <p className="mb-2 text-[11.5px] leading-relaxed text-ink-3">
            These three are the source of the “with jobworker” quantities on{' '}
            <Link href="/production/line-watch" className="text-accent hover:underline">Line Watch</Link>.
            That page flags late jobwork; this is the challan behind the flag. It runs on §9.2’s own
            Monday, five days after the heater factory’s date — two floors, two run dates, one register.
          </p>
          {section(fabrication)}
        </div>
      </Card>

      <Card index={2} className="mt-3" title="By jobworker" live
        sub={`Ageing and concentration — nobody should be holding more than ${money(policy.jobworkerExposureCeiling)} of ours`}>
        <div className="scroll-x overflow-x-auto">
          <table className="w-full min-w-[38rem] border-collapse text-[12.5px]">
            <thead className="bg-surface-2">
              <tr className="text-[11px] uppercase tracking-wide text-ink-3">
                {['Jobworker', 'Open challans', 'Value held', 'Unaccounted', 'Oldest overdue', 'Concentration'].map((h) => (
                  <th key={h} className="whitespace-nowrap border-b border-line px-3 py-2 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {jobworkers.map((j) => {
                const mine = challanRows.filter((r) => r.challan.jobworkerName === j.name && r.challan.status === 'out')
                return (
                  <tr key={j.name} className="border-b border-line-soft">
                    <td className="px-3 py-2 font-medium">{j.name}</td>
                    <td className="px-3 py-2 text-ink-2">
                      {mine.length} · {mine.map((r) => r.challan.process.toLowerCase()).join(', ')}
                    </td>
                    <td className="num px-3 py-2"><Num d={j.exposure} format="money" /></td>
                    <td className={`num px-3 py-2 ${j.unaccounted > 0 ? 'text-critical' : 'text-ink-3'}`}>
                      {j.unaccounted > 0 ? money(j.unaccounted) : '—'}
                    </td>
                    <td className={`num px-3 py-2 ${j.oldest > 0 ? 'text-critical' : 'text-ink-3'}`}>
                      {j.oldest > 0 ? `${j.oldest} days` : 'nothing overdue'}
                    </td>
                    <td className="px-3 py-2">
                      {j.over
                        ? <StatusPill tone="critical" label="Over the ceiling — escalated" />
                        : <StatusPill tone="good" label="Within the ceiling" />}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="border-t border-line-soft px-4 py-3 text-[11.5px] leading-relaxed text-ink-3">
          A concentration limit is not about trust. It is about how much of your working capital can be
          standing in one shed you do not control — and whether you would know, on the day it burned
          down, what was in it. Valued at last purchase price, ex-freight (§13-1), the same basis the
          Inventory and Sourcing pages use.
        </p>
      </Card>

      <ReturnDialog row={returning} onClose={() => setReturning(null)} />
      <CloseDialog row={closing} onClose={() => setClosing(null)} />
      <ExtendDialog row={extending} onClose={() => setExtending(null)} />
      <ChaseNote />
    </>
  )
}
