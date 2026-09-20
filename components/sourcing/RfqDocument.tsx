'use client'
import { useMemo } from 'react'
import { StatePill } from '@/components/ui/DataTable'
import { useWorkspace } from '@/components/workspace/store'
import { PaperDialog, useSentTo, type Paper } from './PaperDialog'
import { docsFor, fileNameFor, renderPdf, sendableFor } from '@/lib/paper/rfq'
import type { Rfq, SendEntry } from '@/lib/workspace/types'

/**
 * The request as a document.
 *
 * Everything about previewing, sharing and recording is `PaperDialog`, shared
 * with the purchase order. What is left here is the part that is about a
 * request: which copies exist, what they are called, and the one state change
 * that handing one over implies.
 */
export function RfqDocument({ open, onClose, rfq }: {
  open: boolean
  onClose: () => void
  rfq: Rfq | null
}) {
  const { workspace, update, today } = useWorkspace()
  const sent = useSentTo('rfq', rfq?.id ?? '')

  const papers = useMemo<Paper[]>(() => {
    if (!workspace || !rfq) return []
    return docsFor(workspace, rfq, today).map((doc) => ({
      vendor: doc.vendor ? { id: doc.vendor.id, name: doc.vendor.name } : null,
      problems: doc.problems,
      fileName: fileNameFor(doc),
      sendable: sendableFor(doc),
      render: () => renderPdf(doc),
    }))
  }, [workspace, rfq, today])

  if (!open || !workspace || !rfq) return null

  /** what was actually done, so silence afterwards is visible */
  const onSent = (vendorId: string, via: SendEntry['via']) => {
    const entry: SendEntry = { kind: 'rfq', id: rfq.id, vendorId, via, at: today }
    update((w) => ({
      ...w,
      sendLog: [...w.sendLog.filter(
        (s) => !(s.kind === 'rfq' && s.id === entry.id && s.vendorId === entry.vendorId)), entry],
      /*
       * Only a draft moves. A request the quotes have already moved to `quoted`
       * or `awarded` would be dragged backwards, and `syncRfqStates` would
       * bounce it straight back — a button that looks broken.
       */
      rfqs: w.rfqs.map((r) => (r.id === rfq.id && r.state === 'draft'
        ? { ...r, state: 'sent' as const } : r)),
    }))
  }

  return (
    <PaperDialog
      open={open} onClose={onClose}
      title={`${rfq.no} — request for quotation`}
      sub={papers.length > 1 ? `${papers.length} copies, one for each supplier` : undefined}
      papers={papers}
      sentTo={new Set(sent.map((s) => s.vendorId))}
      onSent={onSent}
    />
  )
}

/** "sent to 2 · nothing back in 6 days" — the reason to write a request down. */
export function SentSummary({ rfqId, backCount, fallback }: {
  rfqId: string
  backCount: number
  /** what to show when it has not been handed to anybody yet */
  fallback: React.ReactNode
}) {
  const { workspace, today } = useWorkspace()
  if (!workspace) return <>{fallback}</>
  const sent = workspace.sendLog.filter((s) => s.kind === 'rfq' && s.id === rfqId)
  if (sent.length === 0) return <>{fallback}</>

  const oldest = sent.reduce((a, s) => (s.at < a ? s.at : a), sent[0].at)
  const days = Math.round(
    (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${oldest}T00:00:00Z`)) / 86400000,
  )
  const quiet = backCount === 0 && days >= 3

  return (
    <StatePill
      tone={quiet ? 'warn' : 'neutral'}
      title={quiet ? 'Nothing has come back since you sent it' : undefined}
      label={quiet
        ? `sent to ${sent.length} · ${days}d quiet`
        : `sent to ${sent.length}`}
    />
  )
}
