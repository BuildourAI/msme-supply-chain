'use client'
import { useEffect, useState } from 'react'
import { ListPage } from '@/components/ui/ListPage'
import { DataTable, StatePill } from '@/components/ui/DataTable'
import { DeskTools } from '@/components/sheet/DeskTools'
import { buildColumns, type DrawnColumn } from '@/components/sheet/columns'
import { ConfirmDelete } from '@/components/sourcing/ConfirmDelete'
import { useWorkspace } from '@/components/workspace/store'
import { money, num, shortDate } from '@/lib/domain/format'
import { noteRows, removeNote, removeNoteProblem, type NoteRow } from '@/lib/workspace/dispatch-notes'
import { BookCarrierDialog, DeliveryDocument, NoteForm } from './NoteDialogs'

/**
 * Every dispatch note raised: what went, against which order, on whose
 * say-so, with whom. A note with no carrier is said, because a consignment
 * nobody booked cannot be judged on time or late. Taking a note back puts its
 * pieces back on the shelf — until the customer has them.
 */
export function Notes() {
  const { workspace, update } = useWorkspace()
  const [raising, setRaising] = useState<string | null | undefined>(undefined)
  const [doc, setDoc] = useState<string | null>(null)
  const [booking, setBooking] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<NoteRow | null>(null)

  // the e-way bill card links here with ?doc=<note>
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('doc')
    if (id) setDoc(id)
  }, [])

  if (!workspace) return null
  const ws = workspace
  const rows = noteRows(ws)

  const drawn: Record<string, DrawnColumn<NoteRow>> = {
    no: { cell: (r) => <span className="mono text-[12.5px] font-semibold text-ink">{r.note.no}</span>, text: (r) => r.note.no },
    on: { cell: (r) => <span className="num whitespace-nowrap text-ink-2">{shortDate(r.note.on)}</span>, text: (r) => r.note.on },
    order: { cell: (r) => <span className="mono text-[12px] text-ink-2">{r.order?.no ?? '—'}</span>, text: (r) => r.order?.no ?? '' },
    customer: { cell: (r) => <span className="font-medium text-ink">{r.customer?.name ?? '—'}</span>, text: (r) => r.customer?.name ?? '' },
    lines: {
      cell: (r) => (
        <span className="block text-[12.5px] leading-snug">
          {r.lines.map((l, i) => (
            <span key={i} className="block">
              <span className="text-ink">{l.product?.name ?? 'Unknown product'}</span>{' '}
              <span className="num text-ink-2">× {num(l.qty, 0)}</span>
            </span>
          ))}
        </span>
      ),
      text: (r) => r.lines.map((l) => `${l.product?.name ?? ''} x ${l.qty}`).join('; '),
    },
    weight: {
      align: 'right',
      cell: (r) => (r.note.weightKg ? `${num(r.note.weightKg, 1)} kg` : <span className="text-ink-4">—</span>),
      text: (r) => String(r.note.weightKg ?? ''),
    },
    carrier: {
      cell: (r) => (r.carrier
        ? <span className="text-[12.5px]"><span className="text-ink">{r.carrier.name}</span>{r.consignment?.lrNo && <span className="mono block text-[11px] text-ink-3">{r.consignment.lrNo}</span>}</span>
        : <StatePill label="Not booked" tone="warn" />),
      text: (r) => (r.carrier ? `${r.carrier.name}${r.consignment?.lrNo ? ` ${r.consignment.lrNo}` : ''}` : 'not booked'),
    },
    authorised: { cell: (r) => <span className="text-ink-2">{r.note.authorisedBy}</span>, text: (r) => r.note.authorisedBy },
    taxable: {
      align: 'right',
      cell: (r) => (r.handoff.taxable > 0 ? money(r.handoff.taxable) : <span className="text-ink-4">—</span>),
      text: (r) => String(r.handoff.taxable),
    },
    eway: {
      cell: (r) => (r.handoff.ewayNeeded === null ? <span className="text-ink-4">—</span>
        : r.handoff.ewayNeeded ? <StatePill label="Needed" tone="warn" /> : <span className="text-[12px] text-ink-3">Not needed</span>),
      text: (r) => (r.handoff.ewayNeeded === null ? '' : r.handoff.ewayNeeded ? 'needed' : 'not needed'),
    },
  }
  const kit = buildColumns<NoteRow>(ws, 'dispatchNote', (r) => r.note.id, drawn)

  return (
    <>
      <ListPage
        title="Dispatch notes" noun="dispatch note" rows={rows}
        search={(r) => `${r.note.no} ${r.order?.no ?? ''} ${r.customer?.name ?? ''} ${r.carrier?.name ?? ''} ${r.consignment?.lrNo ?? ''} ${kit.searchText(r)}`}
        filter={{
          label: 'Carrier',
          options: [{ value: 'unbooked', label: 'Not booked' }, { value: 'booked', label: 'Booked' }],
          of: (r) => (r.consignment ? 'booked' : 'unbooked'),
        }}
        action={{ label: 'Raise a dispatch note', onClick: () => setRaising(null) }}
        tools={<DeskTools entity="dispatchNote" noun="dispatch note" title="Dispatch notes" rows={() => kit.toRows(rows)} />}
        empty={{
          line: 'Nothing has gone out yet. A dispatch note is raised against an order, takes the pieces off the finished-goods shelf, and prints as a delivery challan.',
          cta: 'Raise a dispatch note',
        }}>
        {(shown) => (
          <DataTable columns={kit.columns} rows={shown} keyOf={(r) => r.note.id}
            extra={{ icon: 'doc', label: (r) => `Delivery challan for ${r.note.no}`, onClick: (r) => setDoc(r.note.id) }}
            extra2={{
              icon: 'truck',
              label: (r) => (r.consignment ? `Change the booking on ${r.note.no}` : `Book ${r.note.no} with a carrier`),
              onClick: (r) => setBooking(r.note.id),
            }}
            onDelete={(r) => setDeleting(r)}
            deleteLabel={(r) => `Take back ${r.note.no}`} />
        )}
      </ListPage>

      <NoteForm orderId={raising} onClose={() => setRaising(undefined)} onRaised={setDoc} />
      <DeliveryDocument noteId={doc} onClose={() => setDoc(null)} />
      <BookCarrierDialog noteId={booking} onClose={() => setBooking(null)} />
      <ConfirmDelete
        open={deleting !== null}
        what={deleting ? `${deleting.note.no} to ${deleting.customer?.name ?? 'the customer'}` : ''}
        impact={{ losses: [], clean: true }}
        blocked={deleting ? removeNoteProblem(ws, deleting.note.id) : null}
        onClose={() => setDeleting(null)}
        onConfirm={() => { if (deleting) update((w) => removeNote(w, deleting.note.id)) }}
      />
    </>
  )
}
