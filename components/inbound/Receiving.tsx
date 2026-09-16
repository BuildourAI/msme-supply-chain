'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Button, Card, Pill, StatusPill } from '@/components/ui/bits'
import { Icon, type IconName } from '@/components/ui/icons'
import { Dumbbell } from '@/components/charts/exec-charts'
import { Dialog } from '@/components/ui/Dialog'
import { Num } from '@/components/ui/Num'
import { money, num, qtyText, shortDate } from '@/lib/domain/format'
import { outcomeForMeasure } from '@/lib/domain/inbound'
import type { CheckOutcome, SpecCheck } from '@/lib/domain/types'
import type { Tone as ToneT } from '@/lib/domain/format'
import { Note } from '@/components/ui/Note'
import { useInbound, type GrnRow } from './store'

const QC_TONE: Record<string, ToneT> = { fresh: 'accent', at_limit: 'warn', overdue: 'critical' }
const QC_LABEL: Record<string, string> = {
  fresh: 'Inside the QC window', at_limit: 'At the QC limit', overdue: 'QC overdue — escalated',
}
const KIND_LABEL: Record<SpecCheck['kind'], string> = {
  measure: 'measure', document: 'certificate', visual: 'visual', count: 'count',
}
/* what kind of check it is, as a picture — a ruler, a certificate, an eye, a
   tally. The word rides along as the title and for a screen reader, so the
   glyph is never carrying the meaning by itself. */
const KIND_ICON: Record<SpecCheck['kind'], IconName> = {
  measure: 'ruler', document: 'doc', visual: 'eye', count: 'hash',
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

const QC_RAIL: Record<string, string> = {
  fresh: 'bg-accent', at_limit: 'bg-warn', overdue: 'bg-critical',
}
const QC_FILL: Record<string, string> = {
  fresh: 'bg-accent', at_limit: 'bg-warn', overdue: 'bg-critical',
}

/**
 * How long this receipt has been standing at the gate, against the two dates
 * that matter: the day the QC window closes and the day it escalates.
 *
 * It replaces four separate sentences — received on, in QC N days, issuable
 * from, and the policy line — with one picture where "past the limit" is a
 * thing you see rather than a thing you work out from two dates.
 */
function QcClock({ row }: { row: GrnRow }) {
  const { policy } = useInbound()
  const age = row.age.value
  const scale = Math.max(age, policy.qcOverdueDays + 1) * 1.1
  const at = (d: number) => `${Math.min(99.5, (d / scale) * 100)}%`
  return (
    <div className="mt-2" title={`Received ${shortDate(row.grn.receivedOn)} · issuable from ${shortDate(row.issuable.value)} if closed on time`}>
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
        <div className={`anim-reveal h-full rounded-full ${QC_FILL[row.state]}`} style={{ width: at(age) }} />
        <div aria-hidden className="absolute top-0 h-full w-[2px] bg-ink/45" style={{ left: at(policy.inboundQcDays) }} />
        <div aria-hidden className="absolute top-0 h-full w-[2px] bg-ink" style={{ left: at(policy.qcOverdueDays) }} />
      </div>
      <p className="mt-1 flex flex-wrap items-baseline gap-x-2 text-[10.5px] text-ink-3">
        <span className="mono">received {shortDate(row.grn.receivedOn)}</span>
        <Num d={row.age} format="days" dp={0} size="sm"
             suffix={row.age.value === 1 ? ' day at the gate' : ' days at the gate'}
             tone={row.state === 'overdue' ? 'critical' : row.state === 'at_limit' ? 'warn' : undefined}
             className="text-[10.5px]" />
        <span className="ml-auto flex items-center gap-1">
          <span aria-hidden className="inline-block h-2 w-[2px] translate-y-[1px] bg-ink/45" />
          {policy.inboundQcDays}d window
          <span aria-hidden className="ml-1.5 inline-block h-2 w-[2px] translate-y-[1px] bg-ink" />
          {policy.qcOverdueDays}d escalate
        </span>
      </p>
    </div>
  )
}

/**
 * One pip per check on the item's spec: hollow until it is marked, green on a
 * pass, red on a fail. Five receipts' worth of "0 of 3 checks marked" is a
 * sentence you read; a row of pips is a thing you glance at. The words stay
 * beside them, because a colour never carries a state alone (§10).
 */
function CheckPips({ row }: { row: GrnRow }) {
  const marked = row.results.filter((r) => r.outcome !== 'not_checked').length
  if (row.checks.length === 0) return null
  return (
    <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink-3">
      <span aria-hidden className="flex items-center gap-1">
        {row.checks.map((c) => {
          const o = row.results.find((r) => r.checkId === c.id)?.outcome ?? 'not_checked'
          return (
            <span key={c.id} title={`${c.label} — ${o === 'not_checked' ? 'not marked yet' : o}`}
              className={`size-2.5 rounded-full border ${
                o === 'pass' ? 'border-good bg-good'
                  : o === 'fail' ? 'border-critical bg-critical'
                  : 'border-ink-4'}`} />
          )
        })}
      </span>
      <span>{marked} of {row.checks.length} checks marked</span>
    </p>
  )
}

function QueueCard({ row }: { row: GrnRow }) {
  const { openInspection, policy } = useInbound()
  const g = row.grn
  return (
    <li data-grn={g.grnNo} style={{ '--i': 0 } as React.CSSProperties}
        className={`anim-fade-up relative mb-2.5 flex break-inside-avoid flex-col overflow-hidden rounded-md border bg-surface pl-2.5 ${
          row.state === 'overdue' ? 'border-critical/40' : 'border-line'}`}>
      <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${QC_RAIL[row.state]}`} />

      <div className="px-2.5 pb-2.5 pt-2.5">
        <div className="flex items-start justify-between gap-2">
          <span className="mono text-[11.5px] font-medium text-ink-2">{g.grnNo}</span>
          <span className="shrink-0">
            <StatusPill tone={QC_TONE[row.state]} label={QC_LABEL[row.state]}
              explain={`Policy allows ${policy.inboundQcDays} days of inbound QC and escalates past ${policy.qcOverdueDays}.`} />
          </span>
        </div>
        <p className="mt-0.5 truncate text-[13px] font-medium" title={g.itemName}>{g.itemName}</p>
        <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-[11px] text-ink-3">
          <span className="mono">{qtyText(g.qtyReceived, g.uom)}</span>
          <span>{g.challanId ? 'jobwork return from' : 'from'} {g.vendorName}</span>
          {g.poNo && (
            <span className="mono">{g.poNo}{g.againstVersion ? ` · shipped against v${g.againstVersion}` : ''}</span>
          )}
          {g.challanId && (
            <Link href="/inbound/jobwork" onClick={(e) => e.stopPropagation()}
              className="mono text-accent-ink hover:underline">challan {g.challanId}</Link>
          )}
        </p>

        <QcClock row={row} />
        <CheckPips row={row} />

        {row.staleAgainst && (
          <p className="mt-2 rounded-md border border-critical/30 bg-critical-soft p-2 text-[11.5px] leading-relaxed text-ink-2">
            <strong className="text-ink">This is a stale order arriving.</strong> {g.vendorName} shipped{' '}
            {qtyText(row.staleAgainst.received, g.uom)} against v{g.againstVersion}. Internally the line moved to{' '}
            v{row.staleAgainst.sync.revisions[row.staleAgainst.sync.revisions.length - 1].version} —{' '}
            {qtyText(row.staleAgainst.internal, g.uom)} — and the notice never went out. That is{' '}
            {qtyText(row.staleAgainst.internal - row.staleAgainst.received, g.uom)} short, and it is a
            communication failure, not a supply failure.{' '}
            <Link href="/inbound/orders" className="font-medium text-accent-ink hover:underline">Open INB-02 →</Link>
          </p>
        )}

        {row.checks.length === 0 && (
          <p className="mt-2 rounded-md border border-warn/30 bg-warn-soft p-2 text-[11.5px] leading-relaxed text-ink-2">
            No inspection spec on file. Received unchecked — booked in, never blocked, and never counted as cover.
          </p>
        )}
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-line-soft px-2.5 py-2">
        <Button size="sm" variant="primary" onClick={() => openInspection(g.id)}>
          {row.results.some((r) => r.outcome !== 'not_checked') ? 'Continue inspection' : 'Inspect & close'}
        </Button>
        <span className="ml-auto text-[11px] text-ink-3">
          held <Num d={row.value} format="money" size="sm" className="text-[11px]" />
        </span>
      </div>
    </li>
  )
}

export function ReceivingQueue() {
  const { queue, qcHeld, policy } = useInbound()
  const overdue = queue.filter((r) => r.state === 'overdue')
  const n = queue.length
  /* Columns rather than a grid: one receipt carries a stale-order callout and
     runs twice the height of its neighbours, and a grid row sizes to its
     tallest card — which would leave two cards' worth of white space beside
     it. Multi-column flows the cards instead, so the gate packs tight. */
  const cols = n <= 1 ? '' : n === 2 ? 'md:columns-2' : 'md:columns-2 xl:columns-3'
  return (
    <>
      <Card index={1} title="At the gate" live
        sub="INB-01 · every arrival, inspected against its spec before any of it becomes usable stock"
        annotation={`${policy.inboundQcDays} days of inbound QC · escalates past ${policy.qcOverdueDays}`}
        actions={<span className="text-[12px] text-ink-3">
          Held in QC <Num d={qcHeld} format="money" />
        </span>}>
        {queue.length === 0 ? (
          <p className="m-4 rounded-md border border-good/30 bg-good-soft p-3 text-[12.5px] leading-relaxed text-ink-2">
            Nothing waiting at the gate. Every receipt has a closed GRN behind it, which means every
            quantity on the Inventory page has been looked at by a person against a written spec.
          </p>
        ) : (
          <ul className={`gap-2.5 p-3 [column-gap:0.625rem] ${cols}`}>
            {queue.map((r) => <QueueCard key={r.grn.id} row={r} />)}
          </ul>
        )}

        {overdue.length > 0 && (
          <Note foot label={`${overdue.length === 1 ? 'One receipt is' : `${overdue.length} receipts are`} past the QC window — what that costs`}>
            <strong className="text-ink">
              {overdue.length === 1 ? 'One receipt is' : `${overdue.length} receipts are`} past the QC window.
            </strong>{' '}
            {overdue.map((r) => r.grn.grnNo).join(', ')} — material that has been paid for, is standing in
            the store, and cannot be issued because nobody has looked at it. That is the gap this system
            exists to make visible.
          </Note>
        )}
      </Card>
      <InspectionSheet />
    </>
  )
}

/* --------------------------------------------------------- closed history --- */

type ClosedRow = ReturnType<typeof useInbound>['closedRows'][number]

/** what a closed receipt turned out to be, in one word */
function outcomeOf(r: ClosedRow): { key: 'clean' | 'rejected' | 'spike' | 'deviation'; label: string; tone: ToneT } {
  if (r.deviationReason) return { key: 'deviation', label: 'deviation', tone: 'warn' }
  if (r.spike) return { key: 'spike', label: 'spike', tone: 'critical' }
  if ((r.grn.rejectedQty ?? 0) > 0) return { key: 'rejected', label: 'rejected', tone: 'warn' }
  return { key: 'clean', label: 'clean', tone: 'good' }
}

/**
 * Accepted against rejected, as one bar.
 *
 * The table put 491 and 9 in two columns and left the reader to work out that
 * one is 98% of the other. The bar is that division, drawn.
 */
function SplitBar({ r, h = 'h-1.5' }: { r: ClosedRow; h?: string }) {
  const total = r.grn.qtyReceived || 1
  const rej = r.grn.rejectedQty ?? 0
  const acceptedPct = ((total - rej) / total) * 100
  return (
    <span className={`block w-full overflow-hidden rounded-full bg-surface-3 ${h}`}>
      <span className="anim-reveal flex h-full w-full">
        <span className="h-full bg-good" style={{ width: `${acceptedPct}%` }} />
        <span className="h-full bg-critical" style={{ width: `${100 - acceptedPct}%` }} />
      </span>
    </span>
  )
}

/** The figures behind one tile — shown when a tile is asked to open. */
function ClosedDetail({ r, onClose }: { r: ClosedRow; onClose: () => void }) {
  const { reopenGrn } = useInbound()
  const rej = r.grn.rejectedQty ?? 0
  const failReason = r.grn.failedCheckIds?.length
    ? r.checks.find((c) => c.id === r.grn.failedCheckIds![0])?.failReason
    : null
  return (
    <div className="anim-drop mt-2.5 rounded-md border border-accent/30 bg-accent-soft/40 p-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="mono text-[12px] font-medium">{r.grn.grnNo}</span>
        <span className="text-[12.5px]">{r.grn.itemName}</span>
        <span className="text-[11.5px] text-ink-3">{r.grn.vendorName}</span>
        <span className="mono text-[11px] text-ink-3">received {shortDate(r.grn.receivedOn)}</span>
        {r.grn.challanId && (
          <span className="mono text-[11px] text-ink-3">jobwork return · {r.grn.challanId}</span>
        )}
        <span className="ml-auto flex shrink-0 gap-1.5">
          <Button size="sm" variant="ghost" onClick={() => reopenGrn(r)}>Reopen</Button>
          <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
        </span>
      </div>

      <div className="mt-2"><SplitBar r={r} h="h-2" /></div>

      <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[12px] text-ink-2">
        {r.accepted ? <Num d={r.accepted} format="raw" dp={3} size="sm" /> : <span className="num">—</span>}
        <span className="text-ink-3">accepted</span>
        <span aria-hidden className="text-ink-4">·</span>
        <span className={`num ${rej > 0 ? 'text-warn' : 'text-ink-3'}`}>{num(rej, 3)}</span>
        <span className="text-ink-3">rejected</span>
        {failReason && <span className="text-ink-3">— {failReason}</span>}
      </p>

      <p className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[11.5px] text-ink-3">
        <span>this receipt</span>
        {r.rejPct ? <Num d={r.rejPct} format="raw" dp={2} suffix="%" size="sm" className="text-[11.5px]" /> : <span className="num">0%</span>}
        <span aria-hidden className="text-ink-4">·</span>
        <span>{r.grn.vendorName} trailing</span>
        <Num d={r.trailing} format="raw" dp={2} suffix="%" size="sm" className="text-[11.5px]" />
        {r.spike && (
          <span className="text-critical">— more than the vendor’s own record; spike — escalated</span>
        )}
      </p>

      {r.deviationReason && (
        <p className="mt-1.5 text-[11.5px] italic text-warn">
          accepted under deviation — “{r.deviationReason}”
        </p>
      )}
    </div>
  )
}

export function InspectionHistory() {
  const { closedRows } = useInbound()
  const shown = closedRows.slice(0, 10)
  const [openId, setOpenId] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'rejected' | 'spike' | 'deviation'>('all')

  /* A close made on this screen should show its own result. The newest closed
     receipt opens itself — but only when it is genuinely new, never on first
     paint, or the card would open something the reader never asked about. */
  const topId = shown[0]?.grn.id ?? null
  const prevTop = useRef<string | null>(null)
  useEffect(() => {
    if (prevTop.current !== null && topId !== null && topId !== prevTop.current) setOpenId(topId)
    prevTop.current = topId
  }, [topId])

  useEffect(() => {
    if (!openId) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenId(null) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [openId])

  const counts = {
    rejected: shown.filter((r) => (r.grn.rejectedQty ?? 0) > 0).length,
    spike: shown.filter((r) => r.spike).length,
    deviation: shown.filter((r) => r.deviationReason).length,
  }
  const matches = (r: ClosedRow) =>
    filter === 'all' ? true
      : filter === 'rejected' ? (r.grn.rejectedQty ?? 0) > 0
      : filter === 'spike' ? !!r.spike
      : !!r.deviationReason
  const open = shown.find((r) => r.grn.id === openId) ?? null

  const chip = (id: typeof filter, label: string, n: number) => (
    <button key={id} type="button" onClick={() => setFilter(filter === id ? 'all' : id)}
      aria-pressed={filter === id}
      className={`press rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
        filter === id ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line text-ink-2 hover:bg-surface-2'}`}>
      {n} {label}
    </button>
  )

  return (
    <Card index={2} title="Closed receipts" live
      sub="§11 · every close is reversible and logged — and every one of them moves a vendor’s trailing rejection rate"
      actions={
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mono text-[10.5px] text-ink-3">{shown.length} closed</span>
          {counts.rejected > 0 && chip('rejected', 'with rejections', counts.rejected)}
          {counts.spike > 0 && chip('spike', 'spikes', counts.spike)}
          {counts.deviation > 0 && chip('deviation', 'under deviation', counts.deviation)}
        </div>
      }>
      <div className="p-3">
        {/* One tile per receipt: what it was, how it split, and how it ended.
            Everything else waits until the tile is asked to open. */}
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {shown.map((r) => {
            const o = outcomeOf(r)
            const on = r.grn.id === openId
            const dim = filter !== 'all' && !matches(r)
            return (
              <li key={r.grn.id}>
                <button type="button" data-grn={r.grn.grnNo} aria-expanded={on}
                  onClick={() => setOpenId(on ? null : r.grn.id)}
                  title={`${r.grn.grnNo} · ${r.grn.itemName} · ${r.grn.vendorName} — click for the figures`}
                  className={`press block w-full rounded-md border p-2 text-left transition-all ${
                    on ? 'border-accent bg-accent-soft/50' : 'border-line bg-surface hover:bg-surface-2'} ${
                    dim ? 'opacity-40' : ''}`}>
                  <span className="flex items-center gap-1">
                    <span className="mono truncate text-[11px] font-medium text-ink-2">{r.grn.grnNo}</span>
                    {r.grn.challanId && (
                      <span aria-hidden title="jobwork return" className="shrink-0 text-[10px] text-ink-3">↩</span>
                    )}
                    {(r.spike || r.deviationReason) && (
                      <Icon name="alert" className={`ml-auto size-3 shrink-0 ${r.spike ? 'text-critical' : 'text-warn'}`} />
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-[11.5px]" title={r.grn.itemName}>{r.grn.itemName}</span>
                  <span className="mt-1.5 block"><SplitBar r={r} /></span>
                  <span className={`mono mt-1 block text-[10px] ${
                    o.tone === 'critical' ? 'text-critical' : o.tone === 'warn' ? 'text-warn' : 'text-ink-3'}`}>
                    {o.label} · {shortDate(r.grn.receivedOn)}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>

        {open
          ? <ClosedDetail r={open} onClose={() => setOpenId(null)} />
          : (
            <p className="mt-2.5 text-[11.5px] text-ink-3">
              Click a receipt for what was accepted, what was rejected and why — and to reopen it.
            </p>
          )}
      </div>
      <Note foot label="How a rejection here re-prices that supplier">
        This table is what a rejection allowance is an average of. §5 prices every quote at
        rate × trailing_rejection_rate — until now that rate was a stored constant. Close a GRN with a
        rejection on it and the Sourcing Desk re-prices that supplier on the next run.
      </Note>
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
                    <span className="ml-auto shrink-0 text-ink-3" title={KIND_LABEL[c.kind]}>
                      <Icon name={KIND_ICON[c.kind]} className="size-3.5" />
                      <span className="sr-only">{KIND_LABEL[c.kind]}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        {/* the four glyphs, named once — a legend, not a column of words */}
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-line-soft pt-2.5">
          {(['measure', 'document', 'visual', 'count'] as SpecCheck['kind'][]).map((k) => (
            <li key={k} className="flex items-center gap-1.5 text-[10.5px] text-ink-3">
              <Icon name={KIND_ICON[k]} className="size-3.5" />{KIND_LABEL[k]}
            </li>
          ))}
        </ul>
      </div>
      <Note foot label="What “inspected” means here, and where a failure goes">
        Two to four checks, a tolerance and a certificate. This is not a quality-management system;
        it is the difference between “we checked it” and a record of what was checked, by whom, and
        against what number. Every failure routes to one of the eight non-usable reasons the
        Inventory page already displays — so a rejection here and a lot there are the same fact.
      </Note>
    </Card>
  )
}

/* ------------------------------------------------------- lead-time truth ---- */

/**
 * Quoted against actual, per material.
 *
 * The table gave three columns — quoted, actual, drift — and asked the reader
 * to subtract. The dumbbell draws the subtraction: two dots, the gap between
 * them coloured, and a vendor who takes longer than they promise reads as a
 * bar leaning right before any number is read.
 */
export function LeadTimeTruth({ rows }: {
  rows: { code: string; name: string; vendor: string; quoted: number; actual: React.ComponentProps<typeof Num>['d'] }[]
}) {
  return (
    <Card index={4} title="Lead-time truth" live
      sub="§5 · the trailing average of the last six actual receipts, never the vendor’s quoted figure">
      <div className="p-3.5">
        <Dumbbell unit="days" fromLabel="quoted" toLabel="actual, last 6 receipts"
          rows={rows.map((r) => ({
            label: r.name,
            sub: `${r.code} · ${r.vendor}`,
            from: r.quoted,
            to: r.actual.value as number,
            inspect: <Num d={r.actual} format="days" suffix="d" size="sm" className="text-[10.5px]" />,
          }))} />
      </div>
      <Note foot label="Why every lead time here is computed, not stored">
        The receipt side of INB-01. Every lead time here is computed from six receipt records, not
        stored as a number — click one to see the six dates it averages. Closing a GRN files another
        receipt, so this table moves as the gate is worked.
      </Note>
    </Card>
  )
}
