'use client'
import { Moved } from '@/components/shell/Moved'

/**
 * Issued to floor became the job cards' own work: material to the floor is
 * issued from each job card in Production, and every slip is on the stock
 * ledger. The address still answers, and lands where that is done now.
 */
export default function Page() {
  return <Moved to="/production/jobs" />
}
