'use client'
import { useState } from 'react'
import { Dialog } from '@/components/ui/Dialog'
import { Field, Select, TextInput } from '@/components/ui/Field'
import { Icon } from '@/components/ui/icons'
import { useWorkspace } from '@/components/workspace/store'
import {
  addField, filledCount, moveColumn, removeField, renameColumn, resolveColumns,
  setHidden, updateField, type ResolvedColumn,
} from '@/lib/workspace/fields'
import type { FieldDef, FieldKind, SheetEntity } from '@/lib/workspace/types'

/**
 * Arranging the table, and inventing the columns it does not have.
 *
 * One dialog for both, because to the person using it a column is a column —
 * whether the build shipped it or they made it up this morning is not a
 * distinction they should have to hold. What differs is only what may be done:
 * a built-in can be renamed, moved and hidden but not deleted, since the screen
 * knows how to draw it and the data behind it is not the owner's to discard.
 *
 * Reordering is two buttons rather than dragging. Dragging is nicer with a
 * mouse and unusable with a keyboard, impossible on a phone without a library,
 * and about ten times the code. The list is six to a dozen rows.
 */
const KINDS: { value: FieldKind; label: string; hint: string }[] = [
  { value: 'text', label: 'Text', hint: 'A GST number, a contact name, a note' },
  { value: 'number', label: 'Number', hint: 'A rating, a minimum order, a distance' },
  { value: 'date', label: 'Date', hint: 'When a licence expires, when you last visited' },
  { value: 'choice', label: 'Choice', hint: 'One of a list you set — A / B / C' },
  { value: 'yesno', label: 'Yes or no', hint: 'Approved, GST registered, preferred' },
]

const KIND_LABEL: Record<FieldKind, string> = {
  text: 'Text', number: 'Number', date: 'Date', choice: 'Choice', yesno: 'Yes/no',
}

export function ColumnsDialog({ open, onClose, entity, noun }: {
  open: boolean
  onClose: () => void
  entity: SheetEntity
  /** "supplier" — used in the sentence a delete has to say out loud */
  noun: string
}) {
  const { workspace, update } = useWorkspace()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<FieldDef | null>(null)
  const [confirmDrop, setConfirmDrop] = useState<FieldDef | null>(null)

  if (!open || !workspace) return null
  const columns = resolveColumns(workspace, entity)

  const close = () => { setAdding(false); setEditing(null); setConfirmDrop(null); onClose() }

  return (
    <>
      <Dialog open onClose={close} wide title="Columns"
        sub="Rename them, move them, hide the ones you do not use — or add your own.">
        <div className="px-4 py-4">
          <ul className="divide-y divide-line-soft rounded-lg border border-line">
            {columns.map((c, i) => (
              <ColumnRow
                key={c.key} column={c} first={i === 0} last={i === columns.length - 1}
                onMove={(by) => update((w) => moveColumn(w, entity, c.key, by))}
                onRename={(label) => update((w) => renameColumn(w, entity, c.key, label))}
                onHide={(hidden) => update((w) => setHidden(w, entity, c.key, hidden))}
                onEdit={() => setEditing(c.field ?? null)}
                onDelete={() => setConfirmDrop(c.field ?? null)}
              />
            ))}
          </ul>

          <button type="button" onClick={() => setAdding(true)}
            className="press mt-3 inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-[13px] font-medium hover:bg-surface-2">
            <Icon name="plus" className="size-3.5" />
            Add a column
          </button>
        </div>

        <footer className="flex justify-end border-t border-line-soft px-4 py-3">
          <button type="button" onClick={close}
            className="press rounded-lg border border-accent-ink bg-accent-ink px-3.5 py-2 text-[13px] font-semibold text-on-accent hover:bg-accent">
            Done
          </button>
        </footer>
      </Dialog>

      <FieldDialog
        open={adding || editing !== null} editing={editing} entity={entity}
        onClose={() => { setAdding(false); setEditing(null) }}
      />

      {confirmDrop && (
        <Dialog open onClose={() => setConfirmDrop(null)} title={`Delete ${confirmDrop.label}?`}>
          <div className="px-4 py-4">
            <p className="text-[13px] leading-relaxed text-ink-2">
              {filledCount(workspace, confirmDrop.id) === 0
                ? `Nothing is filled in against it, so nothing is lost.`
                : `${filledCount(workspace, confirmDrop.id)} ${noun}${
                  filledCount(workspace, confirmDrop.id) === 1 ? '' : 's'} ${
                  filledCount(workspace, confirmDrop.id) === 1 ? 'has' : 'have'} something written in
                  this column. Deleting it throws that away — there is nowhere else it is kept.`}
            </p>
          </div>
          <footer className="flex items-center gap-2 border-t border-line-soft px-4 py-3">
            <button type="button" onClick={() => setConfirmDrop(null)}
              className="press rounded-lg px-2.5 py-2 text-[13px] text-ink-2 hover:text-ink">Keep it</button>
            <span className="ml-auto" />
            <button type="button"
              onClick={() => { update((w) => removeField(w, confirmDrop.id)); setConfirmDrop(null) }}
              className="press rounded-lg border border-critical bg-critical px-3.5 py-2 text-[13px] font-semibold text-on-accent hover:opacity-90">
              Delete the column
            </button>
          </footer>
        </Dialog>
      )}
    </>
  )
}

function ColumnRow({ column, first, last, onMove, onRename, onHide, onEdit, onDelete }: {
  column: ResolvedColumn
  first: boolean
  last: boolean
  onMove: (by: -1 | 1) => void
  onRename: (label: string) => void
  onHide: (hidden: boolean) => void
  onEdit: () => void
  onDelete: () => void
}) {
  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState(column.label)

  const commit = () => { onRename(draft); setRenaming(false) }
  const kind = column.field ? KIND_LABEL[column.field.kind]
    : column.builtin?.derived ? 'Worked out' : 'Built in'

  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-2 px-3 py-2">
      <span className="flex shrink-0 flex-col">
        <button type="button" onClick={() => onMove(-1)} disabled={first}
          aria-label={`Move ${column.label} up`}
          className="press rounded p-0.5 text-ink-4 hover:text-ink disabled:opacity-25">
          <Icon name="chevron" className="size-3 -rotate-90" />
        </button>
        <button type="button" onClick={() => onMove(1)} disabled={last}
          aria-label={`Move ${column.label} down`}
          className="press rounded p-0.5 text-ink-4 hover:text-ink disabled:opacity-25">
          <Icon name="chevron" className="size-3 rotate-90" />
        </button>
      </span>

      <span className="min-w-0 flex-1">
        {renaming ? (
          <span className="flex items-center gap-1.5">
            <TextInput value={draft} onChange={setDraft} autoFocus onEnter={commit}
              label={`New name for ${column.label}`} />
            <button type="button" onClick={commit}
              className="press shrink-0 rounded-md border border-line bg-surface px-2 py-1.5 text-[12px] font-medium hover:bg-surface-2">
              Save
            </button>
          </span>
        ) : (
          <>
            <span className={`block text-[13px] font-medium ${column.hidden ? 'text-ink-4' : ''}`}>
              {column.label}
            </span>
            <span className="mono block text-[10.5px] uppercase tracking-wider text-ink-4">{kind}</span>
          </>
        )}
      </span>

      {!renaming && (
        <span className="flex shrink-0 items-center gap-0.5">
          <button type="button" onClick={() => { setDraft(column.label); setRenaming(true) }}
            title={`Rename ${column.label}`}
            className="press rounded-md p-1.5 text-ink-3 hover:bg-surface-3 hover:text-ink">
            <Icon name="pencil" className="size-3.5" />
            <span className="sr-only">Rename {column.label}</span>
          </button>

          {column.field && (
            <>
              <button type="button" onClick={onEdit} title={`Change what ${column.label} holds`}
                className="press rounded-md p-1.5 text-ink-3 hover:bg-surface-3 hover:text-ink">
                <Icon name="filter" className="size-3.5" />
                <span className="sr-only">Change what {column.label} holds</span>
              </button>
              <button type="button" onClick={onDelete} title={`Delete ${column.label}`}
                className="press rounded-md p-1.5 text-ink-4 hover:bg-critical-soft hover:text-critical">
                <Icon name="trash" className="size-3.5" />
                <span className="sr-only">Delete {column.label}</span>
              </button>
            </>
          )}

          {column.identity ? (
            <span className="mono ml-1 whitespace-nowrap text-[10px] uppercase tracking-wider text-ink-4"
              title="Every row is named by this column, so it always shows.">
              always
            </span>
          ) : (
            <label className="ml-1 inline-flex cursor-pointer select-none items-center gap-1.5 text-[12px] text-ink-2">
              <input type="checkbox" checked={!column.hidden}
                onChange={(e) => onHide(!e.target.checked)}
                className="size-3.5 accent-[var(--accent-ink)]" />
              Show
            </label>
          )}
        </span>
      )}
    </li>
  )
}

/** Adding a column, or changing what an existing one holds. */
function FieldDialog({ open, onClose, entity, editing }: {
  open: boolean
  onClose: () => void
  entity: SheetEntity
  editing: FieldDef | null
}) {
  const { workspace, update } = useWorkspace()
  const [label, setLabel] = useState('')
  const [kind, setKind] = useState<FieldKind>('text')
  const [choices, setChoices] = useState('')
  const [onDoc, setOnDoc] = useState(false)
  const [tried, setTried] = useState(false)
  const [was, setWas] = useState<string | null>(null)

  // seeded from the field being edited, without an effect: re-seeding when the
  // dialog's subject changes is the whole requirement
  const subject = editing?.id ?? (open ? 'new' : null)
  if (open && subject !== was) {
    setWas(subject)
    setLabel(editing?.label ?? '')
    setKind(editing?.kind ?? 'text')
    setChoices((editing?.choices ?? []).join(', '))
    setOnDoc(Boolean(editing?.onDoc))
    setTried(false)
  }

  if (!open || !workspace) return null

  const trimmed = label.trim()
  const clash = workspace.fields.some(
    (f) => f.id !== editing?.id && f.entity === entity
      && f.label.trim().toLowerCase() === trimmed.toLowerCase(),
  )
  const ok = trimmed.length > 0 && !clash

  const save = () => {
    setTried(true)
    if (!ok) return
    const list = choices.split(',').map((c) => c.trim()).filter(Boolean)
    const patch = {
      label: trimmed,
      kind,
      choices: kind === 'choice' ? list : undefined,
      onDoc: onDoc || undefined,
    }
    update((w) => (editing
      ? updateField(w, editing.id, patch)
      : addField(w, { entity, ...patch }).ws))
    onClose()
  }

  return (
    <Dialog open onClose={onClose} title={editing ? `Edit ${editing.label}` : 'Add a column'}>
      <div className="space-y-4 px-4 py-4">
        <Field label="What is it called?" htmlFor="cf-label"
          error={tried && trimmed === '' ? 'Give the column a name.'
            : clash ? 'You already have a column with that name.' : null}>
          <TextInput id="cf-label" value={label} onChange={setLabel} autoFocus
            placeholder="GST number" invalid={(tried && trimmed === '') || clash} />
        </Field>

        <Field label="What does it hold?" htmlFor="cf-kind"
          hint={KINDS.find((k) => k.value === kind)?.hint}>
          <Select id="cf-kind" value={kind} onChange={(v) => setKind(v as FieldKind)}
            options={KINDS.map((k) => ({ value: k.value, label: k.label }))} />
        </Field>

        {kind === 'choice' && (
          <Field label="The choices" hint="Separated by commas. You can change them later.">
            <TextInput value={choices} onChange={setChoices} placeholder="Mill, Trader, Stockist" />
          </Field>
        )}

        {entity === 'rfq' && (
          <label className="flex cursor-pointer select-none items-start gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2.5">
            <input type="checkbox" checked={onDoc} onChange={(e) => setOnDoc(e.target.checked)}
              className="mt-0.5 size-3.5 accent-[var(--accent-ink)]" />
            <span className="text-[12.5px] leading-snug text-ink-2">
              Print this on the request document
              <span className="mt-0.5 block text-[11.5px] text-ink-3">
                For something the supplier needs to see — a drawing number, a tolerance.
              </span>
            </span>
          </label>
        )}

        {editing && editing.kind !== kind && (
          <p className="rounded-lg border border-warn/30 bg-warn-soft px-3 py-2 text-[12.5px] leading-relaxed text-ink-2">
            Changing what a column holds does not throw away what is already written in it. Anything
            that does not fit the new kind is shown as it was typed.
          </p>
        )}
      </div>

      <footer className="flex items-center gap-2 border-t border-line-soft px-4 py-3">
        <button type="button" onClick={onClose}
          className="press rounded-lg px-2.5 py-2 text-[13px] text-ink-2 hover:text-ink">Cancel</button>
        <span className="ml-auto" />
        <button type="button" onClick={save}
          className="press rounded-lg border border-accent-ink bg-accent-ink px-3.5 py-2 text-[13px] font-semibold text-on-accent hover:bg-accent">
          {editing ? 'Save changes' : 'Add the column'}
        </button>
      </footer>
    </Dialog>
  )
}
