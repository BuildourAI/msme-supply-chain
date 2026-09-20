'use client'
import { useState } from 'react'
import { Icon } from '@/components/ui/icons'
import { StatePill, type PillTone } from '@/components/ui/DataTable'
import { ListPage } from '@/components/ui/ListPage'
import { DeskTools } from '@/components/sheet/DeskTools'
import { UploadDialog } from '@/components/intake/UploadDialog'
import { DocViewer } from '@/components/intake/DocViewer'
import { buildColumns, type DrawnColumn } from '@/components/sheet/columns'
import { QuoteForm } from '@/components/sourcing/QuoteForm'
import { ConfirmDelete } from '@/components/sourcing/ConfirmDelete'
import { DeskOnly } from '@/components/sourcing/DeskOnly'
import { useWorkspace } from '@/components/workspace/store'
import {
  acceptAll, acceptLine, expired, nextNo, orderFromQuote, quoteGroups, rejectLine,
  removeQuote, type QuoteLineRow, type QuoteRow,
} from '@/lib/workspace/sourcing'
import { issueId } from '@/lib/workspace/defaults'
import { money, num, shortDate } from '@/lib/domain/format'
import { quoteState, type Quote, type QuoteState } from '@/lib/workspace/types'
import type { SupplierDoc } from '@/lib/intake/types'

/**
 * What came back.
 *
 * One card per quotation, which is what a quotation is: one supplier, one
 * date, one reference, and however many prices they wrote on it. A PDF pricing
 * six materials makes one card with six lines — not six cards that happen to
 * agree about the letterhead.
 *
 * Those cards sit under the request they answer, because comparing is the
 * whole point and a flat list of prices against different materials compares
 * nothing. Quotations that arrived with no request behind them get a group of
 * their own rather than being hidden — that is how most of them arrive.
 *
 * Within a group the cheapest price for each material is marked. Marked, not
 * chosen: the cheapest price is frequently not the cheapest material once
 * freight and a rejection history are in, which is what the Landed cost screen
 * is for.
 *
 * Accepting is per line. A quotation pricing six materials is rarely six
 * things you want from them — you take the two they are best on and leave the
 * rest — so the whole page is taken only by pressing the button that says so.
 *
 * The lines are the column view, drawn as the table they are. That is what
 * lets a column the build never heard of — an HSN code, a pack size, a
 * warranty read off somebody's quotation — appear here at all, and it means
 * hiding or renaming a column in the Columns dialog does exactly what it says
 * on a screen made of cards.
 *
 * Upload sits here as well as on Suppliers, and belongs here more. What a
 * quotation becomes is a quote — the supplier is a side effect of reading one
 * — so this is the screen somebody with a PDF in their inbox or a photograph
 * on their phone will be looking at. It is offered twice: quietly in the
 * header, and again from the empty state, which is the exact moment they have
 * that document open in another window.
 */

/**
 * Drawn as the screen's own furniture, so not repeated inside a line's detail.
 *
 * The request is the group heading these cards sit under, the supplier is the
 * card's title, the material is the line's, and the status is a pill beside
 * it. They stay columns, so an export still carries every one.
 */
const CHROME = new Set(['supplier', 'item', 'state', 'rfq'])

/**
 * Facts about the QUOTATION rather than about a price on it.
 *
 * They belong in the card header, stated once. Six lines each repeating the
 * reference and the date is what pushed the real figures into a truncated
 * "THEIR REFERENC…". Still read out of the column view, so hiding one in the
 * Columns dialog hides it here too.
 */
const HEADER = new Set(['ref', 'on', 'valid'])

/** a column as this screen draws it, once the owner's view has been applied */
type Drawn = { key: string; head: string; align?: 'left' | 'right'; cell: (r: QuoteLineRow) => React.ReactNode }

const TONE: Record<QuoteState, PillTone> = {
  received: 'neutral', accepted: 'good', rejected: 'critical',
}
const LABEL: Record<QuoteState, string> = {
  received: 'Received', accepted: 'Accepted', rejected: 'Not taken',
}

export default function Page() {
  return <DeskOnly><Quotes /></DeskOnly>
}

function Quotes() {
  const { workspace, update, today } = useWorkspace()
  const [editing, setEditing] = useState<Quote | null>(null)
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState<QuoteRow | null>(null)
  const [uploading, setUploading] = useState(false)
  const [viewing, setViewing] = useState<SupplierDoc | null>(null)

  if (!workspace) return null
  const ws = workspace
  const groups = quoteGroups(ws)
  const quotations = groups.flatMap((g) => g.rows)
  const allLines = quotations.flatMap((r) => r.lines)

  /*
   * The columns hang off a LINE, not off the quotation. An HSN code or a pack
   * size belongs to a material; the piece of paper six of them arrived on has
   * no HSN code.
   */
  const drawn: Record<string, DrawnColumn<QuoteLineRow>> = {
    supplier: {
      cell: (r) => r.vendor?.name ?? <span className="text-ink-4">—</span>,
      text: (r) => r.vendor?.name ?? '',
    },
    item: {
      cell: (r) => r.item?.name ?? <span className="text-ink-4">—</span>,
      text: (r) => r.item?.name ?? '',
    },
    state: {
      cell: (r) => <StatePill label={LABEL[r.line.state]} tone={TONE[r.line.state]} />,
      text: (r) => LABEL[r.line.state],
    },
    price: {
      align: 'right',
      cell: (r) => `${money(r.line.unitPrice)}${r.item ? `/${r.item.uom}` : ''}`,
      text: (r) => String(r.line.unitPrice),
    },
    moq: {
      align: 'right',
      cell: (r) => (r.line.moq > 0 ? num(r.line.moq, 0) : <span className="text-ink-4">—</span>),
      text: (r) => String(r.line.moq),
    },
    lead: {
      align: 'right',
      cell: (r) => `${r.line.leadDays}d`,
      text: (r) => String(r.line.leadDays),
    },
    ref: {
      cell: (r) => (r.quote.ref
        ? <span className="mono text-[11.5px]">{r.quote.ref}</span>
        : <span className="text-ink-4">—</span>),
      text: (r) => r.quote.ref ?? '',
    },
    on: {
      align: 'right',
      cell: (r) => shortDate(r.quote.on),
      text: (r) => r.quote.on,
    },
    valid: {
      align: 'right',
      cell: (r) => {
        if (!r.quote.validUntil) return <span className="text-ink-4">no date</span>
        const gone = expired(r.quote.validUntil, today)
        return (
          <span className={gone ? 'font-medium text-critical' : ''}
            title={gone ? 'Their price has run out — ask again before ordering on it' : undefined}>
            {shortDate(r.quote.validUntil)}
          </span>
        )
      },
      text: (r) => r.quote.validUntil ?? '',
    },
    rfq: {
      cell: (r) => (r.rfq ? <span className="mono text-[11.5px]">{r.rfq.no}</span> : <span className="text-ink-4">—</span>),
      text: (r) => r.rfq?.no ?? '',
    },
  }

  const kit = buildColumns<QuoteLineRow>(ws, 'quote', (r) => r.line.id, drawn)
  const header = kit.columns.filter((c) => HEADER.has(c.key))
  const detail = kit.columns.filter((c) => !CHROME.has(c.key) && !HEADER.has(c.key))
  // identity, so it is always there; the owner may have renamed it
  const itemHead = kit.columns.find((c) => c.key === 'item')?.head ?? 'Material'

  const docOf = (q: Quote) => (q.docId ? ws.docs.find((d) => d.id === q.docId) : undefined)

  /*
   * Two acts, two buttons.
   *
   * Accepting is agreeing to a price: it writes that supplier's rate for that
   * material, which is what puts them into the landed-cost comparison and
   * behind the suggestion the order form makes. Raising the order is
   * committing the money, and §11 has said from the start that a person does
   * that.
   */
  const accept = (r: QuoteLineRow) => update((w) => acceptLine(w, r.quote.id, r.line.id))
  const reject = (r: QuoteLineRow) => update((w) => rejectLine(w, r.quote.id, r.line.id))
  const takeAll = (r: QuoteRow) => update((w) => acceptAll(w, r.quote.id))

  const draftOrder = (r: QuoteLineRow) => {
    update((w) => {
      const [after, id] = issueId(w, 'PO')
      const draft = orderFromQuote(after, r.quote, r.line, today)
      return {
        ...after,
        orders: [...after.orders, { ...draft, id, no: nextNo('PO', after.orders) }],
      }
    })
  }

  return (
    <>
      <ListPage
        title="Quotes" noun="quote" rows={quotations}
        search={(r) => `${r.vendor?.name ?? ''} ${r.quote.ref ?? ''} `
          + r.lines.map((l) => `${l.item?.name ?? ''} ${kit.searchText(l)}`).join(' ')}
        filter={{
          label: 'All statuses',
          options: (Object.keys(LABEL) as QuoteState[]).map((s) => ({ value: s, label: LABEL[s] })),
          of: (r) => quoteState(r.quote),
        }}
        action={{ label: 'Record quote', onClick: () => setAdding(true) }}
        tools={<DeskTools entity="quote" noun="quote" title="Quotes"
          onUpload={() => setUploading(true)}
          rows={() => kit.toRows(allLines)} />}
        empty={{
          line: 'Nothing quoted yet. Write a price down as soon as somebody gives you one — '
            + 'or upload what they sent: a PDF, a photograph of a quotation, or a spreadsheet.',
          cta: 'Record your first quote',
          second: { label: 'Upload a quotation', onClick: () => setUploading(true) },
        }}>
        {(shown) => {
          const ids = new Set(shown.map((r) => r.quote.id))
          const visible = groups
            .map((g) => ({ ...g, rows: g.rows.filter((r) => ids.has(r.quote.id)) }))
            .filter((g) => g.rows.length > 0)
          return (
            <div className="space-y-4">
              {visible.map((g) => {
                /*
                 * The lowest price, per material, across every quotation in
                 * the group — which is the only way the comparison means
                 * anything. It used to be the lowest price in the whole box,
                 * and in the loose box that compared a tonne of sheet steel
                 * against a cable gland and marked the gland "lowest price
                 * quoted". Nothing is marked where there is nothing to compare
                 * it with.
                 */
                const low = new Map<string, number>()
                const seen = new Map<string, number>()
                for (const r of g.rows) {
                  for (const l of r.lines) {
                    const at = l.line.itemId
                    low.set(at, Math.min(low.get(at) ?? Infinity, l.line.unitPrice))
                    seen.set(at, (seen.get(at) ?? 0) + 1)
                  }
                }
                return (
                  <section key={g.rfq?.id ?? 'loose'}>
                    <header className="mb-2 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                      <h2 className="mono text-[13px] font-bold">
                        {g.rfq ? g.rfq.no : 'No request'}
                      </h2>
                      {g.rfq && (
                        <span className="text-[12.5px] text-ink-2">
                          {ws.items.find((i) => i.id === g.rfq!.itemId)?.name}
                        </span>
                      )}
                      <span className="mono ml-auto text-[11px] text-ink-3">
                        {g.rows.length} quotation{g.rows.length === 1 ? '' : 's'}
                      </span>
                    </header>

                    <div className="space-y-3">
                      {g.rows.map((r) => (
                        <Quotation
                          key={r.quote.id} row={r} today={today}
                          doc={docOf(r.quote)} header={header} detail={detail}
                          itemHead={itemHead} low={low} seen={seen}
                          onView={setViewing}
                          onAccept={accept} onReject={reject} onAcceptAll={takeAll}
                          onDraft={draftOrder}
                          onEdit={() => setEditing(r.quote)}
                          onDelete={() => setDeleting(r)}
                        />
                      ))}
                    </div>
                  </section>
                )
              })}
            </div>
          )
        }}
      </ListPage>

      <UploadDialog open={uploading} onClose={() => setUploading(false)} />

      {/* the same viewer the Documents screen uses — one file, one way to read it */}
      <DocViewer doc={viewing} items={ws.items} onClose={() => setViewing(null)} />

      <QuoteForm open={adding || editing !== null} editing={editing}
        onClose={() => { setAdding(false); setEditing(null) }} />

      <ConfirmDelete
        open={deleting !== null}
        what={deleting
          ? `the quotation from ${deleting.vendor?.name ?? 'this supplier'}`
            + (deleting.quote.ref ? ` (${deleting.quote.ref})` : '')
          : ''}
        impact={deleting && deleting.lines.length > 1
          ? {
            losses: [`the ${deleting.lines.length} prices on it`],
            clean: false,
            keeps: 'Rates you already accepted off it stay.',
          }
          : { losses: [], clean: true }}
        onClose={() => setDeleting(null)}
        onConfirm={() => { if (deleting) update((w) => removeQuote(w, deleting.quote.id)) }}
      />
    </>
  )
}

/**
 * One quotation, with its prices under it.
 *
 * The header carries everything true of the whole page — who sent it, their
 * reference, the date, how long it holds, and a way back to the original file.
 * Each line carries only what is true of that price.
 */
function Quotation({
  row, today, doc, header, detail, itemHead, low, seen,
  onView, onAccept, onReject, onAcceptAll, onDraft, onEdit, onDelete,
}: {
  row: QuoteRow
  today: string
  doc: SupplierDoc | undefined
  header: Drawn[]
  detail: Drawn[]
  /** what the owner calls the material column, which they can rename */
  itemHead: string
  low: Map<string, number>
  seen: Map<string, number>
  onView: (doc: SupplierDoc) => void
  onAccept: (r: QuoteLineRow) => void
  onReject: (r: QuoteLineRow) => void
  onAcceptAll: (r: QuoteRow) => void
  onDraft: (r: QuoteLineRow) => void
  onEdit: () => void
  onDelete: () => void
}) {
  const { quote, vendor, lines } = row
  const state = quoteState(quote)
  const gone = expired(quote.validUntil, today)
  // the header facts are the same on every line, so any line can state them
  const first = lines[0]
  const untaken = lines.filter((l) => l.line.state === 'received')

  return (
    <article className={`rounded-xl border bg-surface p-4 ${
      state === 'accepted' ? 'border-good/40' : 'border-line'}`}>
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[14px] font-bold">
            {vendor?.name ?? 'Unknown supplier'}
          </h3>
          {first && (header.length > 0 || doc) && (
            <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              {header.map((c) => (
                <span key={c.key} className="inline-flex items-baseline gap-1 text-[12px]">
                  <span className="text-ink-3">{c.head}</span>
                  <span className="num font-medium">{c.cell(first)}</span>
                </span>
              ))}
              {doc && (
                <button type="button" onClick={() => onView(doc)}
                  title={`Open ${doc.fileName}`}
                  className="press inline-flex items-center gap-1 text-[12px] text-accent-ink underline underline-offset-2">
                  <Icon name="doc" className="size-3" />
                  the original
                </button>
              )}
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
          {/* an expired price is worth saying out loud rather than leaving in
              a column somebody has to look for */}
          {gone && <StatePill label="Expired" tone="critical" />}
          <StatePill label={LABEL[state]} tone={TONE[state]} />
          <button type="button" onClick={onEdit}
            title={`Edit the quotation from ${vendor?.name ?? 'this supplier'}`}
            className="press rounded p-1 text-ink-3 hover:text-ink">
            <Icon name="pencil" className="size-3.5" />
            <span className="sr-only">Edit</span>
          </button>
          <button type="button" onClick={onDelete}
            title={`Delete the quotation from ${vendor?.name ?? 'this supplier'}`}
            className="press rounded p-1 text-ink-4 hover:text-critical">
            <Icon name="trash" className="size-3.5" />
            <span className="sr-only">Delete</span>
          </button>
        </div>
      </div>

      {/*
        * A quotation's lines are a table, so they are drawn as one: the
        * headings stated once above them rather than repeated beside every
        * figure. Six lines each captioning their own price is what made a
        * PDF's worth of prices unreadable.
        */}
      <div className="scroll-x mt-3 overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-y border-line-soft text-left">
              <th className="whitespace-nowrap py-2 pr-4 text-[11.5px] font-medium text-ink-3">
                {itemHead}
              </th>
              {detail.map((c) => (
                <th key={c.key}
                  className={`whitespace-nowrap px-3 py-2 text-[11.5px] font-medium text-ink-3 ${
                    c.align === 'right' ? 'text-right' : 'text-left'}`}>
                  {c.head}
                </th>
              ))}
              <th className="w-0 py-2"><span className="sr-only">What to do with it</span></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((r) => {
              const cheapest = (seen.get(r.line.itemId) ?? 0) > 1
                && r.line.unitPrice === low.get(r.line.itemId)
              return (
                <tr key={r.line.id}
                  className={`border-b border-line-soft last:border-0 ${
                    r.line.state === 'rejected' ? 'opacity-55' : ''}`}>
                  <td className="min-w-[10rem] max-w-[22rem] py-2.5 pr-4 align-middle">
                    <span className="block truncate font-semibold" title={r.item?.name}>
                      {r.item?.name ?? 'Unknown material'}
                    </span>
                    {cheapest && (
                      <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-good"
                        title="Lowest quoted price for this material here. Freight, terms and rejection history can still change which is cheapest overall.">
                        <Icon name="check" className="size-3" />
                        lowest price quoted
                      </span>
                    )}
                  </td>
                  {detail.map((c) => (
                    <td key={c.key}
                      className={`whitespace-nowrap px-3 py-2.5 align-middle ${
                        c.align === 'right' ? 'num text-right' : ''}`}>
                      {c.cell(r)}
                    </td>
                  ))}
                  <td className="whitespace-nowrap py-2.5 pl-3 text-right align-middle">
                    <span className="inline-flex items-center gap-1">
                      {r.line.state === 'accepted' ? (
                        <>
                          <StatePill label={LABEL.accepted} tone={TONE.accepted} />
                          <button type="button" onClick={() => onDraft(r)}
                            title="Draft an order from this price. Nothing is sent."
                            className="press rounded-md border border-line bg-surface px-2 py-1 text-[12px] font-medium hover:bg-surface-2">
                            Draft an order
                          </button>
                        </>
                      ) : r.line.state === 'rejected' ? (
                        <>
                          <StatePill label={LABEL.rejected} tone={TONE.rejected} />
                          <button type="button" onClick={() => onAccept(r)}
                            title="Take it after all — it becomes their rate"
                            className="press rounded-md border border-line bg-surface px-2 py-1 text-[12px] font-medium hover:bg-surface-2">
                            Accept price
                          </button>
                        </>
                      ) : (
                        <>
                          <button type="button" onClick={() => onAccept(r)}
                            title={`Take this price for ${r.item?.name ?? 'this material'} — it becomes their rate`}
                            className="press rounded-md border border-line bg-surface px-2 py-1 text-[12px] font-medium hover:bg-surface-2">
                            Accept price
                          </button>
                          <button type="button" onClick={() => onReject(r)}
                            title="Turn this price down. Nothing is sent to the supplier."
                            className="press rounded-md px-2 py-1 text-[12px] text-ink-3 hover:text-critical">
                            Turn down
                          </button>
                        </>
                      )}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/*
        * Taking the whole page, for the case where you did mean all of it.
        * Only offered where there is more than one price left to take — on a
        * single-line quotation it would be the same button twice.
        */}
      {untaken.length > 1 && (
        <div className="mt-2.5 flex border-t border-line-soft pt-2.5">
          <button type="button" onClick={() => onAcceptAll(row)}
            title={`Take all ${untaken.length} prices on this quotation`}
            className="press rounded-md border border-line bg-surface px-2.5 py-1 text-[12px] font-medium hover:bg-surface-2">
            Accept all {untaken.length}
          </button>
        </div>
      )}
    </article>
  )
}
