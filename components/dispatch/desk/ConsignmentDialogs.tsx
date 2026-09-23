'use client'
import { useEffect, useState } from 'react'
import { Dialog } from '@/components/ui/Dialog'
import { Field, TextInput } from '@/components/ui/Field'
import { Icon } from '@/components/ui/icons'
import { useWorkspace } from '@/components/workspace/store'
import { DATE } from '@/components/production/desk/ProductForm'
import { daysBetween } from '@/lib/domain/calc'
import { shortDate } from '@/lib/domain/format'
import { whatsappUrl } from '@/lib/paper/share'
import { chaseText, chasedKey, consignmentRows, deliverProblem, markDelivered } from '@/lib/workspace/consignments'

/**
 * A consignment confirmed as delivered: the day, and who said so and how.
 * A delivery date with nobody's name on it is a guess, and on time and in
 * full is only as good as the dates under it.
 */
export function DeliveredDialog({ consignmentId, onClose }: { consignmentId: string | null; onClose: () => void }) {
  const { workspace, update, today } = useWorkspace()
  const [on, setOn] = useState('')
  const [by, setBy] = useState('')
  const [tried, setTried] = useState(false)

  useEffect(() => {
    if (!consignmentId) return
    setOn(today); setBy(''); setTried(false)
  }, [consignmentId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!consignmentId || !workspace) return null
  const r = consignmentRows(workspace, today).find((x) => x.consignment.id === consignmentId)
  if (!r) return null
  const problem = deliverProblem(workspace, consignmentId, { on, by }, today)
  const drift = on ? daysBetween(r.consignment.promisedDate, on) : 0

  const save = () => {
    setTried(true)
    if (problem) return
    update((w) => markDelivered(w, consignmentId, { on, by }, today))
    onClose()
  }

  return (
    <Dialog open onClose={onClose} title={`${r.note.no} delivered`}
      sub={`To ${r.customer?.name ?? 'the customer'} with ${r.carrier?.name ?? 'the carrier'}, promised ${shortDate(r.consignment.promisedDate)}.`}>
      <div className="space-y-3 px-4 py-4">
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] items-end gap-2">
          <Field label="Arrived on" htmlFor="dl-on">
            <input id="dl-on" type="date" value={on} min={r.note.on} max={today} onChange={(e) => setOn(e.target.value)} className={DATE} />
          </Field>
          <Field label="Who confirmed it, and how" htmlFor="dl-by">
            <TextInput id="dl-by" value={by} onChange={setBy} placeholder="S. Patil at their stores, on the phone" autoFocus />
          </Field>
        </div>
        {on && (
          <p className={`text-[12.5px] ${drift > 0 ? 'text-warn' : 'text-good'}`}>
            {drift > 0 ? `${drift} day${drift === 1 ? '' : 's'} after the promise — it counts as late.` : drift < 0 ? `${-drift} day${drift === -1 ? '' : 's'} early.` : 'On the day promised.'}
            {!r.inFull && ' The order was not all out by then, so it counts as short.'}
          </p>
        )}
        {tried && problem && <p role="alert" className="text-[12.5px] text-critical">{problem}</p>}
      </div>
      <footer className="flex items-center justify-end gap-2 border-t border-line-soft px-4 py-3">
        <button type="button" onClick={onClose}
          className="press rounded-lg px-2.5 py-2 text-[13px] text-ink-2 hover:text-ink">Cancel</button>
        <button type="button" onClick={save}
          className="press rounded-lg border border-accent-ink bg-accent-ink px-3.5 py-2 text-[13px] font-semibold text-on-accent hover:bg-accent">
          Mark delivered
        </button>
      </footer>
    </Dialog>
  )
}

/**
 * A message for a person to send the carrier. Nothing is sent from here: the
 * button opens WhatsApp with the words in it, or the words are copied. The
 * day it was chased is kept, so the card can say so.
 */
export function ChaseDialog({ consignmentId, onClose }: { consignmentId: string | null; onClose: () => void }) {
  const { workspace, update, today } = useWorkspace()
  const [copied, setCopied] = useState(false)
  useEffect(() => { setCopied(false) }, [consignmentId])
  if (!consignmentId || !workspace) return null
  const r = consignmentRows(workspace, today).find((x) => x.consignment.id === consignmentId)
  if (!r) return null
  const words = chaseText(r, workspace.company.name)
  const wa = whatsappUrl({ vendor: r.carrier ? { name: r.carrier.name } : null, subject: `Consignment ${r.note.no}`, message: words }, r.carrier?.phone)
  const chased = () => update((w) => ({ ...w, drafts: { ...w.drafts, [chasedKey(consignmentId)]: today } }))

  return (
    <Dialog open onClose={onClose} title={`Chase ${r.carrier?.name ?? 'the carrier'} about ${r.note.no}`}
      sub="The words to send. You send them; nothing leaves from here.">
      <div className="space-y-3 px-4 py-4">
        <pre className="whitespace-pre-wrap rounded-lg border border-line bg-surface-2 px-3 py-2.5 font-sans text-[13px] leading-relaxed text-ink">{words}</pre>
        {!r.carrier?.phone && (
          <p className="text-[12px] text-ink-3">No phone number on {r.carrier?.name ?? 'this carrier'} — add one on Carriers and this opens WhatsApp.</p>
        )}
      </div>
      <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line-soft px-4 py-3">
        <button type="button" onClick={async () => {
          try { await navigator.clipboard.writeText(words); setCopied(true); chased() } catch { setCopied(false) }
        }}
          className="press inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-[13px] font-medium hover:bg-surface-2">
          <Icon name={copied ? 'check' : 'doc'} className="size-3.5" /> {copied ? 'Copied' : 'Copy the words'}
        </button>
        {wa && (
          <a href={wa} target="_blank" rel="noreferrer" onClick={chased}
            className="press inline-flex items-center gap-1.5 rounded-lg border border-accent-ink bg-accent-ink px-3.5 py-2 text-[13px] font-semibold text-on-accent hover:bg-accent">
            <Icon name="whatsapp" className="size-3.5" /> Open WhatsApp
          </a>
        )}
      </footer>
    </Dialog>
  )
}
