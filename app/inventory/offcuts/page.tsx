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
import { useState } from 'react'
import { useWorkspace } from '@/components/workspace/store'
import { DeskOnly } from '@/components/sourcing/DeskOnly'
import { Cutting } from '@/components/inventory/desk/Cutting'
import { StoreRulesWizard } from '@/components/onboard/wizards/StoreRulesWizard'
import { Icon } from '@/components/ui/icons'

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

/**
 * One route, two companies. The sample keeps its worked example. The owner's
 * company gets its own cut records and register — when it cuts. A store that
 * said it does not is told where that was said, and can change its mind from
 * here; every record made while it was on is still there when it comes back.
 */
export default function Page() {
  const { mode, ready, workspace } = useWorkspace()
  if (!ready) return <div className="min-h-[50vh]" aria-hidden />
  if (mode !== 'mine') return <PageBody />
  return <DeskOnly>{workspace?.cutting ? <Cutting /> : <SwitchedOff />}</DeskOnly>
}

function SwitchedOff() {
  const [open, setOpen] = useState(false)
  return (
    <section className="mx-auto mt-6 max-w-[34rem] rounded-xl border border-line bg-surface px-6 py-10 text-center">
      <span aria-hidden className="mx-auto mb-3 grid size-10 place-items-center rounded-lg bg-accent-tint text-accent-ink">
        <Icon name="scissors" className="size-5" />
      </span>
      <h1 className="text-[16px] font-bold leading-tight tracking-tight">Cutting is switched off</h1>
      <p className="mx-auto mt-2 max-w-[26rem] text-[13px] leading-relaxed text-ink-2">
        Your store rules say material goes out as it came in. If you cut fabric, sheet or tube, switch it on and
        this becomes your cut records and the register of remnants — which rack, how many pieces, how old.
        It is the first question in the store rules, the last set-up step on the Inventory dashboard.
      </p>
      <button type="button" onClick={() => setOpen(true)}
        className="press mt-4 inline-flex items-center gap-1.5 rounded-lg border border-accent-ink bg-accent-ink px-3.5 py-2 text-[13px] font-semibold text-on-accent hover:bg-accent">
        Open the store rules
      </button>
      <StoreRulesWizard open={open} onClose={() => setOpen(false)} />
    </section>
  )
}
