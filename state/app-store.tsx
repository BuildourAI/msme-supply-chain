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
}

export const ACTOR = 'A. Nandy · Buyer'

interface AppCtx {
  audit: AuditEntry[]
  log: (e: Omit<AuditEntry, 'id' | 'at' | 'actor'> & { actor?: string }) => void
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
    const at = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    setAudit((prev) => [{ id: ++seq, at, actor: ACTOR, ...e }, ...prev])
  }, [])

  const say = useCallback((m: string) => {
    setToast(m)
    window.setTimeout(() => setToast((t) => (t === m ? null : t)), 4200)
  }, [])

  const value = useMemo(
    () => ({ audit, log, inspect, openInspect: setInspect, closeInspect: () => setInspect(null), toast, say }),
    [audit, log, inspect, toast, say],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
