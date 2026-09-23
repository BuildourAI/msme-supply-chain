'use client'
import { useEffect, useState } from 'react'
import { Dialog } from '@/components/ui/Dialog'
import { Field, Select } from '@/components/ui/Field'
import { useWorkspace } from '@/components/workspace/store'
import { checkProblem, checksFor, setChecks } from '@/lib/workspace/checks'
import {
  CheckRows, blankDraft, draftOf, inputOf, isBlank, type CheckDraft,
} from './CheckRows'

/**
 * One material's checks, edited together.
 *
 * A material's list rather than one check at a time, because that is how an
 * inspection list is thought about — "for CRCA we gauge it, weigh a sheet and
 * want the mill certificate" — and because whether a list is sensible is only
 * visible when you can see all of it.
 */
export function CheckForm({ open, itemId, onClose }: {
  open: boolean
  /** the material to open on; absent to pick one */
  itemId: string | null
  onClose: () => void
}) {
  const { workspace, update } = useWorkspace()
  const [item, setItem] = useState('')
  const [rows, setRows] = useState<CheckDraft[]>([])
  const [tried, setTried] = useState(false)

  const load = (id: string) => {
    if (!workspace) return
    const have = checksFor(workspace, id).map(draftOf)
    setRows(have.length > 0 ? have : [blankDraft()])
  }

  useEffect(() => {
    if (!open || !workspace) return
    // open on the material asked for, or the first one with nothing written yet
    const first = itemId
      ?? workspace.items.find((i) => checksFor(workspace, i.id).length === 0)?.id
      ?? workspace.items[0]?.id ?? ''
    setItem(first); setTried(false)
    if (first) load(first)
  }, [open, itemId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open || !workspace) return null
  const ws = workspace

  const written = rows.filter((d) => !isBlank(d))
  const names = written.map((d) => d.label.trim().toLowerCase())
  const problem = !item ? 'Pick the material these checks are for.'
    : names.length !== new Set(names).size ? 'Two checks have the same name.'
      : written.map((d) => checkProblem(ws, inputOf(item, d), d.id)).find(Boolean) ?? null

  const save = () => {
    setTried(true)
    if (problem) return
    update((w) => setChecks(w, item, written.map((d) => ({ id: d.id, input: inputOf(item, d) }))))
    onClose()
  }

  const name = ws.items.find((i) => i.id === item)?.name
  return (
    <Dialog open onClose={onClose} wide
      title={name ? `What to check on ${name}` : 'What to check when it arrives'}
      sub="Two to four is plenty. A receipt cannot close until every one marked “must” is answered.">
      <div className="space-y-3.5 px-4 py-4">
        <Field label="Material" htmlFor="ck-item">
          <Select id="ck-item" value={item}
            onChange={(v) => { setItem(v); load(v) }}
            placeholder="Pick one"
            options={ws.items.map((i) => ({
              value: i.id,
              label: `${i.name}${checksFor(ws, i.id).length === 0 ? ' — no checks yet' : ''}`,
            }))} />
        </Field>
        {item && <CheckRows idPrefix="ck" rows={rows} onChange={setRows} />}
        {tried && problem && (
          <p role="alert" className="rounded-md border border-critical/30 bg-critical-soft px-3 py-2 text-[12.5px] text-critical">
            {problem}
          </p>
        )}
      </div>
      <footer className="flex items-center gap-2 border-t border-line-soft px-4 py-3">
        <span className="text-[12px] text-ink-3">
          {written.length === 0 ? 'Nothing written — saving leaves this material unchecked.'
            : `${written.length} check${written.length === 1 ? '' : 's'}`}
        </span>
        <span className="ml-auto" />
        <button type="button" onClick={onClose}
          className="press rounded-lg px-2.5 py-2 text-[13px] text-ink-2 hover:text-ink">Cancel</button>
        <button type="button" onClick={save}
          className="press rounded-lg border border-accent-ink bg-accent-ink px-3.5 py-2 text-[13px] font-semibold text-on-accent hover:bg-accent">
          Save the checks
        </button>
      </footer>
    </Dialog>
  )
}
