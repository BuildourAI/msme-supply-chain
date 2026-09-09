'use client'
import Link from 'next/link'
import { PageHeader } from '@/components/shell/PageHeader'
import { Card, Pill, StatusPill } from '@/components/ui/bits'
import { Donut, RankedBars } from '@/components/charts/exec-charts'
import { IntakeQueue } from '@/components/desk/Panels'
import { useDesk } from '@/components/desk/store'
import { reviewQueue, supplierDocuments } from '@/lib/seed/intake'
import { shortDate } from '@/lib/domain/format'

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
 */

const KIND_LABEL: Record<string, string> = {
  quote: 'Quote', price_list: 'Price list', proforma: 'Proforma', test_cert: 'Test certificate',
}

export default function Page() {
  const { intakeCounts: c, state } = useDesk()

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
  const statusOf = (id: string) => state.intake[id]

  return (
    <>
      <PageHeader eyebrow="Stage 1 · Sourcing & procurement" title="Supplier intake & mapping"
        meta={<>
          <Pill tone="accent">SRC-02</Pill>
          <Pill tone="neutral">{c.total} documents · {lines} lines</Pill>
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

        <div className="grid gap-3">
          <Card index={1} title={`Where the ${c.total} documents went`}
            sub="auto-filed, waiting on a person, or escalated">
            <div className="p-3.5">
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
          </Card>

          <Card index={2} title="How they arrive" sub="two routes in, and only two">
            <div className="p-3.5">
              <RankedBars rows={byChannel} format="int" unit=" documents" />
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
          </Card>

        </div>
      </div>

      <div>
        <Card index={4} title={`All ${c.total} documents`} sub="the last 90 days, searchable by item">
          <div className="scroll-x overflow-auto">
            <table className="w-full min-w-[36rem] border-collapse text-[11.5px]">
              <thead className="bg-surface-2">
                <tr className="text-ink-3">
                  {['Vendor', 'Document', 'Kind', 'In', 'Lines', 'Received', 'Status'].map((h) => (
                    <th key={h} className="whitespace-nowrap border-b border-line px-3 py-1.5 text-left font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {supplierDocuments.map((d) => {
                  // a document is pending only while its line is still pending;
                  // reviewing it here moves the row without a page reload
                  const line = reviewQueue.find((l) => l.documentId === d.id)
                  const st = line ? statusOf(line.id) : 'auto'
                  return (
                    <tr key={d.id} className="border-b border-line-soft hover:bg-surface-2">
                      <td className="whitespace-nowrap px-3 py-1.5">{d.vendorName}</td>
                      <td className="mono max-w-[13rem] truncate px-3 py-1.5 text-ink-2" title={d.fileName}>{d.fileName}</td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-ink-2">{KIND_LABEL[d.kind] ?? d.kind}</td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-ink-2">
                        {d.channel === 'whatsapp' ? 'WhatsApp' : 'Email'}
                      </td>
                      <td className="num px-3 py-1.5">{d.lineCount}</td>
                      <td className="mono whitespace-nowrap px-3 py-1.5 text-ink-3">{shortDate(d.receivedAt)}</td>
                      <td className="whitespace-nowrap px-3 py-1.5">
                        <StatusPill
                          label={st === 'auto' ? 'Auto-filed' : st === 'confirmed' ? 'Mapped' : st === 'rejected' ? 'Escalated' : 'In review'}
                          tone={st === 'auto' || st === 'confirmed' ? 'good' : st === 'rejected' ? 'critical' : 'warn'}
                          explain={st === 'auto'
                            ? 'Every line matched above the confidence floor.'
                            : st === 'confirmed' ? 'Reviewed in this session — the alias is now permanent.'
                            : st === 'rejected' ? 'Sent to a person. The system never guesses a match it is unsure of.'
                            : 'One line is below the confidence floor and is waiting in the queue.'} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>

      </div>
      <Card index={5} className="mt-3" title="The rules this runs on" sub="§11 · escalate, don’t guess">
        <div className="grid gap-x-6 gap-y-2.5 p-3.5 text-[12px] leading-relaxed text-ink-2 md:grid-cols-2">
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
    </>
  )
}
