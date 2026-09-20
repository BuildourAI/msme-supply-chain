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
import { readHeader, readVendor, type DocHeader } from '@/lib/intake/vendor'
import { guessKind } from '@/lib/sheet/match'
import { acceptFiles, readDocument } from '@/lib/intake/read'
import { readImage } from '@/lib/intake/ocr'
import { putFile } from '@/lib/intake/blobs'
import { mirrorUp, pathFor } from '@/lib/intake/mirror'
import { useAuth } from '@/components/workspace/auth'
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
export function UploadDialog({ open, onClose, resume }: {
  open: boolean
  onClose: () => void
  /** a document put down half-reviewed, being picked back up */
  resume?: SupplierDoc | null
}) {
  const { workspace, update, today, session } = useWorkspace()
  const { account } = useAuth()
  const [docId, setDocId] = useState<string | null>(null)

  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [pct, setPct] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [read, setRead] = useState<DocRead>('typed')
  const [header, setHeader] = useState<DocHeader>({})

  const [vendorId, setVendorId] = useState('')
  const [vendorName, setVendorName] = useState('')
  const [channel, setChannel] = useState<DocChannel>('email')
  const [receivedAt, setReceivedAt] = useState(today)
  const [typed, setTyped] = useState('')

  /*
   * The parsed rows are kept, not thrown away after the first draft. Matching
   * depends on which supplier it is — their learned wordings resolve outright —
   * so choosing or changing the supplier has to be able to run it again. Before
   * this it could not, and a document read before anybody was chosen never got
   * the benefit of a single wording the owner had taught.
   */
  const [rows, setRows] = useState<string[][]>([])
  const [found, setFound] = useState<{ name: string; known: boolean } | null>(null)

  const [lines, setLines] = useState<DocLine[]>([])
  const [type, setType] = useState('')
  const [terms, setTerms] = useState('30')
  /*
   * Which of the document's own columns to keep, by heading. Absent means
   * keep — the spreadsheet import makes the same choice for the same reason:
   * bringing a document in is meant to be how you get your columns, and one
   * left out by default is data quietly dropped.
   *
   * Except off a photograph, where the default flips. A spreadsheet heading
   * was typed by a person; a heading off a photograph is whatever the reader
   * made of some ink, and a probe that clicked straight through created a
   * column called "CE)RATE". Still offered, with its values underneath — just
   * not ticked, so keeping one is a thing somebody chose to do.
   */
  const [dropped, setDropped] = useState<Record<string, boolean>>({})
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [custom, setCustom] = useState<Record<string, string>>({})
  const [done, setDone] = useState<{ added: number; rates: number } | null>(null)

  const reset = () => {
    setDocId(null)
    setFile(null); setBusy(null); setPct(0); setError(null); setNote(null); setRead('typed')
    setVendorId(''); setVendorName(''); setChannel('email'); setReceivedAt(today)
    setTyped(''); setRows([]); setFound(null); setLines([]); setType(''); setTerms('30')
    setDropped({})
    setPhone(''); setEmail(''); setCustom({}); setDone(null)
  }

  useEffect(() => {
    if (!open) return
    reset()
    if (!resume) return
    /*
     * Picking a document back up. Everything that was read stays read — the
     * file is not opened again, because re-reading a photograph would produce
     * slightly different lines and quietly discard whatever the owner had
     * already decided about them.
     */
    setDocId(resume.id)
    setVendorId(resume.vendorId ?? '')
    setVendorName(resume.vendorId ? '' : resume.vendorName)
    setChannel(resume.channel)
    setReceivedAt(resume.receivedAt)
    setRead(resume.read)
    setLines(resume.lines)
  }, [open, resume?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open || !workspace) return null
  const ws = workspace

  /* ------------------------------------------------------------- reading -- */

  const known = vendorId ? ws.vendors.find((v) => v.id === vendorId) : undefined
  const forName = known?.name ?? vendorName

  const ingest = (read: string[][], how: DocRead, source: string) => {
    setRows(read)
    setRead(how)

    /*
     * Who it is from, before the lines are matched rather than after. Their
     * learned wordings only apply once the supplier is known, so reading the
     * letterhead first is what makes the very first document from a supplier
     * benefit from everything the owner taught on the last one.
     */
    const who = readVendor(read, ws.vendors, ws.company.name)
    const forId = who?.vendorId ?? (vendorId || undefined)
    if (who) {
      setFound({ name: who.name, known: Boolean(who.vendorId) })
      if (who.vendorId) { setVendorId(who.vendorId); setVendorName('') }
      else if (!vendorId) setVendorName(who.name)
    }

    const head = readHeader(read)
    if (head.date) setReceivedAt(head.date)
    // only for a supplier this is about to invent; an existing one keeps theirs
    if (head.termsDays !== undefined) setTerms(String(head.termsDays))
    setHeader(head)

    const drafted = draftLines(ws, forId, read, 'SD-new')
    setLines(drafted)
    if (drafted.length === 0) {
      setError(`Nothing priced was found in ${source}. Check it is the right file, or type the lines in.`)
    }
  }

  /**
   * Run the matching again for a different supplier.
   *
   * Anything the owner has already settled on a line is theirs and survives —
   * re-reading the file must not quietly undo a decision somebody made.
   */
  const reMatch = (forId: string | undefined) => {
    if (rows.length === 0) return
    const fresh = draftLines(ws, forId, rows, 'SD-new')
    setLines((prev) => fresh.map((l) => {
      const was = prev.find((x) => x.raw === l.raw)
      // only what a person actually did: a line they decided, a material they
      // ticked to create, or one they chose themselves. A suggestion the
      // matcher made for the previous supplier is not a decision, and keeping
      // it let a wording learned from one supplier survive being handed to
      // another — confidently wrong, which is the whole thing to avoid.
      const theirs = was && (was.decision || was.creates || was.picked)
      return theirs ? { ...l, ...was, id: l.id } : l
    }))
  }

  const pick = async (f: File) => {
    setError(null); setNote(null); setFile(f); setPct(0)
    setBusy(/\.(png|jpe?g|webp)$/i.test(f.name) ? 'Reading the photograph' : 'Reading the document')
    try {
      const out = await readDocument(f, readImage, setPct)
      setNote(out.note ?? null)
      ingest(out.rows, out.read, f.name)
    } catch (e) {
      setError((e as Error).message)
      setLines([])
    } finally {
      setBusy(null)
    }
  }

  const useTyped = () => {
    setError(null)
    ingest(typed.split(/\r?\n/).map((r) => r.split('\t').map((c) => c.trim())), 'typed', 'what you typed')
  }

  /* ------------------------------------------------------------ the lines -- */

  const setLine = (id: string, patch: Partial<DocLine>) =>
    setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)))

  const kept = lines.filter((l) => l.decision !== 'rejected')
  /*
   * The columns the document carried that this build has no field for, taken
   * off the lines rather than off the rows — the lines are what the owner has
   * been editing, so a row they dropped takes its cells with it.
   */
  const docColumns: { label: string; values: string[] }[] = []
  for (const l of kept) {
    for (const [label, value] of Object.entries(l.extras ?? {})) {
      const at = docColumns.find((f) => f.label === label)
      if (at) at.values.push(value)
      else docColumns.push({ label, values: [value] })
    }
  }

  const guessedHeads = read === 'photo'
  const keeping = docColumns.filter((f) => (dropped[f.label] ?? guessedHeads) === false)
  const columns = keeping.map((f) => ({ label: f.label, kind: guessKind(f.values) }))
  const keptLabels = new Set(keeping.map((f) => f.label))

  const approvalLines = (): ApprovalLine[] => kept.map((l) => ({
    raw: l.raw,
    itemId: l.itemId ?? '',
    rate: l.rate ?? 0,
    qty: l.qty,
    extras: Object.fromEntries(
      Object.entries(l.extras ?? {}).filter(([label]) => keptLabels.has(label)),
    ),
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
    /*
     * A document being picked back up has no `File` in hand — the bytes are in
     * the device's store, not in this component. Falling straight through to
     * the typed-in defaults renamed every resumed document to "Typed in" and
     * told the viewer it was plain text, so it stopped being openable.
     */
    fileName: file?.name ?? resume?.fileName ?? 'Typed in',
    mime: file?.type ?? resume?.mime ?? 'text/plain',
    bytes: file?.size ?? resume?.bytes ?? 0,
    channel,
    read,
    receivedAt,
    addedAt: resume?.addedAt ?? today,
    docNo: header.docNo ?? resume?.docNo,
    terms: header.terms ?? resume?.terms,
    validUntil: header.validUntil ?? resume?.validUntil,
    remotePath: resume?.remotePath,
    lines: lines.map((l, n) => ({ ...l, id: `${id}/${n + 1}` })),
    status: 'draft',
  })

  const plan = planApproval(ws, {
    doc: draftDoc('SD-preview'),
    vendorId: vendorId || undefined,
    vendorName: forName,
    columns,
    lines: approvalLines(),
    actor: session.actor,
    today,
  })

  /* ----------------------------------------------------------- approving -- */

  const run = () => {
    /*
     * Computed against this render's workspace and handed to `update` as a
     * value, which is what `ImportDialog` does and for a better reason than it
     * says. An updater that issued the id inside itself and then reported it
     * back through a closure looked identical and worked most of the time —
     * React runs an updater eagerly only while its queue is empty, so the id
     * came back sometimes and came back undefined the rest, and the uploaded
     * file was saved under it or silently not at all.
     */
    const [issued, id] = docId ? [ws, docId] : issueId(ws, 'SD')
    {
      const result = applyApproval(issued, {
        doc: draftDoc(id),
        vendorId: vendorId || undefined,
        vendorName: forName,
        vendorType: type || undefined,
        contact: { phone: phone.trim() || undefined, email: email.trim() || undefined },
        custom: Object.keys(custom).length ? custom : undefined,
        termsDays: Number(terms) >= 0 ? Number(terms) : undefined,
        columns,
        lines: approvalLines(),
        actor: session.actor,
        today,
      })
      update(() => result.ws)
      setDocId(id)

      if (file) keep(id, file)
      setDone({
        added: result.undo.added,
        rates: result.undo.vendorItemsBefore?.length ?? 0,
      })
    }
  }

  /**
   * Keep the file, on the device and — when there is an account — in it.
   *
   * Neither is awaited. The document's lines are already in the workspace by
   * the time this runs, which is what every screen actually reads; the file is
   * the evidence behind them. A browser refusing storage, or a network that is
   * not there, costs the owner the ability to reopen the original and nothing
   * else.
   */
  const keep = (id: string, f: File) => {
    void putFile(id, f, today)
    if (!account) return
    const path = pathFor(account.id, ws.id, { ...draftDoc(id), fileName: f.name })
    void mirrorUp(path, f, f.type).then((sent) => {
      if (!sent) return
      update((w) => ({
        ...w,
        docs: w.docs.map((d) => (d.id === id ? { ...d, remotePath: path } : d)),
      }))
    })
  }

  /* --------------------------------------------------------- putting it down -- */

  /**
   * Closing without approving keeps the document.
   *
   * Without this the whole screen would be a lie: "Waiting on you" would be a
   * status nothing could ever be in, and the badge on the rail a number that
   * could only ever read zero. The sample company's queue survives being walked
   * away from, and so does this one.
   */
  const close = () => {
    if (!done && lines.length > 0) {
      const [issued, id] = docId ? [ws, docId] : issueId(ws, 'SD')
      const draft = draftDoc(id)
      update(() => ({
        ...issued,
        docs: issued.docs.some((d) => d.id === id)
          ? issued.docs.map((d) => (d.id === id ? draft : d))
          : [draft, ...issued.docs],
      }))
      if (file) keep(id, file)
      setDocId(id)
    }
    onClose()
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
          file={file} resumed={resume?.fileName ?? null} signedIn={Boolean(account)}
          busy={busy} pct={pct} error={error} note={note} lines={lines.length}
          typed={typed} onTyped={setTyped} onUseTyped={useTyped}
          onPick={(f) => void pick(f)}
          onClear={reset}
          vendorId={vendorId} vendorName={vendorName}
          vendors={ws.vendors.map((v) => ({ value: v.id, label: v.name }))}
          found={found}
          onVendor={(id) => {
            setVendorId(id)
            if (id) setVendorName('')
            reMatch(id || undefined)
          }}
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
      invalid: plan.quotesMade > 0 ? null : 'Give at least one line a material, or add it as a new one.',
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
            columns={docColumns} dropped={dropped} offByDefault={guessedHeads}
            onDrop={(label, off) => setDropped((d) => ({ ...d, [label]: off }))}
            type={type} onType={setType}
            terms={terms} onTerms={setTerms} termsFromDoc={header.terms}
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
    <Wizard open={open} onClose={close} title="Upload a supplier document"
      sub={file?.name ?? resume?.fileName} steps={steps}
      onDone={done ? onClose : run}
      doneLabel={done ? 'Close' : `Approve ${plan.quotesMade} line${plan.quotesMade === 1 ? '' : 's'}`} />
  )
}

/* ------------------------------------------------------------------ step 1 -- */

function Source(p: {
  file: File | null
  /** the name of a document being picked back up, whose bytes are not in hand */
  resumed: string | null
  /** whether there is an account for a copy to go into */
  signedIn: boolean
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
  /** who the document says it is from, if it said */
  found: { name: string; known: boolean } | null
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
      {(p.file || p.resumed) && !p.busy ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2.5">
          <Icon name={p.lines > 0 ? 'check' : 'doc'}
            className={`size-4 shrink-0 ${p.lines > 0 ? 'text-good' : 'text-ink-3'}`} />
          <span className="min-w-0 text-[13px]">
            <strong className="font-semibold">{p.file?.name ?? p.resumed}</strong>
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
          {/*
            * Said where the file is chosen, not in a settings page nobody
            * opens. Reading happens here; the copy only goes anywhere once
            * there is an account to put it in, and then only into that account.
            */}
          <span className="mt-2 text-[11px] leading-snug text-ink-4">
            {p.signedIn
              ? 'Read on this device. A copy is kept on it, and in your account.'
              : 'Read and kept on this device. Nothing is sent anywhere.'}
          </span>
          <input type="file" className="sr-only" accept={acceptFiles()}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) p.onPick(f) }} />
        </label>
      )}

      {/*
        * Said, not silently filled in. A box that populates itself without
        * explanation reads as the system having decided something on your
        * behalf; the same fact with a sentence beside it reads as help.
        */}
      {p.found && !p.busy && (
        <p className="rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-[12.5px] leading-snug text-ink-2">
          Read from the document: <strong className="text-ink">{p.found.name}</strong>
          {p.found.known
            ? ' — already one of your suppliers.'
            : ', which is not on your list yet.'}
        </p>
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
                      onChange={(v) => onLine(l.id, { itemId: v || undefined, picked: true })}
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
  /** what the document said, when it said anything */
  termsFromDoc?: string
  onTerms: (v: string) => void
  phone: string
  onPhone: (v: string) => void
  email: string
  onEmail: (v: string) => void
  custom: Record<string, string>
  onCustom: (v: Record<string, string>) => void
  types: { value: string; label: string }[]
  onAddType: (v: string) => void
  /** headings on the document this build has no field for */
  columns: { label: string; values: string[] }[]
  dropped: Record<string, boolean>
  /** a heading read off a photograph starts unticked — see the note above */
  offByDefault?: boolean
  onDrop: (label: string, off: boolean) => void
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Count n={p.plan.vendor.status === 'new' ? 1 : 0} one="new supplier" many="new suppliers" />
        <Count n={p.plan.quotesMade} one="quote" many="quotes" />
        <Count n={p.plan.itemsCreated} one="new material" many="new materials" />
        <Count n={p.plan.aliasesLearned} one="wording learned" many="wordings learned" />
        <Count n={p.plan.columnsAdded} one="new column" many="new columns" />
        {p.plan.skipped.length > 0
          && <Count n={p.plan.skipped.length} one="line left out" many="lines left out" />}
      </div>

      {p.columns.length > 0 && (
        <div className="space-y-2 rounded-lg border border-line bg-surface-2 p-3">
          <p className="text-[12.5px] font-semibold">
            This document has columns of its own
          </p>
          <p className="text-[11.5px] leading-relaxed text-ink-3">
            {p.offByDefault
              ? 'Read off a photograph, so the headings are a guess. Tick the ones worth '
                + 'keeping against each quote — nothing here changes what was quoted.'
              : 'They are kept against each quote. Untick anything you do not want — '
                + 'nothing here changes what was quoted.'}
          </p>
          <ul className="space-y-1.5">
            {p.columns.map((c) => (
              <li key={c.label} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <label className="flex cursor-pointer select-none items-center gap-1.5 text-[12.5px]">
                  <input type="checkbox"
                    checked={(p.dropped[c.label] ?? p.offByDefault ?? false) === false}
                    onChange={(e) => p.onDrop(c.label, !e.target.checked)}
                    className="size-3.5 accent-[var(--accent-ink)]" />
                  <span className="font-medium">{c.label}</span>
                </label>
                {/* three real values, so a heading read wrongly is visible now */}
                <span className="mono min-w-0 flex-1 truncate text-[11px] text-ink-3">
                  {c.values.slice(0, 3).join(' · ')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

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
            <Field label="Days they give you to pay" htmlFor="ud-terms"
              hint={p.termsFromDoc ? `Read off the document — “${p.termsFromDoc}”.` : undefined}>
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
        {plan.vendor.name} is in your suppliers table, with {plan.quotesMade}{' '}
        quote{plan.quotesMade === 1 ? '' : 's'} on the Quotes screen.
      </p>
      <p className="text-[12.5px] leading-relaxed text-ink-2">
        {/*
          * Said here because it is the one thing that changed about what this
          * does. A quotation is what they said, not what a material costs —
          * accepting a quote is the separate press that makes it a rate you
          * compare suppliers on, and until then nothing has been committed to.
          */}
        Nothing is priced yet. <strong className="text-ink">Accept</strong> a quote when you
        agree to it, and that price becomes their rate.{' '}
        {plan.aliasesLearned > 0 && <>
          {plan.aliasesLearned} of their wording{plan.aliasesLearned === 1 ? '' : 's'} {plan.aliasesLearned === 1 ? 'is' : 'are'} remembered,
          so the next document from them needs less of your time.{' '}
        </>}
        Changed your mind? <strong className="text-ink">Undo import</strong> on the Suppliers screen
        puts all of it back.
      </p>
      <p className="sr-only">{added} records added, {rates} touched.</p>
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
