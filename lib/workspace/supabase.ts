/**
 * The connection to the database, and the account behind it.
 *
 * Two things about the key below are worth saying plainly, because a publishable
 * key sitting in a source file looks alarming until you know why.
 *
 * It is meant to be public. Supabase issues two kinds of key: this one, which
 * identifies the project and is designed to ship inside a browser bundle, and a
 * service key, which bypasses every policy and must never leave a server. This
 * build has no server, so it only ever holds the first. Putting it in an
 * environment variable would not hide it either — `NEXT_PUBLIC_*` is inlined
 * into the same bundle at build time, so the exposure is identical. What it
 * would buy is configurability, which is why the environment is still read
 * first: anybody pointing this at their own project sets two variables and
 * changes no code.
 *
 * What actually protects the data is row-level security. Every policy on
 * `workspaces` compares `auth.uid()` to the row's `user_id`, so this key can
 * read exactly one thing: the workspace belonging to whoever is signed in. With
 * no session it can read nothing at all.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  ?? 'https://kphcuwclzpssypkssebt.supabase.co'

const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ?? 'sb_publishable_JUEPB2oNmIp4lJ1KUWQo5w_nP7-tRCT'

let client: SupabaseClient | null = null

/**
 * One client for the tab.
 *
 * Built lazily and only in the browser. Creating it at module scope would run
 * during the server render, where there is no storage for it to keep a session
 * in, and two clients in one tab race each other over the refresh token.
 */
export function supabase(): SupabaseClient | null {
  if (typeof window === 'undefined') return null
  if (client) return client
  try {
    client = createClient(URL, KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // The app has no callback route; sessions come from a password sign-in
        // rather than from a link with a token in the URL.
        detectSessionInUrl: false,
        storageKey: 'msme.auth',
      },
    })
    return client
  } catch {
    // A browser that refuses storage entirely. The app still runs on local
    // data; it simply cannot sign anybody in.
    return null
  }
}

/** Whether syncing is even possible here — false in a private window. */
export const canSync = (): boolean => supabase() !== null

/**
 * What went wrong, in words an owner can act on.
 *
 * Supabase's own messages are written for developers — "Invalid login
 * credentials", "AuthApiError" — and a person who has just mistyped a password
 * deserves better than a class name.
 */
export function readableAuthError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('invalid login credentials')) {
    return 'That email and password do not match. Check both, or create an account.'
  }
  if (m.includes('already registered') || m.includes('already been registered')) {
    return 'There is already an account with that email. Sign in instead.'
  }
  if (m.includes('password should be at least')) {
    return 'Use a password of at least six characters.'
  }
  if (m.includes('unable to validate email') || m.includes('invalid email')) {
    return 'That does not look like an email address.'
  }
  if (m.includes('email not confirmed')) {
    return 'That account has not been confirmed yet. Check your email for the link.'
  }
  if (m.includes('rate limit') || m.includes('too many')) {
    return 'Too many attempts just now. Wait a minute and try again.'
  }
  if (m.includes('failed to fetch') || m.includes('network')) {
    return 'Could not reach the server. Check your connection and try again.'
  }
  return message
}
