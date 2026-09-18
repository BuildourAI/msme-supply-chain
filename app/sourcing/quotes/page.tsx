'use client'
import { useState } from 'react'
import { Icon } from '@/components/ui/icons'
import { StatePill, type PillTone } from '@/components/ui/DataTable'
import { ListPage } from '@/components/ui/ListPage'
import { QuoteForm } from '@/components/sourcing/QuoteForm'
import { ConfirmDelete } from '@/components/sourcing/ConfirmDelete'
import { DeskOnly } from '@/components/sourcing/DeskOnly'
import { useWorkspace } from '@/components/workspace/store'
import {
  acceptQuote, nextNo, orderFromQuote, quoteGroups, removeQuote, type QuoteRow,
} from '@/lib/workspace/sourcing'
import { nextId } from '@/lib/workspace/defaults'
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
 * history are in, which is what the full comparison on the Dashboard is for.
 */
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

  /** Accepting is one act; raising the order is a second, and a person does it. */
  const accept = (row: QuoteRow) => {
    update((w) => {
      const after = acceptQuote(w, row.quote.id)
      const draft = orderFromQuote(after, row.quote, today)
      return {
        ...after,
        orders: [...after.orders, { ...draft, id: nextId('PO', after.orders), no: nextNo('PO', after.orders) }],
      }
    })
  }

  return (
    <>
      <ListPage
        title="Quotes" noun="quote" rows={flat}
        search={(r) => `${r.vendor?.name ?? ''} ${r.item?.name ?? ''} ${r.quote.ref ?? ''}`}
        filter={{
          label: 'All statuses',
          options: (Object.keys(LABEL) as QuoteState[]).map((s) => ({ value: s, label: LABEL[s] })),
          of: (r) => r.quote.state,
        }}
        action={{ label: 'Record quote', onClick: () => setAdding(true) }}
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
                                {r.quote.ref && (
                                  <span className="mono block truncate text-[10.5px] text-ink-3">
                                    {r.quote.ref}
                                  </span>
                                )}
                              </span>
                              <StatePill label={LABEL[r.quote.state]} tone={TONE[r.quote.state]} />
                            </div>

                            <dl className="mt-2.5 grid grid-cols-3 gap-1.5">
                              {[
                                ['Price', `${money(r.quote.unitPrice)}${r.item ? `/${r.item.uom}` : ''}`],
                                ['Min', r.quote.moq > 0 ? num(r.quote.moq, 0) : '—'],
                                ['Takes', `${r.quote.leadDays}d`],
                              ].map(([k, v]) => (
                                <div key={k}>
                                  <dt className="mono text-[9.5px] uppercase tracking-wider text-ink-3">{k}</dt>
                                  <dd className="num mt-0.5 text-[13px] font-medium">{v}</dd>
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
                              {r.quote.state !== 'accepted' && (
                                <button type="button" onClick={() => accept(r)}
                                  className="press rounded-md border border-line bg-surface px-2 py-1 text-[12px] font-medium hover:bg-surface-2">
                                  Accept &amp; draft order
                                </button>
                              )}
                              <span className="mono ml-auto text-[10px] text-ink-4">
                                {shortDate(r.quote.on)}
                              </span>
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
