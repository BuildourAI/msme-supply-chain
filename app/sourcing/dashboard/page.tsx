'use client'
import { useMemo, useState } from 'react'
import { Icon } from '@/components/ui/icons'
import { DeskOnly } from '@/components/sourcing/DeskOnly'
import { Queue } from '@/components/sourcing/Queue'
import { Tiles } from '@/components/sourcing/Tiles'
import { MetricPicker } from '@/components/sourcing/MetricPicker'
import { PoDocument } from '@/components/sourcing/PoDocument'
import { ReceiveForm } from '@/components/sourcing/ReceiveForm'
import { useWorkspace } from '@/components/workspace/store'
import { buildRows } from '@/lib/domain/derive'
import { bundleFor } from '@/lib/workspace/bundle'
import { decisionsFor, type Act, type Band, type Decision } from '@/lib/workspace/decisions'
import { inFlight } from '@/lib/workspace/flight'
import { flipSignature, pickedMetrics } from '@/lib/workspace/metrics'
import { acceptLine, draftOrderFrom, rejectLine, syncRfqStates } from '@/lib/workspace/sourcing'
import type { PurchaseOrder } from '@/lib/workspace/types'

/**
 * Where the day starts.
 *
 * The work first and the figures below it, which is the whole argument of the
 * screen. Tiles above a worklist is the pattern `ListPage` refuses in its own
 * doc comment — "no KPI strip above the data" — and it has a second cost here:
 * a queue must be able to empty, and a strip of metrics permanently above it
 * means the screen never reads as done. Underneath, the figures are what you
 * scroll to once the queue is clear, which makes them the reward for an empty
 * queue rather than wallpaper you scroll past every morning.
 *
 * The work itself is two columns — what is waiting on you, and what is out
 * with a supplier — because those are the two questions somebody opens this
 * screen with and only one of them was answered anywhere. `Queue` holds the
 * layout and `flight.ts` the partition that keeps the columns from saying
 * anything twice.
 *
 * The queue and the tiles are the same information seen twice — both read from
 * one workspace through pure functions, so the number on a tile and the rows
 * behind it cannot disagree.
 *
 * Nothing here sends anything. Chasing a late order and handing over a draft
 * both open the document, and §11 holds exactly as it does everywhere else:
 * the browser opens WhatsApp or your mail client with the message in it, and
 * you press send.
 */
export default function Page() {
  return <DeskOnly><Dashboard /></DeskOnly>
}

function Dashboard() {
  const { workspace, update, today } = useWorkspace()
  const [picking, setPicking] = useState(false)
  const [papering, setPapering] = useState<string | null>(null)
  const [receiving, setReceiving] = useState<PurchaseOrder | null>(null)
  const [opened, setOpened] = useState<Set<Band>>(new Set())

  /*
   * The at-risk band comes from the same derivation the desk runs, so the two
   * screens cannot disagree about which materials are in trouble. Memoised
   * because it is the whole engine and the queue re-reads on every act.
   */
  const rows = useMemo(
    () => (workspace ? buildRows(bundleFor(workspace, today), workspace.policy) : []),
    [workspace, today],
  )

  if (!workspace) return null
  const ws = workspace

  const queue = decisionsFor(ws, today, rows)
  const berths = inFlight(ws, today)
  const metrics = pickedMetrics(ws, today)

  /*
   * One handler, because a decision carries what it acts on. Adding a kind of
   * decision means adding it to `decisionsFor` and a case here — never a new
   * screen, which is the point of the whole thing.
   */
  const act = (d: Decision, kind: Act) => {
    const { quoteId, lineId, orderNo, itemId, rfqId } = d.refs

    if (kind === 'accept' && quoteId && lineId) {
      update((w) => acceptLine(w, quoteId, lineId))
      return
    }
    if (kind === 'reject' && quoteId && lineId) {
      update((w) => rejectLine(w, quoteId, lineId))
      return
    }
    if (kind === 'draft' && quoteId) {
      update((w) => draftOrderFrom(w, quoteId, today))
      return
    }
    if (kind === 'paper' && orderNo) {
      setPapering(orderNo)
      return
    }
    if (kind === 'receive' && orderNo) {
      // the document is the order's, but a receipt is a line's — so the first
      // line still outstanding is the one the form opens on
      const line = ws.orders.find((o) => o.no === orderNo && o.state !== 'delivered'
        && o.state !== 'cancelled')
      if (line) setReceiving(line)
      return
    }
    if (kind === 'keep' && itemId) {
      /*
       * "I know somebody is cheaper and I am staying with them." Stored as the
       * shape of the comparison, so the question comes back when the answer
       * might have changed rather than merely when a week has passed.
       */
      update((w) => ({
        ...w,
        reviewedFlips: { ...(w.reviewedFlips ?? {}), [itemId]: flipSignature(w, itemId) },
      }))
      return
    }
    if (kind === 'close' && rfqId) {
      update((w) => syncRfqStates({
        ...w,
        rfqs: w.rfqs.map((r) => (r.id === rfqId ? { ...r, state: 'closed' as const } : r)),
      }))
    }
  }

  return (
    <div className="anim-page mx-auto w-full max-w-[72rem]">
      {/*
        * The heading says only what screen this is. Every count that used to
        * sit here — the total, and the bar breaking it into bands — is now on
        * the columns and their sub-headings, where it is next to the rows it
        * counts. Saying it three times in the top inch was the opposite of
        * making the screen quick to read.
        */}
      <header className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-3">
        <h1 className="min-w-0 text-[26px] font-extrabold leading-none tracking-[-0.03em]">
          Sourcing
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
        onShowAll={(b) => setOpened((s) => new Set(s).add(b))} />

      {metrics.length > 0 && (
        <section className="mt-7">
          <h2 className="mb-2.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-3">
            <span aria-hidden className="h-px w-4 bg-line" />
            How you are doing
            <span aria-hidden className="h-px flex-1 bg-line" />
          </h2>
          <Tiles metrics={metrics} />
        </section>
      )}

      <MetricPicker open={picking} onClose={() => setPicking(false)} />
      <PoDocument open={papering !== null} no={papering} onClose={() => setPapering(null)} />
      <ReceiveForm open={receiving !== null} order={receiving}
        onClose={() => setReceiving(null)} />
    </div>
  )
}
