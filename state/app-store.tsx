'use client'
import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { Derived } from '@/lib/domain/types'

/** §7 audit_log / §11 — what happened, when, on what data, on whose authority. */
export interface AuditEntry {
  id: number
  at: string
  actor: string
  entity: string
  entityId: string
  action: string
  detail: string
  reason?: string
  before?: string
  after?: string
}

export const ACTOR = 'A. Nandy · Buyer'

interface AppCtx {
  audit: AuditEntry[]
  log: (e: Omit<AuditEntry, 'id' | 'at' | 'actor'> & { actor?: string }) => void
  /** Removes the newest entry for an entity — used when an action is reversed. */
  undoLast: (entity: string, entityId: string) => void
  inspect: Derived<unknown> | null
  openInspect: (d: Derived<unknown>) => void
  closeInspect: () => void
  toast: string | null
  say: (m: string) => void
}

const Ctx = createContext<AppCtx>(null!)
export const useApp = () => useContext(Ctx)

let seq = 0

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [audit, setAudit] = useState<AuditEntry[]>([])
  const [inspect, setInspect] = useState<Derived<unknown> | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const log = useCallback<AppCtx['log']>((e) => {
    // Client-only timestamp: the seed's `today` is fixed, but an audit entry
    // records when a person actually acted.
    // A full date-time: "when" has to survive more than one working day (§11).
    const at = new Date().toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
    setAudit((prev) => [{ id: ++seq, at, actor: ACTOR, ...e }, ...prev])
  }, [])

  const undoLast = useCallback((entity: string, entityId: string) => {
    setAudit((prev) => {
      const i = prev.findIndex((x) => x.entity === entity && x.entityId === entityId)
      return i < 0 ? prev : [...prev.slice(0, i), ...prev.slice(i + 1)]
    })
  }, [])

  const say = useCallback((m: string) => {
    setToast(m)
    window.setTimeout(() => setToast((t) => (t === m ? null : t)), 4200)
  }, [])

  const value = useMemo(
    () => ({ audit, log, undoLast, inspect, openInspect: setInspect, closeInspect: () => setInspect(null), toast, say }),
    [audit, log, undoLast, inspect, toast, say],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
