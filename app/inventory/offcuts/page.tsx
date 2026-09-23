'use client'
import { PageHeader } from '@/components/shell/PageHeader'
import { Pill } from '@/components/ui/bits'
import { InventoryTabs } from '@/components/inventory/InventoryTabs'
import { CutRecords, OffcutRegister, RepurchaseCheck } from '@/components/inventory/Offcuts'
import { useInventory } from '@/components/inventory/store'
import { Note } from '@/components/ui/Note'
import { buildRows, type SeedBundle } from '@/lib/domain/derive'
import { DEFAULT_POLICY } from '@/lib/domain/policy'
import * as S from '@/lib/seed/sourcing'
import { lakh, longDate } from '@/lib/domain/format'
import { StageGate } from '@/components/onboard/StageGate'

const seed: SeedBundle = {
  today: S.TODAY_SOURCING, items: S.items, vendors: S.vendors, vendorItems: S.vendorItems,
  stockLots: S.stockLots, poLines: S.poLines, receipts: S.receipts,
}
// The live reorder suggestions, so the repurchase check is against the real desk.
const needs = buildRows(seed, DEFAULT_POLICY)
  .filter((r) => r.reorderQty.value > 0)
  .map((r) => ({
    code: r.item.code, name: r.item.name, itemId: r.item.id,
    needQty: r.reorderQty.value, uom: r.item.uom === 'm2' ? 'm²' : r.item.uom,
    rate: r.item.lastPurchaseRate,
  }))

function PageBody() {
  const { offcutValue, cutRows, today } = useInventory()
  const below = cutRows.filter((r) => r.belowPlan).length
  return (
    <>
      <PageHeader eyebrow="Stage 4 · Inventory · INV-02" title="Cutting yield &amp; offcuts"
        meta={<>
          <Pill tone="accent">{lakh(offcutValue.value)} on the rack</Pill>
          <Pill tone={below ? 'warn' : 'good'}>
            {below ? `${below} cuts below the nest plan` : 'every cut at plan'}
          </Pill>
          <Pill tone="neutral" mono>{longDate(today)}</Pill>
        </>} />
      <InventoryTabs />
      <Note label="What this screen does" className="mb-3">
        A remnant above the usable minimum becomes a lot in the same ledger as everything else, with a
        size and a rack. Below the minimum it is scrap at the cut, which is what stops the register
        filling with bits nobody will use. Every cut record balances — input equals parts plus kerf plus
        remnants — so a yield figure is a measurement rather than an opinion.
      </Note>
      <div className="space-y-3">
        <OffcutRegister />
        <CutRecords />
        <RepurchaseCheck needs={needs} />
      </div>
    </>
  )
}

export default function Page() {
  return <StageGate sample="the cut records and the offcut register" shows="cut records, cutting yield and the register of remnants"><PageBody /></StageGate>
}
