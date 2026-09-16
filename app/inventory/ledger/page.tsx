'use client'
import { PageHeader } from '@/components/shell/PageHeader'
import { Pill } from '@/components/ui/bits'
import { InventoryTabs } from '@/components/inventory/InventoryTabs'
import { CountHistory, StockLedger } from '@/components/inventory/Ledger'
import { useInventory } from '@/components/inventory/store'
import { Note } from '@/components/ui/Note'
import { longDate } from '@/lib/domain/format'

export default function Page() {
  const { stockRows, accuracy, today } = useInventory()
  const stale = stockRows.filter((r) => r.stale).length
  return (
    <>
      <PageHeader eyebrow="Stage 4 · Inventory · INV-01" title="Stock ledger &amp; cycle count"
        meta={<>
          <Pill tone={stale ? 'warn' : 'good'}>
            {stale ? `${stale} unconfirmed` : 'every balance confirmed'}
          </Pill>
          <Pill tone="accent">{accuracy.value.toFixed(1)}% record accuracy</Pill>
          <Pill tone="neutral" mono>{longDate(today)}</Pill>
        </>} />
      <InventoryTabs />
      <Note label="What this screen does" className="mb-3">
        No quantity in this build is a stored number. A lot balance is the sum of its movements, and a
        movement can only exist against a document — a goods receipt, a work order, a jobwork challan,
        a cut, a count. Nobody types stock; stock is what is left after the work has been recorded.
      </Note>
      <div className="space-y-3">
        <StockLedger />
        <CountHistory />
      </div>
    </>
  )
}
