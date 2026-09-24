'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * An owner's screen that now lives somewhere else.
 *
 * The address still answers — a bookmark, a link in an old message — and
 * takes them straight to where the thing is now, replacing the history entry
 * so Back does not bounce them here again. The sample company keeps its own
 * page on the same address; this is only ever rendered for an owner.
 */
export function Moved({ to }: { to: string }) {
  const router = useRouter()
  useEffect(() => { router.replace(to) }, [router, to])
  return <div className="min-h-[50vh]" aria-hidden />
}
