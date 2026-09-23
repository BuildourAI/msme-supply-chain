'use client'
import { useMemo, useState } from 'react'
import { PageHeader } from '@/components/shell/PageHeader'
import { Button, Card, Pill, StatusPill } from '@/components/ui/bits'
import { KpiTile } from '@/components/desk/KpiRow'
import { TONE_RAIL, TONE_TEXT } from '@/components/desk/LineCards'
import { Icon, type IconName } from '@/components/ui/icons'
import { Num } from '@/components/ui/Num'
import { CoverBar, StockBar, type StockSeg } from '@/components/charts/kit'
import { Note } from '@/components/ui/Note'
import { buildLineWatch, type DerivedMaterial } from '@/lib/domain/linewatch'
import { lakh, longDate, money, num, qtyText, shortDate, STATUS_LABEL } from '@/lib/domain/format'
import { OWNER_POLICY } from '@/lib/domain/policy'
import { useApp } from '@/state/app-store'
import { daysBetween } from '@/lib/domain/calc'
import { useWorkspace } from '@/components/workspace/store'
import { DeskOnly } from '@/components/sourcing/DeskOnly'
import { LineWatch } from '@/components/production/desk/LineWatch'

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

/**
 * One material that needs a decision, as a tile.
 *
 * The card this replaces was a screen in itself: a header, a row of "feeds"
 * chips, a 34px figure, two bars each with their own legend, five sentences, a
 * customer-order block and a supplier row — 460 to 600px, five of them stacked
 * two to a row. Reading it took three screens to answer a question the owner
 * asks in one look: which material stops the line first, when, and what do I
 * approve.
 *
 * So the tile keeps exactly that. The status rail and glyph, the cover figure
 * against the lead-time tick, the stock split as a bar, the orders at risk, and
 * the proposal with its two buttons. The five sentences that explain the bar —
 * what is at a jobworker, what is earmarked, what is on the rack, where scrap
 * sits against target — become a badge each, with the sentence on the title and
 * the whole set in the fold. The six words under the stock bar are printed once
 * under the grid instead of once per material.
 */
function Flag({ tone, icon, children, title }: {
  tone: 'critical' | 'warn' | 'accent' | 'neutral'; icon: IconName
  children: React.ReactNode; title: string
}) {
  return (
    <span title={title}
      className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-px text-[10.5px] ${
        tone === 'critical' ? 'border-critical/40 bg-critical-soft text-ink-2'
        : tone === 'warn' ? 'border-warn/40 bg-warn-soft text-ink-2'
        : tone === 'accent' ? 'border-accent/40 bg-accent-soft text-ink-2'
        : 'border-line bg-surface-2 text-ink-2'}`}>
      <Icon name={icon} className={`size-3 shrink-0 ${
        tone === 'critical' ? 'text-critical' : tone === 'warn' ? 'text-warn'
        : tone === 'accent' ? 'text-accent-ink' : 'text-ink-3'}`} />
      {children}
    </span>
  )
}

function MaterialTile({ d, index = 0 }: { d: DerivedMaterial; index?: number }) {
  const { log, say } = useApp()
  const m = d.m
  const [supplier, setSupplier] = useState(m.suppliers.find((s) => s.preferred)!.name)
  const [done, setDone] = useState<string | null>(null)
  const chosen = m.suppliers.find((s) => s.name === supplier)!
  const cost = useMemo(() => m.reorderQty * chosen.rate + m.freight, [m, chosen])
  const tone = d.status.value === 'stop' ? 'critical' : d.status.value === 'watch' ? 'warn' : 'good'
  const overScrap = m.scrapPct > m.scrapTargetPct

  const segs: StockSeg[] = [
    { key: 'usable', label: 'Ready to use', value: m.usable, color: 'var(--good)' },
    { key: 'qc', label: 'QC hold', value: m.qcHold, color: 'var(--warn)' },
    { key: 'dmg', label: 'Damaged', value: m.damaged, color: 'var(--critical)' },
    { key: 'exp', label: 'Expired', value: m.expired, color: 'var(--critical)' },
    { key: 'jw', label: 'With a jobworker', value: m.withJobworker, color: 'var(--cat-1)', hatched: true },
    { key: 'oo', label: 'On order', value: m.onOrder, color: 'var(--cat-3)', hatched: true },
  ]

  return (
    <li style={{ '--i': Math.min(index, 8) } as React.CSSProperties}
      className={`anim-fade-up lift panel relative flex flex-col overflow-hidden rounded-lg border pl-2.5 ${
        tone === 'critical' ? 'border-critical/35' : tone === 'warn' ? 'border-warn/35' : 'border-line'}`}>
      <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${TONE_RAIL[tone]}`} />

      <div className="px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Icon name={tone === 'critical' ? 'alert' : tone === 'warn' ? 'clock' : 'check'}
            className={`size-4 shrink-0 ${TONE_TEXT[tone]}`} />
          <h3 className="min-w-0 flex-1 truncate text-[13.5px] font-medium" title={m.name}>{m.name}</h3>
          <StatusPill label={STATUS_LABEL[d.status.value]} tone={tone} />
        </div>
        <p className="mono mt-0.5 truncate text-[10.5px] text-ink-3"
          title={`batch ${m.batchNo} · takes ${m.leadTimeDays} days to arrive · feeds ${m.feeds.join(', ')}`}>
          batch {m.batchNo} · {m.leadTimeDays}-day lead · feeds {m.feeds.join(', ')}
        </p>

        {/* how long the line runs, against the lead time it has to beat */}
        <p className="mt-2 flex items-baseline gap-2">
          <Num d={d.coverDays} format="days" size="lg" tone={tone} suffix=" days" />
          <span className="text-[11.5px] text-ink-3">runs out {shortDate(d.stockoutDate.value)}</span>
        </p>
        <div className="mt-1.5">
          <CoverBar coverDays={d.coverDays.value} leadDays={m.leadTimeDays} tone={tone} />
        </div>

        {/* what the stock actually is — the words are under the grid, once */}
        <div className="mt-2">
          <StockBar segments={segs} uom={m.uom} legend={false} />
        </div>

        <p className="mt-1.5 flex flex-wrap gap-1.5">
          {m.withJobworker > 0 && (
            <Flag tone={d.overdueJobwork ? 'critical' : 'neutral'} icon="truck"
              title={`${qtyText(m.withJobworker, m.uom)} is at ${m.jobworkerName}${
                d.overdueJobwork ? ' and it is overdue' : ' and due back on time'} — neither on the shelf nor consumed.`}>
              at {m.jobworkerName}{d.overdueJobwork ? ', overdue' : ''}
            </Flag>
          )}
          {m.onOrder > 0 && (
            <Flag tone="neutral" icon="cart"
              title={`${qtyText(m.onOrder, m.uom)} is on order and earmarked for ${m.earmarkedFor} — it is not free stock.`}>
              on order, earmarked
            </Flag>
          )}
          {m.offcutQty > 0 && (
            <Flag tone="accent" icon="boxes"
              title={`${qtyText(m.offcutQty, m.uom)} of usable offcut is already on the rack — check it before buying.`}>
              {money(d.offcutValue.value as number)} offcut
            </Flag>
          )}
          {overScrap && (
            <Flag tone="warn" icon="activity"
              title={`Scrap is running at ${m.scrapPct}% against a ${m.scrapTargetPct}% target — over target.`}>
              scrap {m.scrapPct}% vs {m.scrapTargetPct}%
            </Flag>
          )}
          {d.nonUsable.value > 0 && (
            <Flag tone="warn" icon="lock"
              title={`${qtyText(d.nonUsable.value, m.uom)} cannot be issued, worth ${money(d.nonUsableValue.value as number)} — shown, but never counted as cover.`}>
              {qtyText(d.nonUsable.value, m.uom)} not issuable
            </Flag>
          )}
        </p>

        {/* §8.5 — customer orders only on at-risk materials */}
        {d.atRiskOrders.length > 0 && (
          <ul className="mt-2 rounded-md border border-critical/30 bg-critical-soft/40 p-2">
            {d.atRiskOrders.map((s) => (
              <li key={s.soNo} className="flex flex-wrap items-baseline gap-x-2 text-[11.5px] text-ink-2">
                <span className="mono">{s.soNo}</span>
                <span className="min-w-0 truncate">{s.customer}</span>
                <span className="num ml-auto font-medium">{lakh(s.value)}</span>
                <span className="mono text-[10.5px] text-ink-3">promised {shortDate(s.promisedDate)}</span>
              </li>
            ))}
          </ul>
        )}

        {/* the decision */}
        <div className="mt-2 border-t border-line-soft pt-2">
          {/* the supplier keeps a line of its own: a name cut to "Kri" is not a
              supplier a buyer can check before approving */}
          <div className="flex items-center gap-1.5">
            <span className="shrink-0 text-[12px] text-ink-2">
              Buy{' '}
              <Num d={{ value: m.reorderQty, label: 'Reorder quantity', formula: 'reorder_qty (hand-set min/max, §14 Phase 2)',
                inputs: [{ name: 'reorder_qty', value: m.reorderQty, unit: m.uom, source: 'set per material until 90 days of consumption exist' }], unit: m.uom }}
                suffix={` ${m.uom}`} size="sm" /> from
            </span>
          <select value={supplier} aria-label={`Supplier for ${m.name}`} onChange={(e) => {
            setSupplier(e.target.value)
            log({ entity: 'line_material', entityId: m.id, action: 'Supplier changed',
              detail: `${m.name} · ${supplier} → ${e.target.value}` })
            say(`Supplier for ${m.name} set to ${e.target.value}. The cost below has been recalculated.`)
          }}
            className="min-w-0 flex-1 rounded-md border border-line bg-surface px-1.5 py-1 text-[11.5px] outline-none focus:border-accent">
            {m.suppliers.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}{s.preferred ? ' · usual' : ''} — {money(s.rate, s.rate < 1000 ? 2 : 0)}/{m.uom}, {s.leadTimeDays}d
              </option>
            ))}
          </select>
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <span className="text-[12.5px] font-medium">
            <Num d={{ value: cost, label: 'Cost to reorder', formula: 'reorder_qty × rate + freight',
              inputs: [{ name: 'reorder_qty', value: m.reorderQty, unit: m.uom }, { name: 'rate', value: chosen.rate, unit: `₹/${m.uom}`, source: chosen.name }, { name: 'freight', value: m.freight, unit: '₹' }], unit: '₹' }} format="money" size="sm" />
            <span className="ml-1 text-[11px] text-ink-3">landed</span>
          </span>
          <span className="ml-auto flex gap-1.5">
            {done ? (
              <span className="inline-flex items-center gap-1.5 text-[11.5px] text-ink-2">
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
          </span>
          </div>
        </div>

        {/* the sentences, and the quantities behind the bar */}
        <details className="group mt-1.5">
          <summary className="cursor-pointer select-none text-[11px] text-ink-3 hover:text-ink-2">
            Why, and what the stock is
          </summary>
          <ul className="mt-1 space-y-1 text-[11.5px] leading-relaxed text-ink-2">
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
              {overScrap
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
          <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
            {segs.filter((s) => s.value > 0).map((s) => (
              <li key={s.key} className="flex items-center gap-1.5 text-[11px] text-ink-2">
                <span aria-hidden className={`size-2.5 shrink-0 rounded-[2px] ${s.hatched ? 'hatch' : ''}`}
                  style={s.hatched ? { '--hatch-c': s.color } as React.CSSProperties : { background: s.color }} />
                {s.label} <span className="num font-medium text-ink">{num(s.value, s.value < 10 ? 2 : 0)}</span>
              </li>
            ))}
          </ul>
        </details>
      </div>
    </li>
  )
}

function PageBody() {
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

      <Note label="What this screen does" className="mb-3">
        The same data as the buyer’s desk, read as a manufacturing statement rather than an inventory
        number. Plain language on the face — the arithmetic is still underneath every figure if you
        want it.
      </Note>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile index={0} label="The line runs for" d={t.lineRunsFor} format="days" tone="critical" icon="clock" suffix=" days"
          caption={`the shortest material sets the pace — ${PACE.m.name.toLowerCase()}`} />
        <KpiTile index={1} label="Jobs stopping this week" d={t.jobsStopping} format="int" tone="critical" icon="factory" suffix={` of ${lw.jobs.length}`}
          caption={`${HALTING} will halt · ${AT_RISK} at risk, of ${lw.jobs.length} scheduled`} />
        <KpiTile index={2} label="Cash needed for reorders" d={t.cashNeeded} format="lakh" tone="accent" icon="cash"
          caption={`across the ${lw.needsAttention.length} materials needing attention`} />
        <KpiTile index={3} label="Stock you cannot use" d={t.unusableValue} format="money" tone="warn" icon="boxes"
          caption={`across ${t.unusableLotCount} materials · QC hold, damaged and expired`} />
      </div>

      <div className="mb-4"><WeekSchedule /></div>

      <div className="mb-2 flex flex-wrap items-baseline gap-x-2.5">
        <h2 className="text-[17px]">Materials needing attention</h2>
        <p className="text-[11.5px] text-ink-3">Sorted by which one stops the line first.</p>
      </div>
      <ul className={`grid auto-rows-min items-start gap-2.5 ${
        lw.needsAttention.length <= 1 ? ''
        : lw.needsAttention.length === 2 || lw.needsAttention.length === 4 ? 'md:grid-cols-2'
        : 'md:grid-cols-2 xl:grid-cols-3'}`}>
        {lw.needsAttention.map((d, i) => <MaterialTile key={d.m.id} d={d} index={5 + i} />)}
      </ul>

      {/* the six words every stock bar used to carry, printed once */}
      <ul className="mb-4 mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[10.5px] text-ink-3">
        {([['var(--good)', 'ready to use', false], ['var(--warn)', 'QC hold', false],
           ['var(--critical)', 'damaged or expired', false], ['var(--cat-1)', 'with a jobworker', true],
           ['var(--cat-3)', 'on order', true]] as const).map(([color, label, hatched]) => (
          <li key={label} className="flex items-center gap-1.5">
            <span aria-hidden className={`inline-block h-2 w-4 rounded-full ${hatched ? 'hatch' : ''}`}
              style={hatched ? { '--hatch-c': color } as React.CSSProperties : { background: color }} />
            {label}
          </li>
        ))}
        <li>Open “Why” on a tile for the sentences and the quantities.</li>
      </ul>

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
          <Note foot label="A late jobworker is a different problem from empty stock">
        A job halting because a jobworker is late is a different problem from a job halting
            because stock ran out.{' '}
            {OVERDUE.length > 0 && lw.jobs.some((j) => j.status.value === 'at_risk')
              ? <>{lw.jobs.filter((j) => j.status.value === 'at_risk').map((j) => j.job.jobNo).join(', ')} is the first kind — {OVERDUE.map((j) => `${j.vendorName} is ${daysBetween(j.dueBack, lw.today)} days late`).join(', ')} — and the schedule says so.</>
              : 'Nothing is late at a jobworker this week.'}
      </Note>
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

/**
 * One route, two companies. The sample keeps its Line Watch over the §9.2
 * fabricator; the owner gets theirs, which reads their own jobs, plan and
 * store and nothing else.
 */
export default function Page() {
  const { mode, ready } = useWorkspace()
  if (!ready) return <div className="min-h-[50vh]" aria-hidden />
  return mode === 'mine'
    ? <DeskOnly><LineWatch /></DeskOnly>
    : <PageBody />
}
