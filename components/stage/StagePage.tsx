'use client'
import Link from 'next/link'
import { useState } from 'react'
import { PageHeader } from '@/components/shell/PageHeader'
import { Button, Card, Pill } from '@/components/ui/bits'
import { Dialog } from '@/components/ui/Dialog'
import { BUILD_SEQUENCE, type Stage } from '@/lib/seed/stages'

/**
 * A stage page is honest when it separates three things and labels each: what is
 * live, what is queued and when, and what is deliberately excluded.
 */
export function StagePage({ stage, children }: { stage: Stage; children?: React.ReactNode }) {
  const [lock, setLock] = useState<Stage['modules'][number] | null>(null)
  const live = stage.modules.filter((m) => m.href)
  const notBuilt = stage.modules.filter((m) => !m.href)

  return (
    <>
      <PageHeader eyebrow={`Stage ${stage.no} · of five`} title={stage.label}
        meta={<Pill tone={live.length ? 'accent' : 'neutral'}>
          {live.length ? `${live.length} live` : 'nothing live yet'}
        </Pill>} />

      <p className="mb-4 max-w-3xl text-[13.5px] leading-relaxed text-ink-2">{stage.summary}</p>

      <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {stage.problems.map((p, i) => (
          <div key={p.title} style={{ '--i': i } as React.CSSProperties}
               className="anim-fade-up lift rounded-lg border border-line bg-surface p-3.5">
            <h3 className="text-[13.5px] leading-snug">{p.title}</h3>
            <p className="mt-1 text-[12px] leading-relaxed text-ink-2">{p.detail}</p>
            {p.answeredBy
              ? <p className="mt-2 text-[11px] font-medium text-accent">Answered by {p.answeredBy}</p>
              : <p className="mt-2 text-[11px] text-ink-3">Not answered in this build.</p>}
          </div>
        ))}
      </div>

      {children}

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <Card index={6} title="Modules" sub="What you can open here, and what you cannot yet">
          <ul className="divide-y divide-line-soft">
            {live.map((m) => (
              <li key={m.label}>
                <Link href={m.href!} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2">
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium">{m.label}</span>
                    {m.note && <span className="block text-[11.5px] text-ink-3">{m.note}</span>}
                  </span>
                  <span className="ml-auto text-[11px] font-medium text-accent">Open →</span>
                </Link>
              </li>
            ))}
            {notBuilt.map((m) => (
              <li key={m.label}>
                <button type="button" onClick={() => setLock(m)}
                  aria-label={`${m.label} — not available yet, opens an explanation`}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-2">
                  <span className="min-w-0">
                    <span className="block text-[13px] text-ink-3">{m.label}</span>
                  </span>
                  <span className="mono ml-auto text-[10.5px] uppercase tracking-wide text-ink-3">
                    {m.lock!.excludedReason ? 'excluded' : m.lock!.phase}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <Card index={7} title="Where this sits in the build" sub="§14 · ship SRC-01 v2 first and it stalls">
          <ol className="divide-y divide-line-soft">
            {BUILD_SEQUENCE.map((s) => (
              <li key={s.phase} className="flex gap-3 px-4 py-2">
                <span className="mono w-16 shrink-0 pt-0.5 text-[11px] text-ink-3">{s.phase}</span>
                <span className="min-w-0">
                  <span className="block text-[12.5px]">{s.what}</span>
                  {s.note && <span className="block text-[11px] text-ink-3">{s.note}</span>}
                </span>
              </li>
            ))}
          </ol>
        </Card>
      </div>

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
