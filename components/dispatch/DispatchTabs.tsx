'use client'
import { usePathname } from 'next/navigation'
import { Pill } from '@/components/ui/bits'
import { Tabs } from '@/components/ui/Tabs'
import { useDispatch } from './store'

export const DISPATCH_TABS = [
  { href: '/dispatch/despatch', label: 'Despatch notes', code: 'DSP-01' },
  { href: '/dispatch/documents', label: 'Document pack', code: 'DSP-02' },
  { href: '/dispatch/consignments', label: 'Consignments', code: 'DSP-03' },
  { href: '/dispatch/returns', label: 'Returns', code: 'DSP-04' },
] as const

export function DispatchTabs() {
  const path = usePathname()
  const { openOrders, notes, inTransit, rmaRows } = useDispatch()
  const counts: Record<string, number> = {
    '/dispatch/despatch': openOrders.filter((o) => o.overdue).length,
    '/dispatch/documents': notes.length,
    '/dispatch/consignments': inTransit.filter((r) => r.late).length,
    '/dispatch/returns': rmaRows.filter((r) => r.rma.state !== 'closed').length,
  }
  const noun: Record<string, string> = {
    '/dispatch/despatch': 'past the promise',
    '/dispatch/documents': 'packs ready',
    '/dispatch/consignments': 'overdue in transit',
    '/dispatch/returns': 'open',
  }
  const items = DISPATCH_TABS.map((t) => {
    const n = counts[t.href]
    return {
      id: t.href, href: t.href, label: t.label,
      sub: `${t.code} · ${n > 0 ? `${n} ${noun[t.href]}` : 'clear'}`,
      badge: n > 0 ? <Pill tone={path === t.href ? 'accent' : 'neutral'} mono>{n}</Pill> : undefined,
    }
  })
  return <Tabs items={items} value={path} label="Dispatch systems" />
}
