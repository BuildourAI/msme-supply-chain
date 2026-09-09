'use client'
import { usePathname } from 'next/navigation'
import { Pill } from '@/components/ui/bits'
import { Tabs } from '@/components/ui/Tabs'
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
  const items = INVENTORY_TABS.map((t) => {
    const n = counts[t.href]
    return {
      id: t.href, href: t.href, label: t.label,
      sub: `${t.code} · ${n > 0 ? `${n} ${noun[t.href]}` : 'clear'}`,
      badge: n > 0 ? <Pill tone={path === t.href ? 'accent' : 'neutral'} mono>{n}</Pill> : undefined,
    }
  })
  return <Tabs items={items} value={path} label="Inventory systems" />
}
