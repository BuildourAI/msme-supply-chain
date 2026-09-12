'use client'
import { PageHeader } from '@/components/shell/PageHeader'
import { Pill } from '@/components/ui/bits'
import { DispatchTabs } from '@/components/dispatch/DispatchTabs'
import { CarrierTable, ConsignmentRegister, OtifStrip } from '@/components/dispatch/Consignments'
import { useDispatch } from '@/components/dispatch/store'
import { longDate, num } from '@/lib/domain/format'

export default function Page() {
  const { otif, inTransit, today } = useDispatch()
  const late = inTransit.filter((r) => r.late).length
  return (
    <>
      <PageHeader eyebrow="Stage 5 · Dispatch · DSP-03" title="Consignments &amp; milestones"
        meta={<>
          <Pill tone={(otif.value as number) >= 95 ? 'good' : 'critical'}>
            {num(otif.value as number, 1)}% OTIF, measured
          </Pill>
          <Pill tone={late ? 'critical' : 'neutral'}>
            {late ? `${late} overdue in transit` : `${inTransit.length} in transit`}
          </Pill>
          <Pill tone="neutral" mono>{longDate(today)}</Pill>
        </>} />
      <DispatchTabs />
      <p className="mb-4 max-w-3xl text-[13.5px] leading-relaxed text-ink-2">
        Despatched and delivered used to be the same event as far as the record was concerned, so
        customer OTIF could not be computed at all and the executive dashboard carried an assumed
        percentage that said so. A consignment names the carrier, the date the customer was given and the
        date somebody watched the goods arrive. That third fact is the one no client in the source set
        captures today, and it is the whole reason this figure was illustrative.
      </p>
      <OtifStrip />
      <div className="space-y-3">
        <ConsignmentRegister />
        <CarrierTable />
      </div>
    </>
  )
}
