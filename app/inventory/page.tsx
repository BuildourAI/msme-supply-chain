'use client'
import { StagePage } from '@/components/stage/StagePage'
import { stageById } from '@/lib/seed/stages'
import { Card, Pill } from '@/components/ui/bits'
import { Num } from '@/components/ui/Num'
import { buildRows, deskKpis, type SeedBundle } from '@/lib/domain/derive'
import { DEFAULT_POLICY, VALUATION_BASIS } from '@/lib/domain/policy'
import * as S from '@/lib/seed/sourcing'
import { money, qtyText } from '@/lib/domain/format'

const seed: SeedBundle = {
  today: S.TODAY_SOURCING, items: S.items, vendors: S.vendors, vendorItems: S.vendorItems,
  stockLots: S.stockLots, poLines: S.poLines, receipts: S.receipts,
}
const rows = buildRows(seed, DEFAULT_POLICY)
const kpis = deskKpis(rows)

const USABILITY_LABEL: Record<string, string> = {
  usable: 'Usable', qc_hold: 'QC hold', damaged: 'Damaged', expired: 'Expired',
}

export default function Page() {
  return (
    <StagePage stage={stageById('inventory')}>
      <Card title="Stock truth" live sub="Every lot, what state it is in, and what that state costs"
        annotation={`valued at ${VALUATION_BASIS}`}>
        <div className="scroll-x overflow-x-auto">
          <table className="w-full min-w-[48rem] border-collapse text-[12.5px]">
            <thead className="bg-surface-2">
              <tr className="text-[11px] uppercase tracking-wide text-ink-3">
                {['Material', 'Lot', 'State', 'Quantity', 'Why', 'Value'].map((h) => (
                  <th key={h} className={`whitespace-nowrap border-b border-line px-3 py-2 font-medium ${h === 'Value' || h === 'Quantity' ? 'text-right' : 'text-left'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {S.stockLots.map((lot) => {
                const item = S.items.find((i) => i.id === lot.itemId)!
                const uom = item.uom === 'm2' ? 'm²' : item.uom
                const good = lot.usability === 'usable'
                return (
                  <tr key={lot.id} className={`border-b border-line-soft ${good ? '' : 'bg-warn-soft/25'}`}>
                    <td className="px-3 py-2">
                      <span className="mono block text-[11px] text-ink-3">{item.code}</span>
                      {item.name}
                    </td>
                    <td className="mono px-3 py-2 text-[11.5px] text-ink-2">{lot.batchNo}</td>
                    <td className="px-3 py-2">
                      <Pill tone={good ? 'good' : 'warn'}>{USABILITY_LABEL[lot.usability]}</Pill>
                    </td>
                    <td className="num px-3 py-2 text-right">{qtyText(lot.qty, uom)}</td>
                    <td className="px-3 py-2 text-[11.5px] text-ink-3">{lot.usabilityReason ?? '—'}</td>
                    <td className="num px-3 py-2 text-right">
                      {good ? <span className="text-ink-3">—</span> : money(lot.qty * item.lastPurchaseRate, 2)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="bg-surface-2">
                <td colSpan={5} className="px-3 py-2.5 text-right text-[12px] font-medium">
                  Total on hand but not issuable
                </td>
                <td className="px-3 py-2.5 text-right">
                  <Num d={kpis.nonUsableValue} format="money" className="font-semibold" />
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="border-t border-line-soft px-4 py-3 text-[12px] leading-relaxed text-ink-3">
          That total is the same figure, from the same function, as the non-usable tile on the
          Sourcing Desk — the two screens cannot disagree. Non-usable stock is always displayed and
          never counted as cover; same for anything sitting with a jobworker.
        </p>
      </Card>

      <Card className="mt-3" title="Offcuts already owned" live
        sub="§4 · a usable remnant, checked before buying fresh">
        <ul className="divide-y divide-line-soft">
          {S.offcuts.map((o) => {
            const item = S.items.find((i) => i.id === o.itemId)!
            const uom = item.uom === 'm2' ? 'm²' : item.uom
            return (
              <li key={o.itemId} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5">
                <span className="mono text-[11.5px] text-ink-3">{item.code}</span>
                <span className="text-[12.5px]">{o.specNote}</span>
                <span className="text-[11.5px] text-ink-3">{o.location}</span>
                <span className="num ml-auto text-[12.5px]">{qtyText(o.qty, uom)}</span>
                <span className="num w-24 text-right text-[12.5px] font-medium">
                  {money(o.qty * item.lastPurchaseRate)}
                </span>
              </li>
            )
          })}
        </ul>
      </Card>
    </StagePage>
  )
}
