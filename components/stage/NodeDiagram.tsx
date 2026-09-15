'use client'
import Link from 'next/link'
import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { Icon, Logo, STAGE_ICON } from '@/components/ui/icons'
import type { Stage } from '@/lib/seed/stages'

const PAINKILLERS = 'Painkillers solved'

/**
 * The reference's node diagram, with one deliberate change of meaning.
 *
 * The reference draws five identical satellites round a logo — a decoration
 * that says nothing. Here the satellites are the modules you can actually
 * open, and the row underneath is what this stage does NOT have yet. So the
 * picture answers the only question a stage page is asked: what is real here,
 * and what is still a promise?
 *
 * The connectors are measured after mount rather than drawn at fixed
 * coordinates: the cards wrap at every breakpoint, and a hard-coded path is a
 * line pointing at where a card used to be. `null` until measured, so the
 * server and the first client paint agree.
 */

interface Line { d: string; tone: 'live' | 'gap' }

export function NodeDiagram({ stage, onLocked }: {
  stage: Stage
  onLocked: (m: Stage['modules'][number]) => void
}) {
  const live = stage.modules.filter((m) => m.href && m.label !== PAINKILLERS)
  const notBuilt = stage.modules.filter((m) => !m.href)

  const wrap = useRef<HTMLDivElement>(null)
  const hub = useRef<HTMLDivElement>(null)
  const nodes = useRef(new Map<string, HTMLElement>())
  const [lines, setLines] = useState<Line[] | null>(null)

  const register = useCallback((key: string) => (el: HTMLElement | null) => {
    if (el) nodes.current.set(key, el); else nodes.current.delete(key)
  }, [])

  useLayoutEffect(() => {
    const measure = () => {
      const w = wrap.current, h = hub.current
      if (!w || !h) return
      // below md the cards stack in one column and a curve between them is
      // just a line down the middle of the page — draw nothing
      if (w.getBoundingClientRect().width < 640) { setLines(null); return }
      const wr = w.getBoundingClientRect()
      const hr = h.getBoundingClientRect()
      const cx = hr.left - wr.left + hr.width / 2
      const cy = hr.top - wr.top + hr.height / 2
      const out: Line[] = []
      for (const [key, el] of nodes.current) {
        const r = el.getBoundingClientRect()
        const tone: Line['tone'] = key.startsWith('gap:') ? 'gap' : 'live'
        // anchor on the edge of the card that faces the hub
        const ax = r.left - wr.left + (tone === 'gap' ? r.width / 2
          : r.left - wr.left + r.width / 2 < cx ? r.width : 0)
        const ay = r.top - wr.top + (tone === 'gap' ? 0 : r.height / 2)
        const mx = (ax + cx) / 2
        out.push({
          tone,
          d: tone === 'gap'
            ? `M ${ax} ${ay} C ${ax} ${(ay + cy) / 2}, ${cx} ${(ay + cy) / 2}, ${cx} ${cy}`
            : `M ${ax} ${ay} C ${mx} ${ay}, ${mx} ${cy}, ${cx} ${cy}`,
        })
      }
      setLines(out)
    }
    measure()
    const ro = 'ResizeObserver' in window ? new ResizeObserver(measure) : null
    if (ro && wrap.current) ro.observe(wrap.current)
    document.fonts?.ready.then(measure).catch(() => {})
    return () => ro?.disconnect()
  }, [stage.id])

  // left and right columns of satellites, filled alternately so a stage with
  // three live modules does not leave one side empty
  const leftCol = live.filter((_, i) => i % 2 === 0)
  const rightCol = live.filter((_, i) => i % 2 === 1)

  const Satellite = ({ m }: { m: Stage['modules'][number] }) => (
    <Link ref={register(m.label)} href={m.href!}
      className="lift press group flex items-start gap-2.5 rounded-lg border border-line bg-surface p-2.5">
      <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-md bg-accent-icon text-accent-ink">
        <Icon name={STAGE_ICON[stage.id] ?? 'boxes'} className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12.5px] font-semibold leading-tight">{m.label}</span>
        {m.note && (
          <span className="mono mt-0.5 block truncate text-[9.5px] uppercase tracking-wider text-ink-3">
            {m.note}
          </span>
        )}
      </span>
      <span className="shrink-0 text-[11px] font-semibold text-accent-ink">Open →</span>
    </Link>
  )

  return (
    <div ref={wrap} className="relative mb-3">
      {/* drawn under the cards, and only once the cards have been measured */}
      {lines && (
        <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full"
             style={{ zIndex: 0 }}>
          {lines.map((l, i) => (
            <path key={i} d={l.d} fill="none" strokeWidth={1.25}
                  strokeDasharray={l.tone === 'gap' ? '3 4' : undefined}
                  stroke={l.tone === 'gap' ? 'var(--ink-4)' : 'var(--connector)'} />
          ))}
        </svg>
      )}

      {/* minmax(0,1fr), not 1fr: a grid track's default min-width is its
          content, so a long module note stretches the column past the page
          and `truncate` never gets the chance to bite. The extra column gap
          on md+ is the only air on this page, and it is what the connectors
          are drawn in. */}
      <div className="relative grid grid-cols-1 items-center gap-2.5 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:gap-x-9"
           style={{ zIndex: 1 }}>
        {/* grid-cols-1, not a bare `grid`: Tailwind's numbered columns are
            minmax(0,1fr), where an implicit track is min-content — which is
            what let a card overhang its own column and slide under the hub */}
        <div className="grid min-w-0 grid-cols-1 gap-2.5">{leftCol.map((m) => <Satellite key={m.label} m={m} />)}</div>

        <div ref={hub}
             className="glow mx-auto grid size-[104px] shrink-0 place-items-center rounded-xl border border-accent/30 bg-surface">
          <Logo className="size-8 text-accent" />
          <span className="mono mt-1 text-[9.5px] uppercase tracking-wider text-ink-3">
            Stage {stage.no}
          </span>
        </div>

        <div className="grid min-w-0 grid-cols-1 gap-2.5">{rightCol.map((m) => <Satellite key={m.label} m={m} />)}</div>
      </div>

      {notBuilt.length > 0 && (
        <div className="relative mt-2.5" style={{ zIndex: 1 }}>
          <p className="micro mb-1.5">Not built — the honest half of the picture</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {notBuilt.map((m) => (
              // Not disabled and not aria-disabled: it IS interactive — it opens
              // the reason. No border-dashed either; that pattern is reserved
              // for an illustrative figure and would read as "made up" here.
              <button key={m.label} ref={register('gap:' + m.label)} type="button"
                onClick={() => onLocked(m)}
                aria-label={`${m.label} — not available yet, opens an explanation`}
                className="press flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-2.5 py-2 text-left hover:bg-surface-3">
                <Icon name="lock" className="size-3.5 shrink-0 text-ink-4" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11.5px] leading-tight text-ink-2">{m.label}</span>
                  <span className="mono block truncate text-[9px] uppercase tracking-wider text-ink-3">
                    {m.lock!.excludedReason ? 'excluded · §12' : m.lock!.phase}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
