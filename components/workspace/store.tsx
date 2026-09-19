'use client'
import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react'
import type { SeedBundle } from '@/lib/domain/derive'
import { SAMPLE_BUNDLE, bundleFor } from '@/lib/workspace/bundle'
import { emptyWorkspace } from '@/lib/workspace/defaults'
import { browserStore, type Stored, type WorkspaceStore } from '@/lib/workspace/storage'
import { chosen, fetchRemote, pushRemote, resolve } from '@/lib/workspace/remote'
import { useAuth } from './auth'
import type { PersonRole, Session, Workspace, WorkspaceMode } from '@/lib/workspace/types'

/**
 * Where the workspace stands against the copy in the database.
 *
 * `off` is the ordinary case and not a failure: nobody has signed in, so the
 * data lives on this device and nowhere else, exactly as it always has.
 */
export type SyncState = 'off' | 'loading' | 'saving' | 'synced' | 'error'

export interface Sync {
  state: SyncState
  /** when a copy was set aside on sign-in, the sentence saying which */
  note: string | null
  /** what went wrong, in words worth showing */
  error: string | null
}

/**
 * Which company the screens are reading.
 *
 * Two modes, one engine. `sample` is the demo company this build has always
 * shown — the seed, its figures and every worked example in it, untouched.
 * `mine` is the owner's own company, empty on the day they sign in and filled
 * by the set-up steps. Both arrive at the screens as a `SeedBundle`, so there
 * is no second code path to keep honest.
 *
 * The workspace is read from storage after mount rather than during render.
 * Storage does not exist on the server, and a value read during render that the
 * server could not see is the classic hydration mismatch. `ready` says whether
 * that read has happened, so a screen that must not guess — the root, choosing
 * between the sign-in and the dashboard — can wait one frame instead of
 * flashing the wrong one.
 */
export const SAMPLE_SESSION: Session = { actor: 'A. Nandy · Buyer', role: 'buyer' }

interface WorkspaceCtx {
  mode: WorkspaceMode
  /** null until somebody signs in; always null in sample mode */
  workspace: Workspace | null
  session: Session
  bundle: SeedBundle
  /** the date the owner's company is reckoned against; the sample's is fixed */
  today: string
  /** has storage been read yet — false for the first frame only */
  ready: boolean
  hasAccount: boolean
  /** storage refused to keep it: a private window, a full quota */
  persistent: boolean
  /** how the browser copy stands against the database's */
  sync: Sync
  /** push the current workspace up now rather than on the usual delay */
  syncNow: () => void
  /** stop showing the sentence about a copy that was set aside */
  clearSyncNote: () => void
  /**
   * The visitor is already inside the app, so the root shows the dashboard
   * rather than the sign-in. True when they asked for the sample company by URL
   * (`?company=sample`), when they arrived on any screen other than the root,
   * and once they have chosen to look around. Without it, clicking Overview in
   * the nav would throw somebody browsing the sample company back out to a
   * sign-in screen they had already declined.
   */
  insideApp: boolean
  /** they chose to look around rather than set their own company up */
  browseSample: () => void
  createWorkspace: (input: {
    ownerName: string; contact: string; companyName: string; makes: string; role?: PersonRole
  }) => void
  /** the single write path — every set-up step goes through it */
  update: (fn: (ws: Workspace) => Workspace) => void
  setMode: (m: WorkspaceMode) => void
  signOut: () => void
}

const Ctx = createContext<WorkspaceCtx>(null!)
export const useWorkspace = () => useContext(Ctx)

/** A stable key per company, so switching remounts the stores with clean state. */
export const useWorkspaceKey = () => {
  const { mode, workspace } = useWorkspace()
  return mode === 'mine' && workspace ? workspace.id : 'sample'
}

const todayIso = () => new Date().toISOString().slice(0, 10)

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [store, setStore] = useState<WorkspaceStore | null>(null)
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [session, setSession] = useState<Session>(SAMPLE_SESSION)
  const [mode, setModeState] = useState<WorkspaceMode>('sample')
  const [ready, setReady] = useState(false)
  const [persistent, setPersistent] = useState(true)
  const [today, setToday] = useState(SAMPLE_BUNDLE.today)
  const [insideApp, setInsideApp] = useState(false)
  const [sync, setSync] = useState<Sync>({ state: 'off', note: null, error: null })

  const { account } = useAuth()
  /*
   * The latest workspace, readable from a timer without making the timer
   * depend on it. A debounced push that closed over `workspace` would either
   * send a stale copy or be torn down and rebuilt on every keystroke.
   */
  const latest = useRef<Workspace | null>(null)
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const s = browserStore()
    setStore(s)
    const asked = new URLSearchParams(window.location.search).get('company') === 'sample'
    // Landing anywhere but the root means they followed a link into a screen,
    // not that they are a first-time visitor deciding whether to sign up.
    setInsideApp(asked || window.location.pathname !== '/')
    const held = s.load()
    if (held) {
      setWorkspace(held.workspace)
      setSession(held.session)
      if (!asked) setModeState(held.mode ?? 'mine')
    }
    setToday(todayIso())
    setReady(true)
  }, [])

  latest.current = workspace

  /**
   * Send the workspace up.
   *
   * Only ever called for a signed-in account, and deliberately quiet about
   * failure beyond setting the state: the browser copy is already written by
   * the time this runs, so a dropped connection costs nothing but freshness.
   */
  const push = useCallback(async (ws: Workspace, userId: string) => {
    setSync((s0) => ({ ...s0, state: 'saving', error: null }))
    try {
      await pushRemote(userId, ws)
      setSync((s0) => ({ ...s0, state: 'synced', error: null }))
    } catch (e) {
      setSync((s0) => ({
        ...s0,
        state: 'error',
        error: `${(e as Error).message} — your work is saved on this device.`,
      }))
    }
  }, [])

  /**
   * Push after a pause rather than on every change.
   *
   * Typing a supplier's name is a dozen renders; a round trip for each would be
   * a dozen wasted writes and a visibly busy indicator. Two seconds of quiet is
   * the signal that somebody has finished a thought.
   */
  const schedulePush = useCallback((ws: Workspace) => {
    if (!account) return
    if (pushTimer.current) clearTimeout(pushTimer.current)
    pushTimer.current = setTimeout(() => { void push(ws, account.id) }, 2000)
  }, [account, push])

  const persist = useCallback((ws: Workspace, sess: Session, m: WorkspaceMode) => {
    if (!store) return
    setPersistent(store.save({ workspace: ws, session: sess, mode: m }))
    schedulePush(ws)
  }, [store, schedulePush])

  const createWorkspace = useCallback<WorkspaceCtx['createWorkspace']>((input) => {
    const ws = emptyWorkspace({
      id: `WS-${Date.now().toString(36).toUpperCase()}`,
      createdAt: todayIso(),
      ...input,
    })
    const sess: Session = { actor: ws.owner.name, role: input.role ?? 'owner' }
    setWorkspace(ws)
    setSession(sess)
    setModeState('mine')
    persist(ws, sess, 'mine')
  }, [persist])

  const update = useCallback<WorkspaceCtx['update']>((fn) => {
    setWorkspace((prev) => {
      if (!prev) return prev
      const next = fn(prev)
      if (store) {
        setPersistent(store.save({
          workspace: next, session: { actor: next.owner.name, role: 'owner' }, mode: 'mine',
        }))
        schedulePush(next)
      }
      return next
    })
  }, [store, schedulePush])

  /**
   * Signing in joins the two copies together.
   *
   * Runs once per account change, never on an ordinary render. Which copy wins
   * is decided by `resolve` in `remote.ts` — a pure function, so the one rule
   * here that can lose somebody's work is readable and tested rather than
   * tangled up in this effect.
   */
  useEffect(() => {
    if (!store || !ready) return
    if (!account) {
      // signed out, or never signed in: the device copy is all there is
      setSync({ state: 'off', note: null, error: null })
      return
    }

    let alive = true
    setSync({ state: 'loading', note: null, error: null })

    ;(async () => {
      try {
        const local = store.load()
        const remote = await fetchRemote()
        if (!alive) return

        const decision = resolve(local, remote)
        const take = chosen(decision, local, remote)

        if (decision.take === 'remote' && take) {
          // adopt the account's copy, and write it down here so a reload
          // without a connection still shows what was just seen
          const sess: Session = { actor: take.owner.name, role: 'owner' }
          setWorkspace(take)
          setSession(sess)
          setModeState('mine')
          setPersistent(store.save({ workspace: take, session: sess, mode: 'mine' }))
        }

        if (decision.take !== 'neither' && decision.push && take) {
          await pushRemote(account.id, take)
        }
        if (!alive) return

        setSync({
          state: 'synced',
          note: decision.take === 'neither' ? null : decision.note,
          error: null,
        })
      } catch (e) {
        if (!alive) return
        setSync({
          state: 'error',
          note: null,
          error: `${(e as Error).message} — working from this device's copy.`,
        })
      }
    })()

    return () => { alive = false }
  }, [account, store, ready])

  const syncNow = useCallback(() => {
    const ws = latest.current
    if (!account || !ws) return
    if (pushTimer.current) clearTimeout(pushTimer.current)
    void push(ws, account.id)
  }, [account, push])

  const clearSyncNote = useCallback(() => setSync((s0) => ({ ...s0, note: null })), [])

  const signOut = useCallback(() => {
    store?.clear()
    setWorkspace(null)
    setSession(SAMPLE_SESSION)
    setModeState('sample')
    // Signing out means no longer being inside, so the root asks who this is
    // again rather than leaving the last company's dashboard on screen.
    setInsideApp(false)
  }, [store])

  const browseSample = useCallback(() => {
    setInsideApp(true)
    setModeState('sample')
    if (workspace) persist(workspace, session, 'sample')
  }, [workspace, session, persist])

  /** The sample is never written to, so switching to it is just a different read. */
  const setMode = useCallback((m: WorkspaceMode) => {
    setInsideApp(true)
    const to = workspace ? m : 'sample'
    setModeState(to)
    const sess = to === 'mine' && workspace
      ? { actor: workspace.owner.name, role: 'owner' as const }
      : SAMPLE_SESSION
    setSession(sess)
    if (workspace) persist(workspace, sess, to)
  }, [workspace, persist])

  const bundle = useMemo(
    () => (mode === 'mine' && workspace ? bundleFor(workspace, today) : SAMPLE_BUNDLE),
    [mode, workspace, today],
  )

  const value = useMemo<WorkspaceCtx>(() => ({
    mode: mode === 'mine' && workspace ? 'mine' : 'sample',
    workspace: mode === 'mine' ? workspace : null,
    session, bundle,
    today: mode === 'mine' && workspace ? today : SAMPLE_BUNDLE.today,
    ready,
    hasAccount: workspace != null,
    persistent,
    sync, syncNow, clearSyncNote,
    insideApp,
    createWorkspace, update, setMode, signOut, browseSample,
  }), [mode, workspace, session, bundle, today, ready, persistent, insideApp,
    sync, syncNow, clearSyncNote,
    createWorkspace, update, setMode, signOut, browseSample])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
