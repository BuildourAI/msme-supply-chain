'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/bits'
import { Chips, Field, TextInput } from '@/components/ui/Field'
import { Icon } from '@/components/ui/icons'
import { useWorkspace } from '@/components/workspace/store'
import { ROLE_LABEL, type PersonRole } from '@/lib/workspace/types'

/**
 * The first screen, and the one the review call asked for: what does this look
 * like to somebody who has never seen it, with nothing in it.
 *
 * Four questions, all of them things an owner can answer without leaving their
 * chair. No password, because there is nothing yet to protect and a password
 * field on a first visit is a reason to close the tab. What the account does is
 * put a name on every action and give this company's data somewhere to live;
 * when the accounts move to the server, this screen gains a password and
 * nothing else changes.
 *
 * The line about where the data is kept is not small print. Somebody typing
 * their supplier rates deserves to know the answer before they type, not after.
 */
const ROLES: PersonRole[] = ['owner', 'manager', 'stores', 'buyer']

export function Login() {
  const { createWorkspace, hasAccount, workspace, setMode, signOut, browseSample } = useWorkspace()
  const [name, setName] = useState('')
  const [contact, setContact] = useState('')
  const [company, setCompany] = useState('')
  const [makes, setMakes] = useState('')
  const [role, setRole] = useState<PersonRole>('owner')
  const [tried, setTried] = useState(false)

  const nameOk = name.trim().length > 1
  const companyOk = company.trim().length > 1
  const ok = nameOk && companyOk

  const submit = () => {
    setTried(true)
    if (!ok) return
    createWorkspace({
      ownerName: name.trim(), contact: contact.trim(),
      companyName: company.trim(), makes: makes.trim(), role,
    })
  }

  return (
    <div className="mx-auto w-full max-w-[34rem] px-4 py-10">
      <div className="mb-6 flex items-center gap-2.5">
        <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-tint text-accent-ink">
          <Icon name="boxes" className="size-5" />
        </span>
        <span>
          <span className="block text-[17px] font-extrabold leading-tight tracking-tight">Set up your supply chain</span>
          <span className="block text-[12.5px] leading-snug text-ink-2">
            Four questions, then five short steps. About fifteen minutes.
          </span>
        </span>
      </div>

      {hasAccount && workspace && (
        <div className="anim-fade-up mb-5 rounded-lg border border-accent/30 bg-accent-tint p-3">
          <p className="text-[13px] font-semibold">{workspace.company.name} is already set up here.</p>
          <p className="mt-0.5 text-[12px] leading-snug text-ink-2">
            Signed in as {workspace.owner.name}.
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => setMode('mine')}>Continue as {workspace.owner.name}</Button>
            <Button onClick={signOut}>Sign out and start again</Button>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-line bg-surface p-4 shadow-sm">
        <div className="space-y-4">
          <Field label="Your name" hint="Every action gets recorded against it, so the trail says who did what."
            htmlFor="lg-name" error={tried && !nameOk ? 'Please put in a name.' : null}>
            <TextInput id="lg-name" value={name} onChange={setName} autoFocus
              invalid={tried && !nameOk} placeholder="R. Mehta" onEnter={submit} />
          </Field>

          <Field label="Mobile or email" hint="Optional. Only so the system knows how to reach you later."
            htmlFor="lg-contact">
            <TextInput id="lg-contact" value={contact} onChange={setContact}
              placeholder="98200 11223" onEnter={submit} />
          </Field>

          <Field label="Your company" htmlFor="lg-company"
            error={tried && !companyOk ? 'Please put in a company name.' : null}>
            <TextInput id="lg-company" value={company} onChange={setCompany}
              invalid={tried && !companyOk} placeholder="Patel Heaters & Controls" onEnter={submit} />
          </Field>

          <Field label="What do you make?" hint="Optional, and in your own words." htmlFor="lg-makes">
            <TextInput id="lg-makes" value={makes} onChange={setMakes}
              placeholder="industrial heaters and control panels" onEnter={submit} />
          </Field>

          <Field label="What do you do there?">
            <Chips value={role} onChange={(v) => setRole(v as PersonRole)}
              options={ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))} />
          </Field>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line-soft pt-4">
          <Button variant="primary" onClick={submit}>Create my workspace</Button>
          <button type="button" onClick={browseSample}
            className="press text-[12.5px] text-ink-2 underline underline-offset-2 hover:text-ink">
            Look at the sample company first
          </button>
        </div>
      </div>

      <p className="mt-4 flex items-start gap-1.5 text-[11.5px] leading-relaxed text-ink-3">
        <Icon name="lock" className="mt-px size-3.5 shrink-0" />
        <span>
          Your data stays in this browser, on this device. Nothing is uploaded and nobody else can see
          it — including us. Clearing your browser data clears your workspace with it.
        </span>
      </p>
    </div>
  )
}
