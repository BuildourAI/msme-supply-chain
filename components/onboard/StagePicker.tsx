'use client'
import { useState } from 'react'
import Link from 'next/link'
import { Icon, type IconName } from '@/components/ui/icons'
import { useWorkspace } from '@/components/workspace/store'
import { longDate } from '@/lib/domain/format'
import { stepsFor, type Step, type StepId } from '@/lib/workspace/checklist'
import { fyOf, hasRecords } from '@/lib/workspace/executive'
import { BUILT, STAGE_HOME, STAGE_TILES, type StageId } from '@/lib/workspace/reveal'
import type { Workspace } from '@/lib/workspace/types'
import { Wizards } from './Checklist'
import { Gist } from './Gist'

/**
 * Where an owner starts: five stages to open, and one place to start.
 *
 * Not a dashboard on day one. Sixteen figures over a company that has entered
 * four materials would be sixteen zeroes and four charts of nothing, so until
 * the first purchase order, count, job card or sales order is written the only
 * question here is "which part of the business am I working on". Once there is
 * something to read, the gist takes the page — money, what needs the owner,
 * the goals, each stage's figures, each with its way into the stage.
 *
 * Nor is it a form. Materials, suppliers, racks, customers: each is entered
 * inside its own stage, on that stage's lists, whenever the owner gets to it,
 * and each desk's side panel keeps its own short set-up list. What stays here
 * is what belongs to the whole company — the five rule sets, which work on
 * sensible defaults until the owner sets their own, and the company's details.
 */
export function StagePicker() {
  const { workspace, today, browseSample } = useWorkspace()
  const [open, setOpen] = useState<StepId | null>(null)
  if (!workspace) return null
  const running = hasRecords(workspace)
  const start = startOf(workspace)

  return (
    <>
      {running && <Gist />}
      <div className="mx-auto w-full max-w-[90rem]">
        {!running && (
          <>
            <Band ws={workspace} today={today} />
            <StartHere start={start} onOpen={setOpen} />
            <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-5">
              {STAGE_TILES.filter((t) => BUILT.includes(t.id)).map((t, i) => (
                <StageTile key={t.id} stage={t.id} first={start?.stage === t.id} i={i + 2} />
              ))}
            </div>
          </>
        )}

        <div className="mt-2.5 grid grid-cols-1 gap-2.5 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <RulesCard ws={workspace} onOpen={setOpen} />
          <CompanyCard ws={workspace} onOpen={setOpen} />
        </div>

        {!running && (
          <p className="anim-fade-up mt-5 text-center text-[12.5px] text-ink-3" style={{ '--i': 9 } as React.CSSProperties}>
            Want to see where this leads?{' '}
            <button type="button" onClick={browseSample}
              className="press inline-flex items-center gap-1 font-semibold text-navy underline underline-offset-2 hover:text-navy-deep">
              Look at the sample company <Icon name="arrow-right" className="size-3" />
            </button>
          </p>
        )}
      </div>
      <Wizards open={open} onClose={() => setOpen(null)} />
    </>
  )
}

/* ------------------------------------------------------------ the rules -- */

/** The five rule sets, one per stage, in the order material moves. */
const RULES: { id: StepId; stage: StageId; label: string }[] = [
  { id: 'rules', stage: 'sourcing', label: 'Buying' },
  { id: 'gateRules', stage: 'inbound', label: 'Gate' },
  { id: 'storeRules', stage: 'inventory', label: 'Store' },
  { id: 'floorRules', stage: 'production', label: 'Floor' },
  { id: 'dispatchRules', stage: 'dispatch', label: 'Dispatch' },
]
const RULE_IDS = new Set(RULES.map((r) => r.id))

const ruleStep = (id: StepId) => BUILT.flatMap((s) => stepsFor(s)).find((s) => s.id === id)!
const iconOf = (stage: StageId) => STAGE_TILES.find((t) => t.id === stage)!.icon as IconName
const labelOf = (stage: StageId) => STAGE_TILES.find((t) => t.id === stage)!.label

const rulesSet = (ws: Workspace) => RULES.filter((r) => ruleStep(r.id).done(ws)).length

/* -------------------------------------------------------- where to start -- */

/**
 * The first stage with something still to enter, and the first thing in it.
 * Rules and the company are not "something to enter": the rules have
 * defaults, and the company was named at sign-up.
 */
function startOf(ws: Workspace): { stage: StageId; step: Step } | null {
  for (const stage of BUILT) {
    const step = stepsFor(stage).find((s) => s.id !== 'company' && !RULE_IDS.has(s.id) && !s.done(ws))
    if (step) return { stage, step }
  }
  return null
}

/**
 * What the start card asks for, and the list in the stage where that is done.
 * The opening stock count and the job numbering have no list of their own to
 * do them from, so the card opens their wizard in place instead.
 */
const START: Partial<Record<StepId, { title: string; href?: string; sub?: string }>> = {
  materials: {
    title: 'Add your materials and suppliers', href: '/sourcing/materials',
    sub: 'Everything else works from these — the gate, the store, the floor and dispatch. You add them inside Sourcing, on its own lists, whenever you are ready.',
  },
  suppliers: { title: 'Add your suppliers and their rates', href: '/sourcing/suppliers' },
  stock: { title: 'Count the stock you have today' },
  checks: { title: 'Write what to check when goods arrive', href: '/inbound/checks' },
  racks: { title: 'Name the racks your stock sits on', href: '/inventory/racks' },
  jobworkers: { title: 'Say who you send material out to', href: '/inventory/jobwork' },
  products: { title: 'Add the products you make', href: '/production/products' },
  jobs: { title: 'Choose how your job cards are numbered' },
  plan: { title: 'Plan this week on the floor', href: '/production/jobs' },
  customers: { title: 'Add your customers', href: '/dispatch/customers' },
  carriers: { title: 'Add the transporters who carry your goods', href: '/dispatch/carriers' },
  firstOrder: { title: 'Take your first sales order', href: '/dispatch/orders' },
}

/** Each stage's main lists, as the tile names them. */
const TAGS: Record<StageId, string[]> = {
  sourcing: ['Materials', 'Suppliers', 'Purchase orders'],
  inbound: ['Receiving', 'Checks', 'Due in'],
  inventory: ['Stock', 'Jobwork', 'Wastage'],
  production: ['Products', 'Job cards', 'Line watch'],
  dispatch: ['Sales orders', 'Challans', 'Customers'],
}

/* ------------------------------------------------------------- the band -- */

/** The welcome, in the band every dashboard wears: whose company, and how many of the rules are the owner's own. */
function Band({ ws, today }: { ws: Workspace; today: string }) {
  const set = rulesSet(ws)
  return (
    <header data-welcome-band
      className="anim-fade-up flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl bg-gradient-to-r from-navy-deep to-navy px-4 py-3.5 text-white sm:px-5">
      <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/12">
        <Icon name="factory" className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="mono truncate text-[10.5px] uppercase tracking-wider text-white/70">
          {ws.company.name}{today ? ` · ${fyOf(today).label}` : ''}
        </p>
        <h1 className="text-[21px] font-extrabold leading-tight tracking-[-0.02em]">Welcome, {ws.owner.name}</h1>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
        <span data-rules-chip className="inline-flex items-center gap-1.5 rounded-lg bg-white/12 px-2.5 py-1.5 text-[12px] font-semibold">
          <Icon name="scale" className="size-3.5 opacity-80" />
          Rules {set} of {RULES.length} set
          {set < RULES.length && <span className="font-normal text-white/75">· defaults apply</span>}
        </span>
        {today && (
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/12 px-2.5 py-1.5 text-[12px] font-semibold">
            <Icon name="calendar" className="size-3.5 opacity-80" />{longDate(today)}
          </span>
        )}
      </div>
    </header>
  )
}

/* -------------------------------------------------------- the start card -- */

/**
 * The one place to start: the first stage with something still to enter. The
 * button opens the stage on the list where that is done, not a form here —
 * the stage is where it lives, and where it is changed later. The two with no
 * list of their own (the opening count, the job numbering) open in place.
 */
function StartHere({ start, onOpen }: { start: { stage: StageId; step: Step } | null; onOpen: (id: StepId) => void }) {
  if (!start) {
    return (
      <section data-start-here style={{ '--i': 1 } as React.CSSProperties}
        className="anim-fade-up mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border border-line border-l-[4px] border-l-good bg-surface px-4 py-3.5 sm:px-5">
        <span aria-hidden className="grid size-[46px] shrink-0 place-items-center rounded-full bg-good-soft text-good"><Icon name="check" className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[17px] font-bold leading-tight tracking-tight">Every stage has what it needs</p>
          <p className="mt-0.5 max-w-[62ch] text-[12.5px] leading-snug text-ink-2">
            The desks run on your own records now. The first purchase order, count, job card or sales order opens the business at a glance here.
          </p>
        </div>
      </section>
    )
  }
  const label = labelOf(start.stage)
  const s = START[start.step.id] ?? { title: start.step.title, href: STAGE_HOME[start.stage] }
  const START_BUTTON = 'press inline-flex w-full shrink-0 items-center justify-center gap-1.5 rounded-[10px] bg-navy px-4 py-2.5 text-[13.5px] font-semibold text-white hover:bg-navy-deep sm:ml-auto sm:w-auto'
  return (
    <section data-start-here={start.stage} style={{ '--i': 1 } as React.CSSProperties}
      className="anim-fade-up mt-2.5 flex flex-wrap items-center gap-x-[18px] gap-y-3 rounded-2xl border border-line border-l-[4px] border-l-navy bg-surface px-4 py-4 sm:px-5">
      <span aria-hidden className="grid size-[46px] shrink-0 place-items-center rounded-full bg-navy text-white">
        <Icon name={iconOf(start.stage)} className="size-5" />
      </span>
      <div className="min-w-0 flex-1 basis-[16rem]">
        <p className="mono text-[10.5px] uppercase tracking-wider text-navy">Start here · {label}</p>
        <p className="mt-0.5 text-[17px] font-bold leading-tight tracking-tight">{s.title}</p>
        <p className="mt-1 max-w-[62ch] text-[12.5px] leading-snug text-ink-2">
          {s.sub ?? (s.href
            ? `${start.step.why} You do this inside ${label}, whenever you are ready.`
            : `${start.step.why} It is also on ${label}’s set-up list, whenever you are ready.`)}
        </p>
      </div>
      {s.href ? (
        <Link href={s.href} className={START_BUTTON}>
          Open {label}
          <Icon name="arrow-right" className="size-4" />
        </Link>
      ) : (
        <button type="button" onClick={() => onOpen(start.step.id)} className={START_BUTTON}>
          {start.step.cta}
          <Icon name="arrow-right" className="size-4" />
        </button>
      )}
    </section>
  )
}

/* -------------------------------------------------------- the five tiles -- */

/** A stage, as a door: what it is for, what is in it, and the way in. No steps, no counts. */
function StageTile({ stage, first, i }: { stage: StageId; first: boolean; i: number }) {
  const t = STAGE_TILES.find((x) => x.id === stage)!
  return (
    <Link href={STAGE_HOME[stage]} data-stage-tile={stage} style={{ '--i': i } as React.CSSProperties}
      className={`anim-fade-up press group flex min-w-0 flex-col gap-1.5 rounded-2xl border bg-surface p-4 transition-colors hover:bg-navy/[0.03] ${
        first ? 'border-navy/35 ring-1 ring-inset ring-navy/20' : 'border-line'}`}>
      <span className="flex items-center justify-between">
        <span aria-hidden className="grid size-10 place-items-center rounded-xl bg-navy/10 text-navy">
          <Icon name={t.icon} className="size-[18px]" />
        </span>
        {first && <span className="rounded-full bg-navy px-2 py-[3px] text-[10.5px] font-bold text-white">Start here</span>}
      </span>
      <span className="mt-1.5 text-[16px] font-bold leading-tight tracking-tight">{t.label}</span>
      <span className="text-[12.5px] leading-snug text-ink-2 sm:min-h-[2.8em]">{t.blurb}</span>
      <span className="mt-0.5 flex flex-wrap gap-1">
        {TAGS[stage].map((tag) => (
          <span key={tag} className="rounded-md bg-surface-2 px-[7px] py-0.5 text-[11px] text-ink-3">{tag}</span>
        ))}
      </span>
      <span className="mt-auto flex items-center gap-1 border-t border-line-soft pt-2.5 text-[12px] font-semibold text-navy">
        Open {t.label}
        <Icon name="arrow-right" className="size-3 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  )
}

/* ------------------------------------------------- rules and the company -- */

/**
 * The five rule sets as chips. Every one works on a default until it is set,
 * so none is a step to finish: a chip says "default" or "set", and opens its
 * rules either way.
 */
function RulesCard({ ws, onOpen }: { ws: Workspace; onOpen: (id: StepId) => void }) {
  return (
    <section data-rules style={{ '--i': 8 } as React.CSSProperties}
      className="anim-fade-up flex min-w-0 flex-col gap-2.5 rounded-2xl border border-line bg-surface px-4 py-3.5 sm:px-[18px]">
      <div className="min-w-0">
        <h2 className="flex items-center gap-[7px] text-[13.5px] font-bold">
          <Icon name="scale" className="size-4 text-navy" />Your rules
        </h2>
        <p className="mt-0.5 text-[11.5px] text-ink-3">Optional — sensible defaults apply until you set your own.</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {RULES.map((r) => {
          const step = ruleStep(r.id)
          const done = step.done(ws)
          return (
            <button key={r.id} type="button" data-rule={r.id} onClick={() => onOpen(r.id)}
              title={done ? step.summary(ws) : step.why}
              aria-label={`${r.label} rules — ${done ? 'set' : 'default'}`}
              className="press inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-[11px] py-1.5 text-[12.5px] font-medium hover:border-navy/40 hover:bg-navy/[0.04]">
              <Icon name={iconOf(r.stage)} className="size-3.5 text-navy" />
              {r.label}
              {done ? (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-good-soft px-1.5 py-px text-[10.5px] text-good">
                  <Icon name="check" className="size-2.5" />set
                </span>
              ) : (
                <span className="rounded-full bg-surface-2 px-1.5 py-px text-[10.5px] text-ink-3">default</span>
              )}
            </button>
          )
        })}
      </div>
    </section>
  )
}

/** What the company's letterhead holds, one line, and the way to change it. */
function CompanyCard({ ws, onOpen }: { ws: Workspace; onOpen: (id: StepId) => void }) {
  const c = ws.company
  const others = ws.people.length - 1
  const parts = [
    c.name,
    c.gstin ? `GSTIN ${c.gstin}` : c.address ? 'address on file' : 'no address or GSTIN yet',
    others > 0 ? `${others + 1} people` : null,
  ].filter(Boolean)
  return (
    <section data-company style={{ '--i': 8 } as React.CSSProperties}
      className="anim-fade-up flex min-w-0 items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3.5 sm:px-[18px]">
      <div className="min-w-0">
        <h2 className="flex items-center gap-[7px] text-[13.5px] font-bold">
          <Icon name="doc" className="size-4 text-navy" />Company details
        </h2>
        <p className="mt-0.5 text-[11.5px] leading-snug text-ink-3">{parts.join(' · ')}</p>
      </div>
      <button type="button" data-company-change onClick={() => onOpen('company')}
        className="press inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface px-[11px] py-1.5 text-[12.5px] font-medium hover:border-navy/40 hover:bg-navy/[0.04]">
        <Icon name="pencil" className="size-3.5 text-navy" />Change
      </button>
    </section>
  )
}
