'use client'
import { useEffect, useState } from 'react'
import { Wizard, type WizardStep } from '@/components/ui/Wizard'
import { Chips, Field, TextInput } from '@/components/ui/Field'
import { Icon } from '@/components/ui/icons'
import { useWorkspace } from '@/components/workspace/store'
import { ROLE_LABEL, type Person, type PersonRole } from '@/lib/workspace/types'

/**
 * Who else works here.
 *
 * Step one is already ticked when this opens — the company exists, which is the
 * step. This is the part of it worth coming back to: the names that will appear
 * against actions in the audit trail.
 *
 * It is deliberately not a gate. An MSME owner is very often the whole team on
 * day one, and making them invent colleagues before they can add a material
 * would be the sort of ceremony that loses people. §11 wants a named owner on
 * every action; one name satisfies that.
 */
const ROLES: PersonRole[] = ['owner', 'manager', 'stores', 'buyer']

export function TeamWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { workspace, update } = useWorkspace()
  const [company, setCompany] = useState('')
  const [makes, setMakes] = useState('')
  const [people, setPeople] = useState<Person[]>([])
  const [name, setName] = useState('')
  const [role, setRole] = useState<PersonRole>('stores')

  useEffect(() => {
    if (!open || !workspace) return
    setCompany(workspace.company.name)
    setMakes(workspace.company.makes)
    setPeople(workspace.people)
    setName(''); setRole('stores')
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open || !workspace) return null

  const add = () => {
    const n = name.trim()
    if (n.length < 2) return
    setPeople((ps) => (ps.some((p) => p.name.toLowerCase() === n.toLowerCase())
      ? ps : [...ps, { name: n, role }]))
    setName('')
  }

  const steps: WizardStep[] = [
    {
      label: 'Company',
      title: 'Your company',
      why: 'It appears in the corner of every screen, so you always know whose data you are looking at.',
      invalid: company.trim().length < 2 ? 'Put in a company name.' : null,
      body: (
        <div className="space-y-3.5">
          <Field label="Company name" htmlFor="tw-company">
            <TextInput id="tw-company" value={company} onChange={setCompany} autoFocus />
          </Field>
          <Field label="What do you make?" hint="Optional, in your own words." htmlFor="tw-makes">
            <TextInput id="tw-makes" value={makes} onChange={setMakes}
              placeholder="industrial heaters and control panels" />
          </Field>
        </div>
      ),
    },
    {
      label: 'Team',
      title: 'Who else works on this?',
      why: 'Optional. Every action is recorded against a name, and these are the names available.',
      invalid: null,
      body: (
        <div className="space-y-3.5">
          <ul className="divide-y divide-line-soft rounded-md border border-line">
            {people.map((p) => (
              <li key={p.name} className="flex items-center gap-2 px-3 py-2 text-[12.5px]">
                <Icon name="check" className="size-3.5 shrink-0 text-good" />
                <span className="min-w-0 truncate font-medium">{p.name}</span>
                <span className="ml-auto shrink-0 text-[11.5px] text-ink-3">{ROLE_LABEL[p.role]}</span>
                {p.name !== workspace.owner.name && (
                  <button type="button"
                    onClick={() => setPeople((ps) => ps.filter((x) => x.name !== p.name))}
                    title={`Remove ${p.name}`}
                    className="press shrink-0 rounded p-0.5 text-ink-3 hover:text-critical">
                    <Icon name="close" className="size-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>

          <div className="rounded-md border border-line bg-surface-2 p-2.5">
            <Field label="Add somebody">
              <TextInput value={name} onChange={setName} placeholder="S. Kale" onEnter={add} />
            </Field>
            <div className="mt-2.5">
              <Chips value={role} onChange={(v) => setRole(v as PersonRole)}
                options={ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))} />
            </div>
            <button type="button" onClick={add} disabled={name.trim().length < 2}
              className="press mt-2.5 rounded-md border border-line bg-surface px-2.5 py-1.5 text-[12.5px] font-medium hover:bg-surface-2 disabled:opacity-40">
              Add to the team
            </button>
          </div>
        </div>
      ),
    },
  ]

  const save = () => {
    update((w) => ({
      ...w,
      company: { name: company.trim(), makes: makes.trim() },
      people,
    }))
    onClose()
  }

  return (
    <Wizard open={open} onClose={onClose} title="You and your company"
      steps={steps} onDone={save} doneLabel="Save" wide={false} />
  )
}
