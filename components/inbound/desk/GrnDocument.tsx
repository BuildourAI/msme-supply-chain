'use client'
import { useMemo } from 'react'
import { useWorkspace } from '@/components/workspace/store'
import { PaperDialog, useSentTo, type Paper } from '@/components/sourcing/PaperDialog'
import { buildGrn, grnFileName, grnSendableFor, renderGrn } from '@/lib/paper/grn'
import type { SendEntry } from '@/lib/workspace/types'

/**
 * A closed receipt as a document — preview, download, WhatsApp, email, print.
 *
 * The same dialog a purchase order uses, so a supplier gets the gate's record
 * the same four ways they get an order. §11 as everywhere: the buttons open
 * WhatsApp and your mail client with the message already in them. You press
 * send.
 */
export function GrnDocument({ open, onClose, receiptId }: {
  open: boolean
  onClose: () => void
  receiptId: string | null
}) {
  const { workspace, update, today } = useWorkspace()
  const sent = useSentTo('grn', receiptId ?? '')

  const papers = useMemo<Paper[]>(() => {
    if (!workspace || !receiptId) return []
    const doc = buildGrn(workspace, receiptId)
    if (!doc) return []
    return [{
      vendor: doc.vendor ? { id: doc.vendor.id, name: doc.vendor.name } : null,
      problems: doc.problems,
      fileName: grnFileName(doc),
      sendable: grnSendableFor(doc),
      render: () => renderGrn(doc),
    }]
  }, [workspace, receiptId])

  if (!open || !workspace || !receiptId || papers.length === 0) return null

  const onSent = (vendorId: string, via: SendEntry['via']) => {
    const entry: SendEntry = { kind: 'grn', id: receiptId, vendorId, via, at: today }
    update((w) => ({
      ...w,
      sendLog: [...w.sendLog.filter(
        (s) => !(s.kind === 'grn' && s.id === receiptId && s.vendorId === vendorId)), entry],
    }))
  }

  return (
    <PaperDialog
      open={open} onClose={onClose}
      title={`${receiptId} — goods receipt note`}
      papers={papers}
      sentTo={new Set(sent.map((s) => s.vendorId))}
      onSent={onSent}
    />
  )
}
