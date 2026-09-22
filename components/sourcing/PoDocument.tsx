'use client'
import { useMemo } from 'react'
import { StatePill } from '@/components/ui/DataTable'
import { useWorkspace } from '@/components/workspace/store'
import { PaperDialog, useSentTo, type Paper } from './PaperDialog'
import { buildPo, poFileName, poSendableFor, renderPo } from '@/lib/paper/po'
import type { SendEntry } from '@/lib/workspace/types'

/**
 * The order as a document.
 *
 * One page per order, however many lines are on it, because that is what an
 * order is — and the number is what makes several lines one. A supplier gets
 * their own file and nobody else's: an order naming four suppliers, shared to
 * the first, tells them who else you buy from.
 *
 * §11 holds here exactly as it does for a request. The buttons open WhatsApp
 * and your mail client with the message already in them. You press send.
 */
export function PoDocument({ open, onClose, no }: {
  open: boolean
  onClose: () => void
  /** the order NUMBER, not a row id — several lines are one document */
  no: string | null
}) {
  const { workspace, update, today } = useWorkspace()
  const sent = useSentTo('po', no ?? '')

  const papers = useMemo<Paper[]>(() => {
    if (!workspace || !no) return []
    const doc = buildPo(workspace, no)
    if (!doc) return []
    return [{
      vendor: doc.vendor ? { id: doc.vendor.id, name: doc.vendor.name } : null,
      problems: doc.problems,
      blanks: doc.blanks,
      fileName: poFileName(doc),
      sendable: poSendableFor(doc),
      render: () => renderPo(doc),
    }]
  }, [workspace, no])

  if (!open || !workspace || !no || papers.length === 0) return null

  const onSent = (vendorId: string, via: SendEntry['via']) => {
    const entry: SendEntry = { kind: 'po', id: no, vendorId, via, at: today }
    update((w) => ({
      ...w,
      sendLog: [...w.sendLog.filter(
        (s) => !(s.kind === 'po' && s.id === no && s.vendorId === vendorId)), entry],
      /*
       * A draft order handed to a supplier is a confirmed one. Nothing further
       * moves by itself — shipped and delivered are things somebody observes,
       * and this build has never claimed to know them.
       */
      orders: w.orders.map((o) => (o.no === no && o.state === 'draft'
        ? { ...o, state: 'confirmed' as const } : o)),
    }))
  }

  const lines = workspace.orders.filter((o) => o.no === no && o.state !== 'cancelled').length

  return (
    <PaperDialog
      open={open} onClose={onClose}
      title={`${no} — purchase order`}
      sub={lines > 1 ? `${lines} lines on one order` : undefined}
      papers={papers}
      sentTo={new Set(sent.map((s) => s.vendorId))}
      onSent={onSent}
    />
  )
}

/** That an order was handed over, and how — the same pill a request gets. */
export function PoSentPill({ no, fallback }: {
  no: string
  fallback: React.ReactNode
}) {
  const { workspace } = useWorkspace()
  if (!workspace) return <>{fallback}</>
  const sent = workspace.sendLog.filter((s) => s.kind === 'po' && s.id === no)
  if (sent.length === 0) return <>{fallback}</>
  return <StatePill tone="neutral" label={`sent ${sent[0].via === 'download' ? 'as a file' : `by ${sent[0].via}`}`} />
}
