'use client'
import Link from 'next/link'
import { StagePage } from '@/components/stage/StagePage'
import { stageById } from '@/lib/seed/stages'
import { Card, StatusPill } from '@/components/ui/bits'
import { buildRows, type SeedBundle } from '@/lib/domain/derive'
import { DEFAULT_POLICY } from '@/lib/domain/policy'
import * as S from '@/lib/seed/sourcing'
import { useDesk } from '@/components/desk/store'
import { STATUS_LABEL, STATUS_TONE } from '@/lib/domain/format'

const seed: SeedBundle = {
  today: S.TODAY_SOURCING, items: S.items, vendors: S.vendors, vendorItems: S.vendorItems,
  stockLots: S.stockLots, poLines: S.poLines, receipts: S.receipts,
}
const rows = buildRows(seed, DEFAULT_POLICY)

export default function Page() {
  const goods = [...new Set(S.items.flatMap((i) => i.feeds))]
  const { state } = useDesk()
  return (
    <StagePage stage={stageById('production')}>
      <Card id="feeds" title="Feeds map" live
        sub="§7 · if I run out of X I cannot make Y — surfaced only for the material that is actually short">
        <div className="space-y-3 p-4">
          {goods.map((g) => {
            const feeders = rows.filter((r) => r.item.feeds.includes(g))
            const short = feeders.filter((r) => r.status.value === 'at_risk' || r.status.value === 'at_risk_late')
            return (
              <div key={g} className={`rounded-md border p-3 ${short.length ? 'border-critical/30 bg-critical-soft/35' : 'border-line bg-surface-2'}`}>
                <div className="flex flex-wrap items-baseline gap-2">
                  <h3 className="text-[13.5px]">{g}</h3>
                  {short.length > 0
                    ? <StatusPill label={`${short.length} material${short.length > 1 ? 's' : ''} short`} tone="critical" />
                    : <StatusPill label="All materials covered" tone="good" />}
                </div>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {feeders.map((r) => (
                    <li key={r.item.id}>
                      <span className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-[11.5px] ${
                        r.status.value === 'at_risk' || r.status.value === 'at_risk_late'
                          ? 'border-critical/30 bg-critical-soft text-critical'
                          : 'border-line bg-surface text-ink-2'}`}>
                        <span className="mono">{r.item.code}</span>
                        <span className="opacity-70">{STATUS_LABEL[r.status.value]}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
          <p className="text-[12px] leading-relaxed text-ink-3">
            One late component holds a whole order. Two materials feed the immersion heater and one of
            them is at risk — that is the §2 problem, drawn. A full BOM explosion across every SKU is
            deliberately not built; the link is surfaced only where something is short.
          </p>
        </div>
      </Card>

      <Card id="aliases" className="mt-3" title="Item master & aliases" live
        sub={`§8.2 · what the factory calls it, against what each vendor calls it · ${state.aliases.length} mappings`}>
        <ul className="divide-y divide-line-soft">
          {state.aliases.map((a, i) => (
            <li key={i} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5">
              <span className="mono text-[12.5px]">“{a.rawText}”</span>
              <span aria-hidden className="text-ink-3">→</span>
              <span className="mono text-[12.5px] font-medium">{a.itemId}</span>
              <span className="ml-auto text-[11px] text-ink-3">{a.vendorName} · confirmed {a.confirmedAt}</span>
            </li>
          ))}
        </ul>
        <p className="border-t border-line-soft px-4 py-3 text-[12px] leading-relaxed text-ink-3">
          New mappings are written from the review queue on the{' '}
          <Link href="/sourcing/desk#intake" className="font-medium text-accent hover:underline">Sourcing Desk</Link>.
          Accepting a suggested match teaches the system that vendor’s spelling permanently.
        </p>
      </Card>
    </StagePage>
  )
}
