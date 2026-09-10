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

/** Applies a theme change — used around the theme toggle. */
export function crossfadeTheme(apply: () => void) {
  // This used to hand the browser two page snapshots and let it crossfade
  // between them. Once the panes became frosted, capturing a snapshot of a
  // page with three layers of backdrop-filter took over a second before the
  // theme even applied — measured at 1057, 1119 and 1154ms for three
  // consecutive toggles, against 313ms before the frost. A toggle that lags
  // a second is worse than one that does not fade, so it switches at once.
  // (The ::view-transition rules left in globals.css are inert while this
  // function does not start one; they are kept as the guard for reduced
  // motion should it ever come back.)
  apply()
}
