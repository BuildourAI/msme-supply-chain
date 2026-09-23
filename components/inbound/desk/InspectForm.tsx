'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button, StatusPill } from '@/components/ui/bits'
import { Dialog } from '@/components/ui/Dialog'
import { Icon, type IconName } from '@/components/ui/icons'
import { useWorkspace } from '@/components/workspace/store'
import { num, shortDate } from '@/lib/domain/format'
import { outcomeForMeasure } from '@/lib/domain/inbound'
import type { CheckOutcome, SpecCheck } from '@/lib/domain/types'
import { BUCKET_LABEL, KIND_LABEL } from '@/lib/workspace/checks'
import { receiptRow } from '@/lib/workspace/inbound'
import { closeBlockedBy, closeReceipt, markCheck } from '@/lib/workspace/receipts'
import { RackSelect } from '@/components/inventory/desk/RackSelect'

/**
 * Working down the checks on one receipt, and closing it.
 *
 * The sample company's inspection sheet, on the owner's own records: a reading
 * decides itself against its band — nobody has to agree with it — and every
 * other check is a mark. Each mark is saved as it is made, so an inspection
 * broken off for a phone call is still half done when it is opened again.
 *
 * Partial acceptance is the normal case: accept 950, reject 50. What is
 * rejected lands in the bucket the failed check names, with its reason, and
 * is shown everywhere as stock you cannot use. A failed check with nothing
 * rejected is allowed — override, never block — but only against a reason in
 * writing, and the receipt's page says so.
 */
const KIND_ICON: Record<SpecCheck['kind'], IconName> = {
  measure: 'ruler', document: 'doc', visual: 'eye', count: 'hash',
}

export function InspectForm({ receiptId, onClose, onClosed }: {
  receiptId: string | null
  onClose: () => void
  /** after a successful close — the screen offers the receipt's document */
  onClosed?: (receiptId: string) => void
}) {
  const { workspace, update, today, session } = useWorkspace()
  const [rejected, setRejected] = useState('0')
  const [reason, setReason] = useState('')
  const [tried, setTried] = useState(false)
  const [rack, setRack] = useState('')

  useEffect(() => {
    setRejected('0'); setReason(''); setTried(false)
    // where this material already sits is where the new lot most likely goes
    const r = (workspace?.receipts ?? []).find((x) => x.id === receiptId)
    setRack(workspace?.stockLots.find((l) => l.itemId === r?.itemId && l.rack && l.qty > 0)?.rack ?? '')
  }, [receiptId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!receiptId || !workspace) return null
  const r = (workspace.receipts ?? []).find((x) => x.id === receiptId)
  if (!r) return null
  const row = receiptRow(workspace, r, today)
  const uom = row.item?.uom ?? ''

  const rej = rejected.trim() === '' ? 0 : Number(rejected)
  const blocked = closeBlockedBy(workspace, r, rej, reason)
  const failed = row.failed.length > 0
  const asksReason = (failed && rej === 0) || (!failed && rej > 0)
  const thisPct = r.qty > 0 ? (rej / r.qty) * 100 : 0
  const trailing = row.trailingPct
  const spike = rej > 0 && trailing !== null && trailing > 0
    && thisPct > trailing * workspace.policy.rejectionSpikeMultiple
  const unmarked = row.checks.filter((c) => c.mandatory
    && !row.results.some((x) => x.checkId === c.id && x.outcome !== 'not_checked')).length

  const close = () => {
    setTried(true)
    if (blocked) return
    update((w) => closeReceipt(w, r.id, {
      rejected: rej,
      reason,
      inspector: session.actor,
      closedAt: today,
      rack: rack || undefined,
    }))
    onClose()
    onClosed?.(r.id)
  }

  const noChecks = row.checks.length === 0

  return (
    <Dialog open wide onClose={onClose}
      title={`${r.id} · ${row.item?.name ?? 'Unknown material'}`}
      sub={`${num(r.qty, 3)} ${uom} from ${row.vendor?.name ?? 'Unknown supplier'}${
        row.against ? ` against ${row.against}` : ''} · arrived ${shortDate(r.receivedOn)}`}>
      <div className="max-h-[64vh] space-y-4 overflow-y-auto px-4 py-4">
        {noChecks ? (
          <p className="rounded-md border border-warn/30 bg-warn-soft p-3 text-[12.5px] leading-relaxed text-ink-2">
            <strong className="text-ink">No checks are written for {row.item?.name ?? 'this material'}.</strong>{' '}
            It is not blocked — it closes unchecked, and its receipt says so. Say how much, if any,
            you are turning back.{' '}
            <Link href="/inbound/checks" className="text-accent-ink underline underline-offset-2">
              Write its checks
            </Link> for next time.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {row.checks.map((c) => (
              <CheckRow key={c.id} check={c}
                result={row.results.find((x) => x.checkId === c.id)}
                onMark={(outcome, measured) => update((w) =>
                  markCheck(w, r.id, { checkId: c.id, outcome, measured }))} />
            ))}
          </ul>
        )}

        <div className="rounded-md border border-line bg-surface-2 p-3">
          <label htmlFor="in-rejected" className="block text-[12.5px] font-medium">
            How much are you turning back?
          </label>
          <p className="mt-0.5 text-[11.5px] text-ink-3">
            Partial acceptance is the normal case — accept 950, reject 50. Nought if it all passed.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input id="in-rejected" type="number" step="any" min={0} max={r.qty} value={rejected}
              onChange={(e) => setRejected(e.target.value)} inputMode="decimal"
              className="num w-32 rounded-md border border-line bg-surface px-2 py-1.5 text-[13px] outline-none focus:border-accent" />
            <span className="mono text-[11.5px] text-ink-3">
              {uom} of {num(r.qty, 3)} · accepting {num(Math.max(0, r.qty - (Number.isFinite(rej) ? rej : 0)), 3)} {uom}
            </span>
          </div>
          {rej > 0 && Number.isFinite(rej) && (
            <p className="mt-2 text-[11.5px] text-ink-2">
              This delivery: <span className="num font-medium">{num(thisPct, 1)}%</span>
              {trailing !== null && <> · {row.vendor?.name}&apos;s record before it:{' '}
                <span className="num font-medium">{num(trailing, 1)}%</span></>}
              {spike && (
                <span className="ml-1 text-critical">
                  — more than {workspace.policy.rejectionSpikeMultiple}× their own record. The dashboard
                  will raise it as a pattern, not a bad batch.
                </span>
              )}
            </p>
          )}
        </div>

        {(workspace.racks ?? []).length > 0 && (
          <div className="rounded-md border border-line bg-surface-2 p-3">
            <label htmlFor="in-rack" className="block text-[12.5px] font-medium">Which rack does it go on?</label>
            <p className="mt-0.5 text-[11.5px] text-ink-3">
              What is accepted lands on this rack in the store&apos;s book; anything turned back is held beside it.
            </p>
            <div className="mt-2 max-w-xs">
              <RackSelect id="in-rack" value={rack} onChange={setRack} none="Not on a rack yet" />
            </div>
          </div>
        )}

        {asksReason && (
          <div className="rounded-md border border-warn/40 bg-warn-soft p-3">
            <p className="text-[12.5px] text-ink-2">
              {failed ? (
                <><strong className="text-ink">
                  {row.failed.length === 1 ? 'A check failed' : `${row.failed.length} checks failed`}
                </strong> and nothing is being turned back. That is allowed — the gate holds, it does not
                block — but it needs a reason, and the receipt will say it was accepted as it stands.</>
              ) : (
                <><strong className="text-ink">Nothing failed a check</strong>, and some is being turned
                back. Say why — the rejected material carries the reason on every screen.</>
              )}
            </p>
            <textarea id="in-deviation" value={reason} onChange={(e) => setReason(e.target.value)}
              rows={2} placeholder={failed ? 'Why is this being accepted as it stands?' : 'Why is this being turned back?'}
              aria-label={failed ? 'Reason for accepting under deviation' : 'Reason for rejecting'}
              className="mt-2 w-full rounded-md border border-line bg-surface px-2 py-1.5 text-[12.5px] outline-none focus:border-accent" />
          </div>
        )}

        {tried && blocked && (
          <p role="alert" className="rounded-md border border-critical/30 bg-critical-soft px-3 py-2 text-[12.5px] text-critical">
            {blocked}
          </p>
        )}
      </div>

      <footer className="flex flex-wrap items-center gap-2 border-t border-line-soft px-4 py-3">
        {!noChecks && unmarked > 0 && (
          <span className="text-[12px] text-ink-3">
            {unmarked} check{unmarked === 1 ? '' : 's'} still to mark — a receipt cannot close on a partial inspection.
          </span>
        )}
        <span className="ml-auto" />
        <Button onClick={onClose}>Not now</Button>
        <Button variant="primary" onClick={close}>
          {noChecks ? 'Close it unchecked' : 'Close the receipt'}
        </Button>
      </footer>
    </Dialog>
  )
}

function CheckRow({ check, result, onMark }: {
  check: SpecCheck
  result?: { outcome: CheckOutcome; measured?: number }
  onMark: (outcome: CheckOutcome, measured?: number) => void
}) {
  const [reading, setReading] = useState(result?.measured != null ? String(result.measured) : '')
  const outcome = result?.outcome ?? 'not_checked'

  const setMeasure = (v: string) => {
    setReading(v)
    const n = v.trim() === '' ? undefined : Number(v)
    onMark(outcomeForMeasure(check, n), n)
  }

  const band = check.min != null && check.max != null ? `${num(check.min, 3)} – ${num(check.max, 3)}`
    : check.min != null ? `at least ${num(check.min, 3)}` : check.max != null ? `at most ${num(check.max, 3)}` : ''

  return (
    <li className="rounded-md border border-line bg-surface-2 p-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span aria-hidden className="grid size-6 place-items-center rounded-full bg-surface text-ink-3">
          <Icon name={KIND_ICON[check.kind]} className="size-3.5" />
        </span>
        <span className="text-[13px] font-semibold">{check.label}</span>
        <span className="text-[11px] text-ink-3">{KIND_LABEL[check.kind]}</span>
        {check.kind === 'measure' && band && (
          <span className="mono text-[11px] text-ink-3">{band} {check.unit}</span>
        )}
        {!check.mandatory && <span className="text-[11px] text-ink-4">if time allows</span>}
        {outcome !== 'not_checked' && (
          <span className="ml-auto">
            <StatusPill tone={outcome === 'pass' ? 'good' : 'critical'} label={outcome === 'pass' ? 'Pass' : 'Fail'} />
          </span>
        )}
      </div>

      {check.kind === 'measure' ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="text-[12px] text-ink-2" htmlFor={`in-reading-${check.id}`}>Reading</label>
          <input id={`in-reading-${check.id}`} type="number" step="any" inputMode="decimal" value={reading}
            onChange={(e) => setMeasure(e.target.value)}
            placeholder={band}
            className="num w-28 rounded-md border border-line bg-surface px-2 py-1.5 text-[13px] outline-none focus:border-accent" />
          <span className="mono text-[11px] text-ink-3">{check.unit}</span>
          {outcome === 'fail' && (
            <span className="text-[11.5px] text-critical">outside the band — the reading decides</span>
          )}
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          {(['pass', 'fail'] as CheckOutcome[]).map((o) => (
            <Button key={o} size="sm"
              variant={outcome === o ? (o === 'pass' ? 'primary' : 'danger') : 'default'}
              onClick={() => onMark(o)}>
              {o === 'pass'
                ? check.kind === 'document' ? 'Present' : 'Pass'
                : check.kind === 'document' ? 'Missing' : 'Fail'}
            </Button>
          ))}
          {outcome !== 'not_checked' && (
            <Button size="sm" variant="ghost" onClick={() => onMark('not_checked')}>Unmark</Button>
          )}
        </div>
      )}

      {outcome === 'fail' && (
        <p className="mt-2 rounded border border-critical/25 bg-critical-soft px-2 py-1 text-[11.5px] text-ink-2">
          What you turn back lands in <strong className="text-ink">{BUCKET_LABEL[check.failBucket].toLowerCase()}</strong>
          {' '}— “{check.failReason}”.
        </p>
      )}
    </li>
  )
}
