'use client'
import { PageHeader } from '@/components/shell/PageHeader'
import { Pill } from '@/components/ui/bits'
import { DispatchTabs } from '@/components/dispatch/DispatchTabs'
import { DocumentRegister } from '@/components/dispatch/Documents'
import { useDispatch } from '@/components/dispatch/store'
import { Note } from '@/components/ui/Note'
import { longDate } from '@/lib/domain/format'
import { StageGate } from '@/components/onboard/StageGate'

function PageBody() {
  const { notes, today } = useDispatch()
  return (
    <>
      <PageHeader eyebrow="Stage 5 · Dispatch · DSP-02" title="Document pack"
        meta={<>
          <Pill tone="accent">{notes.length} packs</Pill>
          <Pill tone="neutral" mono>{longDate(today)}</Pill>
        </>} />
      <DispatchTabs />
      <Note label="What this screen does" className="mb-3">
        Three documents carry the same figures and are typed three times, and every re-key is a chance to
        ship the right goods against the wrong paperwork. The pack below is prepared once from the
        despatch note and handed to the accounting system the factory already runs. It never allocates an
        invoice number, never computes a tax and never holds a receivable — §12 draws that line, and a
        system that quietly crosses it has become a second set of books nobody reconciles.
      </Note>
      <div className="space-y-3">
        <DocumentRegister />
      </div>
    </>
  )
}

export default function Page() {
  return <StageGate sample="the delivery challan on each dispatch note" shows="the worked example’s dispatch documents"><PageBody /></StageGate>
}
