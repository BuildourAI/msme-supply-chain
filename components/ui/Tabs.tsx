'use client'
import Link from 'next/link'
import { useCallback, useLayoutEffect, useRef, useState } from 'react'

/**
 * One underline tab, four places. The page-level view switcher, the inbound
 * and inventory system tabs and the top nav each re-drew the same 2px accent
 * rule under the active item. Now one component draws it — and because there
 * is only one rule, it can move: a single indicator slides from the tab you
 * were on to the tab you chose instead of one border switching off as another
 * switches on.
 *
 * Structure is unchanged from the originals — role="tablist"/"tab" with
 * aria-selected for in-page views, a <nav> of links with aria-current for
 * routes — because the browser suites find these by role and name.
 */

export interface TabItem<T extends string> {
  id: T
  label: string
  /** a mono second line — the module code, a count, a hint */
  sub?: string
  /** a route makes the item a link; without one it is a button */
  href?: string
  /** an element beside the label — a count pill, usually */
  badge?: React.ReactNode
}

/**
 * Measures the active element inside a track and returns where the indicator
 * should be. Shared with the top nav, whose items are not tabs but which wants
 * the same moving rule.
 */
export function useSlidingIndicator<K extends string, E extends HTMLElement = HTMLDivElement>(active: K | undefined) {
  const items = useRef(new Map<K, HTMLElement>())
  const track = useRef<E>(null)
  const [pos, setPos] = useState<{ left: number; width: number } | null>(null)
  // the first measurement paints in place; only later ones slide
  const [settled, setSettled] = useState(false)

  const register = useCallback((key: K) => (el: HTMLElement | null) => {
    if (el) items.current.set(key, el); else items.current.delete(key)
  }, [])

  useLayoutEffect(() => {
    const measure = () => {
      const el = active ? items.current.get(active) : undefined
      if (!el || !track.current) { setPos(null); return }
      setPos({ left: el.offsetLeft, width: el.offsetWidth })
    }
    measure()
    const t = window.setTimeout(() => setSettled(true), 60)
    const ro = track.current && 'ResizeObserver' in window ? new ResizeObserver(measure) : null
    if (ro && track.current) ro.observe(track.current)
    // fonts arriving late change every width; re-measure once they are in
    document.fonts?.ready.then(measure).catch(() => {})
    return () => { window.clearTimeout(t); ro?.disconnect() }
  }, [active])

  return { track, register, pos, settled }
}

/**
 * The mark of the active tab: a very light accent pill behind it and the
 * accent rule beneath it, sliding together. `pill` positions the pill inside
 * the track — the page strips sit it on the rule, the nav insets it a little.
 */
export function TabIndicator({ pos, settled, pill = 'top-0 bottom-[3px]' }: {
  pos: { left: number; width: number } | null; settled: boolean; pill?: string
}) {
  if (!pos) return null
  const still = settled ? '' : 'tab-ink-still'
  const at = { transform: `translateX(${pos.left}px)`, width: pos.width }
  return (
    <>
      <span aria-hidden className={`tab-ink pointer-events-none absolute left-0 rounded-md bg-pill ${pill} ${still}`} style={at} />
      <span aria-hidden className={`tab-ink pointer-events-none absolute bottom-0 left-0 h-[2px] rounded-full bg-accent ${still}`} style={at} />
    </>
  )
}

export function Tabs<T extends string>({ items, value, onChange, label, className = '' }: {
  items: TabItem<T>[]; value: T; onChange?: (v: T) => void
  /** accessible name of the group */
  label: string
  className?: string
}) {
  const { track, register, pos, settled } = useSlidingIndicator(value)
  const linked = items.some((t) => t.href)

  const inner = (t: TabItem<T>, on: boolean) => (
    <>
      <span className="flex items-center gap-2">
        <span className={`text-[13px] font-medium transition-colors ${on ? 'text-accent' : 'text-ink-2'}`}>{t.label}</span>
        {t.badge}
      </span>
      {t.sub && <span className="mono block text-[10.5px] text-ink-3">{t.sub}</span>}
    </>
  )
  // Every tab wears the tint, not only the one you are on: the strip reads as
  // one green run of controls. The active tab is still unmistakable — a
  // stronger pill, the accent rule under it, and a teal label.
  //
  // pb-2.5: the originals were pb-2 plus a 2px border, and the indicator no
  // longer takes up space, so the extra 2px keeps every page's height as it was
  const cls = (on: boolean) =>
    `tab-item relative z-10 shrink-0 rounded-md px-3 pb-2.5 pt-1 text-left transition-colors ${
      on ? '' : 'bg-pill-2 hover:bg-pill'}`

  const list = items.map((t) => {
    const on = t.id === value
    return linked ? (
      <Link key={t.id} href={t.href!} ref={register(t.id)} aria-current={on ? 'page' : undefined}
        className={cls(on)}>
        {inner(t, on)}
      </Link>
    ) : (
      <button key={t.id} type="button" role="tab" aria-selected={on} ref={register(t.id)}
        onClick={() => onChange?.(t.id)} className={cls(on)}>
        {inner(t, on)}
      </button>
    )
  })

  const trackCls = 'relative flex gap-1'
  return linked ? (
    <nav aria-label={label} className={`scroll-x mb-4 overflow-x-auto border-b border-line ${className}`}>
      <div ref={track} className={trackCls}>{list}<TabIndicator pos={pos} settled={settled} /></div>
    </nav>
  ) : (
    <div role="tablist" aria-label={label} className={`scroll-x mb-4 overflow-x-auto border-b border-line ${className}`}>
      <div ref={track} className={trackCls}>{list}<TabIndicator pos={pos} settled={settled} /></div>
    </div>
  )
}
