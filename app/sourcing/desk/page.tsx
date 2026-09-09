'use client'
import { useState } from 'react'
import { PageHeader, TabStrip } from '@/components/shell/PageHeader'
import { Button, Card, Pill, Segmented, StatusPill } from '@/components/ui/bits'
import { Num } from '@/components/ui/Num'
import { useDesk } from '@/components/desk/store'
import { KpiTile } from '@/components/desk/KpiRow'
import { DetailTable, SummaryTable } from '@/components/desk/Src01Table'
import { GuardrailPanel, LandedCostCompare } from '@/components/desk/Panels'
import { lakh, longDate, money, num, STATUS_LABEL, STATUS_TONE } from '@/lib/domain/format'
import { VALUATION_BASIS } from '@/lib/domain/policy'
import { useApp } from '@/state/app-store'

type Tab = 'desk' | 'history' | 'policy'

function Filters() {
  const { state, setQuery, setFilter, setView, visible, rows } = useDesk()
  const chips: { id: typeof state.statusFilter; label: string }[] = [
    { id: 'all', label: `All ${rows.length}` },
    { id: 'needs_decision', label: 'Needs a decision' },
    { id: 'at_risk', label: 'At risk' },
    { id: 'at_risk_late', label: 'At risk — late' },
    { id: 'open_po_covers', label: 'Open PO covers' },
    { id: 'covered', label: 'Covered' },
  ]
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line-soft px-4 py-2.5">
      <input value={state.query} onChange={(e) => setQuery(e.target.value)}
        placeholder="Search material or supplier" aria-label="Search"
        className="w-52 rounded-md border border-line bg-surface-2 px-2.5 py-1 text-[12.5px] outline-none focus:border-accent" />
      <div className="flex flex-wrap gap-1.5">
        {chips.map((c) => (
          <button key={c.id} type="button" onClick={() => setFilter(c.id)}
            className={`rounded-full border px-2.5 py-0.5 text-[11.5px] transition-colors ${
              state.statusFilter === c.id
                ? 'border-accent bg-accent-soft text-accent'
                : 'border-line text-ink-2 hover:bg-surface-2'}`}>
            {c.label}
          </button>
        ))}
      </div>
      <span className="mono ml-auto text-[11px] text-ink-3">
        showing {visible.length} of {rows.length}
      </span>
      <Segmented label="Table view" value={state.view} onChange={setView}
        options={[{ id: 'summary', label: 'Summary' }, { id: 'detail', label: 'Full detail' }]} />
    </div>
  )
}

function DeskTab() {
  const { kpis, setFilter, state, selected } = useDesk()
  return (
    <>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <KpiTile index={0} label="Lines needing a decision" d={kpis.linesNeedingDecision} format="int"
          tone="critical" active={state.statusFilter === 'needs_decision'}
          onClick={() => setFilter(state.statusFilter === 'needs_decision' ? 'all' : 'needs_decision')}
          actionLabel="Show only these"
          caption="3 at risk · 1 covered on quantity but late on timing" />
        <KpiTile index={1} label="Cash to release" d={kpis.toRelease} format="lakh" tone="accent"
          caption={`across ${kpis.draftPoCount} draft POs · ${kpis.heldCount} held by the guardrail`} />
        <KpiTile index={2} label="Non-usable stock" d={kpis.nonUsableValue} format="money" tone="warn"
          caption={`on hand but not issuable · valued at ${VALUATION_BASIS}`} />
      </div>

      <Card index={4} title="Reorder suggestions" sub="SRC-01 · every line, why it was raised, and what to do about it"
        live className="mb-4">
        <Filters />
        <div key={state.view} className="anim-fade-in">
          {state.view === 'summary' ? <SummaryTable /> : <DetailTable />}
        </div>
        <p className="border-t border-line-soft px-4 py-2.5 text-[11.5px] leading-snug text-ink-3">
          Click any figure to see the formula that produced it. Selecting a row drives the two panels
          below — currently <span className="mono text-ink-2">{selected.item.code}</span>.
        </p>
      </Card>

      <div className="grid items-start gap-3 lg:grid-cols-2">
        <LandedCostCompare />
        <GuardrailPanel />
      </div>
    </>
  )
}

function HistoryTab() {
  const { rows } = useDesk()
  const runs = [
    { id: 'R-0902', at: '2026-09-02 06:15', lines: 4, value: 455100, note: 'This run. MgO moved from at risk to at risk — late when PO-2611’s promised date slipped to 19 Sep.' },
    { id: 'R-0826', at: '2026-08-26 06:15', lines: 3, value: 349600, note: 'Nichrome first crossed its reorder point. Terminal block was not yet held.' },
    { id: 'R-0819', at: '2026-08-19 06:15', lines: 2, value: 224400, note: 'Only the element tube needed a decision.' },
  ]
  return (
    <Card title="Run history" sub="§7 · a suggestion is an immutable snapshot — a later rate change never alters a past run">
      <ul className="divide-y divide-line-soft">
        {runs.map((r, i) => (
          <li key={r.id} className="flex flex-wrap items-start gap-x-4 gap-y-1.5 px-4 py-3">
            <div className="w-28 shrink-0">
              <span className="mono block text-[12.5px] font-medium">{r.id}</span>
              <span className="mono block text-[10.5px] text-ink-3">{r.at}</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] text-ink-2">{r.note}</p>
              {i === 0 && <Pill tone="accent">current run</Pill>}
            </div>
            <div className="text-right">
              <span className="num block text-[13px] font-medium">{lakh(r.value)}</span>
              <span className="block text-[11px] text-ink-3">{r.lines} lines</span>
            </div>
          </li>
        ))}
      </ul>
      <div className="border-t border-line-soft p-4">
        <p className="mono text-[10px] uppercase tracking-wider text-ink-3">What changed since the last run</p>
        <ul className="mt-1.5 space-y-1 text-[12.5px] text-ink-2">
          <li>· MgO powder moved to <strong className="text-ink">at risk — late</strong>. Nothing to buy; PO-2611 needs chasing.</li>
          <li>· Ceramic terminal block is now <strong className="text-ink">held</strong> — the 5,000 MOQ takes cover past 2 months.</li>
          <li>· Cable gland cleared: 1,000 nos in transit land 06 Sep, ahead of a 09 Sep stockout.</li>
        </ul>
        <p className="mt-3 text-[11.5px] leading-snug text-ink-3">
          The {rows.length} lines above are recomputed live from the seed. Past runs keep the rates
          they were generated on — that is the snapshot rule, and it is why an approved PO cannot
          silently change price.
        </p>
      </div>
    </Card>
  )
}

function PolicyTab() {
  const { state, setPolicy, kpis, rows } = useDesk()
  const p = state.policy
  const knobs = [
    { k: 'inboundQcDays' as const, label: 'INBOUND_QC_DAYS', help: 'Days between goods arriving and being issuable. Received is not the same as usable.', min: 0, max: 7, step: 1 },
    { k: 'bufferDays' as const, label: 'BUFFER_DAYS', help: 'Slack built into each line’s order-by date (§5 order_by_date) — see Full detail → Est. arrival. It does not move a reorder quantity.', min: 0, max: 10, step: 1 },
  ]
  const allCycle = new Set(Object.values(p.cycleDays)).size === 1 ? p.cycleDays.A : null
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Card title="Policy" sub="Change a knob and every figure on the desk recomputes">
        <div className="space-y-4 p-4">
          <div>
            <div className="flex items-baseline justify-between">
              <label htmlFor="cycleDays" className="mono text-[12px] font-medium">CYCLE_DAYS · all classes</label>
              <span className="num text-[13px] font-semibold">{allCycle === null ? 'per class' : `${allCycle} days`}</span>
            </div>
            <input id="cycleDays" type="range" min={5} max={45} step={5} value={allCycle ?? 15}
              onChange={(e) => { const v = Number(e.target.value); setPolicy({ cycleDays: { A: v, B: v, C: v } }) }}
              className="mt-1.5 w-full accent-[var(--accent)]" />
            <p className="mt-1 text-[11.5px] leading-snug text-ink-3">
              Days of consumption a single order should cover beyond the reorder point. §5 says per item class;
              §13-3 says 15 is a guess to agree with the client. Set them apart below.
            </p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {(['A', 'B', 'C'] as const).map((c) => (
                <label key={c} className="rounded-md border border-line bg-surface-2 p-2">
                  <span className="mono block text-[11px] text-ink-3">Class {c}</span>
                  <input type="number" min={5} max={60} step={5} value={p.cycleDays[c]}
                    onChange={(e) => setPolicy({ cycleDays: { ...p.cycleDays, [c]: Number(e.target.value) } })}
                    className="num mt-0.5 w-full bg-transparent text-[15px] font-medium outline-none" />
                </label>
              ))}
            </div>
          </div>
          <div>
            <div className="flex items-baseline justify-between">
              <label htmlFor="ownerThreshold" className="mono text-[12px] font-medium">OWNER_APPROVAL_THRESHOLD</label>
              <span className="num text-[13px] font-semibold">{lakh(p.ownerApprovalThreshold)}</span>
            </div>
            <input id="ownerThreshold" type="range" min={50_000} max={500_000} step={25_000} value={p.ownerApprovalThreshold}
              onChange={(e) => setPolicy({ ownerApprovalThreshold: Number(e.target.value) })}
              className="mt-1.5 w-full accent-[var(--accent)]" />
            <p className="mt-1 text-[11.5px] leading-snug text-ink-3">
              §11: any order above the owner’s threshold is the owner’s decision. Lines above it say so on the desk
              and their draft is labelled for the owner’s sign-off.
            </p>
          </div>
          {knobs.map((n) => (
            <div key={n.k}>
              <div className="flex items-baseline justify-between">
                <label htmlFor={n.k} className="mono text-[12px] font-medium">{n.label}</label>
                <span className="num text-[13px] font-semibold">{p[n.k]} days</span>
              </div>
              <input id={n.k} type="range" min={n.min} max={n.max} step={n.step} value={p[n.k]}
                onChange={(e) => setPolicy({ [n.k]: Number(e.target.value) })}
                className="mt-1.5 w-full accent-[var(--accent)]" />
              <p className="mt-1 text-[11.5px] leading-snug text-ink-3">{n.help}</p>
            </div>
          ))}
          <div>
            <p className="mono text-[12px] font-medium">Coverage ceiling by item class</p>
            <p className="mb-2 text-[11.5px] leading-snug text-ink-3">
              §13-4: 2.0 months for everything is a placeholder — it should vary by ABC/XYZ class.
            </p>
            <div className="grid grid-cols-3 gap-2">
              {(['A', 'B', 'C'] as const).map((c) => (
                <label key={c} className="rounded-md border border-line bg-surface-2 p-2">
                  <span className="mono block text-[11px] text-ink-3">Class {c}</span>
                  <input type="number" min={0.5} max={6} step={0.5} value={p.coverageCeiling[c]}
                    onChange={(e) => setPolicy({ coverageCeiling: { ...p.coverageCeiling, [c]: Number(e.target.value) } })}
                    className="num mt-0.5 w-full bg-transparent text-[15px] font-medium outline-none" />
                </label>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <Card title="What that policy produces" sub="Proof that nothing on this screen is a stored display value">
        <div className="space-y-2.5 p-4">
          <div className="flex items-baseline justify-between border-b border-line-soft pb-2">
            <span className="text-[12.5px] text-ink-2">Lines needing a decision</span>
            <Num d={kpis.linesNeedingDecision} format="int" size="lg" />
          </div>
          <div className="flex items-baseline justify-between border-b border-line-soft pb-2">
            <span className="text-[12.5px] text-ink-2">Cash to release</span>
            <Num d={kpis.toRelease} format="lakh" size="lg" />
          </div>
          <div className="flex items-baseline justify-between border-b border-line-soft pb-2">
            <span className="text-[12.5px] text-ink-2">Lines held by the guardrail</span>
            <span className="figure text-[20px]">{kpis.heldCount}</span>
          </div>
          <ul className="space-y-1 pt-1">
            {rows.filter((r) => r.reorderQty.value > 0).map((r) => (
              <li key={r.item.id} className="flex items-baseline justify-between gap-2 text-[12px]">
                <span className="mono truncate text-ink-2">{r.item.code}</span>
                <span className="num">{num(r.reorderQty.value, 0)} {r.item.uom} · {money(r.landedTotal.value)}</span>
              </li>
            ))}
          </ul>
          <p className="pt-2 text-[11.5px] leading-snug text-ink-3">
            Reset to 15 / 2 / 3 and the figures return to exactly what §9.1 states — ₹4.55 L across
            3 POs, 4 lines needing a decision. Decided lines keep their figures whatever you do here.
          </p>
          <div className="rounded-md border border-warn/30 bg-warn-soft/50 p-3">
            <p className="mono text-[10px] uppercase tracking-wider text-warn">Known gaps, stated rather than hidden</p>
            <ul className="mt-1 space-y-1 text-[11.5px] leading-snug text-ink-2">
              <li>· <strong className="text-ink">Unit conversion (§13-6)</strong> — steel is bought in MT and issued in kg. No conversion factor is modelled yet; the two datasets hold CRCA in different units.</li>
              <li>· <strong className="text-ink">One login per employee</strong> — every action here is logged against a single demo buyer. Real attribution needs the login (§12, §14 stack).</li>
              <li>· <strong className="text-ink">Safety stock</strong> is a given per item, not recomputed monthly from variance as §5 describes — the seed’s values do not follow the 60% guideline, so deriving it would break every reorder point.</li>
            </ul>
          </div>
        </div>
      </Card>
    </div>
  )
}

function Desk() {
  const [tab, setTab] = useState<Tab>('desk')
  const { reset, rows, state } = useDesk()
  const { say } = useApp()
  const decided = Object.keys(state.decisions).length

  return (
    <>
      <PageHeader eyebrow="Stage 1 · Sourcing & procurement" title="Sourcing Desk"
        meta={<>
          <Pill mono>run R-0902 · {longDate('2026-09-02')}</Pill>
          <Pill tone="accent">SRC-01 · 03 · 04</Pill>
          {decided > 0 && <Pill tone="good">{decided} decided</Pill>}
        </>}
        actions={<>
          <Button size="sm" onClick={() => {
            say('The system raises, holds and drafts. It never places an order, never contacts a supplier, and never edits a customer record.')
          }}>What this system will not do</Button>
          <Button size="sm" variant="ghost" onClick={reset}>Reset demo</Button>
        </>} />

      <TabStrip value={tab} onChange={setTab} tabs={[
        { id: 'desk', label: 'Buyer’s desk', sub: `${rows.length} materials` },
        { id: 'history', label: 'Run history', sub: 'immutable snapshots' },
        { id: 'policy', label: 'Policy & ceilings', sub: 'the knobs inside §5' },
      ]} />

      <div key={tab} className="anim-fade-in">
        {tab === 'desk' && <DeskTab />}
        {tab === 'history' && <HistoryTab />}
        {tab === 'policy' && <PolicyTab />}
      </div>
    </>
  )
}

export default function Page() {
  return <Desk />
}
