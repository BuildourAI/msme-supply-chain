'use client'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { readableAuthError, supabase } from '@/lib/workspace/supabase'

/**
 * Who is signed in.
 *
 * Kept apart from the workspace provider on purpose. Identity and company data
 * answer different questions — "who are you" and "what have you entered" — and
 * they fail separately: the network can be down while the browser copy is
 * perfectly readable, and somebody can be signed in with nothing entered yet.
 * One provider holding both would have to encode every combination.
 *
 * Until now "signing in" was typing a name. It stored nothing, checked nothing
 * and protected nothing, which was honest while the data never left the
 * machine. It stops being honest the moment that data is in a shared database,
 * so this is real authentication with row-level security behind it.
 */
export interface Account {
  id: string
  email: string
}

interface AuthCtx {
  /** null until the stored session has been read — the first frame only */
  ready: boolean
  account: Account | null
  /** false in a private window, where no session can be kept at all */
  available: boolean
  signUp: (email: string, password: string) => Promise<string | null>
  signIn: (email: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthCtx>(null!)
export const useAuth = () => useContext(Ctx)

const accountOf = (user: { id: string; email?: string } | null | undefined): Account | null =>
  (user ? { id: user.id, email: user.email ?? '' } : null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null)
  const [ready, setReady] = useState(false)
  const [available, setAvailable] = useState(true)

  useEffect(() => {
    const db = supabase()
    if (!db) {
      // A browser refusing storage. The app still runs on local data; it just
      // cannot hold a session, and the sign-in screen says so.
      setAvailable(false)
      setReady(true)
      return
    }

    let alive = true
    db.auth.getSession().then(({ data }) => {
      if (!alive) return
      setAccount(accountOf(data.session?.user))
      setReady(true)
    }).catch(() => {
      if (!alive) return
      setAvailable(false)
      setReady(true)
    })

    /*
     * Also listen, rather than only reading once. A token refresh, a sign-out
     * in another tab, or an expired session all arrive here, and without this
     * the app would go on showing somebody as signed in after they were not.
     */
    const { data: sub } = db.auth.onAuthStateChange((_event, session) => {
      if (!alive) return
      setAccount(accountOf(session?.user))
    })

    return () => { alive = false; sub.subscription.unsubscribe() }
  }, [])

  /** Every one of these returns null on success, or a sentence to show. */
  const signUp = useCallback<AuthCtx['signUp']>(async (email, password) => {
    const db = supabase()
    if (!db) return 'This browser will not keep you signed in. Try a normal window.'
    const { data, error } = await db.auth.signUp({ email: email.trim(), password })
    if (error) return readableAuthError(error.message)
    /*
     * With email confirmation off, sign-up returns a session and the person is
     * in. If it is ever turned on, there is no session yet and saying so beats
     * a screen that looks like it worked and then does nothing.
     */
    if (!data.session) return 'Check your email to confirm the account, then sign in.'
    return null
  }, [])

  const signIn = useCallback<AuthCtx['signIn']>(async (email, password) => {
    const db = supabase()
    if (!db) return 'This browser will not keep you signed in. Try a normal window.'
    const { error } = await db.auth.signInWithPassword({ email: email.trim(), password })
    return error ? readableAuthError(error.message) : null
  }, [])

  const signOut = useCallback(async () => {
    await supabase()?.auth.signOut()
    setAccount(null)
  }, [])

  const value = useMemo<AuthCtx>(
    () => ({ ready, account, available, signUp, signIn, signOut }),
    [ready, account, available, signUp, signIn, signOut],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
