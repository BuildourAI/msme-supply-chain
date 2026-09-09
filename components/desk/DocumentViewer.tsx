'use client'
import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { Button, Pill, StatusPill } from '@/components/ui/bits'
import { Dialog } from '@/components/ui/Dialog'
import { money, num, longDate } from '@/lib/domain/format'
import {
  docMeta, documentLines, reviewQueue, supplierDocuments, type DocLineDetail,
} from '@/lib/seed/intake'
import { useDesk } from './store'

/**
 * The document, opened.
 *
 * A list of filenames is the thing SRC-02 replaces, not the thing it delivers.
 * So the list opens: the page as it arrived on the left, and what the parser
 * made of every line on it on the right — including the lines that resolved to
 * nothing, which are most of a price list and the honest part of this screen.
 *
 * The left pane is a facsimile, not a file. There is no PDF here to serve and
 * inventing a rendered scan of a document that does not exist would be a
 * different kind of lie from the one this build avoids everywhere else — so a
 * quotation is drawn as a quotation, and a WhatsApp photograph is drawn as a
 * photograph of paper, tilted on a dark ground with the caption saying what the
 * picture is of. Nothing here pretends to be a scan.
 */

interface Ctx { open: (documentId: string) => void }
const DocCtx = createContext<Ctx>({ open: () => {} })
export const useDocViewer = () => useContext(DocCtx)

const VIA: Record<DocLineDetail['via'], { label: string; tone: 'good' | 'warn' | 'critical' | 'neutral'; why: string }> = {
  alias: { label: 'Known wording', tone: 'good', why: 'A confirmed alias already maps this vendor’s exact wording. It never reaches the review queue again.' },
  matched: { label: 'Matched', tone: 'good', why: 'The parser resolved it above the confidence floor and filed it without asking anybody.' },
  review: { label: 'Sent to a person', tone: 'warn', why: 'Below the 70% floor. It went to the review queue with the suggestion attached rather than being guessed at.' },
  unmapped: { label: 'Not in the item master', tone: 'neutral', why: 'Nothing in the item master corresponds to this line. It is kept as price history — a price list covers far more than a factory buys.' },
}

function Facsimile({ id }: { id: string }) {
  const d = supplierDocuments.find((x) => x.id === id)!
  const m = docMeta[id]
  const lines = documentLines[id] ?? []
  const photo = d.channel === 'whatsapp'

  const page = (
    <div className={`min-w-0 flex-1 rounded-sm px-4 py-3.5 text-ink ${
      photo ? 'bg-[#faf7ef] shadow-lg' : 'bg-white shadow-sm'}`}
      style={photo ? { transform: 'rotate(-1.1deg)' } : undefined}>
      {/* letterhead */}
      <div className="flex items-start gap-3 border-b-2 border-[#1f2a24] pb-2">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold tracking-tight text-[#1f2a24]">{d.vendorName}</p>
          <p className="mono text-[9px] uppercase tracking-wider text-[#5c6a62]">
            {d.kind === 'price_list' ? 'Price list'
              : d.kind === 'proforma' ? 'Proforma invoice'
              : d.kind === 'test_cert' ? 'Mill test certificate' : 'Quotation'}
          </p>
        </div>
        <div className="mono ml-auto shrink-0 text-right text-[9.5px] leading-relaxed text-[#5c6a62]">
          <p>{m.docNo}</p>
          <p>{longDate(d.receivedAt)}</p>
        </div>
      </div>

      <table className="mt-2.5 w-full border-collapse text-[10px] text-[#1f2a24]">
        <thead>
          <tr className="border-b border-[#c7cfc9] text-left text-[8.5px] uppercase tracking-wide text-[#5c6a62]">
            <th className="py-1 pr-2 font-semibold">#</th>
            <th className="py-1 pr-2 font-semibold">Description</th>
            <th className="py-1 pr-2 text-right font-semibold">Qty</th>
            <th className="py-1 text-right font-semibold">Rate</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={l.id} className="border-b border-[#e4e8e5] align-top">
              <td className="mono py-1 pr-2 text-[9px] text-[#5c6a62]">{i + 1}</td>
              <td className="mono py-1 pr-2 leading-snug">{l.rawText}</td>
              <td className="mono py-1 pr-2 text-right text-[9.5px] whitespace-nowrap">
                {l.qty != null ? `${num(l.qty, l.qty < 10 ? 1 : 0)} ${l.uom}` : `per ${l.uom}`}
              </td>
              <td className="mono py-1 text-right text-[9.5px] whitespace-nowrap">{money(l.rate, l.rate < 100 ? 2 : 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="mono mt-2.5 border-t border-[#c7cfc9] pt-1.5 text-[9px] leading-relaxed text-[#5c6a62]">
        {m.terms}{m.validUntil ? ` · valid to ${longDate(m.validUntil)}` : ''}
      </p>
      <p className="mono mt-1 text-[8.5px] uppercase tracking-wider text-[#8a968f]">
        sample document · prepared for demonstration
      </p>
    </div>
  )

  return (
    <div>
      <div className={`flex rounded-md p-3 ${photo ? 'bg-ink/85' : 'bg-surface-3'}`}>
        {page}
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-ink-3">
        {photo
          ? <><span className="text-ink-2">{m.photoNote}</span>{' '}This is how it looked when it reached the
              queue — no file name that means anything, no text to search, and nothing that reaches a
              price history until somebody reads it.</>
          : <>The attachment as it arrived: <span className="mono text-ink-2">{d.fileName}</span>, {d.lineCount}{' '}
              line{d.lineCount === 1 ? '' : 's'}, filed against {d.vendorName} on {longDate(d.receivedAt)}.</>}
      </p>
    </div>
  )
}

function Reading({ id, onClose }: { id: string; onClose: () => void }) {
  const { state, reviewIntake } = useDesk()
  const lines = documentLines[id] ?? []

  const mapped = lines.filter((l) => l.itemId).length
  return (
    <div>
      <p className="mono text-[9.5px] uppercase tracking-wide text-ink-3">how the system read it</p>
      <p className="mt-1 text-[11.5px] leading-relaxed text-ink-3">
        {mapped} of {lines.length} line{lines.length === 1 ? '' : 's'} resolved to something this
        factory buys. The rest are kept as price history against the vendor — searchable, but not
        pretending to be a match.
      </p>

      <ul className="mt-2.5 space-y-2">
        {lines.map((l) => {
          const v = VIA[l.via]
          // a line that was in the queue may have been decided this session
          const q = reviewQueue.find((x) => x.documentId === id && x.rawItemText === l.rawText)
          const decided = q ? state.intake[q.id] : undefined
          const shown = decided === 'confirmed' ? VIA.alias
            : decided === 'rejected' ? { label: 'Escalated', tone: 'critical' as const, why: 'Sent to a person rather than filed under a nearby item.' }
            : v
          return (
            <li key={l.id} className="rounded-md border border-line bg-surface-2 p-2.5">
              <p className="mono text-[11.5px] font-medium leading-snug">“{l.rawText}”</p>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="num text-[11px] text-ink-2">
                  {money(l.rate, l.rate < 100 ? 2 : 0)}/{l.uom}
                  {l.qty != null && <span className="text-ink-3"> · {num(l.qty, l.qty < 10 ? 1 : 0)} {l.uom} quoted</span>}
                </span>
                <span className="ml-auto shrink-0">
                  <StatusPill label={shown.label} tone={shown.tone} explain={shown.why} />
                </span>
              </div>

              <p className="mt-1 flex flex-wrap items-baseline gap-x-2 text-[11px] text-ink-3">
                {l.itemId ? (
                  <>
                    <span aria-hidden>→</span>
                    <span className="mono font-medium text-ink">{l.itemId}</span>
                    {l.confidence != null && l.confidence < 1 && (
                      <span>parser confidence {(l.confidence * 100).toFixed(0)}%</span>
                    )}
                    {l.via === 'alias' && <span>resolved by a confirmed alias, no review needed</span>}
                  </>
                ) : (
                  <span>no item in the master corresponds — filed as price history only</span>
                )}
              </p>

              {q && state.intake[q.id] === 'pending' && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" variant="primary" onClick={() => reviewIntake(q.id, 'confirmed')}>
                    Accept — map to {q.suggestedItemId}
                  </Button>
                  <Button size="sm" onClick={() => reviewIntake(q.id, 'rejected')}>Reject &amp; escalate</Button>
                  <span className="self-center text-[11px] text-ink-3">— you can decide it here, on the document</span>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      <div className="mt-3 flex justify-end border-t border-line-soft pt-2.5">
        <Button onClick={onClose}>Close</Button>
      </div>
    </div>
  )
}

export function DocViewerProvider({ children }: { children: React.ReactNode }) {
  const [id, setId] = useState<string | null>(null)
  const open = useCallback((documentId: string) => setId(documentId), [])
  const value = useMemo(() => ({ open }), [open])
  const d = id ? supplierDocuments.find((x) => x.id === id) : null

  return (
    <DocCtx.Provider value={value}>
      {children}
      <Dialog wide open={!!d} onClose={() => setId(null)}
        title={d?.fileName ?? ''}
        sub={d ? `${d.vendorName} · ${docMeta[d.id].docNo} · received ${longDate(d.receivedAt)} by ${d.channel === 'whatsapp' ? 'WhatsApp' : 'email'}` : ''}>
        {d && (
          <div className="max-h-[70vh] overflow-y-auto p-4">
            <div className="mb-3 flex flex-wrap gap-1.5">
              <Pill mono>{d.id}</Pill>
              <Pill tone={d.channel === 'whatsapp' ? 'warn' : 'neutral'}>
                {d.channel === 'whatsapp' ? 'photograph, sent to WhatsApp' : 'attachment, by email'}
              </Pill>
              <Pill tone="neutral">{d.lineCount} line{d.lineCount === 1 ? '' : 's'}</Pill>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <Facsimile id={d.id} />
              <Reading id={d.id} onClose={() => setId(null)} />
            </div>
          </div>
        )}
      </Dialog>
    </DocCtx.Provider>
  )
}
