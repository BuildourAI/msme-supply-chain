'use client'
import { useState } from 'react'
import { ListPage } from '@/components/ui/ListPage'
import { DataTable, StatePill } from '@/components/ui/DataTable'
import { DeskTools } from '@/components/sheet/DeskTools'
import { buildColumns, type DrawnColumn } from '@/components/sheet/columns'
import { ConfirmDelete } from '@/components/sourcing/ConfirmDelete'
import { DeskOnly } from '@/components/sourcing/DeskOnly'
import { CheckForm } from '@/components/inbound/desk/CheckForm'
import { ChecksWizard } from '@/components/onboard/wizards/ChecksWizard'
import { Icon } from '@/components/ui/icons'
import { useWorkspace } from '@/components/workspace/store'
import {
  BUCKET_LABEL, KIND_LABEL, removeCheck, uncheckedItems,
} from '@/lib/workspace/checks'
import { num } from '@/lib/domain/format'
import type { Item, SpecCheck } from '@/lib/domain/types'

/**
 * What the gate checks, material by material.
 *
 * The master the receiving screen runs on: when a lorry arrives, these are the
 * rows the inspector works down. Most factories already keep this as a sheet
 * pinned by the gate, which is why this is the one inbound list that imports.
 *
 * Materials with nothing written are named at the top rather than left to be
 * noticed. They are not an error — their receipts close unchecked and say so —
 * but they are the gap in the list, and a list that hides its gap is the one
 * everybody trusts until the day it matters.
 */
interface Row { check: SpecCheck; item?: Item; first: boolean }

export default function Page() {
  return <DeskOnly><Checks /></DeskOnly>
}

function Checks() {
  const { workspace, update } = useWorkspace()
  const [editing, setEditing] = useState<string | null | undefined>(undefined)
  const [walking, setWalking] = useState(false)
  const [deleting, setDeleting] = useState<Row | null>(null)

  if (!workspace) return null
  const ws = workspace

  const sorted = [...(ws.specChecks ?? [])]
    .map((check) => ({ check, item: ws.items.find((i) => i.id === check.itemId) }))
    .sort((a, b) => (a.item?.name ?? '').localeCompare(b.item?.name ?? '')
      || a.check.label.localeCompare(b.check.label))
  const rows: Row[] = sorted.map((r, n) => ({
    ...r, first: n === 0 || sorted[n - 1].check.itemId !== r.check.itemId,
  }))
  const gaps = uncheckedItems(ws)

  const band = (c: SpecCheck) => (c.kind !== 'measure' ? ''
    : c.min != null && c.max != null ? `${num(c.min, 3)} – ${num(c.max, 3)}`
      : c.min != null ? `at least ${num(c.min, 3)}` : `at most ${num(c.max!, 3)}`)

  const drawn: Record<string, DrawnColumn<Row>> = {
    item: {
      // the name once per material, so the list reads as a set per material
      cell: (r) => (r.first
        ? <span className="font-semibold text-ink">{r.item?.name ?? 'Unknown material'}</span>
        : <span aria-hidden className="text-ink-4">〃</span>),
      text: (r) => r.item?.name ?? '',
    },
    label: {
      cell: (r) => <span className="font-medium text-ink">{r.check.label}</span>,
      text: (r) => r.check.label,
    },
    kind: { cell: (r) => KIND_LABEL[r.check.kind], text: (r) => KIND_LABEL[r.check.kind] },
    min: {
      align: 'right',
      cell: (r) => (r.check.min == null
        ? <span className="text-ink-4" title={band(r.check) || undefined}>—</span>
        : num(r.check.min, 3)),
      text: (r) => (r.check.min == null ? '' : String(r.check.min)),
    },
    max: {
      align: 'right',
      cell: (r) => (r.check.max == null ? <span className="text-ink-4">—</span> : num(r.check.max, 3)),
      text: (r) => (r.check.max == null ? '' : String(r.check.max)),
    },
    unit: { cell: (r) => r.check.unit ?? '', text: (r) => r.check.unit ?? '' },
    bucket: {
      cell: (r) => (
        <StatePill label={BUCKET_LABEL[r.check.failBucket]}
          tone={r.check.failBucket === 'usable' ? 'neutral'
            : r.check.failBucket === 'qc_hold' ? 'warn' : 'critical'} />
      ),
      text: (r) => BUCKET_LABEL[r.check.failBucket],
    },
    reason: {
      cell: (r) => <span className="text-ink-2">{r.check.failReason}</span>,
      text: (r) => r.check.failReason,
    },
    mandatory: {
      cell: (r) => (r.check.mandatory ? 'Must' : <span className="text-ink-3">If time allows</span>),
      text: (r) => (r.check.mandatory ? 'Yes' : 'No'),
    },
  }
  const kit = buildColumns<Row>(ws, 'check', (r) => r.check.id, drawn)

  return (
    <>
      <ListPage
        title="Checks" noun="check" rows={rows}
        search={(r) => `${r.item?.name ?? ''} ${r.check.label} ${r.check.failReason} ${kit.searchText(r)}`}
        filter={{
          label: 'All materials',
          options: ws.items.filter((i) => rows.some((r) => r.check.itemId === i.id))
            .map((i) => ({ value: i.id, label: i.name })),
          of: (r) => r.check.itemId,
        }}
        action={{ label: 'Write checks', onClick: () => setEditing(null) }}
        tools={<DeskTools entity="check" noun="check" title="Checks" rows={() => kit.toRows(rows)} />}
        empty={{
          line: ws.items.length === 0
            ? 'Add a material first — a check is written against something you buy.'
            : 'Nothing is checked at the gate yet. Two or three checks per material — a reading, a certificate, a look — and no receipt closes until they are answered.',
          cta: ws.items.length === 0 ? undefined : 'Write your first checks',
          second: ws.items.length > 1
            ? { label: `Walk all ${ws.items.length} materials`, onClick: () => setWalking(true) }
            : undefined,
        }}>
        {(shown) => (
          <>
            {gaps.length > 0 && (
              <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-warn/30 bg-warn-soft px-4 py-2.5">
                <Icon name="alert" className="size-4 shrink-0 text-warn" />
                <p className="min-w-0 flex-1 text-[12.5px] leading-snug text-ink-2">
                  <strong className="text-ink">{gaps.length} material{gaps.length === 1 ? ' has' : 's have'} no checks</strong>
                  {' '}— {gaps.slice(0, 4).map((i) => i.name).join(', ')}{gaps.length > 4 ? ` and ${gaps.length - 4} more` : ''}.
                  {' '}Their receipts close unchecked, and say so.
                </p>
                <button type="button" onClick={() => setEditing(gaps[0].id)}
                  className="press shrink-0 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[12px] font-semibold hover:bg-surface-2">
                  Write checks for {gaps[0].name}
                </button>
              </div>
            )}
            <DataTable
              columns={kit.columns} rows={shown} keyOf={(r) => r.check.id}
              onEdit={(r) => setEditing(r.check.itemId)}
              onDelete={(r) => setDeleting(r)}
              editLabel={(r) => `Edit the checks on ${r.item?.name ?? 'this material'}`}
              deleteLabel={(r) => `Delete ${r.check.label}`}
            />
          </>
        )}
      </ListPage>

      <CheckForm open={editing !== undefined} itemId={editing ?? null}
        onClose={() => setEditing(undefined)} />
      <ChecksWizard open={walking} onClose={() => setWalking(false)} />

      <ConfirmDelete
        open={deleting !== null}
        what={deleting ? `“${deleting.check.label}” on ${deleting.item?.name ?? 'this material'}` : ''}
        impact={{ losses: [], clean: true }}
        onClose={() => setDeleting(null)}
        onConfirm={() => { if (deleting) update((w) => removeCheck(w, deleting.check.id)) }}
      />
    </>
  )
}
