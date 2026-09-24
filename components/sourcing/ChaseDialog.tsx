'use client'
import { useEffect, useState } from 'react'
import { Dialog } from '@/components/ui/Dialog'
import { Field, Textarea, TextInput } from '@/components/ui/Field'
import { Icon } from '@/components/ui/icons'
import { useWorkspace } from '@/components/workspace/store'
import { mailtoUrl, waNumber, whatsappUrl } from '@/lib/paper/share'

/**
 * Words for a person to send.
 *
 * A late order, a jobworker past their date: the build drafts what to say, and
 * the buttons open WhatsApp or the mail app with it already in. §11 is the
 * rule — the system never contacts a supplier — so nothing here is sent until
 * somebody presses send in the app it opens. The text is editable first,
 * because the person sending it knows the supplier and the build does not.
 */
export function ChaseDialog({ open, onClose, title, sub, vendorId, subject, text }: {
  open: boolean
  onClose: () => void
  title: string
  sub?: string
  vendorId: string
  subject: string
  text: string
}) {
  const { workspace, update } = useWorkspace()
  const [body, setBody] = useState(text)
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!open || !workspace) return
    setBody(text); setCopied(false)
    const c = workspace.vendorContact[vendorId]
    setPhone(c?.phone ?? ''); setEmail(c?.email ?? '')
  }, [open, text, vendorId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open || !workspace) return null
  const vendor = workspace.vendors.find((v) => v.id === vendorId)
  const send = { vendor: vendor ? { name: vendor.name } : null, subject, message: body }

  // a number or address typed here is kept against the supplier for next time
  const keep = (patch: { phone?: string; email?: string }) =>
    update((w) => ({
      ...w,
      vendorContact: { ...w.vendorContact, [vendorId]: { ...w.vendorContact[vendorId], ...patch } },
    }))

  const wa = whatsappUrl(send, phone)
  const copy = async () => {
    try { await navigator.clipboard.writeText(body); setCopied(true) } catch { setCopied(false) }
  }

  return (
    <Dialog open onClose={onClose} wide title={title} sub={sub}>
      <div className="space-y-4 px-4 py-4">
        <Field label="The message" htmlFor="chase-text" hint="Change anything — you know them, the build does not.">
          <Textarea id="chase-text" rows={7} value={body} onChange={setBody} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={`${vendor?.name ?? 'Their'} WhatsApp`} htmlFor="chase-phone">
            <TextInput id="chase-phone" value={phone} onChange={setPhone} placeholder="+91 98220 11234" />
          </Field>
          <Field label="Or email" htmlFor="chase-email">
            <TextInput id="chase-email" value={email} onChange={setEmail} placeholder="sales@supplier.in" />
          </Field>
        </div>
        <p className="text-[11.5px] leading-snug text-ink-3">
          Nothing is sent from here. The buttons open WhatsApp or your mail app with this in it, and you press send.
        </p>
      </div>
      <footer className="flex flex-wrap items-center gap-2 border-t border-line-soft px-4 py-3">
        <button type="button" onClick={onClose}
          className="press rounded-lg px-2.5 py-2 text-[13px] text-ink-2 hover:text-ink">Close</button>
        <span className="ml-auto flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void copy()}
            className="press inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-[13px] font-medium hover:bg-surface-2">
            <Icon name={copied ? 'check' : 'doc'} className="size-3.5" />
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button type="button" disabled={!email.includes('@')}
            onClick={() => { keep({ email: email.trim() }); window.open(mailtoUrl(send, email.trim()), '_blank', 'noopener') }}
            className="press inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-[13px] font-medium hover:bg-surface-2 disabled:opacity-40">
            <Icon name="mail" className="size-3.5" />
            Email
          </button>
          <button type="button" disabled={!wa}
            title={wa ? undefined : waNumber(phone) === null ? 'Put in their number first' : undefined}
            onClick={() => { if (!wa) return; keep({ phone: phone.trim() }); window.open(wa, '_blank', 'noopener') }}
            className="press inline-flex items-center gap-1.5 rounded-lg border border-accent-ink bg-accent-ink px-3.5 py-2 text-[13px] font-semibold text-on-accent hover:bg-accent disabled:opacity-40">
            <Icon name="whatsapp" className="size-3.5" />
            WhatsApp
          </button>
        </span>
      </footer>
    </Dialog>
  )
}
