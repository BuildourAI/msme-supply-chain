'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Button, Card, Pill, StatusPill } from '@/components/ui/bits'
import { Dialog } from '@/components/ui/Dialog'
import { Num } from '@/components/ui/Num'
import { money, num, qtyText, shortDate } from '@/lib/domain/format'
import { outcomeForMeasure } from '@/lib/domain/inbound'
import type { CheckOutcome, SpecCheck } from '@/lib/domain/types'
import type { Tone as ToneT } from '@/lib/domain/format'
import { useInbound, type GrnRow } from './store'

const QC_TONE: Record<string, ToneT> = { fresh: 'accent', at_limit: 'warn', overdue: 'critical' }
const QC_LABEL: Record<string, string> = {
  fresh: 'Inside the QC window', at_limit: 'At the QC limit', overdue: 'QC overdue — escalated',
}
const KIND_LABEL: Record<SpecCheck['kind'], string> = {
  measure: 'measure', document: 'certificate', visual: 'visual', count: 'count',
}

/* ------------------------------------------------------ the inspection sheet */

function CheckRow({ row, check }: { row: GrnRow; check: SpecCheck }) {
  const { mark } = useInbound()
  const result = row.results.find((r) => r.checkId === check.id)
  const [reading, setReading] = useState(result?.measured != null ? String(result.measured) : '')

  const setMeasure = (v: string) => {
    setReading(v)
    const n = v.trim() === '' ? undefined : Number(v)
    mark(row.grn.id, check, outcomeForMeasure(check, n), n)
  }

  const outcome = result?.outcome ?? 'not_checked'
  const tone: ToneT = outcome === 'pass' ? 'good' : outcome === 'fail' ? 'critical' : 'neutral'

  return (
    <li className="rounded-md border border-line bg-surface-2 p-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-[13px] font-medium">{check.label}</span>
        <span className="mono rounded border border-line px-1.5 text-[10px] uppercase tracking-wide text-ink-3">
          {KIND_LABEL[check.kind]}
        </span>
        {check.kind === 'measure' && (
          <span className="mono text-[11px] text-ink-3">
            {num(check.min ?? 0, 2)}–{num(check.max ?? 0, 2)} {check.unit}
          </span>
        )}
        {outcome !== 'not_checked' && (
          <span className="ml-auto">
            <StatusPill tone={tone} label={outcome === 'pass' ? 'Pass' : 'Fail'} />
          </span>
        )}
      </div>

      {check.kind === 'measure' ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="text-[12px] text-ink-2" htmlFor={`m-${row.grn.id}-${check.id}`}>Reading</label>
          <input id={`m-${row.grn.id}-${check.id}`} type="number" step="0.01" value={reading}
            onChange={(e) => setMeasure(e.target.value)}
            placeholder={`${check.min}–${check.max}`}
            className="num w-28 rounded-md border border-line bg-surface px-2 py-1 text-[12.5px] outline-none focus:border-accent" />
          <span className="mono text-[11px] text-ink-3">{check.unit}</span>
          {outcome === 'fail' && (
            <span className="text-[11.5px] text-critical">
              outside the band — no one has to agree, the reading decides
            </span>
          )}
          {reading !== '' && (
            <button type="button" onClick={() => setMeasure('')}
              className="ml-auto rounded px-1.5 py-0.5 text-[11px] text-ink-3 hover:bg-surface-3 hover:text-ink">
              Clear
            </button>
          )}
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          {(['pass', 'fail'] as CheckOutcome[]).map((o) => (
            <Button key={o} size="sm" variant={outcome === o ? (o === 'pass' ? 'primary' : 'danger') : 'default'}
              onClick={() => mark(row.grn.id, check, o)}>
              {o === 'pass'
                ? check.kind === 'document' ? 'Certificate present' : 'Pass'
                : check.kind === 'document' ? 'Missing' : 'Fail'}
            </Button>
          ))}
          {outcome !== 'not_checked' && (
            <Button size="sm" variant="ghost" onClick={() => mark(row.grn.id, check, 'not_checked')}>
              Unmark
            </Button>
          )}
        </div>
      )}

      {outcome === 'fail' && (
        <p className="mt-2 rounded border border-critical/25 bg-critical-soft px-2 py-1 text-[11.5px] text-ink-2">
          Failure lands the material in <strong className="text-ink">{check.failBucket.replace('_', ' ')}</strong> —
          “{check.failReason}”. That is the reason recorded; there is no free-text box for it.
        </p>
      )}
    </li>
  )
}

function InspectionSheet() {
  const { openGrn, openInspection, closeGrn, policy } = useInbound()
  const [rejected, setRejected] = useState('0')
  const [deviation, setDeviation] = useState('')

  useEffect(() => { setRejected('0'); setDeviation('') }, [openGrn?.grn.id])

  if (!openGrn) return <Dialog open={false} onClose={() => {}} title="">{null}</Dialog>

  const g = openGrn.grn
  const rej = Number(rejected) || 0
  const overRejected = rej > g.qtyReceived || rej < 0
  const anyFail = openGrn.failed.length > 0
  // §11 override-never-block: a failed check with nothing rejected is allowed,
  // but only against a written reason, and it goes on the audit trail as one.
  const needsDeviation = anyFail && rej === 0
  const canClose = openGrn.complete && !overRejected && (!needsDeviation || deviation.trim().length > 3)
  const thisPct = g.qtyReceived === 0 ? 0 : (rej / g.qtyReceived) * 100
  const spike = rej > 0 && openGrn.trailing.value > 0 && thisPct > openGrn.trailing.value * policy.rejectionSpikeMultiple

  return (
    <Dialog open wide onClose={() => openInspection(null)}
      title={`${g.grnNo} · ${g.itemName}`}
      sub={`${qtyText(g.qtyReceived, g.uom)} from ${g.vendorName} · received ${shortDate(g.receivedOn)}`}>
      <div className="max-h-[62vh] overflow-y-auto px-4 py-4">
        {openGrn.checks.length === 0 ? (
          <p className="rounded-md border border-warn/30 bg-warn-soft p-3 text-[12.5px] leading-relaxed text-ink-2">
            <strong className="text-ink">No inspection spec on file for this item.</strong> The receipt is
            not blocked — it is booked in as <span className="mono">awaiting_qc</span> and flagged
            “received unchecked”. Non-usable never counts as cover (§11), so an uninspected receipt
            cannot make a line look covered. Write the spec, then close this.
          </p>
        ) : (
          <>
            <ul className="space-y-2.5">
              {openGrn.checks.map((c) => <CheckRow key={c.id} row={openGrn} check={c} />)}
            </ul>

            <div className="mt-4 rounded-md border border-line bg-surface-2 p-3">
              <label htmlFor="rejqty" className="block text-[12.5px] font-medium">
                Quantity rejected
              </label>
              <p className="mt-0.5 text-[11.5px] text-ink-3">
                Partial acceptance is the normal case — accept 950, reject 50.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input id="rejqty" type="number" step="0.001" min={0} max={g.qtyReceived} value={rejected}
                  onChange={(e) => setRejected(e.target.value)}
                  className="num w-32 rounded-md border border-line bg-surface px-2 py-1 text-[12.5px] outline-none focus:border-accent" />
                <span className="mono text-[11.5px] text-ink-3">
                  {g.uom} of {num(g.qtyReceived, 3)} · accepting {num(Math.max(0, g.qtyReceived - rej), 3)} {g.uom}
                </span>
              </div>
              {overRejected && (
                <p className="mt-1.5 text-[11.5px] text-critical">
                  You cannot reject more than arrived.
                </p>
              )}
              {rej > 0 && (
                <p className="mt-2 text-[11.5px] text-ink-2">
                  This receipt: <span className="num font-medium">{num(thisPct, 2)}%</span> ·
                  {' '}{g.vendorName}’s trailing rate:{' '}
                  <span className="num font-medium">{num(openGrn.trailing.value, 2)}%</span>
                  {spike && (
                    <span className="ml-2 text-critical">
                      more than {policy.rejectionSpikeMultiple}× the vendor’s own record — this escalates rather than files.
                    </span>
                  )}
                </p>
              )}
            </div>

            {needsDeviation && (
              <div className="mt-3 rounded-md border border-warn/40 bg-warn-soft p-3">
                <p className="text-[12.5px] text-ink-2">
                  <strong className="text-ink">
                    {openGrn.failed.length === 1 ? 'A check failed' : `${openGrn.failed.length} checks failed`}
                  </strong>{' '}
                  and you are rejecting nothing. That is allowed — the guardrail holds, it does not block —
                  but it needs a written reason, and it will read as an acceptance under deviation on the trail.
                </p>
                <textarea value={deviation} onChange={(e) => setDeviation(e.target.value)}
                  rows={2} placeholder="Why is this being accepted as it stands?"
                  aria-label="Reason for accepting under deviation"
                  className="mt-2 w-full rounded-md border border-line bg-surface px-2 py-1.5 text-[12.5px] outline-none focus:border-accent" />
              </div>
            )}
          </>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button variant="primary" disabled={openGrn.checks.length > 0 && !canClose}
            title={openGrn.complete || openGrn.checks.length === 0 ? undefined : 'Every check has to be marked before a GRN can close'}
            onClick={() => closeGrn(openGrn, rej, needsDeviation ? deviation.trim() : undefined)}>
            Close GRN
          </Button>
          <Button onClick={() => openInspection(null)}>Not now</Button>
          {openGrn.checks.length > 0 && !openGrn.complete && (
            <span className="text-[11.5px] text-ink-3">
              {openGrn.checks.filter((c) => !openGrn.results.find((r) => r.checkId === c.id && r.outcome !== 'not_checked')).length}
              {' '}check(s) still unmarked — a GRN cannot close on a partial inspection.
            </span>
          )}
        </div>
      </div>
    </Dialog>
  )
}

/* ------------------------------------------------------------- the queue --- */

function QueueCard({ row }: { row: GrnRow }) {
  const { openInspection, policy } = useInbound()
  const g = row.grn
  return (
    <li style={{ '--i': 0 } as React.CSSProperties}
        className={`anim-fade-up lift glass-card shadow-sm rounded-lg border p-3.5 ${
          row.state === 'overdue' ? 'border-critical/40' : 'border-line'}`}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="mono text-[12.5px] font-medium">{g.grnNo}</span>
        <span className="text-[13px]">{g.itemName}</span>
        <span className="mono text-[11px] text-ink-3">{qtyText(g.qtyReceived, g.uom)}</span>
        <span className="ml-auto">
          <StatusPill tone={QC_TONE[row.state]} label={QC_LABEL[row.state]}
            explain={`Policy allows ${policy.inboundQcDays} days of inbound QC and escalates past ${policy.qcOverdueDays}.`} />
        </span>
      </div>

      <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px] text-ink-3">
        <span>{g.challanId ? 'Jobwork return from' : 'From'} {g.vendorName}</span>
        {g.poNo && <span className="mono">{g.poNo}{g.againstVersion ? ` · shipped against v${g.againstVersion}` : ''}</span>}
        {g.challanId && <Link href="/inbound/jobwork" className="mono text-accent hover:underline">challan {g.challanId}</Link>}
        <span>received {shortDate(g.receivedOn)}</span>
        <span>issuable from {shortDate(row.issuable.value)} if closed on time</span>
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px]">
        <span className="text-ink-3">
          In QC <Num d={row.age} format="days" dp={0} suffix={row.age.value === 1 ? ' day' : ' days'} />
        </span>
        <span className="text-ink-3">
          Value <Num d={row.value} format="money" />
        </span>
        <span className="text-ink-3">
          {g.vendorName} trailing rejection <Num d={row.trailing} format="raw" dp={2} suffix="%" />
        </span>
        <span className="mono ml-auto text-[11px] text-ink-3">
          {row.checks.length
            ? `${row.results.filter((r) => r.outcome !== 'not_checked').length} of ${row.checks.length} checks marked`
            : 'no spec on file'}
        </span>
      </div>

      {row.staleAgainst && (
        <p className="mt-2 rounded-md border border-critical/30 bg-critical-soft p-2.5 text-[12px] leading-relaxed text-ink-2">
          <strong className="text-ink">This is a stale order arriving.</strong> {g.vendorName} shipped{' '}
          {qtyText(row.staleAgainst.received, g.uom)} against v{g.againstVersion}. Internally the line moved to{' '}
          v{row.staleAgainst.sync.revisions[row.staleAgainst.sync.revisions.length - 1].version} —{' '}
          {qtyText(row.staleAgainst.internal, g.uom)} — and the notice never went out. That is{' '}
          {qtyText(row.staleAgainst.internal - row.staleAgainst.received, g.uom)} short, and it is a
          communication failure, not a supply failure.{' '}
          <Link href="/inbound/orders" className="font-medium text-accent hover:underline">Open INB-02 →</Link>
        </p>
      )}

      {row.checks.length === 0 && (
        <p className="mt-2 rounded-md border border-warn/30 bg-warn-soft p-2.5 text-[12px] leading-relaxed text-ink-2">
          No inspection spec on file. Received unchecked — booked in, never blocked, and never counted as cover.
        </p>
      )}

      <div className="mt-2.5 flex flex-wrap gap-2">
        <Button size="sm" variant="primary" onClick={() => openInspection(g.id)}>
          {row.results.some((r) => r.outcome !== 'not_checked') ? 'Continue inspection' : 'Inspect & close'}
        </Button>
      </div>
    </li>
  )
}

export function ReceivingQueue() {
  const { queue, qcHeld, policy } = useInbound()
  const overdue = queue.filter((r) => r.state === 'overdue')
  return (
    <>
      <Card index={1} title="At the gate" live
        sub="INB-01 · every arrival, inspected against its spec before any of it becomes usable stock"
        annotation={`${policy.inboundQcDays} days of inbound QC · escalates past ${policy.qcOverdueDays}`}
        actions={<span className="text-[12px] text-ink-3">
          Held in QC <Num d={qcHeld} format="money" />
        </span>}>
        <div className="p-4">
          {queue.length === 0 ? (
            <p className="rounded-md border border-good/30 bg-good-soft p-3 text-[12.5px] leading-relaxed text-ink-2">
              Nothing waiting at the gate. Every receipt has a closed GRN behind it, which means every
              quantity on the Inventory page has been looked at by a person against a written spec.
            </p>
          ) : (
            <ul className="space-y-3">{queue.map((r) => <QueueCard key={r.grn.id} row={r} />)}</ul>
          )}

          {overdue.length > 0 && (
            <p className="mt-3 rounded-md border border-critical/30 bg-critical-soft p-3 text-[12.5px] leading-relaxed text-ink-2">
              <strong className="text-ink">
                {overdue.length === 1 ? 'One receipt is' : `${overdue.length} receipts are`} past the QC window.
              </strong>{' '}
              {overdue.map((r) => r.grn.grnNo).join(', ')} — material that has been paid for, is standing in
              the store, and cannot be issued because nobody has looked at it. That is the gap this system
              exists to make visible.
            </p>
          )}
        </div>
      </Card>
      <InspectionSheet />
    </>
  )
}

/* --------------------------------------------------------- closed history --- */

export function InspectionHistory() {
  const { closedRows, reopenGrn } = useInbound()
  const shown = closedRows.slice(0, 8)
  return (
    <Card index={2} title="Closed receipts" live
      sub="§11 · every close is reversible and logged — and every one of them moves a vendor’s trailing rejection rate">
      <div className="scroll-x overflow-x-auto">
        <table className="w-full min-w-[46rem] border-collapse text-[12.5px]">
          <thead className="bg-surface-2">
            <tr className="text-[11px] uppercase tracking-wide text-ink-3">
              {['GRN', 'Material', 'Supplier', 'Received', 'Accepted', 'Rejected', 'This receipt', 'Trailing', ''].map((h) => (
                <th key={h} className="whitespace-nowrap border-b border-line px-3 py-2 text-left font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.grn.id} className="border-b border-line-soft">
                <td className="mono whitespace-nowrap px-3 py-2 text-[11.5px]">{r.grn.grnNo}</td>
                <td className="px-3 py-2">
                  {r.grn.itemName}
                  {r.grn.challanId && <span className="mono block text-[10.5px] text-ink-3">jobwork return · {r.grn.challanId}</span>}
                  {r.deviationReason && (
                    <span className="block text-[10.5px] italic text-warn">accepted under deviation</span>
                  )}
                </td>
                <td className="px-3 py-2 text-ink-2">{r.grn.vendorName}</td>
                <td className="whitespace-nowrap px-3 py-2 text-ink-3">{shortDate(r.grn.receivedOn)}</td>
                <td className="num px-3 py-2">
                  {r.accepted ? <Num d={r.accepted} format="raw" dp={3} /> : '—'}
                </td>
                <td className={`num px-3 py-2 ${(r.grn.rejectedQty ?? 0) > 0 ? 'text-warn' : 'text-ink-3'}`}>
                  {num(r.grn.rejectedQty ?? 0, 3)}
                  {r.grn.failedCheckIds?.length ? (
                    <span className="block text-[10.5px] text-ink-3">
                      {r.checks.find((c) => c.id === r.grn.failedCheckIds![0])?.failReason ?? '—'}
                    </span>
                  ) : null}
                </td>
                <td className="num px-3 py-2">
                  {r.rejPct ? <Num d={r.rejPct} format="raw" dp={2} suffix="%" /> : '—'}
                  {r.spike && <span className="block text-[10.5px] text-critical">spike — escalated</span>}
                </td>
                <td className="num px-3 py-2 text-ink-3">
                  <Num d={r.trailing} format="raw" dp={2} suffix="%" />
                </td>
                <td className="px-3 py-2 text-right">
                  <Button size="sm" variant="ghost" onClick={() => reopenGrn(r)}>Reopen</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-line-soft px-4 py-3 text-[11.5px] leading-relaxed text-ink-3">
        This table is what a rejection allowance is an average of. §5 prices every quote at
        rate × trailing_rejection_rate — until now that rate was a stored constant. Close a GRN with a
        rejection on it and the Sourcing Desk re-prices that supplier on the next run.
      </p>
    </Card>
  )
}

/* ------------------------------------------------------- the spec register -- */

export function SpecRegister({ specs }: { specs: SpecCheck[] }) {
  const byItem = useMemo(() => {
    const m = new Map<string, SpecCheck[]>()
    for (const c of specs) m.set(c.itemId, [...(m.get(c.itemId) ?? []), c])
    return [...m.entries()]
  }, [specs])
  return (
    <Card index={3} title="Inspection specs" live
      sub={`${specs.length} checks across ${byItem.length} items — what “inspected” means, written down once`}>
      <div className="p-4">
        <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
          {byItem.map(([itemId, checks], i) => (
            <div key={itemId} style={{ '--i': Math.min(i, 6) } as React.CSSProperties}
                 className="anim-fade-up rounded-md border border-line bg-surface-2 p-3">
              <p className="mono text-[11.5px] font-medium">{itemId}</p>
              <ul className="mt-1.5 space-y-1">
                {checks.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-baseline gap-x-2 text-[11.5px]">
                    <span className="text-ink-2">{c.label}</span>
                    {c.kind === 'measure' && (
                      <span className="mono text-[10.5px] text-ink-3">
                        {num(c.min ?? 0, 2)}–{num(c.max ?? 0, 2)} {c.unit}
                      </span>
                    )}
                    <span className="mono ml-auto text-[10px] uppercase tracking-wide text-ink-3">
                      {KIND_LABEL[c.kind]}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11.5px] leading-relaxed text-ink-3">
          Two to four checks, a tolerance and a certificate. This is not a quality-management system;
          it is the difference between “we checked it” and a record of what was checked, by whom, and
          against what number. Every failure routes to one of the eight non-usable reasons the
          Inventory page already displays — so a rejection here and a lot there are the same fact.
        </p>
      </div>
    </Card>
  )
}

/* ------------------------------------------------------- lead-time truth ---- */

export function LeadTimeTruth({ rows }: {
  rows: { code: string; name: string; vendor: string; quoted: number; actual: React.ComponentProps<typeof Num>['d'] }[]
}) {
  return (
    <Card index={4} title="Lead-time truth" live
      sub="§5 · the trailing average of the last six actual receipts, never the vendor’s quoted figure">
      <div className="scroll-x overflow-x-auto">
        <table className="w-full min-w-[40rem] border-collapse text-[12.5px]">
          <thead className="bg-surface-2">
            <tr className="text-[11px] uppercase tracking-wide text-ink-3">
              {['Material', 'Supplier', 'Quoted', 'Actual, last 6 receipts', 'Drift'].map((h) => (
                <th key={h} className="whitespace-nowrap border-b border-line px-3 py-2 text-left font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const drift = (r.actual.value as number) - r.quoted
              return (
                <tr key={r.code} className="border-b border-line-soft">
                  <td className="px-3 py-2">
                    <span className="mono block text-[11px] text-ink-3">{r.code}</span>
                    {r.name}
                  </td>
                  <td className="px-3 py-2 text-ink-2">{r.vendor}</td>
                  <td className="num px-3 py-2">{r.quoted} days</td>
                  <td className="px-3 py-2"><Num d={r.actual} format="days" suffix=" days" /></td>
                  <td className={`num px-3 py-2 ${drift > 0 ? 'text-warn' : 'text-ink-3'}`}>
                    {drift === 0 ? 'none' : `${drift > 0 ? '+' : ''}${drift} days`}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="border-t border-line-soft px-4 py-3 text-[11.5px] leading-relaxed text-ink-3">
        The receipt side of INB-01. Every lead time here is computed from six receipt records, not
        stored as a number — click one to see the six dates it averages. Closing a GRN files another
        receipt, so this table moves as the gate is worked.
      </p>
    </Card>
  )
}
