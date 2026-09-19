'use client'
import { useEffect, useState } from 'react'
import { Dialog } from '@/components/ui/Dialog'
import { Icon } from '@/components/ui/icons'
import { StatePill } from '@/components/ui/DataTable'
import { getFile, putFile } from '@/lib/intake/blobs'
import { mirrorDown } from '@/lib/intake/mirror'
import { renderPage } from '@/lib/intake/pdf'
import { shortDate } from '@/lib/domain/format'
import { ConfidenceBar } from './ConfidenceBar'
import type { SupplierDoc } from '@/lib/intake/types'
import type { Item } from '@/lib/domain/types'

/**
 * The document itself, beside what was read out of it.
 *
 * This is the owner's counterpart to the sample company's document viewer, and
 * the difference is the whole point. That one draws a facsimile in CSS and says
 * so in its own header — "the left pane is a facsimile, not a file. There is no
 * PDF here to serve." Here there is a file, it is the one the supplier actually
 * sent, and it is shown rather than imitated.
 *
 * What is NOT shown is a file this device does not have. The record travels in
 * the workspace and the bytes do not, so a document uploaded on a phone opens
 * on a laptop with all its lines and a sentence saying where the original is.
 * A spinner that never resolves would be the alternative.
 */
export function DocViewer({ doc, items, onClose }: {
  doc: SupplierDoc | null
  items: Item[]
  onClose: () => void
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [state, setState] = useState<'looking' | 'here' | 'elsewhere'>('looking')
  const [at, setAt] = useState(1)
  const [pages, setPages] = useState(1)

  useEffect(() => { setAt(1); setPages(1) }, [doc?.id])

  useEffect(() => {
    if (!doc) return
    let alive = true
    let made: string | null = null
    setState('looking'); setUrl(null)

    ;(async () => {
      /*
       * The device first, the account second. A document uploaded here opens
       * instantly and offline; one uploaded on a phone is fetched back once and
       * then kept, so the second look is as fast as the first.
       */
      let blob = await getFile(doc.id)
      if (!alive) return
      if (!blob && doc.remotePath) {
        blob = await mirrorDown(doc.remotePath)
        if (!alive) return
        if (blob) void putFile(doc.id, new File([blob], doc.fileName, { type: doc.mime }), doc.addedAt)
      }
      if (!blob) { setState('elsewhere'); return }

      /*
       * A PDF is drawn rather than framed. The browser's own viewer would do
       * the job, but it arrives wrapped in a dark toolbar showing the blob's
       * internal id where a filename belongs — ugly, and a detail nobody
       * should be shown. pdf.js is already here for reading it.
       */
      if (doc.mime === 'application/pdf' || doc.fileName.toLowerCase().endsWith('.pdf')) {
        const page = await renderPage(await blob.arrayBuffer(), at)
        if (!alive) return
        setPages(page.pages)
        made = URL.createObjectURL(page.blob)
      } else {
        made = URL.createObjectURL(blob)
      }
      setUrl(made)
      setState('here')
    })().catch(() => { if (alive) setState('elsewhere') })

    // revoked on the way out rather than on replacement, which blanks the frame
    return () => { alive = false; if (made) URL.revokeObjectURL(made) }
  }, [doc, at])

  if (!doc) return null
  const name = (id?: string) => items.find((i) => i.id === id)?.name

  return (
    <Dialog open wide onClose={onClose} title={doc.fileName}
      sub={`${doc.vendorName} · ${shortDate(doc.receivedAt)} · ${READ[doc.read]}`}>
      <div className="grid max-h-[72vh] gap-3 overflow-y-auto p-3 lg:grid-cols-2">
        <div className="min-w-0">
          {state === 'looking' && (
            <p className="rounded-lg border border-line bg-surface-2 px-3 py-8 text-center text-[12.5px] text-ink-3">
              Finding the original…
            </p>
          )}
          {state === 'elsewhere' && (
            <div className="rounded-lg border border-line bg-surface-2 px-3 py-6 text-center">
              <Icon name="doc" className="mx-auto mb-2 size-6 text-ink-4" />
              <p className="text-[12.5px] font-medium">The original is on the device it came from</p>
              <p className="mt-1 text-[11.5px] leading-snug text-ink-3">
                Every line it was read for is here. The file itself stays where it was uploaded
                unless you were signed in at the time.
              </p>
            </div>
          )}
          {state === 'here' && url && (
            <>
              <img src={url} alt={`${doc.fileName}, page ${at}`}
                className="w-full rounded-lg border border-line bg-surface" />
              {pages > 1 && (
                <div className="mt-2 flex items-center justify-center gap-2">
                  <Page dir={-1} at={at} pages={pages} onGo={setAt} />
                  <span className="mono text-[11px] text-ink-3">page {at} of {pages}</span>
                  <Page dir={1} at={at} pages={pages} onGo={setAt} />
                </div>
              )}
            </>
          )}
        </div>

        <div className="min-w-0">
          <p className="mono text-[9.5px] uppercase tracking-wide text-ink-3">what was read off it</p>
          <ul className="mt-1.5 divide-y divide-line-soft">
            {doc.lines.map((l) => (
              <li key={l.id} className="py-2">
                <p className="flex flex-wrap items-baseline gap-x-2 text-[12px] font-medium">
                  <span className="min-w-0 flex-1">{l.raw}</span>
                  <span className="mono shrink-0 text-ink-2">
                    {l.rate !== undefined ? `₹${l.rate.toLocaleString('en-IN')}` : '—'}
                    {l.uom && <span className="text-ink-3">/{l.uom}</span>}
                  </span>
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <ConfidenceBar value={l.confidence} via={l.via} />
                  {name(l.itemId) && (
                    <span className="text-[11px] text-ink-2">→ {name(l.itemId)}</span>
                  )}
                  {l.decision === 'rejected' && <StatePill label="Left out" tone="neutral" />}
                </p>
              </li>
            ))}
          </ul>
          {doc.lines.length === 0 && (
            <p className="py-3 text-[12px] text-ink-3">Nothing priced was found on this one.</p>
          )}
        </div>
      </div>
    </Dialog>
  )
}

function Page({ dir, at, pages, onGo }: {
  dir: -1 | 1
  at: number
  pages: number
  onGo: (n: number) => void
}) {
  const to = at + dir
  const can = to >= 1 && to <= pages
  return (
    <button type="button" disabled={!can} onClick={() => onGo(to)}
      className="press rounded-md border border-line px-2 py-1 text-[11.5px] text-ink-2 hover:bg-surface-2 disabled:opacity-35">
      {dir === -1 ? 'Back' : 'Next'}
      <span className="sr-only"> page</span>
    </button>
  )
}

/** How the words were got out, said plainly — the figures below mean different things. */
const READ: Record<SupplierDoc['read'], string> = {
  'pdf-text': 'read from the text in the PDF',
  photo: 'read off a photograph',
  sheet: 'read from a spreadsheet',
  typed: 'typed in by hand',
}
