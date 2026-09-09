'use client'
import Link from 'next/link'
import { useState } from 'react'
import { PageHeader } from '@/components/shell/PageHeader'
import { Card, Pill, StatusPill } from '@/components/ui/bits'
import { Donut, RankedBars } from '@/components/charts/exec-charts'
import { DocViewerProvider, useDocViewer } from '@/components/desk/DocumentViewer'
import { AliasTable, IntakeQueue } from '@/components/desk/Panels'
import { useDesk } from '@/components/desk/store'
import { docMeta, documentLines, reviewQueue, supplierDocuments } from '@/lib/seed/intake'
import { shortDate } from '@/lib/domain/format'
import type { Tone } from '@/lib/domain/format'

/**
 * SRC-02 on its own page.
 *
 * It was a panel on the buyer's desk, which put it in the wrong place twice
 * over: it is not part of raising an order, and it is the one module that ships
 * first — it runs on an inbox alone, before there is an item master, a reorder
 * point or a single quote to compare. It earns its own screen.
 *
 * The thing being built here is the alias table, not the parser. A vendor
 * writes "TERMINAL BLK CERAMIC 2WAY 30A"; the factory calls it CM-TRB-2W;
 * accepting the match once teaches that vendor's spelling for good. Everything
 * else on this page — the confidence rule, the escalation route, the document
 * list — exists to keep that table honest.
 *
 * The page reads in the order the work happens: what needs a person now, the
 * rules that decide what reaches them, the documents themselves, and only then
 * the breakdown of where the fourteen went and how they arrived. The breakdown
 * is a summary of the table above it, so it sits under the table rather than
 * over it.
 */

const KIND_LABEL: Record<string, string> = {
  quote: 'Quote', price_list: 'Price list', proforma: 'Proforma', test_cert: 'Test certificate',
}

/** the four states a document can be in, and what each one means */
type DocState = 'auto' | 'pending' | 'confirmed' | 'rejected'
const STATE: Record<DocState, { label: string; tone: Tone; why: string }> = {
  auto: { label: 'Auto-filed', tone: 'good', why: 'Every line matched above the confidence floor.' },
  confirmed: { label: 'Mapped', tone: 'good', why: 'Reviewed in this session — the alias is now permanent.' },
  pending: { label: 'In review', tone: 'warn', why: 'One line is below the confidence floor and is waiting in the queue.' },
  rejected: { label: 'Escalated', tone: 'critical', why: 'Sent to a person. The system never guesses a match it is unsure of.' },
}
const ORDER: DocState[] = ['pending', 'rejected', 'confirmed', 'auto']

function IntakePage() {
  const { intakeCounts: c, state } = useDesk()
  const { open } = useDocViewer()
  const [filter, setFilter] = useState<DocState | 'all'>('all')

  const stateOf = (docId: string): DocState => {
    const line = reviewQueue.find((l) => l.documentId === docId)
    return line ? (state.intake[line.id] as DocState) : 'auto'
  }
  const shown = supplierDocuments.filter((d) => filter === 'all' || stateOf(d.id) === filter)
  const countOf = (s: DocState) => supplierDocuments.filter((d) => stateOf(d.id) === s).length

  const byChannel = (['email', 'whatsapp'] as const).map((ch) => ({
    label: ch === 'email' ? 'Email inbox' : 'WhatsApp number',
    value: supplierDocuments.filter((d) => d.channel === ch).length,
    sub: ch === 'whatsapp'
      ? 'photographs of paper, mostly — and every one of them needed a person before this'
      : 'PDFs and spreadsheets, one address the whole team can see',
  }))

  const byKind = Object.entries(
    supplierDocuments.reduce<Record<string, number>>((a, d) => {
      a[d.kind] = (a[d.kind] ?? 0) + 1
      return a
    }, {}),
  ).map(([k, v]) => ({ label: KIND_LABEL[k] ?? k, value: v })).sort((a, b) => b.value - a.value)

  const lines = supplierDocuments.reduce((a, d) => a + d.lineCount, 0)
  const mappedOf = (id: string) => (documentLines[id] ?? []).filter((l) => l.itemId).length
  const mapped = supplierDocuments.reduce((a, d) => a + mappedOf(d.id), 0)

  return (
    <>
      <PageHeader eyebrow="Stage 1 · Sourcing & procurement" title="Supplier intake & mapping"
        meta={<>
          <Pill tone="accent">SRC-02</Pill>
          <Pill tone="neutral">{c.total} documents · {lines} lines</Pill>
          <Pill tone="good">{mapped} lines mapped to items</Pill>
          <Pill tone={c.review ? 'warn' : 'good'}>{c.review} waiting on a person</Pill>
          {c.escalated > 0 && <Pill tone="critical">{c.escalated} escalated</Pill>}
        </>} />

      <p className="mb-3 max-w-4xl text-[13px] leading-relaxed text-ink-2">
        <strong className="text-ink">This is the module that ships first.</strong> It needs no
        historical data, no item master and no ERP — one inbox and one WhatsApp number are enough to
        start it on day one. Everything else in this build runs on what it produces: the landed-cost
        comparison needs three months of quotes, and a reorder point on a broken item master will
        confidently and repeatedly order the wrong thing.
      </p>

      <div className="mb-3 grid items-start gap-3 xl:grid-cols-[1.15fr_1fr]">
        <IntakeQueue />

        {/* the rules, and the table they produce */}
        <div className="grid gap-3">
          <Card index={1} title="The rules this runs on" sub="§11 · escalate, don’t guess">
            <div className="space-y-2.5 p-3.5 text-[12px] leading-relaxed text-ink-2">
              <p>
                <strong className="text-ink">Below 70% confidence, nobody accepts it unseen.</strong> The
                line goes to a person with the suggestion attached and the vendor’s original wording
                beside it. A parser that guesses at 64% is worse than no parser, because the wrong alias
                is permanent and silent.
              </p>
              <p>
                <strong className="text-ink">A rejection escalates rather than disappears.</strong> It
                does not get auto-filed under a nearby item, and it does not sit in a queue with no
                owner — it is marked escalated and stays visible until a person resolves it.
              </p>
              <p>
                <strong className="text-ink">An accepted match is permanent.</strong> It writes an alias
                against that vendor’s exact wording, so the same line never comes back for review — and
                the floor sees the factory’s name for the material, not the supplier’s.
              </p>
              <p className="text-ink-3">
                The mapping table is the deliverable, not the parser. A better parser reduces the queue;
                only the table makes the data usable by everything downstream.
              </p>
              <p className="border-t border-line-soft pt-2.5">
                <Link href="/production#aliases" className="font-medium text-accent hover:underline">
                  See the aliases on the floor →
                </Link>
              </p>
            </div>
          </Card>
          <AliasTable />
        </div>
      </div>

      <Card index={3} title={`All ${c.total} documents`}
        sub="the last 90 days, searchable by item · click any row to open the document"
        actions={
          <div className="flex flex-wrap items-center gap-1.5">
            {/* only states that actually occur get a chip, so no filter is ever a
                dead click — "Mapped" appears the moment you accept one */}
            <button type="button" onClick={() => setFilter('all')} aria-pressed={filter === 'all'}
              className={`rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
                filter === 'all' ? 'border-accent bg-accent-soft text-accent' : 'border-line text-ink-2 hover:bg-surface-2'}`}>
              All {c.total}
            </button>
            {ORDER.filter((s) => countOf(s) > 0).map((s) => (
              <button key={s} type="button" onClick={() => setFilter(s)} aria-pressed={filter === s}
                title={STATE[s].why}
                className={`rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
                  filter === s ? 'border-accent bg-accent-soft text-accent' : 'border-line text-ink-2 hover:bg-surface-2'}`}>
                {STATE[s].label} {countOf(s)}
              </button>
            ))}
            <span className="mono ml-1 text-[10.5px] text-ink-3">showing {shown.length} of {c.total}</span>
          </div>
        }>
        <div className="scroll-x overflow-auto">
          <table className="w-full min-w-[36rem] border-collapse text-[11.5px]">
            <thead className="bg-surface-2">
              <tr className="text-ink-3">
                {['Vendor', 'Document', 'Kind', 'In', 'Lines', 'Mapped to items', 'Received', 'Status'].map((h) => (
                  <th key={h} className="whitespace-nowrap border-b border-line px-3 py-1.5 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((d) => {
                const st = stateOf(d.id)
                return (
                  <tr key={d.id} onClick={() => open(d.id)}
                      className="cursor-pointer border-b border-line-soft transition-colors hover:bg-surface-2">
                    <td className="whitespace-nowrap px-3 py-1.5">{d.vendorName}</td>
                    <td className="max-w-[15rem] px-3 py-1.5">
                      <button type="button" onClick={(e) => { e.stopPropagation(); open(d.id) }}
                        className="mono block max-w-full truncate text-left font-medium text-accent underline decoration-dotted underline-offset-2 hover:no-underline"
                        title={`Open ${d.fileName} — ${d.lineCount} line${d.lineCount === 1 ? '' : 's'} from ${d.vendorName}`}>
                        {d.fileName}
                      </button>
                      <span className="mono block text-[10px] text-ink-3">{docMeta[d.id].docNo}</span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-ink-2">{KIND_LABEL[d.kind] ?? d.kind}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-ink-2">
                      {d.channel === 'whatsapp' ? 'WhatsApp' : 'Email'}
                    </td>
                    <td className="num px-3 py-1.5">{d.lineCount}</td>
                    {/* a price list is mostly things this factory does not buy, and
                        the column says so rather than letting the line count imply
                        fourteen documents' worth of matches */}
                    <td className="whitespace-nowrap px-3 py-1.5">
                      <span className="num">{mappedOf(d.id)}</span>
                      <span className="text-ink-3"> of {d.lineCount}</span>
                      {mappedOf(d.id) === 0 && <span className="text-ink-3"> · reference only</span>}
                    </td>
                    <td className="mono whitespace-nowrap px-3 py-1.5 text-ink-3">{shortDate(d.receivedAt)}</td>
                    <td className="whitespace-nowrap px-3 py-1.5">
                      <StatusPill label={STATE[st].label} tone={STATE[st].tone} explain={STATE[st].why} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {shown.length === 0 && (
          <p className="px-4 py-3 text-[12px] text-ink-2">
            Nothing in that state right now.{' '}
            <button type="button" onClick={() => setFilter('all')} className="font-medium text-accent hover:underline">
              Show all {c.total} →
            </button>
          </p>
        )}
      </Card>

      {/* the summary of the table above: one section, both halves side by side */}
      <Card index={4} className="mt-3" title="Where the documents went, and how they arrive"
        sub="the same fourteen, cut two ways">
        <div className="grid gap-x-6 gap-y-4 p-3.5 lg:grid-cols-2">
          <div>
            <p className="mono text-[9.5px] uppercase tracking-wide text-ink-3">where they went</p>
            <div className="mt-2">
              <Donut centre={String(c.total)} centreSub="documents"
                foot="A document is auto-filed only when every line on it matched above the confidence floor. One doubtful line holds the whole document — which is why the review queue is short and worth reading."
                segments={[
                  { label: `Filed automatically · ${c.auto}`, value: c.auto, color: 'var(--good)' },
                  { label: `Waiting on a person · ${c.review}`, value: c.review, color: 'var(--warn)' },
                  ...(c.escalated > 0
                    ? [{ label: `Escalated · ${c.escalated}`, value: c.escalated, color: 'var(--critical)' }]
                    : []),
                ]} />
            </div>
          </div>

          <div className="border-t border-line-soft pt-3 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
            <p className="mono text-[9.5px] uppercase tracking-wide text-ink-3">how they arrive</p>
            <div className="mt-2">
              <RankedBars rows={byChannel} format="int" unit=" documents" />
            </div>
            <div className="mt-3 border-t border-line-soft pt-2.5">
              <p className="mono text-[9.5px] uppercase tracking-wide text-ink-3">and what they are</p>
              <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                {byKind.map((k) => (
                  <li key={k.label} className="text-[11.5px] text-ink-2">
                    <span className="num font-medium">{k.value}</span> {k.label.toLowerCase()}
                  </li>
                ))}
              </ul>
            </div>
            <p className="mt-3 rounded-md border border-line bg-surface-2 p-2.5 text-[11.5px] leading-relaxed text-ink-2">
              <strong className="text-ink">The WhatsApp half is the point.</strong> Three of these
              fourteen are photographs of paper sent to a number, and in every factory in the source
              set that is where the price history goes to die. Routing them to the same queue as the
              email attachments is most of the value here.
            </p>
          </div>
        </div>
      </Card>
    </>
  )
}

export default function Page() {
  return <DocViewerProvider><IntakePage /></DocViewerProvider>
}
