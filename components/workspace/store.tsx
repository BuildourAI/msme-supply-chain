'use client'
import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from 'react'
import type { SeedBundle } from '@/lib/domain/derive'
import { SAMPLE_BUNDLE, bundleFor } from '@/lib/workspace/bundle'
import { emptyWorkspace } from '@/lib/workspace/defaults'
import { browserStore, type WorkspaceStore } from '@/lib/workspace/storage'
import type { PersonRole, Session, Workspace, WorkspaceMode } from '@/lib/workspace/types'

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

  const persist = useCallback((ws: Workspace, sess: Session, m: WorkspaceMode) => {
    if (!store) return
    setPersistent(store.save({ workspace: ws, session: sess, mode: m }))
  }, [store])

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
      }
      return next
    })
  }, [store])

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
    insideApp,
    createWorkspace, update, setMode, signOut, browseSample,
  }), [mode, workspace, session, bundle, today, ready, persistent, insideApp,
    createWorkspace, update, setMode, signOut, browseSample])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
