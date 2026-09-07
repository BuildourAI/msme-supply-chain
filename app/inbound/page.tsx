'use client'
import { StagePage } from '@/components/stage/StagePage'
import { stageById } from '@/lib/seed/stages'
import { Card, StatusPill } from '@/components/ui/bits'
import { Num } from '@/components/ui/Num'
import { buildRows, type SeedBundle } from '@/lib/domain/derive'
import { DEFAULT_POLICY } from '@/lib/domain/policy'
import { daysBetween } from '@/lib/domain/calc'
import * as S from '@/lib/seed/sourcing'
import { qtyText, shortDate } from '@/lib/domain/format'

const seed: SeedBundle = {
  today: S.TODAY_SOURCING, items: S.items, vendors: S.vendors, vendorItems: S.vendorItems,
  stockLots: S.stockLots, poLines: S.poLines, receipts: S.receipts,
}
const rows = buildRows(seed, DEFAULT_POLICY)

const SPAN = 26 // days of lane, from today

export default function Page() {
  const lines = S.poLines.map((l) => {
    const row = rows.find((r) => r.item.id === l.itemId)!
    const arrival = daysBetween(seed.today, l.promisedDate)
    const usable = arrival + DEFAULT_POLICY.inboundQcDays
    const stockout = daysBetween(seed.today, row.stockoutDate.value)
    return { l, row, arrival, usable, stockout, late: l.promisedDate > row.stockoutDate.value }
  }).sort((a, b) => a.arrival - b.arrival)

  return (
    <StagePage stage={stageById('inbound')}>
      <Card title="Inbound board" live sub="Everything on its way in, against the day each material runs out"
        annotation={`today ${shortDate(seed.today)} · +${DEFAULT_POLICY.inboundQcDays} days inbound QC`}>
        <div className="p-4">
          <ul className="space-y-3.5">
            {lines.map(({ l, row, arrival, usable, stockout, late }) => (
              <li key={l.id}>
                <div className="mb-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="mono text-[12px] font-medium">{l.poNo}</span>
                  <span className="text-[12.5px]">{row.item.name}</span>
                  <span className="mono text-[11px] text-ink-3">{qtyText(l.qty, row.item.uom)}</span>
                  <span className="ml-auto">
                    <StatusPill
                      label={late ? `Lands ${daysBetween(row.stockoutDate.value, l.promisedDate)} days after the line stops` : 'Lands in time'}
                      tone={late ? 'critical' : 'good'} />
                  </span>
                </div>
                <div className="relative h-7 w-full rounded-md bg-surface-2">
                  {/* the day this material runs out */}
                  <div aria-hidden className="absolute top-0 h-full w-[2px] bg-critical"
                       style={{ left: `${(stockout / SPAN) * 100}%` }} />
                  {/* despatch → arrival, then hatched inbound QC: received is not usable */}
                  <div className="absolute top-1.5 h-4 rounded-l-[3px] bg-accent"
                       style={{ left: 0, width: `${(arrival / SPAN) * 100}%` }} />
                  <div className="absolute top-1.5 h-4 rounded-r-[3px]"
                       style={{
                         left: `${(arrival / SPAN) * 100}%`,
                         width: `${((usable - arrival) / SPAN) * 100}%`,
                         background: 'repeating-linear-gradient(45deg, var(--accent) 0 2px, transparent 2px 5px)',
                         border: '1px solid var(--accent)',
                       }} />
                </div>
                <p className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-ink-3">
                  <span>{l.status === 'in_transit' ? 'In transit' : 'Ordered, not despatched'} · arrives {shortDate(l.promisedDate)}</span>
                  <span>issuable {shortDate(row.estimatedArrival.value > l.promisedDate ? l.promisedDate : l.promisedDate)} + {DEFAULT_POLICY.inboundQcDays} days QC</span>
                  <span className="text-critical">line stops {shortDate(row.stockoutDate.value)}</span>
                  {l.earmarkedJobNo && <span>earmarked for {l.earmarkedJobNo} — not free stock</span>}
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-4 rounded-md border border-warn/30 bg-warn-soft p-3 text-[12.5px] leading-relaxed text-ink-2">
            <strong className="text-ink">PO-2611 is the case worth looking at.</strong> MgO powder is
            covered on quantity — 610 against a reorder point of 480 — but the material lands nine days
            after the line runs dry. That is a timing problem, so the answer is to expedite the open
            order, not to raise a second one. The system does not buy its way out of a late delivery.
          </p>
        </div>
      </Card>

      <Card className="mt-3" title="Lead-time truth" live
        sub="§5 · the trailing average of the last six actual receipts, never the vendor’s quoted figure">
        <div className="scroll-x overflow-x-auto">
          <table className="w-full min-w-[40rem] border-collapse text-[12.5px]">
            <thead className="bg-surface-2">
              <tr className="text-[11px] uppercase tracking-wide text-ink-3">
                {['Material', 'Supplier', 'Quoted', 'Actual, last 6 receipts', 'Drift'].map((h) => (
                  <th key={h} className="whitespace-nowrap border-b border-line px-3 py-2 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const drift = r.leadTime.value - r.chosen.vendorItem.quotedLeadTimeDays
                return (
                  <tr key={r.item.id} className="border-b border-line-soft">
                    <td className="px-3 py-2">
                      <span className="mono block text-[11px] text-ink-3">{r.item.code}</span>
                      {r.item.name}
                    </td>
                    <td className="px-3 py-2 text-ink-2">{r.chosen.vendor.name}</td>
                    <td className="num px-3 py-2">{r.chosen.vendorItem.quotedLeadTimeDays} days</td>
                    <td className="px-3 py-2"><Num d={r.leadTime} format="days" suffix=" days" /></td>
                    <td className={`num px-3 py-2 ${drift > 0 ? 'text-warn' : 'text-ink-3'}`}>
                      {drift === 0 ? 'none' : `${drift > 0 ? '+' : ''}${drift} days`}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="border-t border-line-soft px-4 py-3 text-[11.5px] leading-relaxed text-ink-3">
          Every lead time here is computed from six seeded receipt records, not stored as a number.
          Click one to see the six dates it averages.
        </p>
      </Card>
    </StagePage>
  )
}
