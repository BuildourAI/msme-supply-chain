'use client'
import Link from 'next/link'
import { PageHeader } from '@/components/shell/PageHeader'
import { Card, Pill } from '@/components/ui/bits'
import type { Problem, Stage } from '@/lib/seed/stages'
import type { Tone } from '@/lib/domain/format'

/**
 * One page per stage answering the only question a client actually asks: which
 * of my problems does this remove, and how.
 *
 * The discipline here is the same one the executive dashboard runs on. A pain
 * gets three things and no fewer: what it costs today in THIS dataset rather
 * than a general claim, the mechanism that removes it rather than a promise
 * that it is "improved", and an honest state. A stage where two of four pains
 * are genuinely unanswered says so at the top, in the count, before anyone has
 * to read for it — a page that claims four out of four is worth nothing.
 */

const STATE: Record<NonNullable<Problem['state']>, {
  label: string; tone: Tone; blurb: string
}> = {
  live: { label: 'Removed', tone: 'good', blurb: 'built and working in this demo — open it and watch' },
  planned: { label: 'Part-answered', tone: 'warn', blurb: 'half of it is built; the rest names what it still needs' },
  unsolved: { label: 'Not answered', tone: 'critical', blurb: 'nothing here touches it, and the page says what it would take' },
}

const stateOf = (p: Problem) => p.state ?? (p.answeredBy ? 'live' : 'unsolved')

function PainRow({ p, index }: { p: Problem; index: number }) {
  const st = STATE[stateOf(p)]
  return (
    <li style={{ '--i': index } as React.CSSProperties}
        className="anim-fade-up grid gap-x-5 gap-y-2 border-b border-line-soft px-4 py-3.5 last:border-b-0 lg:grid-cols-2">
      {/* the pain, in the owner's words and with its price attached */}
      <div className="min-w-0">
        <div className="flex items-start gap-2">
          <span aria-hidden className="mono mt-0.5 shrink-0 text-[11px] text-ink-3">{String(index + 1).padStart(2, '0')}</span>
          <h3 className="text-[13.5px] font-medium leading-snug">{p.title}</h3>
          <span className="ml-auto shrink-0">
            <Pill tone={st.tone}>{st.label}</Pill>
          </span>
        </div>
        <p className="mt-1 pl-6 text-[12px] leading-relaxed text-ink-2">{p.detail}</p>
        {p.costsToday && (
          <div className="mt-2 ml-6 rounded-md border border-line bg-surface-2 p-2.5">
            <p className="mono text-[9.5px] uppercase tracking-wide text-ink-3">what it costs today</p>
            <p className="mt-1 text-[12px] leading-relaxed text-ink-2">{p.costsToday}</p>
          </div>
        )}
      </div>

      {/* the painkiller, as a mechanism rather than a claim */}
      <div className="min-w-0 border-t border-line-soft pt-2 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
        <p className="mono text-[9.5px] uppercase tracking-wide text-ink-3">
          {stateOf(p) === 'unsolved' ? 'what it would take' : 'what removes it'}
        </p>
        {p.answeredBy && (
          <p className={`mt-0.5 text-[13px] font-medium ${stateOf(p) === 'live' ? 'text-accent' : 'text-warn'}`}>
            {p.answeredBy}
          </p>
        )}
        <p className="mt-1 text-[12px] leading-relaxed text-ink-2">{p.how}</p>
        {p.href && (
          <Link href={p.href}
            className="mt-2 inline-flex items-center gap-1 rounded border border-line px-2 py-0.5 text-[11.5px] font-medium text-accent transition-colors hover:bg-accent-soft">
            See it working →
          </Link>
        )}
      </div>
    </li>
  )
}

export function Painkillers({ stage }: { stage: Stage }) {
  const counts = { live: 0, planned: 0, unsolved: 0 }
  for (const p of stage.problems) counts[stateOf(p)]++
  const live = stage.modules.filter((m) => m.href && m.label !== 'Painkillers solved')
  const notBuilt = stage.modules.filter((m) => !m.href)

  return (
    <>
      <PageHeader eyebrow={`Stage ${stage.no} · ${stage.label}`} title="Painkillers solved"
        meta={<>
          {(['live', 'planned', 'unsolved'] as const).map((k) => counts[k] ? (
            <Pill key={k} tone={STATE[k].tone}>{counts[k]} {STATE[k].label.toLowerCase()}</Pill>
          ) : null)}
          <Pill mono>{stage.problems.length} pains stated</Pill>
        </>} />

      {/* the honest headline: how many of the stated pains this stage actually removes */}
      <div className="mb-3 grid gap-2 sm:grid-cols-3">
        {(['live', 'planned', 'unsolved'] as const).map((k, i) => (
          <div key={k} style={{ '--i': i } as React.CSSProperties}
               className={`anim-fade-up glass-card rounded-lg border px-3 py-2 ${
                 counts[k] ? 'border-line' : 'border-dashed border-line opacity-60'}`}>
            <p className="flex items-baseline gap-2">
              <span className="figure text-[22px] leading-none">{counts[k]}</span>
              <span className={`text-[12px] font-medium ${
                k === 'live' ? 'text-good' : k === 'planned' ? 'text-warn' : 'text-critical'}`}>
                {STATE[k].label.toLowerCase()}
              </span>
            </p>
            <p className="mt-0.5 text-[10.5px] leading-snug text-ink-3">{STATE[k].blurb}</p>
          </div>
        ))}
      </div>

      <Card index={1} title={`${stage.label} — the pains, and what each one costs`}
        sub="Every claim on this page names a mechanism and a figure from this dataset. Nothing says “improved visibility”."
        className="mb-3">
        <ul>
          {stage.problems.map((p, i) => <PainRow key={p.title} p={p} index={i} />)}
        </ul>
      </Card>

      <div className="grid items-start gap-3 lg:grid-cols-2">
        <Card index={2} title="Open the modules behind these"
          sub={live.length ? `${live.length} live in this build` : 'nothing live in this stage yet'}>
          {live.length ? (
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
          ) : (
            <p className="px-4 py-3 text-[12px] leading-relaxed text-ink-2">
              Nothing in this stage is built, and nothing here is mocked. Inventing the data would
              break the rule the rest of the build runs on — the stage page states the boundary instead.
            </p>
          )}
          <p className="border-t border-line-soft px-4 py-2.5 text-[11px] leading-relaxed text-ink-3">
            A pain is only removed once you can open the thing that removes it. That is why every
            “Removed” row above carries a link, and why the ones that do not are labelled differently.
          </p>
        </Card>

        <Card index={3} title="Not built, and why"
          sub={`${notBuilt.length} module${notBuilt.length === 1 ? '' : 's'} — queued with a prerequisite, or excluded with a reason`}>
          <ul className="divide-y divide-line-soft">
            {notBuilt.map((m) => (
              <li key={m.label} className="px-4 py-2">
                <p className="flex items-baseline gap-2">
                  <span className="text-[12.5px] text-ink-2">{m.label}</span>
                  <span className="mono ml-auto shrink-0 text-[10px] uppercase tracking-wide text-ink-3">
                    {m.lock!.excludedReason ? 'excluded' : m.lock!.phase}
                  </span>
                </p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-ink-3">
                  {m.lock!.excludedReason || m.lock!.needs}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  )
}
