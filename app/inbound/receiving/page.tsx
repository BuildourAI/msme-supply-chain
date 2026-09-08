'use client'
import { PageHeader } from '@/components/shell/PageHeader'
import { Pill } from '@/components/ui/bits'
import { InboundTabs } from '@/components/inbound/InboundTabs'
import { InspectionHistory, LeadTimeTruth, ReceivingQueue, SpecRegister } from '@/components/inbound/Receiving'
import { useInbound } from '@/components/inbound/store'
import { specChecks } from '@/lib/seed/inbound'
import { buildRows, type SeedBundle } from '@/lib/domain/derive'
import { DEFAULT_POLICY } from '@/lib/domain/policy'
import * as S from '@/lib/seed/sourcing'
import { longDate } from '@/lib/domain/format'

const seed: SeedBundle = {
  today: S.TODAY_SOURCING, items: S.items, vendors: S.vendors, vendorItems: S.vendorItems,
  stockLots: S.stockLots, poLines: S.poLines, receipts: S.receipts,
}
const leadRows = buildRows(seed, DEFAULT_POLICY).map((r) => ({
  code: r.item.code, name: r.item.name, vendor: r.chosen.vendor.name,
  quoted: r.chosen.vendorItem.quotedLeadTimeDays, actual: r.leadTime,
}))

export default function Page() {
  const { queue, today } = useInbound()
  return (
    <>
      <PageHeader eyebrow="Stage 2 · Inbound · INB-01" title="Receiving &amp; inbound QC"
        meta={<>
          <Pill tone={queue.length ? 'warn' : 'good'}>
            {queue.length ? `${queue.length} awaiting inspection` : 'gate clear'}
          </Pill>
          <Pill tone="neutral" mono>{longDate(today)}</Pill>
        </>} />
      <InboundTabs />
      <p className="mb-4 max-w-3xl text-[13.5px] leading-relaxed text-ink-2">
        No material becomes usable stock without a goods receipt, and no receipt closes until every
        check on the item’s spec is marked with a reading or a mark against it. What is rejected lands
        in a named bucket rather than a storeman’s memory, and what is accepted files a receipt — so the
        vendor’s lead time and rejection rate move as the gate is worked.
      </p>
      <div className="space-y-3">
        <ReceivingQueue />
        <InspectionHistory />
        <LeadTimeTruth rows={leadRows} />
        <SpecRegister specs={specChecks} />
      </div>
    </>
  )
}
