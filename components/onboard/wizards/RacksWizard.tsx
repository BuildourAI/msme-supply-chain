'use client'
import { useEffect, useState } from 'react'
import { Wizard, type WizardStep } from '@/components/ui/Wizard'
import { Icon } from '@/components/ui/icons'
import { useWorkspace } from '@/components/workspace/store'
import { addRack, rackProblem } from '@/lib/workspace/racks'

interface Row { name: string; note: string }
const blank = (): Row[] => [{ name: '', note: '' }, { name: '', note: '' }, { name: '', note: '' }]

/**
 * Naming the places stock sits.
 *
 * A list to type into, three rows to start and one more on request — racks
 * are usually named in a run, walking the store, and a form per rack would
 * make that twelve dialogs. What people call it is what it is called:
 * "A-1", "Fabric wall", "Under the stairs".
 *
 * "Everything is in one place" is on the same screen and ticks the step.
 * A small store with one shelf is not a store that has skipped a step.
 */
export function RacksWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { workspace, update } = useWorkspace()
  const [rows, setRows] = useState<Row[]>(blank())

  useEffect(() => {
    if (open) setRows(blank())
  }, [open])

  if (!open || !workspace) return null
  const ws = workspace
  const have = [...(ws.racks ?? [])].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))

  const typed = rows.filter((r) => r.name.trim())
  const seen = new Set<string>()
  let problem: string | null = null
  for (const r of typed) {
    const key = r.name.trim().toLowerCase()
    if (seen.has(key)) { problem = `${r.name.trim()} is on the list twice.`; break }
    seen.add(key)
    const p = rackProblem(ws, r.name)
    if (p) { problem = p; break }
  }
  if (!problem && typed.length === 0 && have.length === 0) {
    problem = 'Name at least one rack — or say everything is in one place.'
  }

  const set = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  const onePlace = () => {
    update((w) => ({ ...w, drafts: { ...w.drafts, 'inventory.oneRack': true } }))
    onClose()
  }

  const steps: WizardStep[] = [{
    label: 'Racks',
    title: 'Where does stock sit?',
    why: 'Whatever is painted on the rack, or what people call it. Every lot sits on one, and a count is walked rack by rack.',
    invalid: problem,
    body: (
      <div className="space-y-3">
        {have.length > 0 && (
          <p className="text-[12px] text-ink-3">
            Already named: {have.map((r) => r.name).join(', ')}.
          </p>
        )}
        <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-x-2 gap-y-1.5">
          <span className="text-[11.5px] font-medium text-ink-3">Rack</span>
          <span className="text-[11.5px] font-medium text-ink-3">What is on it <span className="text-ink-4">(optional)</span></span>
          {rows.map((r, i) => (
            <div key={i} className="contents">
              <input aria-label={`Rack ${i + 1}`} value={r.name} data-autofocus={i === 0 ? '' : undefined}
                onChange={(e) => set(i, { name: e.target.value })}
                placeholder={['A-1', 'A-2', 'Fabric wall'][i] ?? `Rack ${i + 1}`}
                className="w-full rounded-md border border-line bg-surface px-2.5 py-2 text-[13px] outline-none focus:border-accent" />
              <input aria-label={`What is on rack ${i + 1}`} value={r.note}
                onChange={(e) => set(i, { note: e.target.value })}
                placeholder={['Fabric rolls', 'Lining and interlining', 'Trims and packing'][i] ?? ''}
                className="w-full rounded-md border border-line bg-surface px-2.5 py-2 text-[13px] outline-none focus:border-accent" />
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setRows((rs) => [...rs, { name: '', note: '' }])}
          className="press inline-flex items-center gap-1 text-[12.5px] font-medium text-accent-ink hover:underline">
          <Icon name="plus" className="size-3.5" /> Another rack
        </button>
        <div className="border-t border-line-soft pt-3">
          <button type="button" onClick={onePlace}
            className="press text-[12.5px] text-ink-3 underline underline-offset-2 hover:text-ink">
            Everything is in one place
          </button>
          <p className="mt-1 text-[11.5px] leading-snug text-ink-4">
            Ticks this step. Racks can be named later, from the Racks screen.
          </p>
        </div>
      </div>
    ),
  }]

  const save = () => {
    const named = rows.filter((r) => r.name.trim())
    if (named.length > 0) {
      update((w0) => named.reduce((w, r) => addRack(w, { name: r.name, note: r.note })[0], w0))
    }
    onClose()
  }

  return (
    <Wizard open={open} onClose={onClose} wide={false}
      title="Name your racks"
      sub={have.length > 0 ? `${have.length} named so far` : undefined}
      steps={steps} onDone={save}
      doneLabel={typed.length > 1 ? `Add these ${typed.length} racks` : typed.length === 1 ? 'Add this rack' : 'Done'} />
  )
}
