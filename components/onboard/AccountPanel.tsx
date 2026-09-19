'use client'
import { useState } from 'react'
import { Field, TextInput } from '@/components/ui/Field'
import { Icon } from '@/components/ui/icons'
import { useAuth } from '@/components/workspace/auth'
import { useWorkspace } from '@/components/workspace/store'

/**
 * An account, so the work survives this browser.
 *
 * Offered rather than required, and that is the whole design. An owner trying
 * the thing out should be able to type a supplier in before being asked for an
 * email; making an account the gate is how a demo loses the person it was built
 * for. So the app still runs entirely on the device, and signing in is the
 * thing that adds — a copy in the database, the same data on a phone, and
 * survival through a cleared browser.
 *
 * What it does NOT do is change who can read it. Every row is fenced by a
 * policy comparing the signed-in id to the row's owner, so an account sees
 * exactly one workspace: its own.
 */
export function AccountPanel({ compact }: { compact?: boolean }) {
  const { account, available, ready, signUp, signIn, signOut } = useAuth()
  const { sync, clearSyncNote, syncNow } = useWorkspace()

  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'in' | 'up'>('up')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!ready) return null

  /* ------------------------------------------------------------ signed in -- */

  if (account) {
    return (
      <div className={`rounded-lg border border-good/30 bg-good-soft/30 ${compact ? 'p-2.5' : 'p-3.5'}`}>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-semibold">
          <Icon name="check" className="size-4 shrink-0 text-good" />
          Saved to your account
          <span className="mono ml-auto text-[10.5px] font-normal text-ink-3">{account.email}</span>
        </p>

        <p className="mt-1 text-[12px] leading-snug text-ink-2">
          <SyncWord />
        </p>

        {sync.note && (
          <p className="mt-2 rounded-md border border-warn/30 bg-warn-soft px-2.5 py-2 text-[11.5px] leading-snug text-ink-2">
            {sync.note}
            <button type="button" onClick={clearSyncNote}
              className="press ml-1.5 underline underline-offset-2">Got it</button>
          </p>
        )}

        {sync.error && (
          <p className="mt-2 rounded-md border border-critical/30 bg-critical-soft px-2.5 py-2 text-[11.5px] leading-snug text-ink-2">
            {sync.error}
            <button type="button" onClick={syncNow}
              className="press ml-1.5 underline underline-offset-2">Try again</button>
          </p>
        )}

        <button type="button" onClick={() => void signOut()}
          className="press mt-2 text-[12px] text-ink-2 underline underline-offset-2 hover:text-ink">
          Sign out of the account
        </button>
      </div>
    )
  }

  /* ----------------------------------------------------------- no account -- */

  if (!available) {
    return (
      <p className="rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-[12px] leading-snug text-ink-2">
        This browser will not keep you signed in — a private window, most likely. Everything still
        works and saves on this device.
      </p>
    )
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="press flex w-full items-start gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-left hover:bg-surface-3">
        <Icon name="upload" className="mt-0.5 size-4 shrink-0 text-ink-3" />
        <span>
          <span className="block text-[12.5px] font-medium">Keep this on an account</span>
          <span className="mt-0.5 block text-[11.5px] leading-snug text-ink-3">
            Optional. It puts a copy in your own database so a cleared browser costs you nothing,
            and the same data opens on your phone.
          </span>
        </span>
      </button>
    )
  }

  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())
  const passwordOk = password.length >= 6
  const submit = async () => {
    setError(null)
    if (!emailOk) { setError('That does not look like an email address.'); return }
    if (!passwordOk) { setError('Use a password of at least six characters.'); return }
    setBusy(true)
    const failed = mode === 'up' ? await signUp(email, password) : await signIn(email, password)
    setBusy(false)
    if (failed) setError(failed)
    else { setOpen(false); setPassword('') }
  }

  return (
    <div className="rounded-lg border border-line bg-surface-2 p-3">
      <div className="mb-2.5 flex items-center gap-2">
        <p className="text-[12.5px] font-semibold">
          {mode === 'up' ? 'Create an account' : 'Sign in'}
        </p>
        <button type="button"
          onClick={() => { setMode(mode === 'up' ? 'in' : 'up'); setError(null) }}
          className="press ml-auto text-[11.5px] text-accent-ink underline underline-offset-2">
          {mode === 'up' ? 'I already have one' : 'I need an account'}
        </button>
      </div>

      <div className="space-y-2.5">
        <Field label="Email" htmlFor="ac-email">
          <TextInput id="ac-email" value={email} onChange={setEmail}
            placeholder="owner@yourfirm.in" autoFocus onEnter={() => void submit()} />
        </Field>
        <Field label="Password"
          hint={mode === 'up' ? 'Six characters or more.' : undefined} htmlFor="ac-password">
          <input id="ac-password" type="password" value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void submit() }}
            className="w-full rounded-md border border-line bg-surface px-2.5 py-2 text-[13px] outline-none transition-colors focus:border-accent" />
        </Field>
      </div>

      {error && (
        <p className="mt-2 rounded-md border border-critical/30 bg-critical-soft px-2.5 py-2 text-[11.5px] leading-snug text-ink-2">
          {error}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void submit()} disabled={busy}
          className="press rounded-lg border border-accent-ink bg-accent-ink px-3 py-1.5 text-[12.5px] font-semibold text-on-accent hover:bg-accent disabled:opacity-40">
          {busy ? 'One moment…' : mode === 'up' ? 'Create it' : 'Sign in'}
        </button>
        <button type="button" onClick={() => { setOpen(false); setError(null) }}
          className="press text-[12px] text-ink-2 underline underline-offset-2 hover:text-ink">
          Not now
        </button>
      </div>

      <p className="mt-2.5 text-[11px] leading-snug text-ink-3">
        Your workspace is stored against this account and nothing else can read it. Supplier names,
        rates and contact details included.
      </p>
    </div>
  )
}

/** What the sync state means, in a sentence rather than a status word. */
function SyncWord() {
  const { sync } = useWorkspace()
  switch (sync.state) {
    case 'loading': return <>Fetching what your account already has…</>
    case 'saving': return <>Saving…</>
    case 'error': return <>Saved on this device. The account copy is behind.</>
    case 'synced': return <>Everything here is in your account as well as on this device.</>
    default: return <>Saved on this device.</>
  }
}
