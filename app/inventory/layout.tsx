'use client'
import { MovementSheet } from '@/components/inventory/MovementSheet'

/**
 * The movement sheet is opened from more than one screen — the stock ledger and
 * the offcut register both have a "documents" button — and the selected lot is
 * app-wide state. Mounting it here means any panel under Inventory can open it
 * without having to remember to render the dialog itself.
 */
export default function InventoryLayout({ children }: { children: React.ReactNode }) {
  return <>{children}<MovementSheet /></>
}
