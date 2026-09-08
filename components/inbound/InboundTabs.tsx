'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Pill } from '@/components/ui/bits'
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
  return (
    <nav aria-label="Inbound systems"
         className="scroll-x mb-4 flex gap-1 overflow-x-auto border-b border-line">
      {INBOUND_TABS.map((t) => {
        const on = path === t.href
        const n = counts[t.href]
        return (
          <Link key={t.href} href={t.href} aria-current={on ? 'page' : undefined}
            className={`shrink-0 border-b-2 px-3 pb-2 pt-1 transition-colors ${
              on ? 'border-accent' : 'border-transparent hover:border-line'}`}>
            <span className="flex items-center gap-2">
              <span className={`text-[13px] font-medium ${on ? 'text-ink' : 'text-ink-2'}`}>{t.label}</span>
              {n > 0 && <Pill tone={on ? 'accent' : 'neutral'} mono>{n}</Pill>}
            </span>
            <span className="mono block text-[10.5px] text-ink-3">
              {t.code} · {n > 0 ? `${n} ${noun[t.href]}` : 'clear'}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
