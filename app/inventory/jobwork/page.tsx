'use client'
import { DeskOnly } from '@/components/sourcing/DeskOnly'
import { Jobwork } from '@/components/inventory/desk/Jobwork'

/** The store's own material in somebody else's shed. */
export default function Page() {
  return <DeskOnly><Jobwork /></DeskOnly>
}
