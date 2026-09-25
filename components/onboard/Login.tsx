'use client'
import { useState } from 'react'
import { Field, TextInput } from '@/components/ui/Field'
import { Icon, Logo, STAGE_ICON } from '@/components/ui/icons'
import { useWorkspace } from '@/components/workspace/store'
import { useAuth } from '@/components/workspace/auth'
import { AccountPanel } from './AccountPanel'
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
 *
 * It wears the owner's colours, the same as the dashboards it leads to: a navy
 * panel saying what this is and the five stages material moves through, and a
 * white card with the questions. On a laptop both sit on one screen; on a
 * phone the panel comes first, short, and the questions follow.
 */
const ROLES: PersonRole[] = ['owner', 'manager', 'stores', 'buyer']

export function Login() {
  const { createWorkspace, hasAccount, workspace, setMode, signOut, browseSample } = useWorkspace()
  const { account } = useAuth()
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
    <div className="mx-auto grid min-h-[100dvh] w-full max-w-[80rem] gap-3 p-3 sm:p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,32rem)] lg:gap-4">
      <section data-login-band
        className="anim-fade-up relative flex flex-col overflow-hidden rounded-2xl bg-gradient-to-br from-navy-deep to-navy px-5 py-5 text-white sm:px-8 sm:py-7">
        <Logo className="pointer-events-none absolute -right-20 top-1/2 size-[26rem] -translate-y-1/2 text-white/[0.04]" />

        <div className="flex items-center gap-2.5">
          <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/12">
            <Logo className="size-5" />
          </span>
          <span>
            <span className="block text-[15px] font-extrabold leading-tight tracking-tight">Material Flow</span>
            <span className="mono block text-[10px] uppercase tracking-wider text-white/65">For Indian manufacturers</span>
          </span>
        </div>

        <h1 className="mt-6 text-[26px] font-extrabold leading-[1.1] tracking-[-0.02em] sm:text-[34px] lg:mt-12">
          Set up your supply chain
        </h1>
        <p className="mt-2 max-w-[30rem] text-[13.5px] leading-snug text-white/75">
          Four questions, then five short steps. About fifteen minutes.
        </p>

        <Stages />

        {/*
          * This line used to promise that nothing was ever uploaded. That stopped
          * being true the moment an account could exist, and a privacy promise
          * that quietly goes stale is worse than none — so it now says which of
          * the two situations you are actually in.
          */}
        <p className="relative mt-5 flex items-start gap-2 rounded-xl bg-white/[0.07] px-3 py-2.5 text-[11.5px] leading-relaxed text-white/80 lg:mt-auto">
          <Icon name="lock" className="mt-0.5 size-3.5 shrink-0" />
          {account ? (
            <span>
              Your data is on this device and in your own database, readable only by this account —
              not by other people using this app, and not by us. Sign out of the account and it stays
              on the device alone.
            </span>
          ) : (
            <span>
              Your data stays in this browser, on this device. Nothing is uploaded and nobody else can
              see it — including us. Clearing your browser data clears your workspace with it, which
              is what an account prevents.
            </span>
          )}
        </p>
      </section>

      <main className="anim-fade-up flex flex-col justify-center rounded-2xl border border-line bg-surface p-5 shadow-sm sm:p-7 [&_input:not([aria-invalid]):focus]:border-navy"
        style={{ '--i': 1 } as React.CSSProperties}>
        {hasAccount && workspace && (
          <div className="mb-5 rounded-xl border border-navy/20 bg-navy/[0.06] p-3">
            <p className="text-[13px] font-semibold">{workspace.company.name} is already set up here.</p>
            <p className="mt-0.5 text-[12px] leading-snug text-ink-2">
              Signed in as {workspace.owner.name}.
            </p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              <button type="button" onClick={() => setMode('mine')} className={PRIMARY}>Continue as {workspace.owner.name}</button>
              <button type="button" onClick={signOut} className={QUIET}>Sign out and start again</button>
            </div>
          </div>
        )}

        <h2 className="flex items-center gap-2 text-[15px] font-bold tracking-tight">
          <span aria-hidden className="grid size-7 place-items-center rounded-lg bg-navy/10 text-navy"><Icon name="pencil" className="size-4" /></span>
          About you and your company
        </h2>

        <div className="mt-4 grid gap-x-3 gap-y-4 sm:grid-cols-2">
          <Field label="Your name" hint="Every action is recorded against it."
            htmlFor="lg-name" error={tried && !nameOk ? 'Please put in a name.' : null}>
            <TextInput id="lg-name" value={name} onChange={setName} autoFocus
              invalid={tried && !nameOk} placeholder="R. Mehta" onEnter={submit} />
          </Field>

          <Field label="Mobile or email" hint="Optional. To reach you later." htmlFor="lg-contact">
            <TextInput id="lg-contact" value={contact} onChange={setContact}
              placeholder="98200 11223" onEnter={submit} />
          </Field>

          <Field label="Your company" hint="As it appears on your documents." htmlFor="lg-company"
            error={tried && !companyOk ? 'Please put in a company name.' : null}>
            <TextInput id="lg-company" value={company} onChange={setCompany}
              invalid={tried && !companyOk} placeholder="Patel Heaters & Controls" onEnter={submit} />
          </Field>

          <Field label="What do you make?" hint="Optional, in your own words." htmlFor="lg-makes">
            <TextInput id="lg-makes" value={makes} onChange={setMakes}
              placeholder="heaters and control panels" onEnter={submit} />
          </Field>

          <Field label="What do you do there?" className="sm:col-span-2">
            <div className="flex flex-wrap gap-1.5">
              {ROLES.map((r) => (
                <button key={r} type="button" onClick={() => setRole(r)} aria-pressed={role === r}
                  className={`press inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[12.5px] transition-colors ${
                    role === r ? 'border-navy bg-navy font-semibold text-white' : 'border-line text-ink-2 hover:bg-surface-2'}`}>
                  {role === r && <Icon name="check" className="size-3.5" />}
                  {ROLE_LABEL[r]}
                </button>
              ))}
            </div>
          </Field>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line-soft pt-4">
          <button type="button" onClick={submit} className={`${PRIMARY} px-4 py-2 text-[13.5px]`}>
            Create my workspace
            <Icon name="arrow-right" className="size-4" />
          </button>
          <button type="button" onClick={browseSample}
            className="press text-[12.5px] text-ink-2 underline underline-offset-2 hover:text-navy">
            Look at the sample company first
          </button>
        </div>

        <div className="mt-4 border-t border-line-soft pt-4">
          <AccountPanel />
        </div>
      </main>
    </div>
  )
}

const PRIMARY = 'press inline-flex items-center gap-1.5 rounded-lg bg-navy px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-navy-deep'
const QUIET = 'press inline-flex items-center rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] font-medium hover:bg-surface-2'

const STAGES: { id: string; label: string; what: string }[] = [
  { id: 'sourcing', label: 'Sourcing', what: 'Suppliers, prices and purchase orders' },
  { id: 'inbound', label: 'Inbound', what: 'What came in at the gate, and whether it passed' },
  { id: 'inventory', label: 'Inventory', what: 'The shelf, counts, jobwork and loss' },
  { id: 'production', label: 'Production', what: 'Job cards, the line and what was made' },
  { id: 'dispatch', label: 'Dispatch', what: 'Sales orders, challans and deliveries' },
]

/**
 * The five stages, in the order material moves through them — one desk each.
 * On a laptop a line per stage with what it holds; on a phone just the five
 * discs in a row, because the words are one scroll away on every desk.
 */
function Stages() {
  return (
    <div className="relative mt-6 lg:mt-10">
      <p className="mono text-[10px] uppercase tracking-wider text-white/60">One desk for each stage</p>
      <ol className="mt-3 grid grid-cols-5 gap-1 lg:hidden">
        {STAGES.map((s) => (
          <li key={s.id} className="flex min-w-0 flex-col items-center gap-1 text-center">
            <span aria-hidden className="grid size-9 place-items-center rounded-xl bg-white/12"><Icon name={STAGE_ICON[s.id]} className="size-4" /></span>
            <span className="max-w-full truncate text-[10.5px] font-semibold text-white/85">{s.label}</span>
          </li>
        ))}
      </ol>
      <ol className="mt-3 hidden lg:block">
        {STAGES.map((s, i) => (
          <li key={s.id} className="relative flex items-center gap-3.5 py-2">
            {i < STAGES.length - 1 && <span aria-hidden className="absolute left-[19px] top-[42px] h-[calc(100%-32px)] w-px bg-white/20" />}
            <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/12"><Icon name={STAGE_ICON[s.id]} className="size-[18px]" /></span>
            <span className="min-w-0">
              <span className="block text-[14px] font-bold leading-tight">{s.label}</span>
              <span className="block text-[12px] leading-snug text-white/70">{s.what}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}
