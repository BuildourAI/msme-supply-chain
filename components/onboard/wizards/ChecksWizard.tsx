'use client'
import { useEffect, useState } from 'react'
import { Wizard, type WizardStep } from '@/components/ui/Wizard'
import { useWorkspace } from '@/components/workspace/store'
import {
  CheckRows, blankDraft, draftOf, inputOf, isBlank, type CheckDraft,
} from '@/components/inbound/desk/CheckRows'
import { checkProblem, checksFor, setChecks } from '@/lib/workspace/checks'
import type { Workspace } from '@/lib/workspace/types'

/**
 * What to check when each material arrives, one material per screen.
 *
 * The same shape as the stock count, for the same reason: a single form with a
 * box for every check on every material is a wall, and somebody writing an
 * inspection list is thinking about one material at a time anyway. A material
 * left blank is skipped, not refused — its receipts close unchecked and say
 * so, which is better than a check written only to get past this screen.
 *
 * It edits the list rather than only adding to it, so opening it again later
 * shows what is there and saving writes the difference.
 */
export function ChecksWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { workspace, update } = useWorkspace()
  const [rows, setRows] = useState<Record<string, CheckDraft[]>>({})

  useEffect(() => {
    if (!open || !workspace) return
    const next: Record<string, CheckDraft[]> = {}
    for (const it of workspace.items) {
      const have = checksFor(workspace, it.id).map(draftOf)
      next[it.id] = have.length > 0 ? have : [blankDraft()]
    }
    setRows(next)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open || !workspace) return null
  const ws = workspace

  if (ws.items.length === 0) {
    return (
      <Wizard open={open} onClose={onClose} title="What to check when it arrives"
        steps={[{
          label: 'Nothing yet', title: 'There are no materials to write checks for',
          invalid: null,
          body: (
            <p className="rounded-md border border-warn/30 bg-warn-soft px-3 py-2.5 text-[12.5px] leading-relaxed text-ink-2">
              Add a material first, then come back and say what to check when it arrives.
            </p>
          ),
        }]}
        onDone={onClose} doneLabel="Close" />
    )
  }

  const steps: WizardStep[] = ws.items.map((it) => {
    const mine = rows[it.id] ?? []
    const written = mine.filter((d) => !isBlank(d))
    const problem = written
      .map((d) => checkProblem(ws, inputOf(it.id, d), d.id))
      .find(Boolean) ?? null
    // two new rows with the same name would each pass against what is stored
    const names = written.map((d) => d.label.trim().toLowerCase())
    const twice = names.length !== new Set(names).size
    return {
      label: it.code,
      title: `What do you check when ${it.name} arrives?`,
      why: 'Two to four is plenty — a reading, a certificate, a look. Leave it blank to skip this material; its receipts will close unchecked and say so.',
      invalid: twice ? 'Two checks on this material have the same name.' : problem,
      body: (
        <CheckRows idPrefix={`cw-${it.id}`} rows={mine}
          onChange={(next) => setRows((s) => ({ ...s, [it.id]: next }))} />
      ),
    }
  })

  const save = () => {
    update((w0) => {
      let w: Workspace = w0
      for (const it of w0.items) {
        // taken off the list here means taken off the list
        w = setChecks(w, it.id, (rows[it.id] ?? []).filter((d) => !isBlank(d))
          .map((d) => ({ id: d.id, input: inputOf(it.id, d) })))
      }
      return w
    })
    onClose()
  }

  const done = ws.items.filter((it) => (rows[it.id] ?? []).some((d) => !isBlank(d))).length
  return (
    <Wizard open={open} onClose={onClose}
      title="What to check when it arrives"
      sub={`${done} of ${ws.items.length} material${ws.items.length === 1 ? '' : 's'} with checks`}
      steps={steps} onDone={save} doneLabel="Save the checks" />
  )
}
