'use client'
import { useEffect, useState } from 'react'
import { DeskOnly } from '@/components/sourcing/DeskOnly'
import { BandButton, BandChip, RecentList, StageDashboard, WaitingList } from '@/components/desk/StageDashboard'
import { InventoryPictures, InventoryStrip } from '@/components/desk/StagePictures'
import { MetricPicker } from '@/components/sourcing/MetricPicker'
import { useWorkspace } from '@/components/workspace/store'
import { recentFor } from '@/lib/workspace/desk-pictures'
import { compact, moneyOf } from '@/lib/workspace/executive'
import { type Act, type Band, type Decision } from '@/lib/workspace/decisions'
import { inventoryDecisionsFor } from '@/lib/workspace/inventory-decisions'
import { pickedMetrics } from '@/lib/workspace/metrics'
import { varianceNotedKey } from '@/lib/workspace/counting'
import { noSale, scrapNotedKey } from '@/lib/workspace/losses'
import { SellScrapDialog } from '@/components/inventory/desk/Wastage'
import { CountDialog, CountSheetDialog, LotStateDialog } from '@/components/inventory/desk/LedgerDialogs'
import { ScrapRemnantDialog, UseRemnantDialog } from '@/components/inventory/desk/CuttingDialogs'
import { cutNotedKey, remnantNotedKey } from '@/lib/workspace/cutting'
import { ChaseDialog } from '@/components/sourcing/ChaseDialog'
import { CloseChallanDialog, ReturnForm } from '@/components/inventory/desk/JobworkDialogs'
import { GrnDocument } from '@/components/inbound/desk/GrnDocument'
import { InspectForm } from '@/components/inbound/desk/InspectForm'
import { challanRows, type ChallanRow } from '@/lib/workspace/inbound'
import { isOpen } from '@/lib/workspace/receipts'

/**
 * The store's morning, in the desk's frame (`StageDashboard`).
 *
 * Four pictures of the store — what the shelf is worth material by material,
 * how many days each lasts against the time a new order takes, which lots are
 * past their counting date, and this month's loss and scrap — a card per
 * material with where its stock is, and on the right what is waiting on you.
 */
export default function Page() {
  return <DeskOnly><Dashboard /></DeskOnly>
}

function Dashboard() {
  const { workspace, update, today } = useWorkspace()
  const [picking, setPicking] = useState(false)
  const [opened, setOpened] = useState<Set<Band>>(new Set())
  const [counting, setCounting] = useState<string | null>(null)
  const [walking, setWalking] = useState<{ rackId?: string; itemId?: string } | null>(null)
  const [stating, setStating] = useState<{ lotId: string; mode: 'release' | 'write-off' } | null>(null)
  const [selling, setSelling] = useState<string | null>(null)
  const [using, setUsing] = useState<string | null>(null)
  const [scrapping, setScrapping] = useState<string | null>(null)
  const [chasing, setChasing] = useState<ChallanRow | null>(null)
  const [returning, setReturning] = useState<string | null>(null)
  const [returned, setReturned] = useState<string | null>(null)
  const [closing, setClosing] = useState<string | null>(null)
  const [inspecting, setInspecting] = useState<string | null>(null)
  const [papering, setPapering] = useState<string | null>(null)

  // what came back from a jobworker goes straight on to its inspection
  useEffect(() => {
    if (!returned || !workspace) return
    const made = (workspace.receipts ?? [])
      .filter((r) => r.challanId === returned && isOpen(r))
      .sort((a, b) => b.id.localeCompare(a.id))[0]
    if (made) { setInspecting(made.id); setReturned(null) }
  }, [returned, workspace])

  if (!workspace) return null
  const ws = workspace

  const queue = inventoryDecisionsFor(ws, today)
  const metrics = pickedMetrics(ws, today, 'inventory')

  const act = (d: Decision, kind: Act) => {
    const { challanId } = d.refs
    if (kind === 'chase' && challanId) {
      const row = challanRows(ws, today).find((r) => r.challan.id === challanId)
      if (row) setChasing(row)
      return
    }
    if (kind === 'return' && challanId) { setReturning(challanId); return }
    if (kind === 'close-challan' && challanId) { setClosing(challanId); return }
    const { rackId, itemId, lotId, countId } = d.refs
    if (kind === 'count') {
      // a variance is one lot counted again; a rack or a material is a walk
      if (d.kind === 'count-variance' && lotId) setCounting(lotId)
      else if (rackId) setWalking({ rackId })
      else if (itemId) setWalking({ itemId })
      return
    }
    if (kind === 'keep' && countId) {
      update((w) => ({ ...w, drafts: { ...w.drafts, [varianceNotedKey(countId)]: true } }))
      return
    }
    if ((kind === 'write-off' || kind === 'release') && lotId) { setStating({ lotId, mode: kind }); return }
    const { lossId } = d.refs
    if (kind === 'sell' && lossId) { setSelling(lossId); return }
    if (kind === 'no-sale' && lossId) { update((w) => noSale(w, lossId, today)); return }
    if (kind === 'keep' && d.kind === 'scrap-over' && itemId) {
      update((w) => ({ ...w, drafts: { ...w.drafts, [scrapNotedKey(itemId, today.slice(0, 7))]: true } }))
      return
    }
    // the cutting table's, only ever raised with cutting switched on
    if (kind === 'use' && lotId) { setUsing(lotId); return }
    if (kind === 'scrap' && lotId) { setScrapping(lotId); return }
    const { cutId, orderNo } = d.refs
    if (kind === 'keep' && d.kind === 'cut-below-plan' && cutId) {
      update((w) => ({ ...w, drafts: { ...w.drafts, [cutNotedKey(cutId)]: true } }))
      return
    }
    if (kind === 'keep' && d.kind === 'remnant-covers' && orderNo && itemId) {
      update((w) => ({ ...w, drafts: { ...w.drafts, [remnantNotedKey(orderNo, itemId)]: true } }))
    }
  }

  const shelf = moneyOf(ws, today).shelf
  return (
    <>
      <StageDashboard stage="Inventory" icon="boxes"
        chips={<>
          <BandChip alert={queue.length > 0}>{queue.length} need{queue.length === 1 ? 's' : ''} you</BandChip>
          {shelf > 0 && <BandChip icon="boxes">{compact(shelf)} on the shelf</BandChip>}
        </>}
        actions={<BandButton icon="columns" onClick={() => setPicking(true)}>Figures</BandButton>}
        metrics={metrics}
        pictures={<InventoryPictures ws={ws} today={today} />}
        strip={<InventoryStrip ws={ws} today={today} />}
        waiting={<WaitingList rows={queue} onAct={act} showAll={opened}
          onShowAll={(b) => setOpened((s) => new Set(s).add(b))}
          clear="Every lot counted in time, every lot on a rack, nothing below nothing, nothing overdue at a jobworker." />}
        recent={<RecentList title="Recent in the store" items={recentFor(ws, 'inventory')} today={today} />} />

      <MetricPicker open={picking} onClose={() => setPicking(false)} stage="inventory" />
      <CountDialog lotId={counting} onClose={() => setCounting(null)} />
      <CountSheetDialog scope={walking} onClose={() => setWalking(null)} />
      <LotStateDialog lotId={stating?.lotId ?? null} mode={stating?.mode ?? 'release'} onClose={() => setStating(null)} />
      <SellScrapDialog lossId={selling} onClose={() => setSelling(null)} />
      <UseRemnantDialog lotId={using} onClose={() => setUsing(null)} />
      <ScrapRemnantDialog lotId={scrapping} onClose={() => setScrapping(null)} />
      {chasing && (
        <ChaseDialog open onClose={() => setChasing(null)}
          title={`Chase ${chasing.vendor?.name ?? 'the jobworker'} on ${chasing.challan.no}`}
          vendorId={chasing.challan.vendorId}
          subject={`Jobwork challan ${chasing.challan.no} — balance with you`}
          text={chasing.chase} />
      )}
      <ReturnForm challanId={returning} onClose={() => setReturning(null)} onBooked={(id) => setReturned(id)} />
      <CloseChallanDialog challanId={closing} onClose={() => setClosing(null)} />
      <InspectForm receiptId={inspecting} onClose={() => setInspecting(null)} onClosed={(id) => setPapering(id)} />
      <GrnDocument open={papering !== null} receiptId={papering} onClose={() => setPapering(null)} />
    </>
  )
}
