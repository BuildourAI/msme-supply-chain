'use client'
import Link from 'next/link'
import { useState } from 'react'
import { PageHeader } from '@/components/shell/PageHeader'
import { Button, Card, Pill } from '@/components/ui/bits'
import { Dialog } from '@/components/ui/Dialog'
import { StageStrip } from '@/components/stage/StageStrip'
import { BUILD_SEQUENCE, type Problem, type Stage } from '@/lib/seed/stages'

/**
 * A stage page is the display page for that stage: its own headline figures
 * first, then what you can open, then the pains it exists to remove.
 *
 * The pains used to be four fat cards here and nothing else. They now have a
 * page of their own — with what each costs and the mechanism that removes it —
 * so this page carries the one-line version and links across. Saying the same
 * thing twice at two different lengths is how a demo starts contradicting
 * itself.
 */

const PAINKILLERS = 'Painkillers solved'

const STATE_TONE = { live: 'good', planned: 'warn', unsolved: 'critical' } as const
const STATE_LABEL = { live: 'Removed', planned: 'Part', unsolved: 'Open' } as const
const stateOf = (p: Problem) => p.state ?? (p.answeredBy ? 'live' : 'unsolved')

export function StagePage({ stage, children }: { stage: Stage; children?: React.ReactNode }) {
  const [lock, setLock] = useState<Stage['modules'][number] | null>(null)
  const live = stage.modules.filter((m) => m.href && m.label !== PAINKILLERS)
  const painkillers = stage.modules.find((m) => m.label === PAINKILLERS)
  const notBuilt = stage.modules.filter((m) => !m.href)
  const removed = stage.problems.filter((p) => stateOf(p) === 'live').length

  return (
    <>
      <PageHeader eyebrow={`Stage ${stage.no} · of five`} title={stage.label}
        meta={<>
          <Pill tone={live.length ? 'accent' : 'neutral'}>
            {live.length ? `${live.length} modules live` : 'nothing live yet'}
          </Pill>
          <Pill tone={removed === stage.problems.length ? 'good' : removed ? 'warn' : 'critical'}>
            {removed} of {stage.problems.length} pains removed
          </Pill>
        </>}
        actions={painkillers && (
          <Link href={painkillers.href!}
            className="press rounded-md border border-line px-2.5 py-1 text-[12px] font-medium text-accent shadow-sm hover:bg-accent-soft">
            Painkillers solved →
          </Link>
        )} />

      <StageStrip stage={stage.id} />

      <p className="mb-3 max-w-4xl text-[13px] leading-relaxed text-ink-2">{stage.summary}</p>

      <div className="mb-3 grid items-start gap-3 lg:grid-cols-[1fr_1.25fr]">
        <Card index={0} title="Open here"
          sub={live.length ? `${live.length} live · everything below is real data` : 'nothing live in this stage'}>
          {live.length > 0 && (
            <ul className="divide-y divide-line-soft">
              {live.map((m) => (
                <li key={m.label}>
                  <Link href={m.href!} className="flex items-center gap-3 px-4 py-2 hover:bg-surface-2">
                    <span className="min-w-0">
                      <span className="block text-[12.5px] font-medium">{m.label}</span>
                      {m.note && <span className="block text-[11px] text-ink-3">{m.note}</span>}
                    </span>
                    <span className="ml-auto shrink-0 text-[11px] font-medium text-accent">Open →</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {notBuilt.length > 0 && (
            <>
              <p className="mono border-y border-line-soft bg-surface-2 px-4 py-1 text-[9.5px] uppercase tracking-wider text-ink-3">
                not built — queued with a prerequisite, or excluded with a reason
              </p>
              <ul className="divide-y divide-line-soft">
                {notBuilt.map((m) => (
                  <li key={m.label}>
                    <button type="button" onClick={() => setLock(m)}
                      aria-label={`${m.label} — not available yet, opens an explanation`}
                      className="flex w-full items-center gap-3 px-4 py-1.5 text-left hover:bg-surface-2">
                      <span className="text-[12.5px] text-ink-3">{m.label}</span>
                      <span className="mono ml-auto shrink-0 text-[10px] uppercase tracking-wide text-ink-3">
                        {m.lock!.excludedReason ? 'excluded' : m.lock!.phase}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        <Card index={1} title="The pains this stage exists to remove"
          sub="one line each — the full brief, with what each costs, is on the painkillers page"
          actions={painkillers && (
            <Link href={painkillers.href!} className="text-[11.5px] font-medium text-accent hover:underline">
              Read the brief →
            </Link>
          )}>
          <ul className="divide-y divide-line-soft">
            {stage.problems.map((p) => {
              const st = stateOf(p)
              return (
                <li key={p.title} className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 px-4 py-2">
                  <span className="text-[12.5px] font-medium">{p.title}</span>
                  <span className="shrink-0"><Pill tone={STATE_TONE[st]}>{STATE_LABEL[st]}</Pill></span>
                  <span className="w-full text-[11.5px] leading-snug text-ink-3">{p.detail}</span>
                  {p.answeredBy && (
                    <span className={`w-full text-[11px] font-medium ${st === 'live' ? 'text-accent' : 'text-warn'}`}>
                      {p.answeredBy}
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        </Card>
      </div>

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

      <Dialog open={!!lock} onClose={() => setLock(null)} title={lock?.label ?? ''}
        sub={lock?.lock?.excludedReason ? 'Deliberately excluded' : `Planned — ${lock?.lock?.phase}`}>
        <div className="space-y-3 px-4 py-4 text-[13px] leading-relaxed text-ink-2">
          {lock?.lock?.excludedReason
            ? <p>{lock.lock.excludedReason}</p>
            : <>
                <p>Not built yet. It lands in <strong className="text-ink">{lock?.lock?.phase}</strong>.</p>
                <div className="rounded-md border border-line bg-surface-2 p-3">
                  <p className="mono text-[10px] uppercase tracking-wider text-ink-3">What it needs first</p>
                  <p className="mt-1 text-ink">{lock?.lock?.needs}</p>
                </div>
              </>}
          <div className="flex justify-end"><Button variant="primary" onClick={() => setLock(null)}>Understood</Button></div>
        </div>
      </Dialog>
    </>
  )
}
