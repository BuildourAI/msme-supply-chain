'use client'
import { useMemo, useState } from 'react'
import { DeskOnly } from '@/components/sourcing/DeskOnly'
import { MetricPicker } from '@/components/sourcing/MetricPicker'
import { BandButton, BandChip, RecentList, StageDashboard, WaitingList } from '@/components/desk/StageDashboard'
import { SourcingPictures, SourcingStrip } from '@/components/desk/StagePictures'
import { PoDocument } from '@/components/sourcing/PoDocument'
import { AckDialog } from '@/components/sourcing/AckDialog'
import { ExpediteDialog } from '@/components/sourcing/ExpediteDialog'
import { useWorkspace } from '@/components/workspace/store'
import { buildRows } from '@/lib/domain/derive'
import { boardLines, type BoardLine } from '@/lib/workspace/board'
import { bundleFor } from '@/lib/workspace/bundle'
import { decisionsFor, type Act, type Band, type Decision } from '@/lib/workspace/decisions'
import { recentFor } from '@/lib/workspace/desk-pictures'
import { compact, moneyOf } from '@/lib/workspace/executive'
import { flipSignature, pickedMetrics } from '@/lib/workspace/metrics'
import { churnNotedKey } from '@/lib/workspace/orders'
import { acceptLine, draftOrderFrom, rejectLine, syncRfqStates } from '@/lib/workspace/sourcing'

/**
 * Where the day starts.
 *
 * The desk's frame (`StageDashboard`): the owner's own figures in a row; four
 * pictures of the buying — every order as a span from placed to promised, each
 * supplier's deliveries as dots, what arrived month by month, and what lands
 * on each of the next ten days; a card per material saying how long its shelf
 * lasts; and on the right what is waiting on you, one line and one button each.
 *
 * The queue and the pictures read one workspace through pure functions, so a
 * late order in red on the timeline is the same late order waiting on the
 * right. `decisionsFor` still decides what is waiting; the pictures only show.
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
  const [acking, setAcking] = useState<string | null>(null)
  const [hurrying, setHurrying] = useState<BoardLine | null>(null)
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
    /*
     * Once an order is with its supplier. "Noted" on a line that keeps moving
     * comes first: the card carries the material too, and the branch below
     * would otherwise file it as a cheaper supplier looked at and declined.
     */
    if (kind === 'keep' && d.kind === 'churn' && d.refs.orderId) {
      const o = ws.orders.find((x) => x.id === d.refs.orderId)
      const key = churnNotedKey(d.refs.orderId, o?.revisions?.length ?? 0)
      update((w) => ({ ...w, drafts: { ...w.drafts, [key]: true } }))
      return
    }
    // the revised order IS the change notice: the same document, sent again
    if (kind === 'notice' && orderNo) { setPapering(orderNo); return }
    if (kind === 'ack' && orderNo) { setAcking(orderNo); return }
    if (kind === 'chase' && d.refs.orderId) {
      const line = boardLines(ws, today).find((l) => l.order.id === d.refs.orderId)
      if (line) setHurrying(line)
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

  const out = moneyOf(ws, today).onOrder
  return (
    <>
      <StageDashboard stage="Sourcing" icon="cart"
        chips={<>
          <BandChip alert={queue.length > 0}>{queue.length} need{queue.length === 1 ? 's' : ''} you</BandChip>
          {out > 0 && <BandChip icon="truck">{compact(out)} out with suppliers</BandChip>}
        </>}
        actions={<BandButton icon="columns" onClick={() => setPicking(true)}>Figures</BandButton>}
        metrics={metrics}
        pictures={<SourcingPictures ws={ws} today={today} />}
        strip={<SourcingStrip ws={ws} today={today} />}
        waiting={<WaitingList rows={queue} onAct={act} showAll={opened}
          onShowAll={(b) => setOpened((s) => new Set(s).add(b))} />}
        recent={<RecentList title="Recent in sourcing" items={recentFor(ws, 'sourcing')} today={today} />} />

      <MetricPicker open={picking} onClose={() => setPicking(false)} />
      <PoDocument open={papering !== null} no={papering} onClose={() => setPapering(null)} />
      <AckDialog no={acking} onClose={() => setAcking(null)} />
      <ExpediteDialog line={hurrying} onClose={() => setHurrying(null)} />
    </>
  )
}
