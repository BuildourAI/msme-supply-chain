'use client'
import { useEffect, useState } from 'react'
import { ListPage } from '@/components/ui/ListPage'
import { DataTable, StatePill } from '@/components/ui/DataTable'
import { Dialog } from '@/components/ui/Dialog'
import { Field, TextInput } from '@/components/ui/Field'
import { DeskTools } from '@/components/sheet/DeskTools'
import { buildColumns, type DrawnColumn } from '@/components/sheet/columns'
import { ConfirmDelete } from '@/components/sourcing/ConfirmDelete'
import { RacksWizard } from '@/components/onboard/wizards/RacksWizard'
import { useWorkspace } from '@/components/workspace/store'
import { money, shortDate } from '@/lib/domain/format'
import {
  addRack, rackImpact, rackProblem, rackRows, removeRack, unplacedLots, updateRack, type RackRow,
} from '@/lib/workspace/racks'
import Link from 'next/link'

/**
 * The places stock sits, set up once and walked from the ledger.
 *
 * Kept off the everyday rail — under "More" — because naming a rack is a
 * once-a-year job. What the list is for, day to day, is seeing which rack is
 * due a count and what is on it.
 */
export function Racks() {
  const { workspace, update, today, session } = useWorkspace()
  const [editing, setEditing] = useState<RackRow | null | undefined>(undefined)
  const [naming, setNaming] = useState(false)
  const [deleting, setDeleting] = useState<RackRow | null>(null)

  if (!workspace) return null
  const ws = workspace
  const rows = rackRows(ws, today)
  const lost = unplacedLots(ws)

  const drawn: Record<string, DrawnColumn<RackRow>> = {
    name: { cell: (r) => <span className="font-semibold text-ink">{r.rack.name}</span>, text: (r) => r.rack.name },
    note: { cell: (r) => <span className="text-ink-2">{r.rack.note ?? ''}</span>, text: (r) => r.rack.note ?? '' },
    lots: {
      align: 'right',
      cell: (r) => (r.lots === 0 ? <span className="text-ink-4">empty</span>
        : <Link href={`/inventory/ledger?rack=${r.rack.id}`} className="text-accent-ink hover:underline">{r.lots}</Link>),
      text: (r) => String(r.lots),
    },
    value: {
      align: 'right',
      cell: (r) => (r.value === 0 ? <span className="text-ink-4">—</span> : money(r.value)),
      text: (r) => String(r.value),
    },
    walked: {
      cell: (r) => (r.walked ? shortDate(r.walked) : <span className="text-ink-4">never</span>),
      text: (r) => r.walked ?? '',
    },
    due: {
      cell: (r) => (r.lots === 0 ? <span className="text-ink-4">—</span>
        : r.due === 0 ? <StatePill label="Counted in time" tone="good" />
          : <StatePill label={`${r.due} lot${r.due === 1 ? '' : 's'} due`} tone="warn" />),
      text: (r) => String(r.due),
    },
  }
  const kit = buildColumns<RackRow>(ws, 'rack', (r) => r.rack.id, drawn)

  return (
    <>
      <ListPage
        title="Racks" noun="rack" rows={rows}
        search={(r) => `${r.rack.name} ${r.rack.note ?? ''} ${kit.searchText(r)}`}
        // an empty store names its racks in a run; one more is a single form
        action={{ label: 'Add a rack', onClick: () => (rows.length === 0 ? setNaming(true) : setEditing(null)) }}
        tools={<DeskTools entity="rack" noun="rack" title="Racks" rows={() => kit.toRows(rows)} />}
        empty={{
          line: ws.drafts['inventory.oneRack'] === true
            ? 'Everything is in one place, you said. Name racks here the day there is more than one.'
            : 'No racks named yet. Name the places stock sits — A-1, the fabric wall — and each lot can be placed and walked.',
          cta: 'Name your racks',
        }}>
        {(shown) => (
          <>
            {lost.length > 0 && (
              <p className="mb-3 rounded-xl border border-warn/30 bg-warn-soft px-4 py-2.5 text-[12.5px] text-ink-2">
                <strong className="text-ink">{lost.length} lot{lost.length === 1 ? ' is' : 's are'} on no rack.</strong>{' '}
                <Link href="/inventory/ledger?rack=none" className="font-medium text-accent-ink hover:underline">Place them</Link>
                {' '}— nobody walking the racks will count {lost.length === 1 ? 'it' : 'them'}.
              </p>
            )}
            <DataTable
              columns={kit.columns} rows={shown} keyOf={(r) => r.rack.id}
              onEdit={(r) => setEditing(r)}
              onDelete={(r) => setDeleting(r)}
              editLabel={(r) => `Rename ${r.rack.name}`}
              deleteLabel={(r) => `Delete ${r.rack.name}`}
            />
          </>
        )}
      </ListPage>

      <RackForm row={editing} onClose={() => setEditing(undefined)}
        onSave={(name, note) => update((w) => (editing
          ? updateRack(w, editing.rack.id, { name, note })
          : addRack(w, { name, note })[0]))} />
      <RacksWizard open={naming} onClose={() => setNaming(false)} />
      <ConfirmDelete
        open={deleting !== null}
        what={deleting?.rack.name ?? ''}
        impact={deleting ? rackImpact(ws, deleting.rack.id) : { losses: [], clean: true }}
        onClose={() => setDeleting(null)}
        onConfirm={() => { if (deleting) update((w) => removeRack(w, deleting.rack.id, today, session.actor)) }}
      />
    </>
  )
}

function RackForm({ row, onClose, onSave }: {
  row: RackRow | null | undefined
  onClose: () => void
  onSave: (name: string, note: string) => void
}) {
  const { workspace } = useWorkspace()
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [tried, setTried] = useState(false)

  useEffect(() => {
    if (row === undefined) return
    setName(row?.rack.name ?? ''); setNote(row?.rack.note ?? ''); setTried(false)
  }, [row])

  if (row === undefined || !workspace) return null
  const problem = rackProblem(workspace, name, row?.rack.id)

  const save = () => {
    setTried(true)
    if (problem) return
    onSave(name, note)
    onClose()
  }

  return (
    <Dialog open onClose={onClose} title={row ? `Rename ${row.rack.name}` : 'Add a rack'}>
      <div className="space-y-3 px-4 py-4">
        <Field label="What it is called" htmlFor="rk-name" error={tried ? problem ?? undefined : undefined}>
          <TextInput id="rk-name" value={name} onChange={setName} autoFocus onEnter={save}
            placeholder="A-3" invalid={tried && !!problem} />
        </Field>
        <Field label="What is on it" hint="Optional — so a new person knows where to look." htmlFor="rk-note">
          <TextInput id="rk-note" value={note} onChange={setNote} onEnter={save} placeholder="Pocketing and lining" />
        </Field>
      </div>
      <footer className="flex items-center justify-end gap-2 border-t border-line-soft px-4 py-3">
        <button type="button" onClick={onClose}
          className="press rounded-lg px-2.5 py-2 text-[13px] text-ink-2 hover:text-ink">Cancel</button>
        <button type="button" onClick={save}
          className="press rounded-lg border border-accent-ink bg-accent-ink px-3.5 py-2 text-[13px] font-semibold text-on-accent hover:bg-accent">
          {row ? 'Save' : 'Add the rack'}
        </button>
      </footer>
    </Dialog>
  )
}
