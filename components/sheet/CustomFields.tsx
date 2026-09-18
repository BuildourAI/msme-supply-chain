'use client'
import { Field, NumberInput, Select, TextInput } from '@/components/ui/Field'
import { fieldsFor } from '@/lib/workspace/fields'
import { useWorkspace } from '@/components/workspace/store'
import type { SheetEntity } from '@/lib/workspace/types'

/**
 * The owner's own fields, on the dialog that adds or edits a record.
 *
 * A column you can see in the table but cannot fill in from the form is worse
 * than no column, so this goes on all three dialogs automatically — adding a
 * field is one action, not one action plus a second place to remember.
 *
 * It renders nothing at all when there are no custom fields, which is most
 * workspaces most of the time, so the dialogs look exactly as they did.
 */
export function CustomFields({ entity, values, onChange }: {
  entity: SheetEntity
  values: Record<string, string>
  onChange: (next: Record<string, string>) => void
}) {
  const { workspace } = useWorkspace()
  if (!workspace) return null
  const fields = fieldsFor(workspace, entity)
  if (fields.length === 0) return null

  const set = (id: string, v: string) => onChange({ ...values, [id]: v })

  return (
    <div className="space-y-4 border-t border-line-soft pt-4">
      <p className="mono text-[10px] uppercase tracking-wider text-ink-3">Your own columns</p>
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((f) => {
          const id = `cfv-${f.id}`
          const v = values[f.id] ?? ''
          return (
            <Field key={f.id} label={f.label} htmlFor={id}>
              {f.kind === 'number' ? (
                <NumberInput id={id} value={v} onChange={(x) => set(f.id, x)} unit={f.unit} />
              ) : f.kind === 'date' ? (
                <input id={id} type="date" value={/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : ''}
                  onChange={(e) => set(f.id, e.target.value)}
                  className="num w-full rounded-md border border-line bg-surface px-2.5 py-2 text-[13px] outline-none focus:border-accent" />
              ) : f.kind === 'yesno' ? (
                <Select id={id} value={v} onChange={(x) => set(f.id, x)} placeholder="—"
                  options={[{ value: 'Yes', label: 'Yes' }, { value: 'No', label: 'No' }]} />
              ) : f.kind === 'choice' ? (
                /*
                 * A value already stored that is not in the list — typed before
                 * somebody edited the choices, or brought in by an import — is
                 * offered alongside them rather than silently cleared.
                 */
                <Select id={id} value={v} onChange={(x) => set(f.id, x)} placeholder="—"
                  options={[
                    ...(f.choices ?? []).map((c) => ({ value: c, label: c })),
                    ...(v && !(f.choices ?? []).includes(v) ? [{ value: v, label: v }] : []),
                  ]} />
              ) : (
                <TextInput id={id} value={v} onChange={(x) => set(f.id, x)} />
              )}
            </Field>
          )
        })}
      </div>
    </div>
  )
}
