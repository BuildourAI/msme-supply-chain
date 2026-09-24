'use client'
import { num, shortDate } from '@/lib/domain/format'
import { verdictText, type BoardLine } from '@/lib/workspace/board'
import { expediteDraft } from '@/lib/workspace/orders'
import { ChaseDialog } from './ChaseDialog'

/** An order that will not be here in time, and the words to hurry it. */
export function ExpediteDialog({ line, onClose }: { line: BoardLine | null; onClose: () => void }) {
  if (!line) return null
  return (
    <ChaseDialog open onClose={onClose}
      title={`Ask ${line.vendor?.name ?? 'the supplier'} to hurry ${line.order.no}`}
      sub={`${line.item?.name ?? 'This material'} lands ${verdictText(line)}`}
      vendorId={line.order.vendorId}
      subject={`${line.order.no} — needed sooner`}
      text={expediteDraft(
        line.vendor?.name ?? 'Sir', line.order.no, line.item?.name ?? 'the material',
        `${num(line.qty, 3)} ${line.uom}`, shortDate(line.promised),
        line.stops ? shortDate(line.stops) : shortDate(line.arrives))} />
  )
}
