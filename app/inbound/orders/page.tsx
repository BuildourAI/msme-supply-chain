'use client'
import { PageHeader } from '@/components/shell/PageHeader'
import { Pill } from '@/components/ui/bits'
import { InboundTabs } from '@/components/inbound/InboundTabs'
import { InboundBoard, OrderSync } from '@/components/inbound/Orders'
import { useInbound } from '@/components/inbound/store'
import { buildRows, type SeedBundle } from '@/lib/domain/derive'
import { DEFAULT_POLICY } from '@/lib/domain/policy'
import { addDays, daysBetween } from '@/lib/domain/calc'
import * as S from '@/lib/seed/sourcing'
import { longDate, money, qtyText, shortDate } from '@/lib/domain/format'

const seed: SeedBundle = {
  today: S.TODAY_SOURCING, items: S.items, vendors: S.vendors, vendorItems: S.vendorItems,
  stockLots: S.stockLots, poLines: S.poLines, receipts: S.receipts,
}
const rows = buildRows(seed, DEFAULT_POLICY)

export default function Page() {
  const { syncRows, outOfSync, today, policy } = useInbound()

  // The board reads the ACKNOWLEDGED quantity and date, because that is what will
  // actually arrive — an internal change improves nothing until the vendor confirms.
  const lines = syncRows.filter((r) => !r.received).map((r) => {
    const row = rows.find((x) => x.item.id === r.item.id)!
    const eta = r.vendorKnown.value === 0 ? today : r.sync.revisions.find((v) => v.version === r.sync.ackedVersion)!.promisedDate
    const arrival = daysBetween(today, eta)
    const stockout = daysBetween(today, row.stockoutDate.value)
    return {
      poNo: r.sync.poNo, itemName: r.item.name,
      qtyLabel: qtyText(r.vendorKnown.value, r.uom),
      arrival, usable: arrival + policy.inboundQcDays, stockout,
      late: Math.max(0, daysBetween(row.stockoutDate.value, eta)),
      etaLabel: `${r.sync.shipped ? 'In transit' : 'Ordered, not despatched'} · arrives ${shortDate(eta)}`,
      issuableLabel: `issuable ${shortDate(addDays(eta, policy.inboundQcDays))} after ${policy.inboundQcDays} days of inbound QC`,
      stockoutLabel: `line stops ${shortDate(row.stockoutDate.value)}`,
      statusLabel: eta > row.stockoutDate.value
        ? `Lands ${daysBetween(row.stockoutDate.value, eta)} days after the line stops`
        : 'Lands in time',
      inSync: r.state === 'acknowledged',
      ackNote: `we need ${qtyText(r.internal.value, r.uom)} — ${money(r.exposure.value)} not acknowledged`,
    }
  }).sort((a, b) => a.arrival - b.arrival)

  return (
    <>
      <PageHeader eyebrow="Stage 2 · Inbound · INB-02" title="Open orders &amp; change sync"
        meta={<>
          <Pill tone={outOfSync.some((r) => !r.received) ? 'critical' : 'good'}>
            {outOfSync.filter((r) => !r.received).length
              ? `${outOfSync.filter((r) => !r.received).length} lines out of sync`
              : 'every line in sync'}
          </Pill>
          <Pill tone="neutral" mono>{longDate(today)}</Pill>
        </>} />
      <InboundTabs />
      <p className="mb-4 max-w-3xl text-[13.5px] leading-relaxed text-ink-2">
        Every purchase order line carries its versions. An internal change — a quantity, a date, a
        cancellation — creates a new version and drafts the notice; a person sends it and records what
        the vendor said back. Until that acknowledgement exists, the vendor is still making the old
        quantity, and this system counts the old quantity.
      </p>
      <div className="space-y-3">
        <OrderSync />
        <InboundBoard lines={lines} />
      </div>
    </>
  )
}
