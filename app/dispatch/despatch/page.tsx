'use client'
import { PageHeader } from '@/components/shell/PageHeader'
import { Pill } from '@/components/ui/bits'
import { DispatchTabs } from '@/components/dispatch/DispatchTabs'
import { DespatchRegister, FinishedGoods, OrderBook } from '@/components/dispatch/Despatch'
import { useDispatch } from '@/components/dispatch/store'
import { lakh, longDate } from '@/lib/domain/format'

export default function Page() {
  const { openOrders, overdueValue, today } = useDispatch()
  const late = openOrders.filter((o) => o.overdue).length
  return (
    <>
      <PageHeader eyebrow="Stage 5 · Dispatch · DSP-01" title="Despatch notes"
        meta={<>
          <Pill tone={late ? 'critical' : 'good'}>
            {late ? `${late} past the promise` : 'nothing overdue'}
          </Pill>
          <Pill tone="warn">{lakh(overdueValue.value as number)} late</Pill>
          <Pill tone="neutral" mono>{longDate(today)}</Pill>
        </>} />
      <DispatchTabs />
      <p className="mb-4 max-w-3xl text-[13.5px] leading-relaxed text-ink-2">
        The mirror of the goods receipt. The inbound gate has been instrumented since INB-01 and the
        outbound one was not, so the ledger was accurate right up to the moment material left the
        building. A despatch note names what went, against which order and on whose authority, and it
        posts the movement that takes the goods off the bay.
      </p>
      <div className="space-y-3">
        <OrderBook />
        <FinishedGoods />
        <DespatchRegister />
      </div>
    </>
  )
}
