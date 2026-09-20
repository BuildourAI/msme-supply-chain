'use client'
import { useState } from 'react'
import { Icon } from '@/components/ui/icons'
import { StatePill, type PillTone } from '@/components/ui/DataTable'
import { ListPage } from '@/components/ui/ListPage'
import { DeskTools } from '@/components/sheet/DeskTools'
import { buildColumns, type DrawnColumn } from '@/components/sheet/columns'
import { QuoteForm } from '@/components/sourcing/QuoteForm'
import { ConfirmDelete } from '@/components/sourcing/ConfirmDelete'
import { DeskOnly } from '@/components/sourcing/DeskOnly'
import { useWorkspace } from '@/components/workspace/store'
import {
  acceptQuote, expired, nextNo, orderFromQuote, quoteGroups, removeQuote, type QuoteRow,
} from '@/lib/workspace/sourcing'
import { issueId } from '@/lib/workspace/defaults'
import { money, num, shortDate } from '@/lib/domain/format'
import type { Quote, QuoteState } from '@/lib/workspace/types'

/**
 * What came back.
 *
 * Grouped by the request each quote answers, because comparing is the whole
 * point and a flat list of prices against different materials compares nothing.
 * Quotes that arrived with no request behind them get a group of their own
 * rather than being hidden — that is how most of them arrive.
 *
 * Within a group the cheapest is marked. It is marked, not chosen: the cheapest
 * price is frequently not the cheapest material once freight and a rejection
 * history are in, which is what the Landed cost screen is for.
 *
 * The detail on each card is the column view, laid out as a list rather than a
 * table. That is what lets a column the build never heard of — an HSN code, a
 * pack size, a warranty read off somebody's quotation — appear here at all, and
 * it means hiding or renaming a column in the Columns dialog does what it says
 * on a screen that is not a table.
 */

/**
 * Drawn elsewhere on the screen, so not repeated inside the card's detail.
 *
 * The request is the group heading these cards sit under, which is why it is
 * here: a row reading "Against — RFQ-3" beneath a box already titled RFQ-3 is
 * noise, and beneath the "No request" box it is a dash on every card. It stays
 * a column, so an export still carries it.
 */
const CHROME = new Set(['supplier', 'item', 'state', 'rfq'])
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
  const [deleting, setDeleting] = useState<Quote | null>(null)

  if (!workspace) return null
  const ws = workspace
  const groups = quoteGroups(ws)
  const flat = groups.flatMap((g) => g.rows)

  const drawn: Record<string, DrawnColumn<QuoteRow>> = {
    supplier: {
      cell: (r) => r.vendor?.name ?? <span className="text-ink-4">—</span>,
      text: (r) => r.vendor?.name ?? '',
    },
    item: {
      cell: (r) => r.item?.name ?? <span className="text-ink-4">—</span>,
      text: (r) => r.item?.name ?? '',
    },
    state: {
      cell: (r) => <StatePill label={LABEL[r.quote.state]} tone={TONE[r.quote.state]} />,
      text: (r) => LABEL[r.quote.state],
    },
    price: {
      align: 'right',
      cell: (r) => `${money(r.quote.unitPrice)}${r.item ? `/${r.item.uom}` : ''}`,
      text: (r) => String(r.quote.unitPrice),
    },
    moq: {
      align: 'right',
      cell: (r) => (r.quote.moq > 0 ? num(r.quote.moq, 0) : <span className="text-ink-4">—</span>),
      text: (r) => String(r.quote.moq),
    },
    lead: {
      align: 'right',
      cell: (r) => `${r.quote.leadDays}d`,
      text: (r) => String(r.quote.leadDays),
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

  const kit = buildColumns<QuoteRow>(ws, 'quote', (r) => r.quote.id, drawn)
  const detail = kit.columns.filter((c) => !CHROME.has(c.key))

  /*
   * Two acts, two buttons.
   *
   * Accepting is agreeing to a price: it writes the supplier's rate, which is
   * what puts them into the landed-cost comparison and behind the suggestion
   * the order form makes. Raising the order is committing the money, and §11
   * has said from the start that a person does that.
   *
   * They used to be one button, which was defensible while approving a
   * document wrote the rates — accepting then meant nothing but a pill
   * changing colour, so it had to be bundled with something. Now it does the
   * work, and an owner who wants the price without an order can have it.
   */
  const accept = (row: QuoteRow) => update((w) => acceptQuote(w, row.quote.id))

  const draftOrder = (row: QuoteRow) => {
    update((w) => {
      const [after, id] = issueId(w, 'PO')
      const draft = orderFromQuote(after, row.quote, today)
      return {
        ...after,
        orders: [...after.orders, { ...draft, id, no: nextNo('PO', after.orders) }],
      }
    })
  }

  return (
    <>
      <ListPage
        title="Quotes" noun="quote" rows={flat}
        search={(r) => `${r.vendor?.name ?? ''} ${r.item?.name ?? ''} ${r.quote.ref ?? ''} ${kit.searchText(r)}`}
        filter={{
          label: 'All statuses',
          options: (Object.keys(LABEL) as QuoteState[]).map((s) => ({ value: s, label: LABEL[s] })),
          of: (r) => r.quote.state,
        }}
        action={{ label: 'Record quote', onClick: () => setAdding(true) }}
        tools={<DeskTools entity="quote" noun="quote" title="Quotes"
          rows={() => kit.toRows(flat)} />}
        empty={{
          line: 'Nothing quoted yet. Write down a price as soon as somebody gives you one.',
          cta: 'Record your first quote',
        }}>
        {(shown) => {
          const ids = new Set(shown.map((r) => r.quote.id))
          const visible = groups
            .map((g) => ({ ...g, rows: g.rows.filter((r) => ids.has(r.quote.id)) }))
            .filter((g) => g.rows.length > 0)
          return (
            <div className="space-y-4">
              {visible.map((g) => {
                const best = Math.min(...g.rows.map((r) => r.quote.unitPrice))
                return (
                  <section key={g.rfq?.id ?? 'loose'}
                    className="rounded-xl border border-line bg-surface p-4">
                    <header className="mb-3 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                      <h2 className="mono text-[13px] font-bold">
                        {g.rfq ? g.rfq.no : 'No request'}
                      </h2>
                      {g.rfq && (
                        <span className="text-[12.5px] text-ink-2">
                          {ws.items.find((i) => i.id === g.rfq!.itemId)?.name}
                        </span>
                      )}
                      <span className="mono ml-auto text-[11px] text-ink-3">
                        {g.rows.length} quote{g.rows.length === 1 ? '' : 's'}
                      </span>
                    </header>

                    <ul className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                      {g.rows.map((r) => {
                        const cheapest = g.rows.length > 1 && r.quote.unitPrice === best
                        return (
                          <li key={r.quote.id}
                            className={`rounded-lg border p-3 ${
                              r.quote.state === 'accepted'
                                ? 'border-good/40 bg-good-soft/30' : 'border-line bg-surface-2/50'}`}>
                            <div className="flex items-start gap-2">
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[13px] font-semibold">
                                  {r.vendor?.name ?? 'Unknown supplier'}
                                </span>
                                {/*
                                  * The material, only where the group header is
                                  * not already saying it. A quote with no
                                  * request behind it is the common case and
                                  * used to name no material anywhere.
                                  */}
                                {!g.rfq && (
                                  <span className="block truncate text-[11px] text-ink-3">
                                    {r.item?.name ?? 'Unknown material'}
                                  </span>
                                )}
                              </span>
                              <span className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                                {/*
                                  * An expired price is worth saying out loud
                                  * rather than leaving in a column somebody
                                  * has to look for.
                                  */}
                                {expired(r.quote.validUntil, today)
                                  && <StatePill label="Expired" tone="critical" />}
                                <StatePill label={LABEL[r.quote.state]} tone={TONE[r.quote.state]} />
                              </span>
                            </div>

                            <dl className="mt-2.5 grid grid-cols-3 gap-1.5">
                              {detail.map((c) => (
                                <div key={c.key} className="min-w-0">
                                  <dt className="mono truncate text-[9.5px] uppercase tracking-wider text-ink-3"
                                    title={c.head}>
                                    {c.head}
                                  </dt>
                                  <dd className="num mt-0.5 truncate text-[13px] font-medium">
                                    {c.cell(r)}
                                  </dd>
                                </div>
                              ))}
                            </dl>

                            {cheapest && (
                              <p className="mt-2 flex items-center gap-1 text-[11px] text-good"
                                title="Lowest quoted price here. Freight, terms and rejection history can still change which is cheapest overall.">
                                <Icon name="check" className="size-3" />
                                lowest price quoted
                              </p>
                            )}

                            <div className="mt-2.5 flex items-center gap-1 border-t border-line-soft pt-2">
                              {r.quote.state !== 'accepted' ? (
                                <button type="button" onClick={() => accept(r)}
                                  title={`Take ${r.vendor?.name ?? 'this'} price — it becomes their rate`}
                                  className="press rounded-md border border-line bg-surface px-2 py-1 text-[12px] font-medium hover:bg-surface-2">
                                  Accept price
                                </button>
                              ) : (
                                <button type="button" onClick={() => draftOrder(r)}
                                  title="Draft an order from this quote. Nothing is sent."
                                  className="press rounded-md border border-line bg-surface px-2 py-1 text-[12px] font-medium hover:bg-surface-2">
                                  Draft an order
                                </button>
                              )}
                              <span className="ml-auto" />
                              <button type="button" onClick={() => setEditing(r.quote)}
                                title={`Edit the quote from ${r.vendor?.name ?? 'this supplier'}`}
                                className="press rounded p-1 text-ink-3 hover:text-ink">
                                <Icon name="pencil" className="size-3.5" />
                                <span className="sr-only">Edit</span>
                              </button>
                              <button type="button" onClick={() => setDeleting(r.quote)}
                                title={`Delete the quote from ${r.vendor?.name ?? 'this supplier'}`}
                                className="press rounded p-1 text-ink-4 hover:text-critical">
                                <Icon name="trash" className="size-3.5" />
                                <span className="sr-only">Delete</span>
                              </button>
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  </section>
                )
              })}
            </div>
          )
        }}
      </ListPage>

      <QuoteForm open={adding || editing !== null} editing={editing}
        onClose={() => { setAdding(false); setEditing(null) }} />

      <ConfirmDelete
        open={deleting !== null}
        what={deleting ? `the quote from ${ws.vendors.find((v) => v.id === deleting.vendorId)?.name ?? 'this supplier'}` : ''}
        impact={{ losses: [], clean: true }}
        onClose={() => setDeleting(null)}
        onConfirm={() => { if (deleting) update((w) => removeQuote(w, deleting.id)) }}
      />
    </>
  )
}
