'use client'
import { useState } from 'react'
import type { DerivedRow } from '@/lib/domain/derive'
import { Button } from '@/components/ui/bits'
import { Dialog } from '@/components/ui/Dialog'
import { useApp } from '@/state/app-store'
import { money, num } from '@/lib/domain/format'
import { useDesk } from './store'

/**
 * §11 — the system raises, holds and drafts. Nothing here places an order or
 * contacts a supplier, and the verbs say so.
 */
export function RowActions({ row, size = 'sm' }: { row: DerivedRow; size?: 'sm' | 'md' }) {
  const { decide, undo, state } = useDesk()
  const { log, say } = useApp()
  const [reasonOpen, setReasonOpen] = useState(false)
  const [reason, setReason] = useState('')
  const decided = state.decisions[row.item.id]

  if (decided) {
    const label: Record<string, string> = {
      approved: 'Draft PO raised', held: 'Held', overridden: 'Released with reason',
      expedited: 'Expedite drafted', deferred: 'Set aside',
    }
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[11.5px] text-ink-2"
            title="Decided lines keep the figures they were decided on — a later rate or policy change never alters them (§7).">
        <span aria-hidden className="size-1.5 rounded-full bg-good" />
        {label[decided.decision] ?? decided.decision}
        <span className="mono text-[10px] text-ink-3">· figures frozen</span>
        <button type="button" onClick={() => undo(row)}
          className="ml-1 text-[11px] font-medium text-accent hover:underline"
          title="Every automated action is reversible (§11). Nothing was sent, so nothing needs recalling.">
          Undo
        </button>
      </span>
    )
  }

  const submitOverride = () => {
    if (reason.trim().length < 10) return
    decide(row, 'overridden', reason.trim())
    setReasonOpen(false); setReason('')
  }

  const flags = (
    <>
      {row.aboveLastPurchase.value && (
        <span className="basis-full text-[10.5px] leading-tight text-warn"
              title={row.aboveLastPurchase.note}>
          rate above last purchase price · needs sign-off
        </span>
      )}
      {row.needsOwnerSignoff.value && (
        <span className="basis-full text-[10.5px] leading-tight text-warn"
              title={row.needsOwnerSignoff.note}>
          above the owner’s threshold · owner signs off
        </span>
      )}
    </>
  )

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {flags}
      {row.held.value ? (
        <>
          <Button size={size} variant="danger" onClick={() => setReasonOpen(true)}>Override with reason</Button>
          <Button size={size} onClick={() => {
            log({ entity: 'vendor', entityId: row.chosen.vendor.name, action: 'MOQ split requested',
              detail: `Drafted a request to ${row.chosen.vendor.name} to split the ${num(row.item.moq, 0)} ${row.item.uom} MOQ on ${row.item.code}` })
            say(`A request to split the MOQ has been drafted for ${row.chosen.vendor.name}. It has not been sent — you send it.`)
          }}>Ask vendor to split MOQ</Button>
        </>
      ) : row.status.value === 'at_risk' ? (
        <>
          <Button size={size} variant="primary" onClick={() => decide(row, 'approved')}>
            {row.needsOwnerSignoff.value ? 'Draft PO for owner sign-off' : 'Approve draft PO'}
          </Button>
          <Button size={size} variant="ghost" onClick={() => decide(row, 'deferred')}>Not now</Button>
        </>
      ) : row.status.value === 'at_risk_late' ? (
        <>
          <Button size={size} variant="primary" onClick={() => decide(row, 'expedited')}
            title="Covered on quantity, late on timing — the answer is to chase the open order, not to buy more">
            Expedite {row.inboundRefs[0]}
          </Button>
          <Button size={size} variant="ghost" onClick={() => decide(row, 'deferred')}>Not now</Button>
        </>
      ) : (
        <Button size={size} variant="ghost" onClick={() => {
          log({ entity: 'reorder_suggestion', entityId: row.item.code, action: 'Line reviewed',
            detail: `${row.item.code} confirmed as ${row.status.value === 'covered' ? 'covered' : 'covered by an open order'} — no purchase raised` })
          say(`${row.item.code} marked reviewed. No purchase was raised; this line does not need one.`)
        }}>Mark reviewed</Button>
      )}

      <Dialog open={reasonOpen} onClose={() => setReasonOpen(false)}
        title="Release past the coverage ceiling"
        sub={`${row.item.code} · ${row.item.name}`}>
        <div className="space-y-3 px-4 py-4">
          <div className="rounded-md border border-warn/30 bg-warn-soft p-3 text-[12.5px] leading-relaxed text-ink-2">
            This order takes cover to <strong className="text-ink">{num(row.coverageAfterMonths.value, 2)} months</strong>,
            past the {num(state.policy.coverageCeiling[row.item.itemClass], 1)}-month ceiling for class {row.item.itemClass}.
            The MOQ of {num(row.item.moq, 0)} {row.item.uom} against a net need of{' '}
            {num(row.reorderPoint.value + state.policy.cycleDays[row.item.itemClass] * row.item.avgDailyConsumption - row.truePosition.value, 0)} {row.item.uom} is why.
          </div>
          <label className="block">
            <span className="text-[12px] font-medium">Why are you releasing it?</span>
            <textarea data-autofocus value={reason} onChange={(e) => setReason(e.target.value)}
              rows={3} placeholder="e.g. Vendor will not split the MOQ and the line stops in 8 days."
              className="mt-1 w-full rounded-md border border-line bg-surface-2 p-2 text-[13px] outline-none focus:border-accent" />
            <span className="mt-1 block text-[11px] text-ink-3">
              Required, and at least 10 characters. It is stored against you with a timestamp and
              shown on the audit trail — the guardrail holds the line, only a person releases it.
            </span>
          </label>
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setReasonOpen(false)}>Cancel</Button>
            <Button variant="primary" disabled={reason.trim().length < 10} onClick={submitOverride}>
              Release with this reason
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}

export function OrderValue({ row }: { row: DerivedRow }) {
  return row.reorderQty.value > 0
    ? <span className="num text-[13px] font-medium">{money(row.landedTotal.value)}</span>
    : <span className="text-ink-3">—</span>
}
