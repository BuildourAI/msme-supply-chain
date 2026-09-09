'use client'
import { useEffect, useRef, useState } from 'react'

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Tween a number when it CHANGES after mount. The first render shows the real
 * value, so server and client agree and there is no count-up-from-zero flash on
 * load. The motion happens exactly when it means something: a supplier changed,
 * a policy knob moved, and the figure it feeds slides to its new value.
 */
export function useAnimatedNumber(value: number, ms = 560): number {
  const [shown, setShown] = useState(value)
  const prev = useRef(value)

  useEffect(() => {
    const from = prev.current
    const to = value
    prev.current = value
    if (from === to || !Number.isFinite(from) || !Number.isFinite(to) || reducedMotion()) {
      setShown(to)
      return
    }
    let raf = 0
    const t0 = performance.now()
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / ms)
      const eased = 1 - Math.pow(1 - p, 3)
      setShown(from + (to - from) * eased)
      if (p < 1) raf = requestAnimationFrame(step)
      else setShown(to)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value, ms])

  return shown
}

/** A class that flashes for a moment whenever `value` changes after mount. */
export function useFlash(value: unknown): string {
  const [on, setOn] = useState(false)
  const prev = useRef(value)

  useEffect(() => {
    if (Object.is(prev.current, value)) return
    prev.current = value
    if (reducedMotion()) return
    setOn(true)
    const t = window.setTimeout(() => setOn(false), 900)
    return () => window.clearTimeout(t)
  }, [value])

  return on ? 'flash' : ''
}

/** Briefly cross-fades every colour on the page — used around a theme toggle. */
export function crossfadeTheme(apply: () => void) {
  // One compositor-driven crossfade of a page snapshot. The old approach put a
  // CSS transition on every element in the document for 340ms; this hands the
  // browser two snapshots and lets it fade between them.
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown }
  if (reducedMotion() || typeof doc.startViewTransition !== 'function') { apply(); return }
  doc.startViewTransition(() => { apply() })
}
