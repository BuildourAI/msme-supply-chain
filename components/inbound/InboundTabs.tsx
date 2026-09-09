'use client'
import { usePathname } from 'next/navigation'
import { Pill } from '@/components/ui/bits'
import { Tabs } from '@/components/ui/Tabs'
import { useInbound } from './store'

export const INBOUND_TABS = [
  { href: '/inbound/receiving', label: 'Receiving & QC', code: 'INB-01' },
  { href: '/inbound/orders', label: 'Open orders', code: 'INB-02' },
  { href: '/inbound/jobwork', label: 'Jobwork register', code: 'INB-03' },
] as const

/**
 * The three systems are tabs and nav entries at the same time: the same three
 * routes, reachable from the header dropdown or from here without going back up.
 */
export function InboundTabs() {
  const path = usePathname()
  const { queue, outOfSync, challanRows } = useInbound()
  const counts: Record<string, number> = {
    '/inbound/receiving': queue.length,
    '/inbound/orders': outOfSync.filter((r) => !r.received).length,
    '/inbound/jobwork': challanRows.filter((r) => r.overdue).length,
  }
  const noun: Record<string, string> = {
    '/inbound/receiving': 'awaiting inspection',
    '/inbound/orders': 'out of sync',
    '/inbound/jobwork': 'overdue',
  }
  const items = INBOUND_TABS.map((t) => {
    const n = counts[t.href]
    return {
      id: t.href, href: t.href, label: t.label,
      sub: `${t.code} · ${n > 0 ? `${n} ${noun[t.href]}` : 'clear'}`,
      badge: n > 0 ? <Pill tone={path === t.href ? 'accent' : 'neutral'} mono>{n}</Pill> : undefined,
    }
  })
  return <Tabs items={items} value={path} label="Inbound systems" />
}
