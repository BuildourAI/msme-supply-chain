'use client'
import { useEffect, useState } from 'react'
import { Dialog } from '@/components/ui/Dialog'
import { Field, NumberInput, Select, TextInput } from '@/components/ui/Field'
import { useWorkspace } from '@/components/workspace/store'
import { money, num, shortDate } from '@/lib/domain/format'
import { addDays } from '@/lib/workspace/sourcing'
import { challanRow } from '@/lib/workspace/inbound'
import {
  bookReturn, closeChallan, closeChallanProblem, extendDue, jobworkers, sendOut, sendOutProblem,
  usableOnHand,
} from '@/lib/workspace/jobwork'

/*
 * The four things that happen to a challan, each one a small dialog: material
 * leaves, material comes back, the date is re-agreed, the challan is settled.
 * Each writes one record, and each names the document it moved on.
 */

const DATE = 'num w-full rounded-md border border-line bg-surface px-2.5 py-2 text-[13px] outline-none focus:border-accent'

function Foot({ onClose, onSave, label, danger }: {
  onClose: () => void; onSave: () => void; label: string; danger?: boolean
}) {
  return (
    <footer className="flex items-center gap-2 border-t border-line-soft px-4 py-3">
      <button type="button" onClick={onClose}
        className="press rounded-lg px-2.5 py-2 text-[13px] text-ink-2 hover:text-ink">Cancel</button>
      <span className="ml-auto" />
      <button type="button" onClick={onSave}
        className={`press rounded-lg border px-3.5 py-2 text-[13px] font-semibold ${danger
          ? 'border-critical bg-critical text-on-accent hover:opacity-90'
          : 'border-accent-ink bg-accent-ink text-on-accent hover:bg-accent'}`}>
        {label}
      </button>
    </footer>
  )
}

/* ------------------------------------------------------------- send out -- */

/**
 * Material leaving for a jobworker.
 *
 * It comes off the usable shelf the moment it leaves — the challan is the
 * document it moves on — and it is shown as out with the jobworker, never as
 * cover, until it comes back through the gate.
 */
export function SendOutForm({ open, onClose, onAddJobworker }: {
  open: boolean; onClose: () => void; onAddJobworker?: () => void
}) {
  const { workspace, update, today, session } = useWorkspace()
  const [vendorId, setVendorId] = useState('')
  const [itemId, setItemId] = useState('')
  const [qty, setQty] = useState('')
  const [yieldPct, setYieldPct] = useState('100')
  const [sentOn, setSentOn] = useState('')
  const [due, setDue] = useState('')
  const [process, setProcess] = useState('')
  const [tried, setTried] = useState(false)

  useEffect(() => {
    if (!open || !workspace) return
    const firstItem = workspace.items.find((i) => usableOnHand(workspace, i.id) > 0) ?? workspace.items[0]
    setVendorId(jobworkers(workspace)[0]?.id ?? ''); setItemId(firstItem?.id ?? '')
    setQty(''); setYieldPct('100'); setSentOn(today); setDue(addDays(today, 7)); setProcess('')
    setTried(false)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open || !workspace) return null
  const ws = workspace
  const who = jobworkers(ws)

  if (who.length === 0) {
    return (
      <Dialog open onClose={onClose} title="Send material out">
        <div className="px-4 py-5">
          <p className="rounded-lg border border-warn/30 bg-warn-soft px-3 py-2.5 text-[13px] leading-relaxed text-ink-2">
            Nobody is set up as a jobworker yet. Add who you send material to — a name and how to
            reach them — and then send it.
          </p>
        </div>
        <Foot onClose={onClose} label="Add a jobworker" onSave={() => { onClose(); onAddJobworker?.() }} />
      </Dialog>
    )
  }

  const item = ws.items.find((i) => i.id === itemId)
  const have = itemId ? usableOnHand(ws, itemId) : 0
  const n = (v: string) => (v.trim() === '' ? NaN : Number(v))
  const s = {
    vendorId, itemId, qty: n(qty), sentOn, dueBack: due,
    expectedYield: n(yieldPct) / 100, process, actor: session?.actor ?? '',
  }
  const problem = sendOutProblem(ws, s)

  const save = () => {
    setTried(true)
    if (problem) return
    update((w) => sendOut(w, s)[0])
    onClose()
  }

  return (
    <Dialog open onClose={onClose} wide title="Send material out"
      sub="A challan for what leaves — it comes off the shelf now and back through the gate">
      <div className="space-y-4 px-4 py-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="To" htmlFor="jw-vendor">
            <Select id="jw-vendor" value={vendorId} onChange={setVendorId}
              options={who.map((v) => ({ value: v.id, label: v.name }))} />
          </Field>
          <Field label="What they are doing to it" htmlFor="jw-process" hint="Cutting, bending, galvanising, plating…">
            <TextInput id="jw-process" value={process} onChange={setProcess} placeholder="Laser cutting" />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Material" htmlFor="jw-item">
            <Select id="jw-item" value={itemId} onChange={setItemId}
              options={ws.items.map((i) => ({ value: i.id, label: i.name }))} />
          </Field>
          <Field label="How much is going" htmlFor="jw-qty"
            hint={`${num(have, 3)} ${item?.uom ?? ''} usable on the shelf`}>
            <NumberInput id="jw-qty" value={qty} onChange={setQty} unit={item?.uom} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Should come back" htmlFor="jw-yield"
            hint="Per 100 sent. Below 100 for cutting; above for galvanising, which adds weight.">
            <NumberInput id="jw-yield" value={yieldPct} onChange={setYieldPct} unit="%" />
          </Field>
          <Field label="Left on" htmlFor="jw-on">
            <input id="jw-on" type="date" value={sentOn} max={today} onChange={(e) => setSentOn(e.target.value)} className={DATE} />
          </Field>
          <Field label="Promised back" htmlFor="jw-due">
            <input id="jw-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} className={DATE} />
          </Field>
        </div>

        {Number.isFinite(s.qty) && s.qty > 0 && s.qty <= have && (
          <p className="rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-[12.5px] leading-relaxed text-ink-2">
            <strong className="text-ink">{num(have - s.qty, 3)} {item?.uom}</strong> stays usable on the shelf.
            The {num(s.qty, 3)} {item?.uom} going out is worth {money(s.qty * (item?.lastPurchaseRate ?? 0))} at what
            you last paid, and counts as nobody&apos;s cover until it is back and inspected.
          </p>
        )}
        {tried && problem && <p className="text-[12.5px] text-critical">{problem}</p>}
      </div>
      <Foot onClose={onClose} onSave={save} label="Send it out" />
    </Dialog>
  )
}

/* ------------------------------------------------------------ it's back -- */

/**
 * Material back from the jobworker — at the gate, not on the shelf. The
 * receipt waits to be inspected like any delivery.
 */
export function ReturnForm({ challanId, onClose, onBooked }: {
  challanId: string | null
  onClose: () => void
  /** handed the challan, so a screen can go straight on to inspecting it */
  onBooked?: (challanId: string) => void
}) {
  const { workspace, update, today } = useWorkspace()
  const [qty, setQty] = useState('')
  const [on, setOn] = useState('')
  const [note, setNote] = useState('')
  const [tried, setTried] = useState(false)
  const row = workspace && challanId
    ? (() => { const c = (workspace.challans ?? []).find((x) => x.id === challanId); return c ? challanRow(workspace, c, today) : null })()
    : null

  useEffect(() => {
    if (!row) return
    setQty(String(Math.max(0, row.acct.atVendor.value + row.acct.unaccounted.value)))
    setOn(today); setNote(''); setTried(false)
  }, [challanId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!workspace || !row) return null
  const c = row.challan
  const outstanding = row.acct.atVendor.value + row.acct.unaccounted.value
  const n = qty.trim() === '' ? NaN : Number(qty)
  const ok = Number.isFinite(n) && n > 0 && on.length === 10 && on >= c.sentOn && on <= today

  const save = () => {
    setTried(true)
    if (!ok) return
    update((w) => bookReturn(w, c.id, { qty: n, receivedOn: on, note })[0])
    onClose()
    onBooked?.(c.id)
  }

  return (
    <Dialog open onClose={onClose} title={`${c.no} — it came back`}
      sub={`${row.vendor?.name ?? 'The jobworker'} · ${num(outstanding, 3)} ${row.uom} still out`}>
      <div className="space-y-4 px-4 py-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="How much came back" htmlFor="jw-back-qty" hint="Weighed or counted at the gate.">
            <NumberInput id="jw-back-qty" value={qty} onChange={setQty} unit={row.uom} />
          </Field>
          <Field label="On" htmlFor="jw-back-on">
            <input id="jw-back-on" type="date" value={on} max={today} min={c.sentOn}
              onChange={(e) => setOn(e.target.value)} className={DATE} />
          </Field>
        </div>
        <Field label="Anything worth remembering" hint="Optional.">
          <TextInput value={note} onChange={setNote} />
        </Field>
        {Number.isFinite(n) && n > outstanding && (
          <p className="text-[12px] leading-relaxed text-warn">
            That is more than is still out. Galvanising returns more weight than it took; anything else is worth
            a second look before you book it.
          </p>
        )}
        <p className="rounded-lg border border-warn/30 bg-warn-soft px-3 py-2.5 text-[12.5px] leading-relaxed text-ink-2">
          It waits at the gate until somebody inspects it, like any delivery. Until then none of it is usable
          stock — nothing skips inspection because it was ours to begin with.
        </p>
        {tried && !ok && <p className="text-[12.5px] text-critical">Put in what came back, and a date since it left.</p>}
      </div>
      <Foot onClose={onClose} onSave={save} label="It's at the gate" />
    </Dialog>
  )
}

/* -------------------------------------------------------- a new date -- */

export function ExtendDueDialog({ challanId, onClose }: { challanId: string | null; onClose: () => void }) {
  const { workspace, update, today } = useWorkspace()
  const [to, setTo] = useState('')
  const [reason, setReason] = useState('')
  const [tried, setTried] = useState(false)
  const c = workspace && challanId ? (workspace.challans ?? []).find((x) => x.id === challanId) : undefined

  useEffect(() => {
    if (!c) return
    setTo(addDays(c.dueBack > today ? c.dueBack : today, 3)); setReason(''); setTried(false)
  }, [challanId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!workspace || !c) return null
  const vendor = workspace.vendors.find((v) => v.id === c.vendorId)
  const ok = to > c.dueBack && reason.trim().length >= 4

  const save = () => {
    setTried(true)
    if (!ok) return
    update((w) => extendDue(w, c.id, { to, reason, on: today }))
    onClose()
  }

  return (
    <Dialog open onClose={onClose} title={`${c.no} — a new date`}
      sub={`Promised ${shortDate(c.dueBack)}${c.extensions?.length ? ` · moved ${c.extensions.length} time${c.extensions.length === 1 ? '' : 's'} before` : ''}`}>
      <div className="space-y-4 px-4 py-4">
        <Field label={`New date, agreed with ${vendor?.name ?? 'the jobworker'}`} htmlFor="jw-extend-to">
          <input id="jw-extend-to" type="date" value={to} min={c.dueBack} onChange={(e) => setTo(e.target.value)} className={DATE} />
        </Field>
        <Field label="What did they say?" htmlFor="jw-extend-reason">
          <TextInput id="jw-extend-reason" value={reason} onChange={setReason}
            placeholder="Called — plating line down, promised Friday" />
        </Field>
        <p className="text-[12px] leading-relaxed text-ink-3">
          The old date stays on the record. A re-agreed date is not an on-time return, and the ledger keeps saying so.
        </p>
        {tried && !ok && <p className="text-[12.5px] text-critical">A later date, and what they said.</p>}
      </div>
      <Foot onClose={onClose} onSave={save} label="Record the new date" />
    </Dialog>
  )
}

/* ------------------------------------------------------------ settle -- */

/**
 * Closing a challan against a written reason. What is neither back nor
 * explained by the process is written off, by name, with the reason.
 */
export function CloseChallanDialog({ challanId, onClose }: { challanId: string | null; onClose: () => void }) {
  const { workspace, update, today } = useWorkspace()
  const [reason, setReason] = useState('')
  const [tried, setTried] = useState(false)
  useEffect(() => { setReason(''); setTried(false) }, [challanId])

  if (!workspace || !challanId) return null
  const c = (workspace.challans ?? []).find((x) => x.id === challanId)
  if (!c) return null
  // what it WOULD write off: the split as it stands once closed
  const settled = challanRow(workspace, { ...c, status: 'closed' }, today)
  const lost = settled.acct.unaccounted.value
  const loss = settled.acct.processLoss.value
  const problem = closeChallanProblem(workspace, c.id, reason)

  const save = () => {
    setTried(true)
    if (problem) return
    update((w) => closeChallan(w, c.id, { reason, on: today, unaccounted: lost }))
    onClose()
  }

  return (
    <Dialog open onClose={onClose} title={`Close ${c.no}`}
      sub={`${settled.vendor?.name ?? 'The jobworker'}${c.process ? ` · ${c.process.toLowerCase()}` : ''}`}>
      <div className="space-y-4 px-4 py-4">
        {lost > 0 ? (
          <p className="rounded-lg border border-critical/30 bg-critical-soft px-3 py-2.5 text-[12.5px] leading-relaxed text-ink-2" data-writeoff>
            Closing this writes off <strong className="text-ink">{num(lost, 3)} {settled.uom}</strong> —{' '}
            <strong className="text-ink">{money(settled.valueLost.value)}</strong> — as unaccounted: it left, it is not
            back, and the process does not explain it.{loss > 0 && <> {num(loss, 3)} {settled.uom} more is the process loss you allowed.</>}
          </p>
        ) : (
          <p className="rounded-lg border border-good/30 bg-good-soft px-3 py-2.5 text-[12.5px] leading-relaxed text-ink-2">
            Everything that left is back{loss > 0 && <>, or inside the {num(loss, 3)} {settled.uom} of process loss you allowed</>}. This closes clean.
          </p>
        )}
        <Field label="Why is it closing?" htmlFor="jw-close-reason">
          <TextInput id="jw-close-reason" value={reason} onChange={setReason}
            placeholder={lost > 0 ? 'Agreed with them as scrap · written off after a count' : 'Job done, all back'} />
        </Field>
        {tried && problem && <p className="text-[12.5px] text-critical">{problem}</p>}
      </div>
      <Foot onClose={onClose} onSave={save} danger={lost > 0}
        label={lost > 0 ? `Close and write off ${money(settled.valueLost.value)}` : 'Close the challan'} />
    </Dialog>
  )
}
