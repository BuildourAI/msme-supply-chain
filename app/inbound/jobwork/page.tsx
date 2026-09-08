'use client'
import { PageHeader } from '@/components/shell/PageHeader'
import { Pill } from '@/components/ui/bits'
import { InboundTabs } from '@/components/inbound/InboundTabs'
import { JobworkRegister } from '@/components/inbound/Jobwork'
import { useInbound } from '@/components/inbound/store'
import { lakh, longDate } from '@/lib/domain/format'

export default function Page() {
  const { challanRows, jobworkTotal, today } = useInbound()
  const overdue = challanRows.filter((r) => r.overdue).length
  return (
    <>
      <PageHeader eyebrow="Stage 2 · Inbound · INB-03" title="Jobwork register"
        meta={<>
          <Pill tone={overdue ? 'critical' : 'good'}>
            {overdue ? `${overdue} overdue` : 'nothing overdue'}
          </Pill>
          <Pill tone="warn">{lakh(jobworkTotal.value)} out</Pill>
          <Pill tone="neutral" mono>{longDate(today)}</Pill>
        </>} />
      <InboundTabs />
      <p className="mb-4 max-w-3xl text-[13.5px] leading-relaxed text-ink-2">
        Once material leaves for jobwork it is neither on the shelf nor consumed, and a challan book
        that stops at “sent” can tell you nothing about it. Every unit that left is visibly one of four
        things here — back, at the jobworker, allowed process loss, or unaccounted — and returns come
        back through inbound QC like any other receipt.
      </p>
      <JobworkRegister />
    </>
  )
}
