'use client'
import { PageHeader } from '@/components/shell/PageHeader'
import { Pill } from '@/components/ui/bits'
import { InventoryTabs } from '@/components/inventory/InventoryTabs'
import { LossLedger, LossSummary, ScrapVsTarget } from '@/components/inventory/Wastage'
import { useInventory } from '@/components/inventory/store'
import { Note } from '@/components/ui/Note'
import { lakh, longDate } from '@/lib/domain/format'
import { useWorkspace } from '@/components/workspace/store'
import { DeskOnly } from '@/components/sourcing/DeskOnly'
import { Wastage } from '@/components/inventory/desk/Wastage'

function PageBody() {
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
      <Note label="What this screen does" className="mb-3">
        Seven causes, six of them posted automatically by events that already happen — a cut, a count,
        a closed challan, a gate rejection. Only wastage on the floor is typed by a person, because a
        loss you have to remember to enter is a loss nobody enters. Scrap percentage is then derived
        from this ledger rather than stored, which is what makes it move.
      </Note>
      <div className="space-y-3">
        <LossSummary />
        <ScrapVsTarget />
        <LossLedger />
      </div>
    </>
  )
}

/**
 * One route, two companies. The sample keeps its worked example; the owner
 * gets their own loss ledger, which reads their workspace and nothing else.
 */
export default function Page() {
  const { mode, ready } = useWorkspace()
  if (!ready) return <div className="min-h-[50vh]" aria-hidden />
  return mode === 'mine'
    ? <DeskOnly><Wastage /></DeskOnly>
    : <PageBody />
}
