'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button, Card, StatusPill } from '@/components/ui/bits'
import { Dialog } from '@/components/ui/Dialog'
import { Icon, type IconName } from '@/components/ui/icons'
import { Num } from '@/components/ui/Num'
import { money, num, qtyText, shortDate } from '@/lib/domain/format'
import { Note } from '@/components/ui/Note'
import { useInbound, type ChallanRow } from './store'

/**
 * The five-way split.
 *
 * Everything that left the gate is exactly one of five things, and the five sum
 * to the quantity sent — so "where is my material" is answered by looking. That
 * argument does not need a full-width bar and a five-item legend under every
 * challan: it needs 96px of colour in a column, with the words printed once
 * under the table and the quantities a click away.
 */
const SPLIT = (row: ChallanRow) => {
  const a = row.acct
  return [
    { key: 'returned', label: 'Back, in stock', qty: a.returned.value, cls: 'bg-good' },
    { key: 'inQc', label: 'Back, in inbound QC', qty: a.inQc.value, cls: 'bg-accent/50' },
    { key: 'atVendor', label: 'At the jobworker', qty: a.atVendor.value, cls: 'bg-accent' },
    { key: 'loss', label: 'Allowed process loss', qty: a.processLoss.value, cls: 'bg-ink-3/40' },
    { key: 'unacc', label: 'Unaccounted', qty: a.unaccounted.value, cls: 'bg-critical' },
  ].filter((s) => s.qty > 0.0001)
}

function SplitBar({ row }: { row: ChallanRow }) {
  const sent = row.challan.qtySent
  const segs = SPLIT(row)
  return (
    <span className="flex h-2.5 w-24 overflow-hidden rounded-full bg-surface-3"
      title={segs.map((s) => `${s.label} — ${qtyText(s.qty, row.challan.uom)}`).join(' · ')}>
      {segs.map((s, i) => (
        <span key={s.key} className={`anim-reveal h-full ${s.cls}`}
          style={{ width: `${(s.qty / sent) * 100}%`, '--i': i } as React.CSSProperties} />
      ))}
    </span>
  )
}

/** The same five, with their quantities, for the row that has been opened. */
function SplitLegend({ row }: { row: ChallanRow }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[11.5px]">
      {SPLIT(row).map((s) => (
        <li key={s.key} className="flex items-center gap-1.5 text-ink-3">
          <span aria-hidden className={`size-2 rounded-[2px] ${s.cls}`} />
          {s.label} <span className="num text-ink-2">{num(s.qty, 3)} {row.challan.uom}</span>
        </li>
      ))}
    </ul>
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

/** Which glyph stands for where a challan has got to. */
const ROW_ICON = (row: ChallanRow): { name: IconName; cls: string } =>
  row.challan.status === 'closed'
    ? { name: 'check', cls: row.acct.unaccounted.value > 0 ? 'text-warn' : 'text-good' }
    : row.overdue ? { name: 'alert', cls: 'text-critical' }
    : row.acct.returned.value + row.acct.inQc.value > 0 ? { name: 'tray', cls: 'text-accent-ink' }
    : { name: 'factory', cls: 'text-ink-3' }

/**
 * One challan, as a row you can open.
 *
 * The card this replaces stacked seven things: a header, a meta line, a
 * full-width five-way bar, its five-item legend, a figures line, up to two
 * paragraphs and four buttons — 260px per challan, six challans to a screen.
 * The row carries what a supervisor scans for (who has it, where it is, what it
 * is worth, what is missing, whether it is late) and the rest is one click down:
 * the split with quantities, the yield, the sentence that explains the missing
 * material, and every action.
 *
 * The detail row stays in the document when it is shut rather than being torn
 * out, so the explanation is always there to be found — `hidden` keeps it out
 * of the page and out of the accessibility tree until it is asked for.
 */
function ChallanRowView({ row, open, onToggle, onReturn, onClose, onExtend }: {
  row: ChallanRow; open: boolean; onToggle: () => void
  onReturn: () => void; onClose: () => void; onExtend: () => void
}) {
  const { showChase } = useInbound()
  const c = row.challan
  const late = row.late.value
  const closed = c.status === 'closed'
  const icon = ROW_ICON(row)
  const missing = row.acct.unaccounted.value > 0

  return (
    <tbody className={`border-b border-line-soft ${open ? 'bg-surface-2/60' : ''}`}>
      <tr onClick={onToggle}
        className={`cursor-pointer transition-colors ${open ? '' : 'hover:bg-surface-2'}`}>
        <td className="py-1.5 pl-2 pr-1">
          <button type="button" aria-expanded={open}
            onClick={(e) => { e.stopPropagation(); onToggle() }}
            title={`${open ? 'Hide' : 'Show'} what is where on ${c.challanNo}`}
            className="press flex size-5 items-center justify-center rounded text-ink-3 hover:text-ink">
            <Icon name="chevron" className={`size-3.5 transition-transform duration-200 ${open ? 'rotate-90' : ''}`} />
            <span className="sr-only">{open ? 'Hide' : 'Show'} the detail for {c.challanNo}</span>
          </button>
        </td>

        <td className="whitespace-nowrap py-1.5 pr-2">
          <span className="flex items-center gap-1.5">
            <Icon name={icon.name} className={`size-3.5 shrink-0 ${icon.cls}`} />
            <span className="mono text-[11.5px] font-medium">{c.challanNo}</span>
          </span>
        </td>

        <td className="py-1.5 pr-2">
          <span className="block truncate text-[12px]" title={`${c.jobworkerName} · ${c.process}`}>
            {c.jobworkerName} <span className="text-ink-3">· {c.process.toLowerCase()}</span>
          </span>
        </td>

        <td className="max-w-[14rem] py-1.5 pr-2">
          <span className="flex items-baseline gap-1.5">
            <span className="min-w-0 truncate text-[12px]" title={c.itemName}>{c.itemName}</span>
            <span className="mono shrink-0 text-[11px] text-ink-3">{qtyText(c.qtySent, c.uom)}</span>
          </span>
        </td>

        <td className="py-1.5 pr-2"><SplitBar row={row} /></td>

        <td className="num whitespace-nowrap py-1.5 pl-4 pr-2 text-right text-[11.5px]">
          {money(row.valueOut.value)}
        </td>

        <td className={`num whitespace-nowrap py-1.5 pl-4 pr-2 text-right text-[11.5px] ${
          missing ? 'text-critical' : 'text-ink-3'}`}>
          {missing ? money(row.valueLost.value) : '—'}
        </td>

        <td className="whitespace-nowrap py-1.5 pl-4 pr-2 text-right">
          {closed ? (
            <StatusPill tone={missing ? 'warn' : 'good'}
              label={missing ? 'Closed — written off' : 'Closed — fully accounted'} />
          ) : (
            <StatusPill tone={row.overdue ? 'critical' : row.acct.returned.value + row.acct.inQc.value > 0 ? 'accent' : 'neutral'}
              label={row.overdue
                ? `Overdue by ${late} day${late === 1 ? '' : 's'}`
                : row.acct.returned.value + row.acct.inQc.value > 0 ? 'Part returned' : `Due back ${shortDate(c.dueBack)}`}
              explain={`Promised ${c.dueBack}, judged against ${c.asOf}.`} />
          )}
        </td>
      </tr>

      <tr hidden={!open}>
        <td colSpan={8} className="px-3 pb-3 pt-0.5">
          <p className="mb-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px] text-ink-3">
            <span>sent {shortDate(c.sentOn)}</span>
            <span>due {shortDate(c.dueBack)}</span>
            {c.purpose && <span>for {c.purpose}</span>}
            <span>
              Yield so far <Num d={row.yielded} format="raw" dp={1} suffix="%" size="sm" />
              <span className="ml-1">of {num(c.expectedYield * 100, 1)}% expected</span>
            </span>
          </p>

          <SplitLegend row={row} />

          <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-3">
            <span>
              With the jobworker <Num d={row.acct.atVendor} format="raw" dp={3} suffix={` ${c.uom}`} size="sm" />
              {' · '}<Num d={row.valueOut} format="money" size="sm" />
            </span>
            {row.acct.inQc.value > 0 && (
              <span>
                Back, in QC <Num d={row.acct.inQc} format="raw" dp={3} suffix={` ${c.uom}`} size="sm" tone="accent" />
              </span>
            )}
            {missing && (
              <span>
                Unaccounted <Num d={row.acct.unaccounted} format="raw" dp={3} suffix={` ${c.uom}`} size="sm" tone="critical" />
                {' · '}<Num d={row.valueLost} format="money" size="sm" tone="critical" />
              </span>
            )}
          </p>

          {missing && !closed && (
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

          {!closed ? (
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" variant="primary" onClick={onReturn}>Book in a return</Button>
              {row.overdue && <Button size="sm" onClick={() => showChase(c.id)}>Draft a chase note</Button>}
              {row.overdue && <Button size="sm" onClick={onExtend}>Re-agree the date</Button>}
              <Button size="sm" variant={missing ? 'danger' : 'default'} onClick={onClose}>
                Close the challan
              </Button>
            </div>
          ) : c.closedOn && (
            <p className="mt-2 text-[11.5px] text-ink-3">Closed {shortDate(c.closedOn)}.</p>
          )}
        </td>
      </tr>
    </tbody>
  )
}

export function JobworkRegister() {
  const { challanRows, jobworkTotal, unaccountedTotal, jobworkers, policy } = useInbound()
  const [returning, setReturning] = useState<ChallanRow | null>(null)
  const [closing, setClosing] = useState<ChallanRow | null>(null)
  const [extending, setExtending] = useState<ChallanRow | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)

  const heaters = challanRows.filter((r) => r.challan.floor === 'heaters')
  const fabrication = challanRows.filter((r) => r.challan.floor === 'fabrication')
  const overdue = challanRows.filter((r) => r.overdue)

  const HEADS = ['', 'Challan', 'Jobworker · process', 'Item · sent', 'Where it is', 'Out', 'Missing', 'State']

  const table = (rows: ChallanRow[]) => (
    <div className="scroll-x relative overflow-x-auto">
      <table className="w-full min-w-[54rem] border-collapse text-[12px]">
        <thead>
          <tr className="mono border-b border-line text-left text-[9.5px] uppercase tracking-wider text-ink-3">
            {HEADS.map((h, i) => (
              <th key={h || i} className={`whitespace-nowrap py-1 font-normal ${
                i === 0 ? 'pl-2 pr-1' : i === 7 ? 'pl-4 pr-2' : i >= 5 ? 'pl-4 pr-2' : 'pr-2'} ${
                i >= 5 ? 'text-right' : ''} ${i === 3 ? 'w-full' : ''}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        {rows.map((r) => (
          <ChallanRowView key={r.challan.id} row={r}
            open={openId === r.challan.id}
            onToggle={() => setOpenId(openId === r.challan.id ? null : r.challan.id)}
            onReturn={() => setReturning(r)} onClose={() => setClosing(r)} onExtend={() => setExtending(r)} />
        ))}
      </table>
    </div>
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
        <div className="px-3 pb-2 pt-2.5">
          {overdue.length > 0 && (
            <p className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-critical/30 bg-critical-soft px-2.5 py-1.5 text-[12px] text-ink-2">
              <Icon name="alert" className="size-3.5 shrink-0 text-critical" />
              <strong className="text-ink">
                {overdue.length === 1 ? '1 challan' : `${overdue.length} challans`} past the promised date
              </strong>
              <span className="mono text-[11.5px]">
                {overdue.map((r) => `${r.challan.challanNo} (${r.late.value}d)`).join(', ')}
              </span>
            </p>
          )}

          <p className="mono mb-1 text-[10px] uppercase tracking-wider text-ink-3">
            Heater factory · §9.1 · as of {shortDate(heaters[0]?.challan.asOf ?? '')}
          </p>
          {table(heaters)}

          <p className="mono mb-1 mt-3 text-[10px] uppercase tracking-wider text-ink-3">
            Fabrication floor · §9.2 · as of {shortDate(fabrication[0]?.challan.asOf ?? '')} · behind the late-jobwork
            flag on <Link href="/production/line-watch" className="text-accent-ink normal-case hover:underline">Line Watch</Link>
          </p>
          {table(fabrication)}

          {/* the five words the rows no longer repeat, printed once */}
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10.5px] text-ink-3">
            {[['bg-good', 'back, in stock'], ['bg-accent/50', 'back, in inbound QC'], ['bg-accent', 'at the jobworker'],
              ['bg-ink-3/40', 'allowed process loss'], ['bg-critical', 'unaccounted']].map(([cls, label]) => (
              <li key={label} className="flex items-center gap-1.5">
                <span aria-hidden className={`inline-block h-2 w-4 rounded-full ${cls}`} />{label}
              </li>
            ))}
            <li className="text-ink-3">Click a challan for the quantities, the yield and what to do about it.</li>
          </ul>
        </div>

        <Note foot label="Why overdue is not the same as missing, and why two floors run on two dates">
          <p>
            Material that is out is neither on the shelf nor consumed, so it counts as neither, and none
            of it is cover (§11). A challan only reports material unaccounted once it closes, or once the
            jobworker starts returning short — which is why an overdue challan with nothing back is a
            chase, not a write-off.
          </p>
          <p className="mt-2">
            The fabrication floor runs on §9.2’s own Monday, five days after the heater factory’s date.
            Two floors, two run dates, one register — and the three fabrication challans are the source
            of the “with jobworker” quantities on Line Watch.
          </p>
        </Note>
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
        <Note foot label="Why a concentration limit is not about trust">
        A concentration limit is not about trust. It is about how much of your working capital can be
          standing in one shed you do not control — and whether you would know, on the day it burned
          down, what was in it. Valued at last purchase price, ex-freight (§13-1), the same basis the
          Inventory and Sourcing pages use.
      </Note>
      </Card>

      <ReturnDialog row={returning} onClose={() => setReturning(null)} />
      <CloseDialog row={closing} onClose={() => setClosing(null)} />
      <ExtendDialog row={extending} onClose={() => setExtending(null)} />
      <ChaseNote />
    </>
  )
}
