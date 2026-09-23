'use client'
import { useEffect, useState } from 'react'
import { Select } from '@/components/ui/Field'
import { useWorkspace } from '@/components/workspace/store'
import { addRack, rackByName } from '@/lib/workspace/racks'

/**
 * Which rack, with a new one addable on the spot.
 *
 * The value is a rack id, or '' for none. A rack typed in through "Add new…"
 * is written straight away and picked as soon as it exists — somebody placing
 * a lot on a rack nobody has named yet should not have to leave the form.
 */
export function RackSelect({ value, onChange, id, none = 'No rack' }: {
  value: string
  onChange: (rackId: string) => void
  id?: string
  none?: string
}) {
  const { workspace, update } = useWorkspace()
  const [pending, setPending] = useState<string | null>(null)

  useEffect(() => {
    if (!pending || !workspace) return
    const r = rackByName(workspace, pending)
    if (r) { onChange(r.id); setPending(null) }
  }, [pending, workspace]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!workspace) return null
  const racks = [...(workspace.racks ?? [])]
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))

  return (
    <Select id={id} value={value}
      onChange={(v) => {
        if (v === '' || racks.some((r) => r.id === v)) onChange(v)
        else setPending(v)
      }}
      options={[{ value: '', label: none }, ...racks.map((r) => ({ value: r.id, label: r.name }))]}
      addLabel="Add a rack…"
      onAdd={(name) => update((w) => addRack(w, { name })[0])} />
  )
}
