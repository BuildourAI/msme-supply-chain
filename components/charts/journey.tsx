'use client'
import Link from 'next/link'
import { Icon } from '@/components/ui/icons'
import { shortDate } from '@/lib/domain/format'
import type { Journey, JourneyDoc, JourneyStep } from '@/lib/workspace/journeys'

/**
 * Where a record has got to, drawn as a row of steps (the styles are the
 * `jr-` rules in globals.css; the steps come from lib/workspace/journeys.ts).
 *
 * A disc per step — navy when done, a navy ring where it is now, a ring
 * filling when part-way, grey ahead, dashed where it was never needed — and
 * the line between two steps carrying what happens between them. Late is the
 * only red, and only on the step holding it up.
 *
 * Papers sit under their step as chips. A job card opens its card; anything
 * else opens only where the screen says how, through `onDoc`.
 */

const STATE_WORD: Record<JourneyStep['state'], string> = {
  done: 'done', part: 'part-way', now: 'where it is now', next: 'not yet', skip: 'not needed',
}

const docHref = (d: JourneyDoc): string | undefined =>
  d.kind === 'job' ? `/production/jobs?card=${d.id}` : undefined

function Ring({ pct, late }: { pct: number; late: boolean }) {
  const r = 25
  const c = 2 * Math.PI * r
  return (
    <svg className="jr-ring" viewBox="0 0 54 54" aria-hidden>
      <circle cx="27" cy="27" r={r} fill="none" stroke="var(--accent-icon)" strokeWidth="3" />
      <circle cx="27" cy="27" r={r} fill="none" stroke={late ? 'var(--critical)' : 'var(--navy)'} strokeWidth="3.5"
        strokeLinecap="round" strokeDasharray={`${(c * pct) / 100} ${c}`} transform="rotate(-90 27 27)" />
    </svg>
  )
}

function Doc({ d, onDoc }: { d: JourneyDoc; onDoc?: (d: JourneyDoc) => void }) {
  const stop = (e: React.MouseEvent) => e.stopPropagation()
  if (onDoc && d.kind !== 'job') {
    return (
      <button type="button" className="jr-doc" data-doc={d.label}
        onClick={(e) => { stop(e); onDoc(d) }} title={`Open ${d.label}`}>{d.label}</button>
    )
  }
  const href = docHref(d)
  return href
    ? <Link href={href} className="jr-doc" data-doc={d.label} onClick={stop} title={`Open ${d.label}`}>{d.label}</Link>
    : <span className="jr-doc" data-doc={d.label}>{d.label}</span>
}

export function JourneyStrip({ journey, label, small = false, hideLate = false, onDoc, className = '' }: {
  journey: Journey<unknown>
  /** what it is the journey of, for a screen reader — "SO-8" */
  label: string
  /** the smaller discs, for a strip on every row of a list */
  small?: boolean
  /** the row's own header already says how late, so the step need not */
  hideLate?: boolean
  onDoc?: (d: JourneyDoc) => void
  className?: string
}) {
  const { steps, between } = journey
  const reached = (s: JourneyStep) => s.state === 'done' || s.state === 'part' || s.state === 'skip' || s.current
  return (
    <div className={`jr-box ${className}`}>
      <ol className={`jr ${small ? 'jr-sm' : ''}`} data-journey={label} aria-label={`Where ${label} is`}>
        {steps.map((s, i) => {
          const late = Boolean(s.late)
          const line = between[i]
          const next = steps[i + 1]
          return [
            <li key={s.key} data-step={s.key} data-state={s.state} data-current={s.current ? '' : undefined}
              className={`jr-step jr-${s.state} ${late ? 'jr-late' : ''}`}>
              <span className="jr-disc">
                {s.state === 'part' && <Ring pct={s.pct ?? 0} late={late} />}
                <Icon name={s.icon} />
                {s.state === 'part' && <em className="jr-pct">{s.pct}%</em>}
              </span>
              <span className="jr-txt">
                <span className="jr-lbl">{s.label}</span>
                <span className="sr-only">: {s.state === 'part' ? `${s.pct}% done` : STATE_WORD[s.state]}{s.current && s.state === 'part' ? ', where it is now' : ''}</span>
                <span className="jr-dt num">{s.on ? shortDate(s.on) : ''}</span>
                {s.sub && <span className={`jr-sub ${s.warn ? 'warn' : ''}`}>{s.sub}</span>}
                {s.docs && s.docs.length > 0 && (
                  <span className="jr-docs">{s.docs.map((d) => <Doc key={`${d.kind}-${d.id}`} d={d} onDoc={onDoc} />)}</span>
                )}
                {late && !hideLate && (
                  <span className="jr-pill" data-late><Icon name="alert" className="size-3" />{s.late}</span>
                )}
              </span>
            </li>,
            next && (
              <li key={`${s.key}-line`} className={`jr-line ${reached(next) ? '' : 'ahead'} ${line?.late ? 'late' : ''}`}
                data-line={line?.text}>
                {line && <span>{line.text}</span>}
              </li>
            ),
          ]
        })}
      </ol>
    </div>
  )
}

/** A dot a step and a word — where a record is, for a row on a phone. */
export function JourneyDots({ journey }: { journey: Journey<unknown> }) {
  const { steps } = journey
  const reached = (s: JourneyStep) => s.state === 'done' || s.state === 'part' || s.state === 'skip' || s.current
  const late = journey.late > 0
  return (
    <span className="flex shrink-0 flex-col items-end gap-1" data-dots>
      <span className="jr-dots" aria-hidden>
        {steps.map((s, i) => {
          const cls = s.state === 'done' ? 'd' : s.state === 'skip' ? 's'
            : s.state === 'part' ? (s.late ? 'pl' : 'p') : s.current ? (s.late ? 'l' : 'n') : ''
          return [
            <i key={s.key} className={cls} style={{ '--p': `${s.pct ?? 0}%` } as React.CSSProperties} />,
            i < steps.length - 1 && <b key={`${s.key}-b`} className={reached(steps[i + 1]) ? '' : 'a'} />,
          ]
        })}
      </span>
      <small className={`whitespace-nowrap text-[11px] ${late ? 'font-semibold text-critical' : 'text-ink-2'}`}>
        {/* late at the gate is against the owner's rule, so it says how long it has waited instead */}
        {!late ? journey.word : /at the gate$/.test(journey.lateShort ?? '') ? journey.lateShort : `${journey.word} · ${journey.lateShort}`}
      </small>
    </span>
  )
}
