'use client'
import { PageHeader } from '@/components/shell/PageHeader'
import { Pill } from '@/components/ui/bits'
import { DispatchTabs } from '@/components/dispatch/DispatchTabs'
import { ReturnsRegister } from '@/components/dispatch/Returns'
import { useDispatch } from '@/components/dispatch/store'
import { Note } from '@/components/ui/Note'
import { longDate, num } from '@/lib/domain/format'
import { StageGate } from '@/components/onboard/StageGate'
import { useWorkspace } from '@/components/workspace/store'
import { DeskOnly } from '@/components/sourcing/DeskOnly'
import { Returns } from '@/components/dispatch/desk/Returns'

function PageBody() {
  const { rmaRows, rmaRate, today } = useDispatch()
  const open = rmaRows.filter((r) => r.rma.state !== 'closed').length
  return (
    <>
      <PageHeader eyebrow="Stage 5 · Dispatch · DSP-04" title="Returns"
        meta={<>
          <Pill tone={open ? 'warn' : 'good'}>{open ? `${open} open` : 'nothing outstanding'}</Pill>
          <Pill tone="neutral">{num(rmaRate.value as number, 2)}% RMA rate, measured</Pill>
          <Pill tone="neutral" mono>{longDate(today)}</Pill>
        </>} />
      <DispatchTabs />
      <Note label="What this screen does" className="mb-3">
        A returned product used to be handled on the phone: it never became stock again, never became a
        quality signal and never reached the supplier who caused it. Half the fix was already built,
        because goods coming back are goods coming in and the inbound gate has checked those against a
        spec since INB-01. The missing half is this — an authorisation with a named owner and a date the
        return can be late against.
      </Note>
      <div className="space-y-3">
        <ReturnsRegister />
      </div>
    </>
  )
}

/** One route, two companies: the sample keeps its returns; the owner gets their own. */
export default function Page() {
  const { mode, ready } = useWorkspace()
  if (!ready) return <div className="min-h-[50vh]" aria-hidden />
  return mode === 'mine'
    ? <DeskOnly><Returns /></DeskOnly>
    : <StageGate sample="Returns"><PageBody /></StageGate>
}
