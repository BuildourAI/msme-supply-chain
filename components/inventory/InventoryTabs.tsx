'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Pill } from '@/components/ui/bits'
import { useInventory } from './store'

export const INVENTORY_TABS = [
  { href: '/inventory/ledger', label: 'Stock ledger', code: 'INV-01' },
  { href: '/inventory/offcuts', label: 'Cutting & offcuts', code: 'INV-02' },
  { href: '/inventory/wastage', label: 'Wastage & loss', code: 'INV-03' },
] as const

export function InventoryTabs() {
  const path = usePathname()
  const { stockRows, cutRows, scrapRows } = useInventory()
  const counts: Record<string, number> = {
    '/inventory/ledger': stockRows.filter((r) => r.stale).length,
    '/inventory/offcuts': cutRows.filter((r) => r.belowPlan).length,
    '/inventory/wastage': scrapRows.filter((r) => r.over).length,
  }
  const noun: Record<string, string> = {
    '/inventory/ledger': 'unconfirmed',
    '/inventory/offcuts': 'below the nest plan',
    '/inventory/wastage': 'over target',
  }
  return (
    <nav aria-label="Inventory systems"
         className="scroll-x mb-4 flex gap-1 overflow-x-auto border-b border-line">
      {INVENTORY_TABS.map((t) => {
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
