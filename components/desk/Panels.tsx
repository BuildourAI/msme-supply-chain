'use client'
import { useState } from 'react'
import { Button, Card, Pill, Segmented, StatusPill } from '@/components/ui/bits'
import { Num } from '@/components/ui/Num'
import { BarRows, StackedBars, type StackRow } from '@/components/charts/kit'
import { lakh, money, num, qtyText } from '@/lib/domain/format'
import { AGE_LABEL, blockedStock, CAUSE_LABEL, ROUTE_LABEL } from '@/lib/seed/blocked'
import { reviewQueue, supplierDocuments } from '@/lib/seed/intake'
import { offcuts } from '@/lib/seed/sourcing'
import { useDesk } from './store'

const COST_KEYS = ['Rate', 'Freight', 'Non-cred. GST', 'Payment term', 'Rejection']

/* ------------------------------------------------ SRC-03 · landed cost ---- */

export function LandedCostCompare() {
  const { selected: r } = useDesk()
  const [mode, setMode] = useState<'full' | 'extras'>('full')

  const rows: StackRow[] = r.quotes.map((q) => {
    const vi = q.vendorItem
    const segs = [
      { key: 'Rate', value: vi.rate },
      { key: 'Freight', value: vi.freightPerUnit },
      { key: 'Non-cred. GST', value: vi.nonCreditableGst },
      { key: 'Payment term', value: vi.paymentTermCost },
      { key: 'Rejection', value: q.rejectionAllowance.value },
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

  return (
    <Card id="compare" index={5} title="Landed-cost comparison" sub={`SRC-03 · ${r.item.code} · ${r.item.name}`}
      actions={<Segmented label="Comparison basis" value={mode} onChange={setMode}
        options={[{ id: 'full', label: 'Full landed cost' }, { id: 'extras', label: 'Beyond the rate' }]} />}>
      <div className="p-4">
        <StackedBars rows={rows} keys={mode === 'full' ? COST_KEYS : COST_KEYS.slice(1)} />

        {r.flipsVendor ? (
          <p className="mt-4 rounded-md border border-accent/30 bg-accent-soft p-3 text-[12.5px] leading-relaxed text-ink-2">
            <strong className="text-ink">Landed cost overturns the cheapest quote here.</strong>{' '}
            {cheap.vendor.name} quotes {money(cheap.vendorItem.rate, 2)} against {best.vendor.name}’s{' '}
            {money(best.vendorItem.rate, 2)}, and lands at {money(cheap.landedPerUnit.value, 2)} against{' '}
            {money(best.landedPerUnit.value, 2)} — {money((cheap.landedPerUnit.value - best.landedPerUnit.value) * Math.max(r.reorderQty.value, 1))}{' '}
            more on {r.reorderQty.value > 0 ? `a ${num(r.reorderQty.value, 0)} ${r.item.uom} order` : 'this line'},
            because of freight, terms and a {cheap.vendorItem.trailingRejectionRate}% rejection history.
          </p>
        ) : (
          <p className="mt-4 rounded-md border border-line bg-surface-2 p-3 text-[12.5px] leading-relaxed text-ink-2">
            <strong className="text-ink">The obvious choice is also the right one here.</strong>{' '}
            {best.vendor.name} has both the lowest quoted rate and the lowest landed cost. Not every
            comparison flips the vendor — on this dataset six of nine do and three confirm.
          </p>
        )}
      </div>
    </Card>
  )
}

/* -------------------------------------------------- SRC-04 · guardrail ---- */

export function GuardrailPanel() {
  const { selected: r, state } = useDesk()
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
              {num(r.reorderPoint.value + state.policy.cycleDays * r.item.avgDailyConsumption - r.truePosition.value, 0)}{' '}
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
      </div>
    </Card>
  )
}

/* ------------------------------------------------------ SRC-02 · intake --- */

export function IntakeQueue() {
  const { state, reviewIntake, intakeCounts: c } = useDesk()
  const pending = reviewQueue.filter((l) => state.intake[l.id] === 'pending')

  return (
    <Card id="intake" index={7} title="Supplier intake" sub="SRC-02 · one inbox, one WhatsApp number">
      <div className="p-4">
        <div className="mb-3 flex flex-wrap gap-2">
          <Pill tone="neutral">{c.total} documents</Pill>
          <Pill tone="good">{c.auto} auto-filed</Pill>
          <Pill tone={c.review ? 'warn' : 'good'}>{c.review} in review</Pill>
          {c.escalated > 0 && <Pill tone="critical">{c.escalated} escalated to a person</Pill>}
        </div>

        {pending.length > 0 ? (
          <ul className="space-y-2.5">
            {pending.map((l) => (
              <li key={l.id} className="rounded-md border border-warn/30 bg-warn-soft/40 p-3">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="mono text-[12.5px] font-medium">“{l.rawItemText}”</span>
                  <span className="text-[11px] text-ink-3">from {l.vendorName}</span>
                  <span className="num ml-auto text-[12px]">{money(l.rate, 2)}/{l.uom}</span>
                </div>
                <p className="mt-1.5 text-[12.5px] text-ink-2">
                  Suggested match <span className="mono font-medium text-ink">{l.suggestedItemId}</span>
                  <span className="ml-2 text-ink-3">confidence {(l.confidence * 100).toFixed(0)}%</span>
                </p>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
                  <div className="anim-reveal h-full rounded-full bg-accent" style={{ width: `${l.confidence * 100}%` }} />
                </div>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  <Button size="sm" variant="primary" onClick={() => reviewIntake(l.id, 'confirmed')}>
                    Accept — map to {l.suggestedItemId}
                  </Button>
                  <Button size="sm" onClick={() => reviewIntake(l.id, 'rejected')}>Reject &amp; escalate</Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-md border border-good/30 bg-good-soft p-3 text-[12.5px] leading-relaxed text-ink-2">
            The review queue is clear. Every document from the last 90 days is searchable by item, and
            each vendor’s own spelling now resolves automatically.
          </p>
        )}

        <div className="mt-4">
          <p className="mono text-[10px] uppercase tracking-wider text-ink-3">
            Item alias table · {state.aliases.length} mappings
          </p>
          <ul className="mt-1.5 space-y-1">
            {state.aliases.map((a, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-x-2 text-[11.5px]">
                <span className="mono truncate text-ink-2">“{a.rawText}”</span>
                <span aria-hidden className="text-ink-3">→</span>
                <span className="mono font-medium">{a.itemId}</span>
                <span className="ml-auto text-[10.5px] text-ink-3">{a.vendorName}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] leading-snug text-ink-3">
            The mapping table is the deliverable, not the parser. Accepting a match teaches the system
            that vendor’s spelling for good.
          </p>
        </div>
      </div>
    </Card>
  )
}

/* ---------------------------------------------- SRC-04 · blocked capital -- */

export function BlockedCapital() {
  const [by, setBy] = useState<'cause' | 'age'>('cause')
  const total = blockedStock.reduce((a, b) => a + b.value, 0)

  const group = (key: 'cause' | 'ageBucket', labels: Record<string, string>) => {
    const m = new Map<string, number>()
    for (const b of blockedStock) m.set(b[key], (m.get(b[key]) ?? 0) + b.value)
    return [...m.entries()]
      .map(([k, v]) => ({ label: labels[k] ?? k, value: v }))
      .sort((a, b) => b.value - a.value)
  }
  const rows = by === 'cause' ? group('cause', CAUSE_LABEL) : group('ageBucket', AGE_LABEL)

  return (
    <Card id="blocked" index={8} title="Blocked capital" sub="SRC-04 · money stuck in the wrong material"
      actions={<Segmented label="Group by" value={by} onChange={setBy}
        options={[{ id: 'cause', label: 'By cause' }, { id: 'age', label: 'By age' }]} />}>
      <div className="p-4">
        <p className="figure mb-3 text-[28px] leading-none">{lakh(total)}</p>
        <BarRows rows={rows} format="lakh" colorMode={by === 'cause' ? 'categorical' : 'sequential'} />

        <p className="mt-3.5 rounded-md border border-line bg-surface-2 p-3 text-[12.5px] leading-relaxed text-ink-2">
          {by === 'cause' ? (
            <>
              <strong className="text-ink">MOQ forced is the top cause at {lakh(rows[0].value)}.</strong>{' '}
              That is a vendor negotiation, not a software change — which is the whole reason this
              column exists.
            </>
          ) : (
            <>
              <strong className="text-ink">{lakh(rows[0].value)} has been sitting for over 180 days.</strong>{' '}
              Age tells you how bad it is; cause tells you what to do about it.
            </>
          )}
        </p>

        <details className="mt-3 group">
          <summary className="cursor-pointer text-[12px] font-medium text-accent hover:underline">
            All {blockedStock.length} lots, with an owner and a deadline
          </summary>
          <div className="scroll-x mt-2 max-h-72 overflow-auto">
            <table className="w-full min-w-[38rem] border-collapse text-[11.5px]">
              <thead className="sticky top-0 bg-surface-2">
                <tr className="text-ink-3">
                  {['Material', 'Qty', 'Value', 'Age', 'Cause', 'Route', 'Owner', 'By'].map((h) => (
                    <th key={h} className="whitespace-nowrap border-b border-line px-2 py-1.5 text-left font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {blockedStock.map((b) => (
                  <tr key={b.id} className="border-b border-line-soft">
                    <td className="px-2 py-1.5">
                      <span className="mono block text-[10.5px] text-ink-3">{b.itemCode}</span>
                      <span className="block max-w-[14rem] truncate">{b.itemName}</span>
                    </td>
                    <td className="num whitespace-nowrap px-2 py-1.5">{num(b.qty, b.qty < 10 ? 2 : 0)} {b.uom}</td>
                    <td className="num whitespace-nowrap px-2 py-1.5 font-medium">{lakh(b.value)}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-ink-2">{AGE_LABEL[b.ageBucket]}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-ink-2">{CAUSE_LABEL[b.cause]}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-ink-2">{ROUTE_LABEL[b.route]}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-ink-2">{b.owner}</td>
                    <td className="mono whitespace-nowrap px-2 py-1.5 text-ink-3">{b.deadline}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>
    </Card>
  )
}
