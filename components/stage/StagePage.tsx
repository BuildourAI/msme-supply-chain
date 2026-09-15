'use client'
import Link from 'next/link'
import { useState } from 'react'
import { Card, Pill } from '@/components/ui/bits'
import { Icon } from '@/components/ui/icons'
import { LockDialog, type Locked } from '@/components/shell/LockDialog'
import { StageStrip } from '@/components/stage/StageStrip'
import { NodeDiagram } from '@/components/stage/NodeDiagram'
import { BUILD_SEQUENCE, type Problem, type Stage } from '@/lib/seed/stages'

/**
 * A stage page is the display page for that stage, set as a slide: the claim
 * the stage makes, the figures that back it, a picture of what is built and
 * what is not, and then the pains it exists to remove.
 *
 * The pains carry one line each here. The full brief — what each costs in this
 * dataset and the mechanism that removes it — is a page of its own, linked
 * across. Saying the same thing twice at two different lengths is how a demo
 * starts contradicting itself.
 */

const PAINKILLERS = 'Painkillers solved'

const STATE_TONE = { live: 'good', planned: 'warn', unsolved: 'critical' } as const
const STATE_LABEL = { live: 'Removed', planned: 'Part', unsolved: 'Open' } as const
const stateOf = (p: Problem) => p.state ?? (p.answeredBy ? 'live' : 'unsolved')

export function StagePage({ stage, children }: { stage: Stage; children?: React.ReactNode }) {
  const [lock, setLock] = useState<Locked | null>(null)
  const live = stage.modules.filter((m) => m.href && m.label !== PAINKILLERS)
  const painkillers = stage.modules.find((m) => m.label === PAINKILLERS)
  const removed = stage.problems.filter((p) => stateOf(p) === 'live').length

  return (
    <>
      {/* the slide ground. It bleeds to the edges of <main> with a negative
          margin so the dot grid runs to the chrome, the way the reference's
          slides run to the edge of the page rather than sitting in a box. */}
      <section className="dots -mx-3 mb-3 border-b border-line px-3 pb-4 pt-1 lg:-mx-4 lg:px-4">
        <div className="mb-2.5 flex flex-wrap items-end gap-x-4 gap-y-2">
          <p className="micro micro-rule">Stage {stage.no} · of five</p>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <span className="mono rounded-lg border border-line bg-surface px-2 py-0.5 text-[11px] text-ink-2">
              {stage.no}/5
            </span>
            <Pill tone={live.length ? 'accent' : 'neutral'}>
              {live.length ? `${live.length} modules live` : 'nothing live yet'}
            </Pill>
            <Pill tone={removed === stage.problems.length ? 'good' : removed ? 'warn' : 'critical'}>
              {removed} of {stage.problems.length} pains removed
            </Pill>
            {painkillers && (
              <Link href={painkillers.href!}
                className="press inline-flex items-center gap-1 rounded-lg border border-line bg-surface px-2.5 py-1 text-[11.5px] font-semibold text-accent-ink hover:bg-accent-soft">
                Painkillers solved →
              </Link>
            )}
          </div>
        </div>

        {/* The claim, at slide size. The key phrase and the stop are orange:
            at 40px and up, the fill-grade accent is large text and clears the
            contrast floor, which it would not at body size. */}
        <h1 className="max-w-[18ch] text-[34px] font-extrabold leading-[1.04] tracking-[-0.03em] sm:max-w-none sm:text-[40px] lg:text-[48px]">
          {stage.headline.pre}{' '}
          <span className="text-accent">{stage.headline.key}</span>
          {stage.headline.post.startsWith('.') ? '' : ' '}
          {stage.headline.post}
        </h1>
        <p className="mt-1.5 max-w-3xl text-[13px] leading-relaxed text-ink-2">{stage.summary}</p>
        <p className="mono mt-1 text-[10px] uppercase tracking-wider text-ink-3">{stage.label}</p>
      </section>

      <StageStrip stage={stage.id} />

      <NodeDiagram stage={stage} onLocked={(m) => setLock({ label: m.label, lock: m.lock! })} />

      <Card index={1} className="mb-3" title="The pains this stage exists to remove"
        sub="one line each — the full brief, with what each costs, is on the painkillers page"
        actions={painkillers && (
          <Link href={painkillers.href!} className="text-[11.5px] font-medium text-accent-ink hover:underline">
            Read the brief →
          </Link>
        )}>
        <div className="grid gap-px bg-line-soft sm:grid-cols-2">
          {stage.problems.map((p) => {
            const st = stateOf(p)
            return (
              <div key={p.title} className="flex gap-2.5 bg-surface px-3.5 py-2.5">
                <span aria-hidden className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-md ${
                  st === 'live' ? 'bg-accent-icon text-accent-ink'
                    : st === 'planned' ? 'bg-warn-soft text-warn' : 'bg-critical-soft text-critical'}`}>
                  <Icon name={st === 'live' ? 'check' : st === 'planned' ? 'clock' : 'alert'} className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="text-[12.5px] font-semibold">{p.title}</span>
                    <span className="shrink-0"><Pill tone={STATE_TONE[st]}>{STATE_LABEL[st]}</Pill></span>
                  </span>
                  <span className="mt-0.5 block text-[11.5px] leading-snug text-ink-3">{p.detail}</span>
                  {p.answeredBy && (
                    <span className={`mono mt-1 block text-[9.5px] uppercase tracking-wider ${
                      st === 'live' ? 'text-accent-ink' : 'text-warn'}`}>
                      {p.answeredBy}
                    </span>
                  )}
                </span>
              </div>
            )
          })}
        </div>
      </Card>

      {children}

      <Card index={2} className="mt-3" title="Where this sits in the build"
        sub="§14 · ship SRC-01 v2 first and it stalls — that is the sequencing mistake to avoid">
        <ol className="grid gap-x-5 sm:grid-cols-2 xl:grid-cols-3">
          {BUILD_SEQUENCE.map((s) => (
            <li key={s.phase} className="flex gap-2.5 border-b border-line-soft px-4 py-1.5">
              <span className="mono w-14 shrink-0 pt-0.5 text-[10.5px] text-ink-3">{s.phase}</span>
              <span className="min-w-0">
                <span className="block text-[12px] leading-snug">{s.what}</span>
                {s.note && <span className="block text-[10.5px] leading-snug text-ink-3">{s.note}</span>}
              </span>
            </li>
          ))}
        </ol>
      </Card>

      {/* the reference closes every slide on a hairline with the deck's own
          spine in it. Ours is the five stages, so the page always says where
          in the chain you are standing. */}
      <footer className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-2.5">
        <p className="text-[11.5px] text-ink-3">Built for honest material flow.</p>
        <p className="mono ml-auto text-[9.5px] uppercase tracking-wider text-ink-3">
          {['Source', 'Receive', 'Stock', 'Make', 'Ship'].map((w, i) => (
            <span key={w}>
              {i > 0 && <span className="px-1 text-ink-4">›</span>}
              <span className={i + 1 === stage.no ? 'text-accent-ink' : ''}>{w}</span>
            </span>
          ))}
        </p>
      </footer>

      <LockDialog lock={lock} onClose={() => setLock(null)} />
    </>
  )
}
