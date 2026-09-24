'use client'
import { PageHeader } from '@/components/shell/PageHeader'
import { Pill } from '@/components/ui/bits'
import { InboundTabs } from '@/components/inbound/InboundTabs'
import { JobworkRegister } from '@/components/inbound/Jobwork'
import { useInbound } from '@/components/inbound/store'
import { Note } from '@/components/ui/Note'
import { lakh, longDate } from '@/lib/domain/format'
import { useWorkspace } from '@/components/workspace/store'
import { Moved } from '@/components/shell/Moved'

function PageBody() {
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
      <Note label="What this screen does" className="mb-3">
        Once material leaves for jobwork it is neither on the shelf nor consumed, and a challan book
        that stops at “sent” can tell you nothing about it. Every unit that left is visibly one of five
        things here — back in stock, back and waiting on inspection, still at the jobworker, allowed
        process loss, or unaccounted — and the five always add up to what went out. Returns come back
        through inbound QC like any other receipt, and material inside its promised date is never
        reported as missing.
      </Note>
      <JobworkRegister />
    </>
  )
}

/**
 * One route, two companies. The sample keeps the worked example it has always
 * had; the owner gets their own desk, which reads their workspace and nothing
 * else.
 */
export default function Page() {
  const { mode, ready } = useWorkspace()
  if (!ready) return <div className="min-h-[50vh]" aria-hidden />
  // an owner's jobwork is the store's now — their own material in somebody else's shed
  return mode === 'mine' ? <Moved to="/inventory/jobwork" /> : <PageBody />
}
