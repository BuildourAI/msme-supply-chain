'use client'
import { useMemo, useState } from 'react'
import { PageHeader } from '@/components/shell/PageHeader'
import { Button, Card, Pill, StatusPill } from '@/components/ui/bits'
import { KpiTile } from '@/components/desk/KpiRow'
import { Num } from '@/components/ui/Num'
import { CoverBar, StockBar, type StockSeg } from '@/components/charts/kit'
import { buildLineWatch, type DerivedMaterial } from '@/lib/domain/linewatch'
import { lakh, longDate, money, num, qtyText, shortDate, STATUS_LABEL } from '@/lib/domain/format'
import { OWNER_POLICY } from '@/lib/domain/policy'
import { useApp } from '@/state/app-store'
import { daysBetween } from '@/lib/domain/calc'

const lw = buildLineWatch()
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const HALTING = lw.jobs.filter((j) => j.status.value === 'will_halt').length
const AT_RISK = lw.jobs.filter((j) => j.status.value === 'at_risk').length
const PACE = [...lw.materials].sort((a, b) => a.coverDays.value - b.coverDays.value)[0]
const OVERDUE = lw.jobwork.filter((j) => j.dueBack < lw.today)
const jobworkFor = (itemId: string) => lw.jobwork.find((j) => j.itemId === itemId)
/** the material whose scrap is furthest over its target — worth a conversation */
const WORST_SCRAP = [...lw.materials].sort((a, b) =>
  (b.m.scrapPct - b.m.scrapTargetPct) - (a.m.scrapPct - a.m.scrapTargetPct))[0]

const JOB_TONE = { will_run: 'good', at_risk: 'warn', will_halt: 'critical' } as const

function WeekSchedule() {
  return (
    <Card index={4} title="This week on the floor" live sub={`Six working days from ${longDate(lw.today)}`}>
      <div className="scroll-x overflow-x-auto p-4">
        <div className="grid min-w-[46rem] grid-cols-6 gap-2">
          {DAYS.map((d, i) => (
            <div key={d} className="mono border-b border-line pb-1 text-[11px] uppercase tracking-wide text-ink-3">
              {d} <span className="text-ink-2">{7 + i} Sep</span>
            </div>
          ))}
          {DAYS.map((_, day) => (
            <div key={day} className="min-h-24 space-y-1.5">
              {lw.jobs.filter((j) => day >= j.job.startOffset && day < j.job.startOffset + j.job.durationDays)
                .map((j) => {
                  const tone = JOB_TONE[j.status.value]
                  const lateNames = j.status.lateJw.map((name) => {
                    const mat = lw.materials.find((m) => m.m.name === name)
                    const jw = mat && jobworkFor(mat.m.id)
                    return jw ? `${name} is with ${jw.vendorName} for ${jw.process.toLowerCase()} and overdue` : `${name} is overdue at a jobworker`
                  })
                  const short = j.status.blocking.length
                    ? `Short of ${j.status.blocking.join(' and ')}`
                    : lateNames.length ? lateNames.join('; ') : 'All materials cover this job'
                  return (
                    <div key={j.job.jobNo} title={`${j.job.jobNo} — ${short}`}
                      style={{ '--i': day + 2 } as React.CSSProperties}
                      className={`anim-fade-up lift shadow-sm rounded-md border p-2 ${
                        tone === 'critical' ? 'border-critical/35 bg-critical-soft'
                        : tone === 'warn' ? 'border-warn/35 bg-warn-soft' : 'border-good/30 bg-good-soft'}`}>
                      <span className="mono block text-[10.5px] text-ink-3">{j.job.jobNo}</span>
                      <span className="block text-[11.5px] leading-snug">{j.job.product}</span>
                      <span className="mono block text-[10px] text-ink-3">{j.job.qty} nos</span>
                      <span className="mt-1 block text-[10.5px] font-medium">
                        {j.status.value === 'will_halt' ? 'Will halt' : j.status.value === 'at_risk' ? 'At risk' : 'Will run'}
                      </span>
                    </div>
                  )
                })}
            </div>
          ))}
        </div>
        <ul className="mt-3 space-y-1 text-[12px] text-ink-2">
          {lw.jobs.filter((j) => j.status.value !== 'will_run').map((j) => (
            <li key={j.job.jobNo}>
              <strong className="text-ink">{j.job.jobNo}</strong> ({j.job.product}) —{' '}
              {j.status.blocking.length
                ? <>will halt. Short of <strong className="text-ink">{j.status.blocking.join(' and ')}</strong>.</>
                : <>at risk. {j.status.lateJw.map((name) => {
                    const mat = lw.materials.find((m) => m.m.name === name)
                    const jw = mat && jobworkFor(mat.m.id)
                    return <span key={name}><strong className="text-ink">{name}</strong> is with {jw?.vendorName ?? 'a jobworker'}{jw ? ` for ${jw.process.toLowerCase()}` : ''} and overdue.</span>
                  })}</>}
            </li>
          ))}
        </ul>
      </div>
    </Card>
  )
}

function MaterialCard({ d, index = 0 }: { d: DerivedMaterial; index?: number }) {
  const { log, say } = useApp()
  const m = d.m
  const [supplier, setSupplier] = useState(m.suppliers.find((s) => s.preferred)!.name)
  const [done, setDone] = useState<string | null>(null)
  const chosen = m.suppliers.find((s) => s.name === supplier)!
  const cost = useMemo(() => m.reorderQty * chosen.rate + m.freight, [m, chosen])
  const tone = d.status.value === 'stop' ? 'critical' : d.status.value === 'watch' ? 'warn' : 'good'

  const segs: StockSeg[] = [
    { key: 'usable', label: 'Ready to use', value: m.usable, color: 'var(--good)' },
    { key: 'qc', label: 'QC hold', value: m.qcHold, color: 'var(--warn)' },
    { key: 'dmg', label: 'Damaged', value: m.damaged, color: 'var(--critical)' },
    { key: 'exp', label: 'Expired', value: m.expired, color: 'var(--critical)' },
    { key: 'jw', label: 'With a jobworker', value: m.withJobworker, color: 'var(--cat-1)', hatched: true },
    { key: 'oo', label: 'On order', value: m.onOrder, color: 'var(--cat-3)', hatched: true },
  ]

  return (
    <Card index={index} className={tone === 'critical' ? 'border-critical/35' : tone === 'warn' ? 'border-warn/35' : ''}>
      <div className="p-4">
        <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
          <div className="min-w-0">
            <h3 className="text-[16px] leading-tight">{m.name}</h3>
            <p className="mono mt-0.5 text-[11px] text-ink-3">
              batch {m.batchNo} · takes {m.leadTimeDays} days to arrive
            </p>
          </div>
          <span className="ml-auto"><StatusPill label={STATUS_LABEL[d.status.value]} tone={tone} /></span>
        </div>

        <ul className="mt-2 flex flex-wrap gap-1.5">
          <li className="text-[11px] text-ink-3">Feeds:</li>
          {m.feeds.map((f) => (
            <li key={f} className="rounded border border-line bg-surface-2 px-1.5 py-px text-[11px] text-ink-2">{f}</li>
          ))}
        </ul>

        <div className="mt-3.5 flex items-end gap-3">
          <div>
            <p className="text-[11px] text-ink-3">The line runs for</p>
            <p className="figure text-[34px] leading-none">
              <Num d={d.coverDays} format="days" size="display" tone={tone} suffix=" days" />
            </p>
          </div>
          <p className="pb-1 text-[11.5px] leading-snug text-ink-2">
            runs out {shortDate(d.stockoutDate.value)}
          </p>
        </div>
        <div className="mt-2">
          <CoverBar coverDays={d.coverDays.value} leadDays={m.leadTimeDays} tone={tone} />
        </div>

        <div className="mt-3.5">
          <p className="mb-1 text-[11px] text-ink-3">What the stock actually is</p>
          <StockBar segments={segs} uom={m.uom} />
        </div>

        {/* one sentence each — the extras §8.5 asks for */}
        <ul className="mt-3 space-y-1 text-[12px] leading-relaxed text-ink-2">
          {m.withJobworker > 0 && (
            <li>
              {qtyText(m.withJobworker, m.uom)} is at {m.jobworkerName}
              {d.overdueJobwork ? <strong className="text-critical"> and it is overdue</strong> : ' and due back on time'} —
              neither on the shelf nor consumed.
            </li>
          )}
          {m.onOrder > 0 && (
            <li>{qtyText(m.onOrder, m.uom)} is on order and earmarked for {m.earmarkedFor} — it is not free stock.</li>
          )}
          {m.offcutQty > 0 && (
            <li>
              {qtyText(m.offcutQty, m.uom)} of usable offcut is already on the rack, worth about{' '}
              <Num d={d.offcutValue} format="money" size="sm" /> — check it before buying.
            </li>
          )}
          <li>
            Scrap is running at {m.scrapPct}% against a {m.scrapTargetPct}% target
            {m.scrapPct > m.scrapTargetPct
              ? <span className="text-warn"> — over target</span>
              : <span className="text-good"> — within target</span>}.
          </li>
          {d.nonUsable.value > 0 && (
            <li>
              <Num d={d.nonUsable} size="sm" /> {m.uom} cannot be issued, worth{' '}
              <Num d={d.nonUsableValue} format="money" size="sm" /> — shown, but never counted as cover.
            </li>
          )}
        </ul>

        {/* §8.5 — customer orders only on at-risk materials */}
        {d.atRiskOrders.length > 0 && (
          <div className="mt-3 rounded-md border border-critical/30 bg-critical-soft/40 p-2.5">
            <p className="text-[11px] font-medium text-critical">Customer orders this puts at risk</p>
            <ul className="mt-1 space-y-0.5">
              {d.atRiskOrders.map((s) => (
                <li key={s.soNo} className="flex flex-wrap items-baseline gap-x-2 text-[12px] text-ink-2">
                  <span className="mono">{s.soNo}</span>
                  <span>{s.customer} · {s.description}</span>
                  <span className="num ml-auto font-medium">{lakh(s.value)}</span>
                  <span className="mono text-[10.5px] text-ink-3">promised {shortDate(s.promisedDate)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-3.5 flex flex-wrap items-end gap-2.5 border-t border-line-soft pt-3">
          <label className="min-w-[11rem]">
            <span className="block text-[11px] text-ink-3">Supplier</span>
            <select value={supplier} onChange={(e) => {
              setSupplier(e.target.value)
              log({ entity: 'line_material', entityId: m.id, action: 'Supplier changed',
                detail: `${m.name} · ${supplier} → ${e.target.value}` })
              say(`Supplier for ${m.name} set to ${e.target.value}. The cost below has been recalculated.`)
            }}
              className="mt-0.5 w-full rounded-md border border-line bg-surface px-2 py-1 text-[12.5px] outline-none focus:border-accent">
              {m.suppliers.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name}{s.preferred ? ' · usual supplier' : ''} — {money(s.rate, s.rate < 1000 ? 2 : 0)}/{m.uom}, {s.leadTimeDays}d
                </option>
              ))}
            </select>
          </label>
          <div>
            <span className="block text-[11px] text-ink-3">Order</span>
            <span className="text-[13px] font-medium">
              <Num d={{ value: m.reorderQty, label: 'Reorder quantity', formula: 'reorder_qty (hand-set min/max, §14 Phase 2)',
                inputs: [{ name: 'reorder_qty', value: m.reorderQty, unit: m.uom, source: 'set per material until 90 days of consumption exist' }], unit: m.uom }} suffix={` ${m.uom}`} />
            </span>
          </div>
          <div>
            <span className="block text-[11px] text-ink-3">Cost</span>
            <span className="text-[13px] font-medium">
              <Num d={{ value: cost, label: 'Cost to reorder', formula: 'reorder_qty × rate + freight',
                inputs: [{ name: 'reorder_qty', value: m.reorderQty, unit: m.uom }, { name: 'rate', value: chosen.rate, unit: `₹/${m.uom}`, source: chosen.name }, { name: 'freight', value: m.freight, unit: '₹' }], unit: '₹' }} format="money" />
            </span>
          </div>
          <div className="ml-auto flex gap-2">
            {done ? (
              <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-2">
                <span aria-hidden className="size-1.5 rounded-full bg-good" />{done}
              </span>
            ) : (
              <>
                <Button size="sm" variant="primary" onClick={() => {
                  setDone('Draft prepared')
                  log({ entity: 'line_material', entityId: m.id, action: 'Draft order prepared',
                    detail: `${m.name} · ${qtyText(m.reorderQty, m.uom)} from ${supplier} · ${money(cost)}` })
                  say(`Draft order prepared for ${supplier}. Nothing has been sent — you place the order.`)
                }}>Approve</Button>
                <Button size="sm" variant="ghost" onClick={() => {
                  setDone('Set aside')
                  log({ entity: 'line_material', entityId: m.id, action: 'Deferred',
                    detail: `${m.name} · no order raised today` })
                  say(`${m.name} set aside. It will come back tomorrow with one day less cover.`)
                }}>Not now</Button>
              </>
            )}
          </div>
        </div>
      </div>
    </Card>
  )
}

export default function Page() {
  const [showHealthy, setShowHealthy] = useState(false)
  const t = lw.tiles
  return (
    <>
      <PageHeader eyebrow="Stage 3 · Production & material flow" title="Line Watch"
        meta={<>
          <Pill mono>Mon {longDate(lw.today)}</Pill>
          <Pill tone="accent">the owner’s floor view</Pill>
          <Pill>supplier policy: {OWNER_POLICY.supplierDefault === 'preferred' ? 'usual supplier' : 'lowest landed cost'}</Pill>
        </>} />

      <p className="mb-4 max-w-3xl text-[13.5px] leading-relaxed text-ink-2">
        The same data as the buyer’s desk, read as a manufacturing statement rather than an inventory
        number. Plain language on the face — the arithmetic is still underneath every figure if you
        want it.
      </p>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile index={0} label="The line runs for" d={t.lineRunsFor} format="days" tone="critical" suffix=" days"
          caption={`the shortest material sets the pace — ${PACE.m.name.toLowerCase()}`} />
        <KpiTile index={1} label="Jobs stopping this week" d={t.jobsStopping} format="int" tone="critical" suffix={` of ${lw.jobs.length}`}
          caption={`${HALTING} will halt · ${AT_RISK} at risk, of ${lw.jobs.length} scheduled`} />
        <KpiTile index={2} label="Cash needed for reorders" d={t.cashNeeded} format="lakh" tone="accent"
          caption={`across the ${lw.needsAttention.length} materials needing attention`} />
        <KpiTile index={3} label="Stock you cannot use" d={t.unusableValue} format="money" tone="warn"
          caption={`across ${t.unusableLotCount} materials · QC hold, damaged and expired`} />
      </div>

      <div className="mb-4"><WeekSchedule /></div>

      <h2 className="mb-2 text-[17px]">Materials needing attention</h2>
      <p className="mb-3 text-[12.5px] text-ink-3">Sorted by which one stops the line first.</p>
      <div className="mb-4 grid gap-3 xl:grid-cols-2">
        {lw.needsAttention.map((d, i) => <MaterialCard key={d.m.id} d={d} index={5 + i} />)}
      </div>

      <Card index={10} className="mb-4" title="Everything else is fine for now"
        sub={`${lw.healthy.length} materials with more cover than they need`}
        actions={<Button size="sm" onClick={() => setShowHealthy((v) => !v)}>
          {showHealthy ? 'Collapse' : 'Show details'}
        </Button>}>
        <ul className="divide-y divide-line-soft">
          {lw.healthy.map((d) => (
            <li key={d.m.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2">
              <span className="text-[12.5px]">{d.m.name}</span>
              <span className="mono text-[11px] text-ink-3">{d.m.batchNo}</span>
              <span className="ml-auto text-[12px]">
                <Num d={d.coverDays} format="days" tone="good" suffix=" days of cover" />
              </span>
              {showHealthy && (
                <span className="mono w-full text-[11px] text-ink-3">
                  {qtyText(d.m.usable, d.m.uom)} ready · lead {d.m.leadTimeDays}d · scrap {d.m.scrapPct}% vs {d.m.scrapTargetPct}% target
                  {d.nonUsable.value > 0 && ` · ${qtyText(d.nonUsable.value, d.m.uom)} not issuable`}
                </span>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card index={11} title="Out with jobworkers" sub="Neither on the shelf nor consumed — and never counted as cover">
          <ul className="divide-y divide-line-soft">
            {lw.jobwork.map((j) => {
              const late = j.dueBack < lw.today
              const mat = lw.materials.find((m) => m.m.id === j.itemId)!
              return (
                <li key={j.id} className="px-4 py-2.5">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="text-[12.5px] font-medium">{j.vendorName}</span>
                    <span className="text-[11.5px] text-ink-3">{j.process}</span>
                    <span className="ml-auto">
                      {late
                        ? <StatusPill label={`${daysBetween(j.dueBack, lw.today)} days overdue`} tone="critical" />
                        : <StatusPill label={`due ${shortDate(j.dueBack)}`} tone="good" />}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[12px] text-ink-2">
                    {qtyText(j.qty, mat.m.uom)} of {mat.m.name} · sent {shortDate(j.sentOn)}
                  </p>
                </li>
              )
            })}
          </ul>
          <p className="border-t border-line-soft px-4 py-3 text-[12px] leading-relaxed text-ink-3">
            A job halting because a jobworker is late is a different problem from a job halting
            because stock ran out.{' '}
            {OVERDUE.length > 0 && lw.jobs.some((j) => j.status.value === 'at_risk')
              ? <>{lw.jobs.filter((j) => j.status.value === 'at_risk').map((j) => j.job.jobNo).join(', ')} is the first kind — {OVERDUE.map((j) => `${j.vendorName} is ${daysBetween(j.dueBack, lw.today)} days late`).join(', ')} — and the schedule says so.</>
              : 'Nothing is late at a jobworker this week.'}
          </p>
        </Card>

        <Card index={12} title="Offcuts and scrap" sub="Material already owned, and material being lost">
          <div className="p-4">
            <p className="mono text-[10px] uppercase tracking-wider text-ink-3">Usable offcuts on the rack</p>
            <ul className="mt-1.5 space-y-1">
              {lw.materials.filter((d) => d.m.offcutQty > 0).map((d) => (
                <li key={d.m.id} className="flex flex-wrap items-baseline gap-x-2 text-[12.5px]">
                  <span>{d.m.name}</span>
                  <span className="num ml-auto">{qtyText(d.m.offcutQty, d.m.uom)}</span>
                  <span className="num w-20 text-right font-medium">
                    <Num d={d.offcutValue} format="money" size="sm" />
                  </span>
                </li>
              ))}
            </ul>
            <p className="mono mt-3.5 text-[10px] uppercase tracking-wider text-ink-3">Scrap against target</p>
            <ul className="mt-1.5 space-y-1.5">
              {[...lw.materials].sort((a, b) => (b.m.scrapPct - b.m.scrapTargetPct) - (a.m.scrapPct - a.m.scrapTargetPct))
                .slice(0, 5).map((d) => {
                  const over = d.m.scrapPct > d.m.scrapTargetPct
                  return (
                    <li key={d.m.id} className="grid grid-cols-[1fr_auto] items-center gap-2 text-[12px]">
                      <span className="truncate text-ink-2">{d.m.name}</span>
                      <span className={`num ${over ? 'text-warn' : 'text-good'}`}>
                        {d.m.scrapPct}% vs {d.m.scrapTargetPct}% {over ? 'over' : 'within'}
                      </span>
                    </li>
                  )
                })}
            </ul>
            <p className="mt-3 text-[12px] leading-relaxed text-ink-3">
              {WORST_SCRAP.m.name} is running at {num(WORST_SCRAP.m.scrapPct, 1)}% against a{' '}
              {num(WORST_SCRAP.m.scrapTargetPct, 1)}% target — the biggest single gap on the floor, and
              the one worth a conversation this week.
            </p>
          </div>
        </Card>
      </div>
    </>
  )
}
