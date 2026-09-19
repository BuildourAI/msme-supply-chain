'use client'
import { useEffect, useMemo, useState } from 'react'
import { Wizard, type WizardStep } from '@/components/ui/Wizard'
import { Chips, Field, NumberInput, Select, TextInput, Textarea } from '@/components/ui/Field'
import { Icon } from '@/components/ui/icons'
import { CustomFields } from '@/components/sheet/CustomFields'
import { useWorkspace } from '@/components/workspace/store'
import { issueId } from '@/lib/workspace/defaults'
import { findVendorByName, parseUom, UOM_VALUES } from '@/lib/workspace/records'
import { applyApproval, planApproval, type ApprovalLine } from '@/lib/intake/apply'
import { draftLines } from '@/lib/intake/draft'
import { acceptFiles, readDocument } from '@/lib/intake/read'
import { readImage } from '@/lib/intake/ocr'
import { putFile } from '@/lib/intake/blobs'
import { AUTO, preselect } from '@/lib/intake/match'
import { MAX_DOC_LINES, type DocChannel, type DocLine, type DocRead, type SupplierDoc } from '@/lib/intake/types'
import { ConfidenceBar } from './ConfidenceBar'
import type { Uom } from '@/lib/domain/types'

/**
 * A supplier's document, from the file to the suppliers table.
 *
 * This is the owner's version of the sample company's SRC-02, and the one thing
 * it does differently is that the document is real. The sample's viewer draws a
 * facsimile in CSS and says so in its own header; there was never a file. Here
 * there is, and everything on screen has to be honest about what was actually
 * read out of it.
 *
 * Three steps, the shape the spreadsheet import already uses. Who it is from
 * comes first because a supplier's learned wordings cannot be applied until we
 * know which supplier it is — so choosing them is part of opening the document,
 * not a detail confirmed afterwards.
 *
 * Nothing is written until the last step. §11 holds throughout: this reads a
 * document the owner already has and suggests what it thinks the lines are. It
 * does not reply to the supplier, and it does not order anything.
 */
export function UploadDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { workspace, update, today, session } = useWorkspace()

  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [pct, setPct] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [read, setRead] = useState<DocRead>('typed')

  const [vendorId, setVendorId] = useState('')
  const [vendorName, setVendorName] = useState('')
  const [channel, setChannel] = useState<DocChannel>('email')
  const [receivedAt, setReceivedAt] = useState(today)
  const [typed, setTyped] = useState('')

  const [lines, setLines] = useState<DocLine[]>([])
  const [type, setType] = useState('')
  const [terms, setTerms] = useState('30')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [custom, setCustom] = useState<Record<string, string>>({})
  const [done, setDone] = useState<{ added: number; rates: number } | null>(null)

  const reset = () => {
    setFile(null); setBusy(null); setPct(0); setError(null); setNote(null); setRead('typed')
    setVendorId(''); setVendorName(''); setChannel('email'); setReceivedAt(today)
    setTyped(''); setLines([]); setType(''); setTerms('30')
    setPhone(''); setEmail(''); setCustom({}); setDone(null)
  }

  useEffect(() => { if (open) reset() }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open || !workspace) return null
  const ws = workspace

  /* ------------------------------------------------------------- reading -- */

  const known = vendorId ? ws.vendors.find((v) => v.id === vendorId) : undefined
  const forName = known?.name ?? vendorName

  const ingest = async (rows: string[][], how: DocRead, source: string) => {
    const drafted = draftLines(ws, vendorId || undefined, rows, 'SD-new')
    setLines(drafted)
    setRead(how)
    if (drafted.length === 0) {
      setError(`Nothing priced was found in ${source}. Check it is the right file, or type the lines in.`)
    }
  }

  const pick = async (f: File) => {
    setError(null); setNote(null); setFile(f); setPct(0)
    setBusy(/\.(png|jpe?g|webp)$/i.test(f.name) ? 'Reading the photograph' : 'Reading the document')
    try {
      const out = await readDocument(f, readImage, setPct)
      setNote(out.note ?? null)
      await ingest(out.rows, out.read, f.name)
    } catch (e) {
      setError((e as Error).message)
      setLines([])
    } finally {
      setBusy(null)
    }
  }

  const useTyped = () => {
    setError(null)
    const rows = typed.split(/\r?\n/).map((r) => r.split('\t').map((c) => c.trim()))
    void ingest(rows, 'typed', 'what you typed')
  }

  /* ------------------------------------------------------------ the lines -- */

  const setLine = (id: string, patch: Partial<DocLine>) =>
    setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)))

  const kept = lines.filter((l) => l.decision !== 'rejected')
  const approvalLines = (): ApprovalLine[] => kept.map((l) => ({
    raw: l.raw,
    itemId: l.itemId ?? '',
    rate: l.rate ?? 0,
    qty: l.qty,
    creates: l.creates,
    newName: l.newName ?? l.raw,
    newUom: l.newUom ?? parseUom(l.uom ?? '') ?? 'nos',
    // a wording worth remembering is one a person settled, or one that was
    // already certain. A guess the owner has not looked at teaches nothing.
    learn: Boolean(l.itemId) && (l.via !== 'alias'),
  }))

  const draftDoc = (id: string): SupplierDoc => ({
    id,
    vendorId: vendorId || undefined,
    vendorName: forName.trim(),
    fileName: file?.name ?? 'Typed in',
    mime: file?.type ?? 'text/plain',
    bytes: file?.size ?? 0,
    channel,
    read,
    receivedAt,
    addedAt: today,
    lines: lines.map((l, n) => ({ ...l, id: `${id}/${n + 1}` })),
    status: 'draft',
  })

  const plan = planApproval(ws, {
    doc: draftDoc('SD-preview'),
    vendorId: vendorId || undefined,
    vendorName: forName,
    lines: approvalLines(),
    actor: session.actor,
    today,
  })

  /* ----------------------------------------------------------- approving -- */

  const run = () => {
    /*
     * The id is issued inside the update, never before it — the same rule every
     * other writer in this build follows, and the reason a deleted record can
     * never hand its id to the next one.
     */
    let saved: { id: string; added: number; rates: number } | undefined
    update((w0) => {
      const [w, id] = issueId(w0, 'SD')
      const result = applyApproval(w, {
        doc: draftDoc(id),
        vendorId: vendorId || undefined,
        vendorName: forName,
        vendorType: type || undefined,
        contact: { phone: phone.trim() || undefined, email: email.trim() || undefined },
        custom: Object.keys(custom).length ? custom : undefined,
        termsDays: Number(terms) >= 0 ? Number(terms) : undefined,
        lines: approvalLines(),
        actor: session.actor,
        today,
      })
      saved = { id, added: result.undo.added, rates: result.undo.vendorItemsBefore?.length ?? 0 }
      return result.ws
    })

    /*
     * The file is kept after the write, never before it, and never awaited by
     * the screen. An owner whose browser refuses storage still gets their
     * supplier and their rates — they simply cannot reopen the original.
     */
    const out = saved as { id: string; added: number; rates: number } | undefined
    if (out && file) void putFile(out.id, file, today)
    setDone({ added: out?.added ?? 0, rates: out?.rates ?? 0 })
  }

  /* --------------------------------------------------------------- steps -- */

  const steps: WizardStep[] = [
    {
      label: 'Document',
      title: 'What came in, and who from?',
      why: 'The supplier comes first — their own wordings can only be recognised once we know which supplier it is.',
      invalid: lines.length > 0 && forName.trim().length > 1
        ? null
        : lines.length === 0 ? 'Open a document, or type the lines in.' : 'Say who it is from.',
      body: (
        <Source
          file={file} busy={busy} pct={pct} error={error} note={note} lines={lines.length}
          typed={typed} onTyped={setTyped} onUseTyped={useTyped}
          onPick={(f) => void pick(f)}
          onClear={reset}
          vendorId={vendorId} vendorName={vendorName}
          vendors={ws.vendors.map((v) => ({ value: v.id, label: v.name }))}
          onVendor={(id) => { setVendorId(id); if (id) setVendorName('') }}
          onVendorName={setVendorName}
          channel={channel} onChannel={setChannel}
          receivedAt={receivedAt} onReceivedAt={setReceivedAt}
        />
      ),
    },
    {
      label: 'Lines',
      title: `What ${forName.trim() || 'they'} quoted`,
      why: 'Every line, with what it was matched to and how sure that is. Nothing is written until the last step.',
      invalid: plan.ratesSet > 0 ? null : 'Give at least one line a material, or add it as a new one.',
      body: (
        <Lines
          lines={lines} onLine={setLine}
          items={ws.items.map((i) => ({ value: i.id, label: i.name }))}
          hasItems={ws.items.length > 0}
        />
      ),
    },
    {
      label: 'Check',
      title: done ? 'Filed' : 'What this will do',
      invalid: null,
      body: done
        ? <Finished {...done} plan={plan} />
        : (
          <Check
            plan={plan} newSupplier={!known}
            type={type} onType={setType}
            terms={terms} onTerms={setTerms}
            phone={phone} onPhone={setPhone}
            email={email} onEmail={setEmail}
            custom={custom} onCustom={setCustom}
            types={ws.categories.supplierType.map((t) => ({ value: t, label: t }))}
            onAddType={(v) => update((w) => ({
              ...w, categories: { ...w.categories, supplierType: [...w.categories.supplierType, v] },
            }))}
          />
        ),
    },
  ]

  return (
    <Wizard open={open} onClose={onClose} title="Upload a supplier document"
      sub={file?.name} steps={steps}
      onDone={done ? onClose : run}
      doneLabel={done ? 'Close' : `Approve ${plan.ratesSet} line${plan.ratesSet === 1 ? '' : 's'}`} />
  )
}

/* ------------------------------------------------------------------ step 1 -- */

function Source(p: {
  file: File | null
  busy: string | null
  pct: number
  error: string | null
  note: string | null
  lines: number
  typed: string
  onTyped: (v: string) => void
  onUseTyped: () => void
  onPick: (f: File) => void
  onClear: () => void
  vendorId: string
  vendorName: string
  vendors: { value: string; label: string }[]
  onVendor: (id: string) => void
  onVendorName: (v: string) => void
  channel: DocChannel
  onChannel: (c: DocChannel) => void
  receivedAt: string
  onReceivedAt: (v: string) => void
}) {
  const [over, setOver] = useState(false)
  const [manual, setManual] = useState(false)

  return (
    <div className="space-y-4">
      {p.file && !p.busy ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2.5">
          <Icon name={p.lines > 0 ? 'check' : 'doc'}
            className={`size-4 shrink-0 ${p.lines > 0 ? 'text-good' : 'text-ink-3'}`} />
          <span className="min-w-0 text-[13px]">
            <strong className="font-semibold">{p.file.name}</strong>
            {p.lines > 0 && <span className="text-ink-2"> · {p.lines} priced line{p.lines === 1 ? '' : 's'}</span>}
          </span>
          <button type="button" onClick={p.onClear}
            className="press ml-auto shrink-0 text-[12px] text-ink-2 underline underline-offset-2 hover:text-ink">
            Start again
          </button>
        </div>
      ) : p.busy ? (
        <div className="rounded-lg border border-line bg-surface-2 px-3 py-3">
          <p className="text-[13px] font-medium">{p.busy}…</p>
          <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-surface-3">
            <span className="block h-full rounded-full bg-accent transition-[width] duration-300"
              style={{ width: `${Math.max(p.pct, 6)}%` }} />
          </span>
          {/* worth saying on a screen asking for a picture of a supplier's prices */}
          <p className="mt-2 text-[11.5px] text-ink-3">
            This happens on your device. The file is not sent anywhere to be read.
          </p>
        </div>
      ) : (
        <label
          onDragOver={(e) => { e.preventDefault(); setOver(true) }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault(); setOver(false)
            const f = e.dataTransfer.files[0]
            if (f) p.onPick(f)
          }}
          className={`flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed px-4 py-7 text-center transition-colors ${
            over ? 'border-accent bg-accent-tint/40' : 'border-line hover:border-ink-4 hover:bg-surface-2'}`}>
          <Icon name="upload" className="mb-2 size-6 text-ink-3" />
          <span className="text-[13.5px] font-medium">Drop a quote or price list here, or choose one</span>
          <span className="mt-1 text-[12px] text-ink-3">
            A PDF, a photo of a printed quote, or a spreadsheet
          </span>
          <input type="file" className="sr-only" accept={acceptFiles()}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) p.onPick(f) }} />
        </label>
      )}

      {p.error && (
        <p className="rounded-lg border border-warn/40 bg-warn-soft px-3 py-2.5 text-[12.5px] leading-snug text-ink-2">
          {p.error}
        </p>
      )}
      {p.note && (
        <p className="rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-[12.5px] leading-snug text-ink-2">
          {p.note}
        </p>
      )}

      {/*
        * Always offered, not only after a failure. A hand-filled quotation pad
        * photographed at an angle is not reliably readable by anything, and
        * somebody who knows their document has three lines should be able to
        * walk straight past the reader.
        */}
      {!manual ? (
        <button type="button" onClick={() => setManual(true)}
          className="press text-[12.5px] text-accent-ink underline underline-offset-2">
          Type the lines in myself
        </button>
      ) : (
        <div className="space-y-2">
          <Field label="One line each: what they called it, quantity, unit, rate"
            hint="Separate the columns with a tab, or paste them straight out of a sheet.">
            <Textarea value={p.typed} onChange={p.onTyped} rows={5} mono
              placeholder={'CRCA SHEET 1.2MM\t12\tMT\t62800'} />
          </Field>
          {p.typed.trim() !== '' && (
            <button type="button" onClick={p.onUseTyped}
              className="press rounded-lg border border-line bg-surface px-3 py-2 text-[13px] font-medium hover:bg-surface-2">
              Use what I typed
            </button>
          )}
        </div>
      )}

      <div className="grid gap-4 border-t border-line-soft pt-4 sm:grid-cols-2">
        <Field label="Who is it from?" htmlFor="ud-vendor">
          <Select id="ud-vendor" value={p.vendorId} onChange={p.onVendor}
            placeholder="A supplier not on your list" options={p.vendors} />
        </Field>
        {!p.vendorId && (
          <Field label="Their name" htmlFor="ud-name">
            <TextInput id="ud-name" value={p.vendorName} onChange={p.onVendorName}
              placeholder="Shah Metals & Alloys" />
          </Field>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="How did it arrive?">
          <Chips value={p.channel} onChange={(v) => p.onChannel(v as DocChannel)}
            options={[
              { value: 'email', label: 'Email' },
              { value: 'whatsapp', label: 'WhatsApp' },
              { value: 'hand', label: 'By hand' },
            ]} />
        </Field>
        <Field label="Date on the document" htmlFor="ud-date">
          <input id="ud-date" type="date" value={p.receivedAt}
            onChange={(e) => p.onReceivedAt(e.target.value)}
            className="w-full rounded-md border border-line bg-surface px-2.5 py-2 text-[13px] outline-none transition-colors focus:border-accent" />
        </Field>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ step 2 -- */

function Lines({ lines, onLine, items, hasItems }: {
  lines: DocLine[]
  onLine: (id: string, patch: Partial<DocLine>) => void
  items: { value: string; label: string }[]
  hasItems: boolean
}) {
  const waiting = lines.filter((l) => l.decision !== 'rejected' && l.confidence < AUTO).length

  return (
    <div className="space-y-3">
      <p className="text-[12.5px] leading-snug text-ink-2">
        {waiting === 0
          ? 'Every line cleared the floor on its own. Look them over anyway.'
          : <>
            <strong className="text-ink">{waiting} line{waiting === 1 ? '' : 's'} need{waiting === 1 ? 's' : ''} you.</strong>
            {' '}The rest matched on their own. Nothing below the floor is filled in for you.
          </>}
      </p>

      {!hasItems && (
        <p className="rounded-lg border border-warn/40 bg-warn-soft px-3 py-2.5 text-[12.5px] leading-snug text-ink-2">
          You have no materials yet, so nothing can be matched. Tick a line to add it as a material.
        </p>
      )}

      <ul className="space-y-2">
        {lines.map((l) => {
          const off = l.decision === 'rejected'
          return (
            <li key={l.id}
              className={`rounded-lg border p-2.5 transition-colors ${
                off ? 'border-line-soft bg-surface-2 opacity-55' : 'border-line bg-surface'}`}>
              <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
                <p className="min-w-0 flex-1 text-[12.5px] font-medium leading-snug">
                  {/* their wording, never edited — it is the evidence */}
                  {l.raw}
                </p>
                <span className="mono shrink-0 text-[12px] text-ink-2">
                  {l.rate !== undefined ? `₹${l.rate.toLocaleString('en-IN')}` : '—'}
                  {l.uom && <span className="text-ink-3">/{l.uom}</span>}
                </span>
                <button type="button"
                  onClick={() => onLine(l.id, { decision: off ? undefined : 'rejected' })}
                  title={off ? 'Put this line back' : 'Leave this line out'}
                  className="press shrink-0 rounded-md p-1 text-ink-4 hover:bg-surface-3 hover:text-ink">
                  <Icon name={off ? 'undo' : 'close'} className="size-3.5" />
                  <span className="sr-only">{off ? 'Put this line back' : 'Leave this line out'}</span>
                </button>
              </div>

              {!off && (
                <div className="mt-2 grid items-end gap-2 sm:grid-cols-[1.5fr_auto]">
                  <Field label="Material">
                    <Select
                      value={preselect(l.confidence) ? (l.itemId ?? '') : (l.itemId && l.via === 'alias' ? l.itemId : '')}
                      onChange={(v) => onLine(l.id, { itemId: v || undefined })}
                      placeholder={l.itemId && !preselect(l.confidence)
                        ? `Closest: ${items.find((i) => i.value === l.itemId)?.label ?? ''}`
                        : 'Pick one'}
                      options={items} />
                  </Field>
                  <div className="pb-1.5">
                    <ConfidenceBar value={l.confidence} via={l.via} />
                  </div>
                </div>
              )}

              {!off && !l.itemId && (
                <div className="mt-2 rounded-md border border-line-soft bg-surface-2 p-2">
                  <label className="flex items-center gap-2 text-[12px]">
                    <input type="checkbox" checked={Boolean(l.creates)}
                      onChange={(e) => onLine(l.id, {
                        creates: e.target.checked,
                        newName: l.newName ?? l.raw,
                        newUom: l.newUom ?? parseUom(l.uom ?? '') ?? 'nos',
                      })}
                      className="size-3.5 accent-[var(--accent-ink)]" />
                    Add this as a new material
                  </label>
                  {l.creates && (
                    <div className="mt-2 grid gap-2 sm:grid-cols-[2fr_1fr]">
                      <Field label="Call it">
                        <TextInput value={l.newName ?? ''} label="Name for the new material"
                          onChange={(v) => onLine(l.id, { newName: v })} />
                      </Field>
                      <Field label="Bought in">
                        <Select value={l.newUom ?? 'nos'}
                          onChange={(v) => onLine(l.id, { newUom: v as Uom })}
                          options={UOM_VALUES.map((u) => ({ value: u, label: u }))} />
                      </Field>
                    </div>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {lines.length >= MAX_DOC_LINES && (
        <p className="text-[11.5px] text-ink-3">
          Only the first {MAX_DOC_LINES} lines were read.
        </p>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ step 3 -- */

function Check(p: {
  plan: ReturnType<typeof planApproval>
  newSupplier: boolean
  type: string
  onType: (v: string) => void
  terms: string
  onTerms: (v: string) => void
  phone: string
  onPhone: (v: string) => void
  email: string
  onEmail: (v: string) => void
  custom: Record<string, string>
  onCustom: (v: Record<string, string>) => void
  types: { value: string; label: string }[]
  onAddType: (v: string) => void
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Count n={p.plan.vendor.status === 'new' ? 1 : 0} one="new supplier" many="new suppliers" />
        <Count n={p.plan.ratesSet} one="rate" many="rates" />
        <Count n={p.plan.itemsCreated} one="new material" many="new materials" />
        <Count n={p.plan.aliasesLearned} one="wording learned" many="wordings learned" />
        {p.plan.skipped.length > 0
          && <Count n={p.plan.skipped.length} one="line left out" many="lines left out" />}
      </div>

      {p.newSupplier && (
        <div className="space-y-3 rounded-lg border border-line bg-surface-2 p-3">
          <p className="text-[12.5px] font-semibold">
            {p.plan.vendor.name} is new — anything you know about them
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Type" htmlFor="ud-type">
              <Select id="ud-type" value={p.type} onChange={p.onType} options={p.types}
                placeholder="Not set" addLabel="New supplier type…" onAdd={p.onAddType} />
            </Field>
            <Field label="Days they give you to pay" htmlFor="ud-terms">
              <NumberInput id="ud-terms" value={p.terms} onChange={p.onTerms} unit="days" step="1" />
            </Field>
            <Field label="Phone" hint="With the country code, for WhatsApp." htmlFor="ud-phone">
              <TextInput id="ud-phone" value={p.phone} onChange={p.onPhone} placeholder="+91 98250 11234" />
            </Field>
            <Field label="Email" htmlFor="ud-email">
              <TextInput id="ud-email" value={p.email} onChange={p.onEmail} placeholder="sales@shahmetals.in" />
            </Field>
          </div>
          <CustomFields entity="supplier" values={p.custom} onChange={p.onCustom} />
        </div>
      )}

      {p.plan.skipped.length > 0 && (
        <div>
          <p className="text-[12.5px] font-medium">Left out</p>
          <ul className="mt-1 space-y-1">
            {p.plan.skipped.map((s) => (
              <li key={s.raw} className="flex gap-2 text-[11.5px] text-ink-2">
                <span className="min-w-0 flex-1 truncate">{s.raw}</span>
                <span className="shrink-0 text-ink-3">{s.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* the promise this whole build runs on, at the one moment it matters */}
      <p className="rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-[11.5px] leading-relaxed text-ink-2">
        <strong className="text-ink">Nothing is sent to the supplier.</strong> This files what they
        quoted into your own records. Getting back to them is still yours to do.
      </p>
    </div>
  )
}

function Finished({ added, rates, plan }: {
  added: number
  rates: number
  plan: ReturnType<typeof planApproval>
}) {
  return (
    <div className="space-y-3">
      <p className="flex items-center gap-2 text-[13.5px] font-semibold">
        <Icon name="check" className="size-4 text-good" />
        {plan.vendor.name} and {plan.ratesSet} rate{plan.ratesSet === 1 ? '' : 's'} are in your suppliers table.
      </p>
      <p className="text-[12.5px] leading-relaxed text-ink-2">
        {plan.aliasesLearned > 0 && <>
          {plan.aliasesLearned} of their wording{plan.aliasesLearned === 1 ? '' : 's'} {plan.aliasesLearned === 1 ? 'is' : 'are'} remembered,
          so the next document from them needs less of your time.{' '}
        </>}
        Changed your mind? <strong className="text-ink">Undo import</strong> on the Suppliers screen
        puts all of it back.
      </p>
      <p className="sr-only">{added} records added, {rates} rates touched.</p>
    </div>
  )
}

/*
 * Both words spelled out rather than an `s` stuck on the end. "Wording learned"
 * pluralises in the middle and "line left out" at the front, so the usual
 * shortcut produces "3 wording learneds" — which it did, until a screenshot
 * showed it.
 */
function Count({ n, one, many }: { n: number; one: string; many: string }) {
  return (
    <span className={`rounded-lg border px-2.5 py-1.5 text-[12px] ${
      n > 0 ? 'border-line bg-surface' : 'border-line-soft bg-surface-2 text-ink-3'}`}>
      <span className="num font-semibold">{n}</span> {n === 1 ? one : many}
    </span>
  )
}
