'use client'
import { useEffect, useState } from 'react'
import { Dialog } from './Dialog'
import { Icon } from './icons'

/**
 * One question at a time.
 *
 * "If I ask all this data in just one window, it's overwhelming. You break it
 * into step one, step two, step three, so it looks easy — they feel like
 * achieving milestones." That is the whole idea, and it is why this exists
 * rather than another long pane: the same fields, the same validation and the
 * same result, arranged so that a person can see the end of the thing they have
 * started.
 *
 * Three rules the steps rely on:
 *
 * - A step cannot be left until it is valid, and the reason is shown on the
 *   step rather than collected into a summary at the end. Being told at step
 *   five that step two was wrong is how a form loses somebody.
 * - Going back never discards what was typed ahead of you. The draft is the
 *   caller's state, so Back is just an index change.
 * - Closing keeps the draft. Somebody who breaks off to go and look at a
 *   delivery note comes back to the step they left, not to a blank form.
 */
export interface WizardStep {
  /** short, for the rail — "Name", not "Enter the material name" */
  label: string
  /** the question, in full */
  title: string
  /** one line on why it is being asked; the answer to "why do you need this?" */
  why?: string
  body: React.ReactNode
  /** null when the step may be left; a sentence when it may not */
  invalid?: string | null
}

export function Wizard({
  open, onClose, title, sub, steps, onDone, doneLabel = 'Done', busy, wide = true,
}: {
  open: boolean
  onClose: () => void
  title: string
  sub?: string
  steps: WizardStep[]
  onDone: () => void
  doneLabel?: string
  busy?: boolean
  wide?: boolean
}) {
  const [i, setI] = useState(0)
  const [tried, setTried] = useState(false)

  // A fresh open starts at the first step; the caller keeps the answers, so a
  // half-finished material is still there when the wizard is opened again.
  useEffect(() => { if (open) { setI(0); setTried(false) } }, [open])

  if (!open) return null
  const at = Math.min(i, steps.length - 1)
  const step = steps[at]
  const last = at === steps.length - 1
  const blocked = step.invalid ?? null

  const go = (to: number) => { setI(to); setTried(false) }

  const next = () => {
    if (blocked) { setTried(true); return }
    if (last) { onDone(); return }
    go(at + 1)
  }

  return (
    <Dialog open onClose={onClose} title={title} sub={sub} wide={wide}>
      {/* The rail is the milestone: how many, which one, and how far along. */}
      <div className="border-b border-line-soft px-4 pb-3 pt-3">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <span className="mono text-[10.5px] uppercase tracking-wider text-ink-3">
            Step {at + 1} of {steps.length}
          </span>
          <span className="mono text-[10.5px] text-ink-3">{step.label}</span>
        </div>
        <ol className="flex items-center gap-1">
          {steps.map((s, n) => {
            const done = n < at
            const here = n === at
            return (
              <li key={s.label} className="flex min-w-0 flex-1 items-center gap-1">
                <button
                  type="button"
                  onClick={() => { if (n <= at) go(n) }}
                  disabled={n > at}
                  aria-current={here ? 'step' : undefined}
                  title={n <= at ? `Back to: ${s.title}` : s.title}
                  className={`h-1.5 w-full rounded-full transition-colors ${
                    done ? 'bg-accent-ink' : here ? 'bg-accent' : 'bg-surface-3'
                  } ${n <= at ? 'cursor-pointer' : 'cursor-default'}`}>
                  <span className="sr-only">{`Step ${n + 1}: ${s.title}`}</span>
                </button>
              </li>
            )
          })}
        </ol>
      </div>

      <div key={at} className="anim-fade-in space-y-3 px-4 py-4">
        <div>
          <h3 className="text-[15px] font-bold leading-tight tracking-tight">{step.title}</h3>
          {step.why && <p className="mt-1 text-[12px] leading-snug text-ink-2">{step.why}</p>}
        </div>
        {step.body}
        {tried && blocked && (
          <p role="alert" className="flex items-start gap-1.5 rounded-md border border-critical/30 bg-critical-soft px-2.5 py-2 text-[12px] leading-snug text-critical">
            <Icon name="alert" className="mt-px size-3.5 shrink-0" />
            {blocked}
          </p>
        )}
      </div>

      <footer className="flex items-center gap-2 border-t border-line-soft px-4 py-3">
        {at > 0 ? (
          <button type="button" onClick={() => go(at - 1)}
            className="press inline-flex items-center gap-1 rounded-md border border-line bg-surface px-2.5 py-1.5 text-[12.5px] font-medium text-ink hover:bg-surface-2">
            <Icon name="chevron" className="size-3 rotate-180" />
            Back
          </button>
        ) : (
          <button type="button" onClick={onClose}
            className="press rounded-md px-2 py-1.5 text-[12.5px] text-ink-2 hover:text-ink">
            Not now
          </button>
        )}
        <span className="ml-auto" />
        {!last && (
          <span className="hidden text-[11.5px] text-ink-3 sm:inline">
            {steps.length - at - 1} more
          </span>
        )}
        <button type="button" onClick={next} disabled={busy}
          className={`press inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[13px] font-medium disabled:opacity-40 ${
            blocked && tried
              ? 'border-line bg-surface text-ink-3'
              : 'border-accent-ink bg-accent-ink text-on-accent hover:bg-accent'}`}>
          {last ? doneLabel : 'Next'}
          {!last && <Icon name="chevron" className="size-3" />}
        </button>
      </footer>
    </Dialog>
  )
}
