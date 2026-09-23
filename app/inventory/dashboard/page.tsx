'use client'
import { useState } from 'react'
import { Icon } from '@/components/ui/icons'
import { DeskOnly } from '@/components/sourcing/DeskOnly'
import { Queue } from '@/components/sourcing/Queue'
import { Tiles } from '@/components/sourcing/Tiles'
import { MetricPicker } from '@/components/sourcing/MetricPicker'
import { useWorkspace } from '@/components/workspace/store'
import { type Act, type Band, type Decision } from '@/lib/workspace/decisions'
import { inFlight } from '@/lib/workspace/flight'
import { inventoryDecisionsFor } from '@/lib/workspace/inventory-decisions'
import { pickedMetrics } from '@/lib/workspace/metrics'
import { varianceNotedKey } from '@/lib/workspace/counting'
import { noSale, scrapNotedKey } from '@/lib/workspace/losses'
import { SellScrapDialog } from '@/components/inventory/desk/Wastage'
import { CountDialog, CountSheetDialog, LotStateDialog } from '@/components/inventory/desk/LedgerDialogs'

/**
 * The store's morning.
 *
 * The same two columns as the other desks: what is waiting on you, and what
 * is on its way. The left is the store's own work — which rack is due a
 * count, which lots nobody can find, where the book has gone below nothing.
 * The right is what is landing, because that is what the store is about to
 * have to put somewhere.
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

  if (!workspace) return null
  const ws = workspace

  const queue = inventoryDecisionsFor(ws, today)
  const berths = inFlight(ws, today)
  const metrics = pickedMetrics(ws, today, 'inventory')

  const act = (d: Decision, kind: Act) => {
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
    }
  }

  return (
    <div className="anim-page mx-auto w-full max-w-[72rem]">
      <header className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-3">
        <h1 className="min-w-0 text-[26px] font-extrabold leading-none tracking-[-0.03em]">
          Inventory
        </h1>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <button type="button" onClick={() => setPicking(true)}
            className="press inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-[13px] font-medium hover:bg-surface-2">
            <Icon name="columns" className="size-3.5" />
            Figures
          </button>
        </div>
      </header>

      <Queue rows={queue} berths={berths} onAct={act} showAll={opened}
        onShowAll={(b) => setOpened((s) => new Set(s).add(b))}
        clear="Every lot counted in time, every lot on a rack, nothing below nothing." />

      {metrics.length > 0 && (
        <section className="mt-7">
          <h2 className="mb-2.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-3">
            <span aria-hidden className="h-px w-4 bg-line" />
            How the store is doing
            <span aria-hidden className="h-px flex-1 bg-line" />
          </h2>
          <Tiles metrics={metrics} />
        </section>
      )}

      <MetricPicker open={picking} onClose={() => setPicking(false)} stage="inventory" />
      <CountDialog lotId={counting} onClose={() => setCounting(null)} />
      <CountSheetDialog scope={walking} onClose={() => setWalking(null)} />
      <LotStateDialog lotId={stating?.lotId ?? null} mode={stating?.mode ?? 'release'} onClose={() => setStating(null)} />
      <SellScrapDialog lossId={selling} onClose={() => setSelling(null)} />
    </div>
  )
}
