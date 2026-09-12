'use client'
import { PageHeader } from '@/components/shell/PageHeader'
import { Pill } from '@/components/ui/bits'
import { DispatchTabs } from '@/components/dispatch/DispatchTabs'
import { DocumentRegister } from '@/components/dispatch/Documents'
import { useDispatch } from '@/components/dispatch/store'
import { longDate } from '@/lib/domain/format'

export default function Page() {
  const { notes, today } = useDispatch()
  return (
    <>
      <PageHeader eyebrow="Stage 5 · Dispatch · DSP-02" title="Document pack"
        meta={<>
          <Pill tone="accent">{notes.length} packs</Pill>
          <Pill tone="neutral" mono>{longDate(today)}</Pill>
        </>} />
      <DispatchTabs />
      <p className="mb-4 max-w-3xl text-[13.5px] leading-relaxed text-ink-2">
        Three documents carry the same figures and are typed three times, and every re-key is a chance to
        ship the right goods against the wrong paperwork. The pack below is prepared once from the
        despatch note and handed to the accounting system the factory already runs. It never allocates an
        invoice number, never computes a tax and never holds a receivable — §12 draws that line, and a
        system that quietly crosses it has become a second set of books nobody reconciles.
      </p>
      <div className="space-y-3">
        <DocumentRegister />
      </div>
    </>
  )
}
