'use client'
import Link from 'next/link'
import { useState } from 'react'
import { Button, Card, Pill, Segmented, StatusPill } from '@/components/ui/bits'
import { Icon } from '@/components/ui/icons'
import { Note } from '@/components/ui/Note'
import { Num } from '@/components/ui/Num'
import { StackedBars, type StackRow } from '@/components/charts/kit'
import { lakh, money, num, qtyText, shortDate } from '@/lib/domain/format'
import { blockedStock } from '@/lib/seed/blocked'
import { documentLines, reviewQueue, supplierDocuments } from '@/lib/seed/intake'
import { offcuts } from '@/lib/seed/sourcing'
import { useDocViewer } from './DocumentViewer'
import { useDesk } from './store'

const COST_KEYS = ['Rate', 'Freight', 'Non-cred. GST', 'Payment term', 'Rejection']

/* ------------------------------------------------ SRC-03 · landed cost ---- */

export function LandedCostCompare({ numbers = 'shown' }: {
  /**
   * The per-component table under the bars. On the desk it is part of the
   * answer and stays open; on the comparison page it sits beside a list the
   * reader is clicking through, where seven numeric columns redrawing on every
   * click is noise — the bars carry the same five components, and the numbers
   * are one click away for anyone checking a figure.
   */
  numbers?: 'shown' | 'folded'
}) {
  const { selected: r } = useDesk()
  const [mode, setMode] = useState<'full' | 'extras'>('full')
  const [showNums, setShowNums] = useState(false)
  if (!r) return null

  const rows: StackRow[] = r.quotes.map((q) => {
    const vi = q.vendorItem
    const segs = [
      { key: 'Rate', value: vi.rate },
      { key: 'Freight', value: vi.freightPerUnit },
      { key: 'Non-cred. GST', value: vi.nonCreditableGst },
      { key: 'Payment term', value: vi.paymentTermCost },
      { key: 'Rejection', value: q.rejectionAllowance.value,
        inspect: <Num d={q.rejectionAllowance} format="money" dp={2} tone={q.rejectionAllowance.crossCheck ? 'warn' : undefined} /> },
    ]
    const badges: StackRow['badges'] = []
    if (q.isRecommended) badges.push({ text: 'Recommended', tone: 'accent' })
    if (q.isLowestRate) badges.push({ text: 'Lowest quoted rate', tone: 'good' })
    if (q.vendor.id === r.chosenVendorId && !q.isRecommended) badges.push({ text: 'Chosen by the buyer', tone: 'warn' })
    return {
      label: q.vendor.name,
      sub: `${vi.trailingRejectionRate}% rejection history · ${q.leadTime.value}d lead`,
      segments: mode === 'full' ? segs : segs.slice(1),
      total: mode === 'full' ? q.landedPerUnit.value : Math.round((q.landedPerUnit.value - vi.rate) * 100) / 100,
      badges,
    }
  })

  const best = r.quotes[0], cheap = r.quotes.find((q) => q.isLowestRate)!
  const gap = cheap.landedPerUnit.value - best.landedPerUnit.value
  const onOrder = gap * Math.max(r.reorderQty.value, 0)
  const folded = numbers === 'folded'

  return (
    <Card id="compare" index={5}
      title={folded ? `Landed-cost comparison · ${r.item.code}` : 'Landed-cost comparison'}
      sub={`SRC-03 · ${r.item.code} · ${r.item.name}`}
      actions={<Segmented label="Comparison basis" value={mode} onChange={setMode}
        options={[{ id: 'full', label: 'Full landed cost' }, { id: 'extras', label: 'Beyond the rate' }]} />}>
      <div className={folded ? 'p-3.5' : 'p-4'}>
        <StackedBars rows={rows} keys={mode === 'full' ? COST_KEYS : COST_KEYS.slice(1)}
          table={!folded || showNums} />

        {folded && (
          <button type="button" onClick={() => setShowNums((v) => !v)} aria-expanded={showNums}
            className="press mt-2.5 inline-flex items-center gap-1.5 rounded text-[11.5px] text-ink-3 transition-colors hover:text-ink">
            <Icon name="chevron" className={`size-2.5 shrink-0 transition-transform duration-200 ${showNums ? 'rotate-90' : ''}`} />
            {showNums ? 'Hide the numbers' : 'Show the numbers'}
          </button>
        )}

        {r.flipsVendor ? (
          <p className={`rounded-md border border-accent/30 bg-accent-soft p-3 text-[12.5px] leading-relaxed text-ink-2 ${folded ? 'mt-2.5' : 'mt-4'}`}>
            <strong className="text-ink">Landed cost overturns the cheapest quote here.</strong>{' '}
            {cheap.vendor.name} quotes {money(cheap.vendorItem.rate, 2)} and lands{' '}
            {money(gap, 2)} dearer than {best.vendor.name} — {onOrder > 0
              ? `${money(onOrder)} more on ${`a ${num(r.reorderQty.value, 0)} ${r.item.uom} order`}`
              : 'nothing today, because this line has no order on it'}.
          </p>
        ) : (
          <p className={`rounded-md border border-line bg-surface-2 p-3 text-[12.5px] leading-relaxed text-ink-2 ${folded ? 'mt-2.5' : 'mt-4'}`}>
            <strong className="text-ink">The obvious choice is also the right one here.</strong>{' '}
            {best.vendor.name} has both the lowest quoted rate and the lowest landed cost.
          </p>
        )}
      </div>

      <Note foot label={r.flipsVendor ? 'Why this vendor loses on landed cost' : 'Why some lines flip and this one does not'}>
        {r.flipsVendor ? (
          <>
            {cheap.vendor.name} quotes {money(cheap.vendorItem.rate, 2)} against {best.vendor.name}’s{' '}
            {money(best.vendorItem.rate, 2)}, and lands at {money(cheap.landedPerUnit.value, 2)} against{' '}
            {money(best.landedPerUnit.value, 2)} — because of freight, terms and a{' '}
            {cheap.vendorItem.trailingRejectionRate}% rejection history. Not every comparison flips the
            vendor: on this dataset six of nine do and three confirm.
          </>
        ) : (
          <>
            Freight, payment terms and rejection history can all overturn a quoted rate, and on six of
            these nine lines they do. Here they do not: {best.vendor.name} is ahead on the rate and stays
            ahead once the other four components are added.
          </>
        )}
      </Note>
    </Card>
  )
}

/* -------------------------------------------------- SRC-04 · guardrail ---- */

export function GuardrailPanel() {
  const { selected: r, state } = useDesk()
  if (!r) return null
  const ceiling = state.policy.coverageCeiling[r.item.itemClass]
  const cover = r.coverageAfterMonths.value
  const over = r.held.value
  const offcut = offcuts.find((o) => o.itemId === r.item.id)
  const scale = Math.max(cover, ceiling) * 1.15

  return (
    <Card id="guardrail" index={6} title="Coverage guardrail" sub={`SRC-04 · before approval · ${r.item.code}`}>
      <div className="space-y-3.5 p-4">
        <dl className="grid grid-cols-3 gap-2.5">
          {[
            { k: 'Usable now', v: <Num d={r.usable} />, s: qtyText(0, r.item.uom).split(' ')[1] },
            { k: 'On order', v: <Num d={r.openPoQty} />, s: '' },
            { k: 'This order', v: r.reorderQty.value > 0 ? <Num d={r.reorderQty} /> : <span className="text-ink-3">—</span>, s: '' },
          ].map((c) => (
            <div key={c.k} className="rounded-md border border-line bg-surface-2 p-2.5">
              <dt className="text-[11px] text-ink-3">{c.k}</dt>
              <dd className="mt-0.5 text-[15px] font-medium">{c.v}</dd>
            </div>
          ))}
        </dl>

        <div>
          <div className="flex items-baseline justify-between">
            <span className="text-[12px] text-ink-2">Coverage after receipt</span>
            <span className="text-[12px]">
              <Num d={r.coverageAfterMonths} format="months" tone={over ? 'critical' : 'good'} suffix=" months" />
            </span>
          </div>
          <div className="relative mt-1.5 h-3 w-full overflow-hidden rounded-full bg-surface-3">
            <div className={`anim-reveal h-full rounded-full ${over ? 'bg-critical' : 'bg-good'}`}
                 style={{ width: `${Math.min(100, (cover / scale) * 100)}%` }} />
            <div aria-hidden className="anim-tick absolute top-0 h-full w-[2px] bg-ink"
                 style={{ left: `${(ceiling / scale) * 100}%` }} />
          </div>
          <p className="mt-1 text-[11px] text-ink-3">
            <span aria-hidden className="mr-1 inline-block h-2.5 w-[2px] translate-y-[2px] bg-ink" />
            ceiling {num(ceiling, 1)} months for class {r.item.itemClass}
          </p>
        </div>

        {over ? (
          <div className="rounded-md border border-critical/30 bg-critical-soft p-3">
            <StatusPill label="Held by the guardrail" tone="critical" />
            <p className="mt-2 text-[12.5px] leading-relaxed text-ink-2">
              An MOQ of {num(r.item.moq, 0)} {r.item.uom} against a net need of{' '}
              {num(r.reorderPoint.value + state.policy.cycleDays[r.item.itemClass] * r.item.avgDailyConsumption - r.truePosition.value, 0)}{' '}
              {r.item.uom} pushes cover to {num(cover, 2)} months. The system holds the line and asks
              for a written reason. It does not block you — only a person can release it.
            </p>
          </div>
        ) : (
          <div className="rounded-md border border-line bg-surface-2 p-3 text-[12.5px] leading-relaxed text-ink-2">
            {r.reorderQty.value > 0
              ? `Within the ceiling. This order takes cover to ${num(cover, 2)} months against a limit of ${num(ceiling, 1)}.`
              : 'No purchase is being raised on this line, so there is nothing for the guardrail to hold.'}
          </div>
        )}

        <div>
          <p className="mono text-[10px] uppercase tracking-wider text-ink-3">Substitution check</p>
          <ul className="mt-1.5 space-y-1 text-[12.5px] text-ink-2">
            <li className="flex gap-2">
              <span aria-hidden className={r.usable.value > 0 ? 'text-good' : 'text-ink-3'}>•</span>
              Existing stock: {qtyText(r.usable.value, r.item.uom)} usable
              {r.nonUsable.value > 0 && `, plus ${qtyText(r.nonUsable.value, r.item.uom)} that cannot be issued`}
            </li>
            <li className="flex gap-2">
              <span aria-hidden className={offcut ? 'text-good' : 'text-ink-3'}>•</span>
              {offcut
                ? <>Tracked offcut: {qtyText(offcut.qty, r.item.uom)} in {offcut.location} — {offcut.specNote}, worth about{' '}
                    {money(offcut.qty * r.item.lastPurchaseRate)}</>
                : 'No tracked offcut for this specification.'}
            </li>
            <li className="flex gap-2">
              <span aria-hidden className="text-ink-3">•</span>
              Alternate grade: none approved for {r.item.code}. Escalate rather than substitute.
            </li>
          </ul>
        </div>

        <p className="border-t border-line-soft pt-2.5 text-[11.5px] leading-relaxed text-ink-3">
          This guardrail is the preventive half of SRC-04. What it failed to prevent in the past —
          {' '}{lakh(blockedStock.reduce((a, b) => a + b.value, 0))} across {blockedStock.length} lots,
          with an owner and a route out on each — is on the{' '}
          <Link href="/sourcing/blocked" className="font-medium text-accent-ink hover:underline">
            blocked-capital register
          </Link>.
        </p>
      </div>
    </Card>
  )
}

/* ------------------------------------------------------ SRC-02 · intake --- */

/**
 * How sure the parser was, as a mark rather than a sentence. The number stays
 * beside it — a bar on its own is a shape, and this one decides whether a
 * person is asked at all.
 */
function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100)
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5"
      title={`Parser confidence ${pct}% — below 70%, nobody accepts it unseen`}>
      <span aria-hidden className="h-1.5 w-12 overflow-hidden rounded-full bg-surface-3">
        <span className="anim-reveal block h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </span>
      <span className="num text-[11px] text-ink-2">{pct}%</span>
    </span>
  )
}

/**
 * The lines still waiting on a person.
 *
 * Each one used to be a tinted box five sentences tall: the vendor's wording,
 * who it came from, a rate, a sentence of provenance, a sentence of confidence,
 * and two full-width buttons. Three decisions filled the screen, and the facts
 * that repeat on every line — how it arrived, that it is in review — were
 * written out three times.
 *
 * It is a row now. The wording, what it resolves to, how sure the parser was
 * and the rate sit on one line; where it came from sits under it in small
 * type; how it arrived is a glyph at the head of the row. Nothing is lost —
 * the channel sentence rides in an `sr-only` span and a tooltip, the filename
 * is still the button that opens the page it came off, and the Accept button
 * still reads "Accept — map to CM-TRB-2W" to a screen reader.
 */
export function IntakeQueue() {
  const { state, reviewIntake, intakeCounts: c } = useDesk()
  const { open } = useDocViewer()
  const pending = reviewQueue.filter((l) => state.intake[l.id] === 'pending')
  const docOf = (id: string) => supplierDocuments.find((d) => d.id === id)!

  return (
    <Card id="intake" index={7} title="Supplier intake" sub="SRC-02 · one inbox, one WhatsApp number"
      actions={
        <div className="flex flex-wrap gap-1.5">
          <Pill tone="neutral">{c.total} documents</Pill>
          <Pill tone="good">{c.auto} auto-filed</Pill>
          <Pill tone={c.review ? 'warn' : 'good'}>{c.review} in review</Pill>
          {c.escalated > 0 && <Pill tone="critical">{c.escalated} escalated to a person</Pill>}
        </div>
      }>
      {pending.length > 0 ? (
        <ul className="divide-y divide-line-soft">
          {pending.map((l) => {
            const doc = docOf(l.documentId)
            const lineNo = (documentLines[l.documentId] ?? []).findIndex((x) => x.rawText === l.rawItemText) + 1
            const arrived = doc.channel === 'whatsapp'
              ? 'photographed and sent to WhatsApp'
              : 'attached to an email'
            return (
              <li key={l.id}
                className="group grid grid-cols-[1.1rem_minmax(0,1fr)] items-start gap-x-2.5 px-3.5 py-2 transition-colors hover:bg-surface-2 sm:grid-cols-[1.1rem_minmax(0,1fr)_auto]">
                {/* how it arrived — a glyph, because it is the same fact on every row */}
                <span className="mt-0.5 text-ink-3" title={`${arrived[0].toUpperCase()}${arrived.slice(1)} on ${shortDate(doc.receivedAt)}`}>
                  <Icon name={doc.channel === 'whatsapp' ? 'camera' : 'mail'} className="size-4" />
                  <span className="sr-only">{arrived}</span>
                </span>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="mono min-w-0 flex-[1_1_11rem] truncate text-[12.5px] font-medium"
                          title={l.rawItemText}>“{l.rawItemText}”</span>
                    <span className="flex shrink-0 items-baseline gap-2">
                      <span aria-hidden className="text-ink-3">→</span>
                      <span className="mono text-[12px] font-semibold">{l.suggestedItemId}</span>
                      <ConfidenceBar value={l.confidence} />
                      <span className="num text-[12px] text-ink-2">{money(l.rate, 2)}/{l.uom}</span>
                    </span>
                  </div>
                  {/* a line with no document behind it is a claim; this opens the page it came off */}
                  <p className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 text-[10.5px] text-ink-3">
                    <span>{l.vendorName}</span>
                    <span aria-hidden>·</span>
                    <span>line {lineNo}/{doc.lineCount}</span>
                    <span aria-hidden>·</span>
                    <button type="button" onClick={() => open(l.documentId)}
                      title={`Open ${doc.fileName} — line ${lineNo} of ${doc.lineCount} from ${l.vendorName}`}
                      className="mono max-w-full truncate font-medium text-accent-ink underline decoration-dotted underline-offset-2 hover:no-underline">
                      {doc.fileName}
                    </button>
                    <span aria-hidden>·</span>
                    <span className="mono">{shortDate(doc.receivedAt)}</span>
                  </p>
                </div>

                <div className="col-start-2 mt-1.5 flex shrink-0 gap-1.5 opacity-90 transition-opacity group-hover:opacity-100 sm:col-start-3 sm:row-start-1 sm:mt-0">
                  <Button size="sm" variant="primary" onClick={() => reviewIntake(l.id, 'confirmed')}
                    title={`Accept — map to ${l.suggestedItemId}. The alias is permanent.`}>
                    <Icon name="check" className="size-3.5" />
                    Accept<span className="sr-only"> — map to {l.suggestedItemId}</span>
                  </Button>
                  <Button size="sm" onClick={() => reviewIntake(l.id, 'rejected')}
                    title="Goes to a person. It is never auto-filed under a nearby item.">
                    Reject &amp; escalate
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="flex items-center gap-2 px-3.5 py-2.5 text-[12px] text-ink-2">
          <Icon name="check" className="size-4 shrink-0 text-good" />
          Queue clear — every line from the last 90 days is searchable by item.
        </p>
      )}
    </Card>
  )
}

/**
 * The alias table, beside the rules that produce it rather than inside the
 * queue. The queue is what still needs a person; this is what the queue has
 * already settled, and it is the actual deliverable of SRC-02.
 */
export function AliasTable() {
  const { state } = useDesk()
  return (
    <Card index={2} title="Item alias table"
      sub={`${state.aliases.length} mappings · a vendor's own wording, resolved for good`}>
      <div className="p-3.5">
          <ul className="space-y-1">
            {state.aliases.map((a, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-x-2 text-[11.5px]"
                  title={`Any future line from ${a.vendorName} reading “${a.rawText}” resolves to ${a.itemId} without review.`}>
                <span className="mono truncate text-ink-2">“{a.rawText}”</span>
                <span aria-hidden className="text-ink-3">→</span>
                <span className="mono font-medium">{a.itemId}</span>
                <span className="ml-auto text-[10.5px] text-ink-3">{a.vendorName} · resolves automatically</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] leading-snug text-ink-3">
            The mapping table is the deliverable, not the parser. Accepting a match teaches the system
            that vendor’s spelling for good.
          </p>
      </div>
    </Card>
  )
}
