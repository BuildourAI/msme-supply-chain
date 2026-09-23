'use client'
import { DeskOnly } from '@/components/sourcing/DeskOnly'
import { Orders } from '@/components/dispatch/desk/Orders'

export default function Page() {
  return <DeskOnly><Orders /></DeskOnly>
}
