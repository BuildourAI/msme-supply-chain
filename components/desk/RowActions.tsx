'use client'
import { useState } from 'react'
import type { DerivedRow } from '@/lib/domain/derive'
import { Button } from '@/components/ui/bits'
import { Dialog } from '@/components/ui/Dialog'
import { Num } from '@/components/ui/Num'
import { useApp } from '@/state/app-store'
import { money, num, qtyText } from '@/lib/domain/format'
import { offcutEffect } from '@/lib/domain/inventory'
import { useInventory } from '@/components/inventory/store'
import { useDesk } from './store'

/**
 * INV-02 → SRC-01. The offcut register is not a screen the buyer visits, so the
 * check belongs at the moment the money is committed: the approval. It reads the
 * LIVE band balance, so using a remnant on the floor moves what the desk sees.
 *
 * It offers, it does not net off silently. A short remnant is not a full length,
 * and an automatic reduction would quietly under-buy.
 */
function ApproveDialog({ row, open, onClose }: {
  row: DerivedRow; open: boolean; onClose: () => void
}) {
  const { decide, state } = useDesk()
  const { offcutRows, issueRemnantToOrder } = useInventory()
  if (!open) return null

  const band = offcutRows.find((r) => r.item.id === row.item.id)
  const onRack = band?.balance.value ?? 0
  const uom = row.item.uom === 'm2' ? 'm²' : row.item.uom
  const eff = offcutEffect(
    row.reorderPoint.value, state.policy.cycleDays[row.item.itemClass],
    row.item.avgDailyConsumption, row.truePosition.value,
    row.item.moq, row.reorderQty.value, onRack, uom,
  )
  const saved = eff.reducedBy > 0
    ? row.landedTotal.value - eff.revisedQty.value * row.chosen.landedPerUnit.value : 0
  const poRef = `draft PO · ${row.item.code}`

  const approve = (adjust?: { qty: number; offcutApplied: number }) => {
    if (adjust) issueRemnantToOrder(row.item.id, adjust.offcutApplied, poRef)
    decide(row, 'approved', undefined, adjust)
    onClose()
  }

  return (
    <Dialog open wide onClose={onClose}
      title={`Approve the draft PO · ${row.item.code}`}
      sub={`${row.chosen.vendor.name} · ${qtyText(row.reorderQty.value, uom)} · ${money(row.landedTotal.value)}`}>
      <div className="space-y-3 px-4 py-4">
        <div className="rounded-md border border-accent/30 bg-accent-soft p-3">
          <p className="text-[12.5px] leading-relaxed text-ink-2">
            <strong className="text-ink">
              {qtyText(onRack, uom)} of this is already on {band?.band?.location}.
            </strong>{' '}
            {band?.band?.spec} — worth {money(onRack * row.item.lastPurchaseRate)}. It is not counted as
            cover, because a short remnant is not a full length. It is netted off this order instead,
            and only if you say so.
          </p>
          <table className="mono mt-2.5 w-full text-[11.5px]">
            <tbody className="text-ink-2">
              <tr><td className="py-0.5">Need before the remnant</td>
                  <td className="py-0.5 text-right"><Num d={eff.rawNeed} format="raw" dp={0} suffix={` ${uom}`} /></td></tr>
              <tr><td className="py-0.5">Less remnants on the rack</td>
                  <td className="py-0.5 text-right">− {num(onRack, 3)} {uom}</td></tr>
              <tr className="border-t border-accent/25"><td className="py-0.5">Need after</td>
                  <td className="py-0.5 text-right"><Num d={eff.netNeed} format="raw" dp={0} suffix={` ${uom}`} /></td></tr>
              <tr><td className="py-0.5">Rounded up to the {num(row.item.moq, 0)} {uom} MOQ</td>
                  <td className="py-0.5 text-right font-medium text-ink">
                    <Num d={eff.revisedQty} format="raw" dp={0} suffix={` ${uom}`} /></td></tr>
            </tbody>
          </table>
        </div>

        {eff.absorbedByMoq ? (
          <p className="rounded-md border border-warn/30 bg-warn-soft p-3 text-[12.5px] leading-relaxed text-ink-2">
            <strong className="text-ink">The MOQ swallows it — this order does not change.</strong>{' '}
            {num(eff.netNeed.value, 0)} {uom} still rounds up to {num(eff.revisedQty.value, 0)} {uom} at a
            minimum of {num(row.item.moq, 0)}. Quoting a saving here would be a lie. What the remnant is
            worth is <em>sequencing</em>: issue it to this batch first and the next reorder falls about{' '}
            {num(onRack / row.item.avgDailyConsumption, 1)} days later.
          </p>
        ) : (
          <p className="rounded-md border border-good/30 bg-good-soft p-3 text-[12.5px] leading-relaxed text-ink-2">
            <strong className="text-ink">
              The remnant crosses an MOQ boundary — the order drops by {qtyText(eff.reducedBy, uom)}.
            </strong>{' '}
            That is {money(saved)} not spent on material this factory already owns and has already paid
            for.
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => approve()}>
            Order the full {num(row.reorderQty.value, 0)} {uom}
          </Button>
          <Button variant="primary" onClick={() => approve({ qty: eff.revisedQty.value, offcutApplied: onRack })}>
            {eff.absorbedByMoq
              ? `Approve, and issue the ${num(onRack, 3)} ${uom} to this batch`
              : `Approve at ${num(eff.revisedQty.value, 0)} ${uom} — save ${money(saved)}`}
          </Button>
        </div>
        <p className="text-[11px] leading-relaxed text-ink-3">
          Either way nothing is sent. Taking the remnants moves them off{' '}
          {band?.band?.location} on the INV-02 register with this order as the reference, so the next
          person to look at the rack sees them spoken for.
        </p>
      </div>
    </Dialog>
  )
}

/**
 * §11 — the system raises, holds and drafts. Nothing here places an order or
 * contacts a supplier, and the verbs say so.
 */
export function RowActions({ row, size = 'sm' }: { row: DerivedRow; size?: 'sm' | 'md' }) {
  const { decide, undo, state } = useDesk()
  const { offcutRows } = useInventory()
  const { log, say } = useApp()
  const [reasonOpen, setReasonOpen] = useState(false)
  const [approveOpen, setApproveOpen] = useState(false)
  const [reason, setReason] = useState('')
  const decided = state.decisions[row.item.id]
  // Only interrupt the approval where there is genuinely something to see.
  const onRack = offcutRows.find((r) => r.item.id === row.item.id)?.balance.value ?? 0
  const hasRemnants = onRack > 0 && row.reorderQty.value > 0

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
        {decided.offcutApplied != null && decided.offcutApplied > 0 && (
          <span className="text-[10.5px] text-accent"
                title="Remnants already on the rack were netted off this order at the approval (INV-02).">
            · {num(decided.offcutApplied, 3)} {row.item.uom === 'm2' ? 'm²' : row.item.uom} off the rack
          </span>
        )}
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
          <Button size={size} variant="primary"
            onClick={() => (hasRemnants ? setApproveOpen(true) : decide(row, 'approved'))}>
            {row.needsOwnerSignoff.value ? 'Draft PO for owner sign-off' : 'Approve draft PO'}
          </Button>
          {hasRemnants && (
            <span className="basis-full text-[10.5px] leading-tight text-accent"
                  title="The offcut register holds material for this item. The approval will show it.">
              {num(onRack, 3)} {row.item.uom === 'm2' ? 'm²' : row.item.uom} already on the rack
            </span>
          )}
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

      <ApproveDialog row={row} open={approveOpen} onClose={() => setApproveOpen(false)} />

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
