'use client'
import { PageHeader } from '@/components/shell/PageHeader'
import { Pill } from '@/components/ui/bits'
import { InventoryTabs } from '@/components/inventory/InventoryTabs'
import { LossLedger, LossSummary, ScrapVsTarget } from '@/components/inventory/Wastage'
import { useInventory } from '@/components/inventory/store'
import { lakh, longDate } from '@/lib/domain/format'

export default function Page() {
  const { netLoss, scrapRows, today } = useInventory()
  const over = scrapRows.filter((s) => s.over).length
  return (
    <>
      <PageHeader eyebrow="Stage 4 · Inventory · INV-03" title="Wastage &amp; material loss"
        meta={<>
          <Pill tone="critical">{lakh(netLoss.value)} net loss</Pill>
          <Pill tone={over ? 'warn' : 'good'}>
            {over ? `${over} over target` : 'all within target'}
          </Pill>
          <Pill tone="neutral" mono>{longDate(today)}</Pill>
        </>} />
      <InventoryTabs />
      <p className="mb-4 max-w-3xl text-[13.5px] leading-relaxed text-ink-2">
        Seven causes, six of them posted automatically by events that already happen — a cut, a count,
        a closed challan, a gate rejection. Only wastage on the floor is typed by a person, because a
        loss you have to remember to enter is a loss nobody enters. Scrap percentage is then derived
        from this ledger rather than stored, which is what makes it move.
      </p>
      <div className="space-y-3">
        <LossSummary />
        <ScrapVsTarget />
        <LossLedger />
      </div>
    </>
  )
}
