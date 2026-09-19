/**
 * The same workspace, kept in Postgres as well as in the browser.
 *
 * Local first, deliberately. The browser copy stays the one the screens read,
 * so the app is instant and keeps working on a train; the database is what
 * makes the data survive a cleared browser and turn up on a second device. A
 * design where every keystroke waited on a network round trip would be worse
 * than what it replaced.
 *
 * The cost of that choice is that two devices can drift apart, so the rule for
 * settling it is written down here as a pure function rather than buried in an
 * effect — it is the one piece of this that can silently lose somebody's work,
 * and it deserves to be readable and tested.
 */
import { supabase } from './supabase'
import type { Stored } from './storage'
import type { Workspace } from './types'

export interface RemoteRow {
  workspace: Workspace
  /** when the database last accepted a write, set by a trigger, not the client */
  updatedAt: string
}

/* ------------------------------------------------------------------- read -- */

/** The signed-in person's workspace, or null if they have never saved one. */
export async function fetchRemote(): Promise<RemoteRow | null> {
  const db = supabase()
  if (!db) return null

  const { data, error } = await db
    .from('workspaces')
    .select('data, updated_at')
    .maybeSingle()

  // A missing row is not a failure — it is somebody's first sign-in. Anything
  // else is worth surfacing rather than swallowing into "no data".
  if (error) throw new Error(error.message)
  if (!data) return null

  return { workspace: data.data as Workspace, updatedAt: data.updated_at as string }
}

/* ------------------------------------------------------------------ write -- */

/**
 * Store the workspace against the signed-in user.
 *
 * `upsert` on `user_id` rather than insert-then-update: the table allows one
 * row per person, so this is a single round trip that works the first time and
 * every time after.
 */
export async function pushRemote(userId: string, ws: Workspace): Promise<void> {
  const db = supabase()
  if (!db) throw new Error('No connection to the database.')

  const { error } = await db
    .from('workspaces')
    .upsert({ user_id: userId, data: ws }, { onConflict: 'user_id' })

  if (error) throw new Error(error.message)
}

export async function deleteRemote(): Promise<void> {
  const db = supabase()
  if (!db) return
  // RLS narrows this to the caller's own row; the filter is belt and braces.
  const { data } = await db.auth.getUser()
  if (!data.user) return
  await db.from('workspaces').delete().eq('user_id', data.user.id)
}

/* --------------------------------------------------------------- settling -- */

export type Resolution =
  /** nothing anywhere: a genuinely new account */
  | { take: 'neither' }
  /** only the browser has one — send it up, which is also how an existing
   *  local-only workspace is migrated on first sign-in */
  | { take: 'local'; push: true; note: null }
  /** only the database has one — adopt it */
  | { take: 'remote'; push: false; note: null }
  /** both, and one is older. The loser is named rather than silently dropped. */
  | { take: 'local'; push: true; note: string }
  | { take: 'remote'; push: false; note: string }

/**
 * Which copy wins when a person signs in.
 *
 * Last write wins, by the two timestamps. That is the crude answer and it is
 * chosen knowingly: a real merge of two divergent workspaces needs a per-record
 * history this build does not keep, and a half-merge that silently interleaves
 * two versions of the same supplier would be worse than a clear choice.
 *
 * What the crude answer owes the person is honesty, so when a copy is set aside
 * the caller gets a sentence saying so, and the local copy is never destroyed —
 * it stays in the browser until the next save overwrites it.
 */
export function resolve(
  local: { savedAt?: string } | null,
  remote: RemoteRow | null,
): Resolution {
  if (!local && !remote) return { take: 'neither' }
  if (local && !remote) return { take: 'local', push: true, note: null }
  if (!local && remote) return { take: 'remote', push: false, note: null }

  // both exist
  const localAt = local!.savedAt ?? ''
  const remoteAt = remote!.updatedAt

  /*
   * A local copy with no timestamp predates this feature, so it is a workspace
   * somebody built before there was any syncing. It is theirs and it is real;
   * the database copy in that situation can only be something newer, so the
   * database wins — but the note says what happened.
   */
  if (localAt === '') {
    return {
      take: 'remote',
      push: false,
      note: 'This device had an older copy saved before syncing existed. '
        + 'The version from your account is being used instead.',
    }
  }

  if (Date.parse(remoteAt) > Date.parse(localAt)) {
    return {
      take: 'remote',
      push: false,
      note: 'Your account had newer changes than this device, so those are the ones shown.',
    }
  }
  return {
    take: 'local',
    push: true,
    note: 'This device had newer changes than your account, so those have been sent up.',
  }
}

/** What `resolve` decided, applied — the caller supplies the two candidates. */
export function chosen(
  resolution: Resolution,
  local: Stored | null,
  remote: RemoteRow | null,
): Workspace | null {
  if (resolution.take === 'neither') return null
  return resolution.take === 'remote'
    ? (remote?.workspace ?? null)
    : (local?.workspace ?? null)
}
