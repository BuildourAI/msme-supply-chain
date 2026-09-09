'use client'
import { useEffect, useState } from 'react'
import { Button, Card, Pill, StatusPill } from '@/components/ui/bits'
import { Dialog } from '@/components/ui/Dialog'
import { Num } from '@/components/ui/Num'
import { money, num, qtyText, shortDate } from '@/lib/domain/format'
import type { Tone } from '@/lib/domain/format'
import { latestRevision } from '@/lib/domain/inbound'
import { useInbound, type SyncRow } from './store'

const SYNC_TONE: Record<string, Tone> = {
  acknowledged: 'good', awaiting_ack: 'warn', not_told: 'critical',
}
const SYNC_LABEL: Record<string, string> = {
  acknowledged: 'Vendor is on the current version',
  awaiting_ack: 'Notice sent — awaiting acknowledgement',
  not_told: 'Changed — vendor not told',
}

/* ------------------------------------------------------------ the draft ---- */

function NoticeDraft() {
  const { draftRow, showDraft, markNotified } = useInbound()
  const [copied, setCopied] = useState(false)
  useEffect(() => { setCopied(false) }, [draftRow?.sync.poLineId])
  if (!draftRow) return null

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(draftRow.draft)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <Dialog open wide onClose={() => showDraft(null)}
      title={`Change notice · ${draftRow.sync.poNo}`}
      sub={`Drafted for ${draftRow.sync.vendorName} — the system never sends it (§11)`}>
      <div className="px-4 py-4">
        <pre className="mono max-h-[38vh] overflow-auto whitespace-pre-wrap rounded-md border border-line bg-surface-2 p-3 text-[12px] leading-relaxed text-ink-2">
{draftRow.draft}
        </pre>
        <p className="mt-3 text-[12.5px] leading-relaxed text-ink-2">
          Copy this into WhatsApp or email and send it yourself. Then mark it sent — the line moves to
          “awaiting acknowledgement”, and the cover figures{' '}
          <strong className="text-ink">still use the old quantity</strong> until{' '}
          {draftRow.sync.vendorName} confirms, because that is what will actually arrive.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="primary" onClick={copy}>{copied ? 'Copied ✓' : 'Copy the text'}</Button>
          <Button onClick={() => markNotified(draftRow)}>I have sent it</Button>
          <Button variant="ghost" onClick={() => showDraft(null)}>Close</Button>
        </div>
      </div>
    </Dialog>
  )
}

/* -------------------------------------------------------- revise / ack ----- */

function ReviseDialog({ row, onClose }: { row: SyncRow | null; onClose: () => void }) {
  const { revise } = useInbound()
  const [qty, setQty] = useState('')
  const [date, setDate] = useState('')
  const [reason, setReason] = useState('')
  useEffect(() => {
    if (!row) return
    const r = latestRevision(row.sync)
    setQty(String(r.qty)); setDate(r.promisedDate); setReason('')
  }, [row])
  if (!row) return null

  const cur = latestRevision(row.sync)
  const n = Number(qty)
  const changed = (Number.isFinite(n) && n !== cur.qty) || date !== cur.promisedDate
  const ok = changed && reason.trim().length > 3 && Number.isFinite(n) && n > 0

  return (
    <Dialog open onClose={onClose} title={`Change ${row.sync.poNo}`}
      sub={`Currently v${cur.version} · ${qtyText(cur.qty, row.uom)} due ${shortDate(cur.promisedDate)}`}>
      <div className="space-y-3 px-4 py-4">
        <div className="flex flex-wrap gap-3">
          <label className="text-[12.5px]">
            <span className="block text-ink-2">Quantity</span>
            <input type="number" step="0.001" value={qty} onChange={(e) => setQty(e.target.value)}
              className="num mt-1 w-32 rounded-md border border-line bg-surface px-2 py-1 outline-none focus:border-accent" />
          </label>
          <label className="text-[12.5px]">
            <span className="block text-ink-2">Required by</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="mono mt-1 rounded-md border border-line bg-surface px-2 py-1 outline-none focus:border-accent" />
          </label>
        </div>
        <label className="block text-[12.5px]">
          <span className="block text-ink-2">Why is it changing?</span>
          <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="A job was cancelled · the customer order grew · the spec moved"
            className="mt-1 w-full rounded-md border border-line bg-surface px-2 py-1.5 outline-none focus:border-accent" />
        </label>
        <p className="rounded-md border border-warn/30 bg-warn-soft p-2.5 text-[12px] leading-relaxed text-ink-2">
          Saving this creates <strong className="text-ink">v{cur.version + 1}</strong> and drafts the notice.
          It does not tell {row.sync.vendorName} anything — you send it, and the line reads
          “changed, vendor not told” until you do.
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!ok}
            title={ok ? undefined : 'Change something, and say why'}
            onClick={() => { revise(row, n, date, reason.trim()); onClose() }}>
            Save v{cur.version + 1}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

function AckDialog({ row, onClose }: { row: SyncRow | null; onClose: () => void }) {
  const { recordAck } = useInbound()
  const [ref, setRef] = useState('')
  useEffect(() => { setRef('') }, [row])
  if (!row) return null
  const v = latestRevision(row.sync)
  return (
    <Dialog open onClose={onClose} title={`Record ${row.sync.vendorName}’s acknowledgement`}
      sub={`${row.sync.poNo} · confirming v${v.version} — ${qtyText(v.qty, row.uom)} due ${shortDate(v.promisedDate)}`}>
      <div className="space-y-3 px-4 py-4">
        <label className="block text-[12.5px]">
          <span className="block text-ink-2">What did they say, and where?</span>
          <input value={ref} onChange={(e) => setRef(e.target.value)}
            placeholder="WhatsApp 02/09 — “ok, 450 confirmed”"
            className="mt-1 w-full rounded-md border border-line bg-surface px-2 py-1.5 outline-none focus:border-accent" />
        </label>
        <p className="text-[12px] leading-relaxed text-ink-3">
          There is no vendor login in this build, so the acknowledgement is recorded by the buyer
          against a reply they can point to. That is a deliberate limit, not an oversight — it fits a
          shop where the vendor answers on WhatsApp and will never open a portal.
        </p>
        <p className="rounded-md border border-good/30 bg-good-soft p-2.5 text-[12px] leading-relaxed text-ink-2">
          Recording this moves the inbound board and the cover figures onto{' '}
          {qtyText(v.qty, row.uom)} and closes <strong className="text-ink">{money(row.exposure.value)}</strong>{' '}
          of unacknowledged exposure.
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={ref.trim().length < 3}
            onClick={() => { recordAck(row, ref.trim()); onClose() }}>
            Record the acknowledgement
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

/* ------------------------------------------------------------ the register - */

function LineCard({ row, onRevise, onAck }: {
  row: SyncRow; onRevise: () => void; onAck: () => void
}) {
  const { showDraft, policy } = useInbound()
  const s = row.sync
  const latest = latestRevision(s)
  const out = row.state !== 'acknowledged'
  const short = row.gap.value > 0

  return (
    <li className={`anim-fade-up lift glass-card shadow-sm rounded-lg border p-3.5 ${
      row.state === 'not_told' ? 'border-critical/40' : row.state === 'awaiting_ack' ? 'border-warn/40' : 'border-line'}`}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="mono text-[12.5px] font-medium">{s.poNo}</span>
        <span className="text-[13px]">{row.item.name}</span>
        <span className="mono text-[11px] text-ink-3">v{latest.version}</span>
        {row.received && <Pill tone="neutral">received</Pill>}
        <span className="ml-auto">
          <StatusPill tone={SYNC_TONE[row.state]} label={SYNC_LABEL[row.state]}
            explain={s.ackRef ? `Last acknowledgement: ${s.ackRef}` : 'No acknowledgement on file for the current version.'} />
        </span>
      </div>

      {/* the two quantities, side by side — the whole point of the system */}
      <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
        <div className="rounded-md border border-line bg-surface-2 p-2.5">
          <p className="mono text-[10px] uppercase tracking-wider text-ink-3">What we need</p>
          <p className="mt-0.5"><Num d={row.internal} format="raw" dp={3} size="lg" suffix={` ${row.uom}`} /></p>
          <p className="mt-0.5 text-[11px] text-ink-3">
            v{latest.version} · {latest.changedBy} · {shortDate(latest.changedOn)}
          </p>
        </div>
        <div className={`rounded-md border p-2.5 ${out ? 'border-warn/40 bg-warn-soft' : 'border-line bg-surface-2'}`}>
          <p className="mono text-[10px] uppercase tracking-wider text-ink-3">What the vendor is making</p>
          <p className="mt-0.5"><Num d={row.vendorKnown} format="raw" dp={3} size="lg" suffix={` ${row.uom}`}
            tone={out ? 'warn' : undefined} /></p>
          <p className="mt-0.5 text-[11px] text-ink-3">
            v{s.ackedVersion} · {s.ackedOn ? `acknowledged ${shortDate(s.ackedOn)}` : 'never acknowledged'}
          </p>
        </div>
      </div>

      {out && (
        <p className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[12px]">
          <span className="text-ink-3">
            Gap <Num d={row.gap} format="raw" dp={3} suffix={` ${row.uom}`} tone={short ? 'critical' : 'warn'} />
          </span>
          <span className="text-ink-3">
            Exposure <Num d={row.exposure} format="money" tone="warn" />
          </span>
          {short ? (
            <span className="text-ink-3">
              Cover lost <Num d={row.coverGap} format="days" dp={1} suffix=" days" tone="critical" />
            </span>
          ) : (
            <span className="text-warn">
              {qtyText(Math.abs(row.gap.value), row.uom)} arriving that nobody needs — blocked capital in the making
            </span>
          )}
          <span className="mono ml-auto text-[11px] text-ink-3">
            changed <Num d={row.sinceChange} format="days" dp={0}
              suffix={row.sinceChange.value === 1 ? ' day ago' : ' days ago'} />
          </span>
        </p>
      )}

      {row.state === 'awaiting_ack' && (
        <p className={`mt-2 rounded-md border p-2.5 text-[12px] leading-relaxed ${
          row.chaseOverdue ? 'border-critical/30 bg-critical-soft' : 'border-line bg-surface-2'} text-ink-2`}>
          Notice sent {shortDate(s.notifiedOn!)} —{' '}
          <Num d={row.awaitingAck} format="days" dp={0}
            suffix={row.awaitingAck.value === 1 ? ' day' : ' days'} /> with no reply.
          {row.chaseOverdue && (
            <> Past the {policy.ackChaseDays}-day limit, so it escalates. {s.shipped
              ? 'The material has already left, which means it left at the old quantity.'
              : 'Until they confirm, assume they are making the old quantity.'}</>
          )}
        </p>
      )}

      {row.whipsawed && (
        <p className="mt-2 rounded-md border border-warn/30 bg-warn-soft p-2.5 text-[12px] leading-relaxed text-ink-2">
          <strong className="text-ink">This line has changed <Num d={row.churn} format="int" /> times in 30 days</strong>{' '}
          against a limit of {policy.poChurnLimit}. The vendor is being whipsawed — and a supplier
          who re-plans four times prices that in next quarter. The fix is upstream of purchasing.
        </p>
      )}

      {/* the version history */}
      <details className="mt-2 group">
        <summary className="cursor-pointer select-none text-[11.5px] text-ink-3 hover:text-ink-2">
          {s.revisions.length} versions · what changed and who changed it
        </summary>
        <ol className="mt-1.5 space-y-1 border-l-2 border-line pl-3">
          {s.revisions.map((r) => (
            <li key={r.version} className="text-[11.5px]">
              <span className="mono font-medium">v{r.version}</span>{' '}
              <span className="num">{num(r.qty, 3)} {row.uom}</span>{' '}
              <span className="text-ink-3">due {shortDate(r.promisedDate)} · {shortDate(r.changedOn)} · {r.changedBy}</span>
              {r.version <= s.ackedVersion && <span className="ml-1.5 text-good">acknowledged</span>}
              {r.version > s.ackedVersion && r.version <= s.notifiedVersion && <span className="ml-1.5 text-warn">sent</span>}
              {r.version > s.notifiedVersion && <span className="ml-1.5 text-critical">never sent</span>}
              <span className="block italic text-ink-3">“{r.reason}”</span>
            </li>
          ))}
        </ol>
      </details>

      <div className="mt-2.5 flex flex-wrap gap-2">
        {row.state === 'not_told' && (
          <Button size="sm" variant="primary" onClick={() => showDraft(s.poLineId)}>
            Draft the change notice
          </Button>
        )}
        {row.state === 'awaiting_ack' && (
          <>
            <Button size="sm" variant="primary" onClick={onAck}>Record the acknowledgement</Button>
            <Button size="sm" onClick={() => showDraft(s.poLineId)}>Re-send the notice</Button>
          </>
        )}
        {!row.received && <Button size="sm" onClick={onRevise}>Change this order</Button>}
      </div>
    </li>
  )
}

export function OrderSync() {
  const { syncRows, outOfSync, exposure } = useInbound()
  const [revising, setRevising] = useState<SyncRow | null>(null)
  const [acking, setAcking] = useState<SyncRow | null>(null)
  const open = syncRows.filter((r) => !r.received)
  const received = syncRows.filter((r) => r.received)

  return (
    <>
      <Card index={1} title="Order change sync" live
        sub="INB-02 · what we need, what the vendor believes, and the gap between them"
        actions={<span className="text-[12px] text-ink-3">
          Unacknowledged exposure <Num d={exposure} format="money" tone={exposure.value > 0 ? 'warn' : 'good'} />
        </span>}>
        <div className="p-4">
          <div className="mb-3 flex flex-wrap gap-2">
            <Pill tone="neutral">{open.length} open lines</Pill>
            <Pill tone={outOfSync.some((r) => r.state === 'not_told') ? 'critical' : 'good'}>
              {syncRows.filter((r) => r.state === 'not_told').length} changed, vendor not told
            </Pill>
            <Pill tone={syncRows.some((r) => r.state === 'awaiting_ack') ? 'warn' : 'good'}>
              {syncRows.filter((r) => r.state === 'awaiting_ack').length} awaiting acknowledgement
            </Pill>
            <Pill tone="good">{syncRows.filter((r) => r.state === 'acknowledged').length} in sync</Pill>
          </div>

          <ul className="space-y-3">
            {open.map((r, i) => (
              <div key={r.sync.poLineId} style={{ '--i': Math.min(i, 5) } as React.CSSProperties}>
                <LineCard row={r} onRevise={() => setRevising(r)} onAck={() => setAcking(r)} />
              </div>
            ))}
          </ul>

          {received.length > 0 && (
            <>
              <p className="mono mt-4 text-[10px] uppercase tracking-wider text-ink-3">
                Closed on receipt — kept because the receipt proves the point
              </p>
              <ul className="mt-1.5 space-y-3">
                {received.map((r) => (
                  <LineCard key={r.sync.poLineId} row={r} onRevise={() => setRevising(r)} onAck={() => setAcking(r)} />
                ))}
              </ul>
            </>
          )}

          <p className="mt-4 rounded-md border border-line bg-surface-2 p-3 text-[12.5px] leading-relaxed text-ink-2">
            <strong className="text-ink">The design decision worth arguing about.</strong> Every cover
            calculation on this system uses the vendor-acknowledged quantity, not the internal one.
            Raising a number in your own system does not make more material appear — so an internal
            change improves nothing until the vendor has confirmed it. That is why the exposure figure
            above only goes down when someone actually talks to a supplier.
          </p>
        </div>
      </Card>

      <NoticeDraft />
      <ReviseDialog row={revising} onClose={() => setRevising(null)} />
      <AckDialog row={acking} onClose={() => setAcking(null)} />
    </>
  )
}

/* ------------------------------------------------------- the inbound board -- */

export function InboundBoard({ lines, span = 26 }: {
  lines: {
    poNo: string; itemName: string; qtyLabel: string; arrival: number; usable: number
    stockout: number; late: number; etaLabel: string; issuableLabel: string
    stockoutLabel: string; statusLabel: string; inSync: boolean; ackNote: string
  }[]
  span?: number
}) {
  return (
    <Card index={2} className="mt-3" title="Inbound board" live
      sub="Everything on its way in, against the day each material runs out — at the quantity the vendor has confirmed">
      <div className="p-4">
        <ul className="space-y-3.5">
          {lines.map((l) => (
            <li key={l.poNo}>
              <div className="mb-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="mono text-[12px] font-medium">{l.poNo}</span>
                <span className="text-[12.5px]">{l.itemName}</span>
                <span className="mono text-[11px] text-ink-3">{l.qtyLabel}</span>
                {!l.inSync && <Pill tone="warn">vendor’s quantity, not ours</Pill>}
                <span className="ml-auto">
                  <StatusPill label={l.statusLabel} tone={l.late > 0 ? 'critical' : 'good'} />
                </span>
              </div>
              <div className="relative h-7 w-full rounded-md bg-surface-2">
                <div aria-hidden className="anim-tick absolute top-0 h-full w-[2px] bg-critical"
                     style={{ left: `${Math.min(100, (l.stockout / span) * 100)}%` }} />
                <div className="anim-reveal absolute top-1.5 h-4 rounded-l-[3px] bg-accent"
                     style={{ left: 0, width: `${Math.min(100, (l.arrival / span) * 100)}%` }} />
                <div className="anim-reveal hatch absolute top-1.5 h-4 rounded-r-[3px]"
                     style={{ '--i': 3, '--hatch-c': 'var(--accent)', '--hatch-pitch': '5px', '--hatch-w': '2px',
                       left: `${Math.min(100, (l.arrival / span) * 100)}%`,
                       width: `${Math.max(0, ((l.usable - l.arrival) / span) * 100)}%`,
                     } as React.CSSProperties} />
              </div>
              <p className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-ink-3">
                <span>{l.etaLabel}</span>
                <span>{l.issuableLabel}</span>
                <span className="text-critical">{l.stockoutLabel}</span>
                {!l.inSync && <span className="text-warn">{l.ackNote}</span>}
              </p>
            </li>
          ))}
        </ul>
        <p className="mt-4 rounded-md border border-warn/30 bg-warn-soft p-3 text-[12.5px] leading-relaxed text-ink-2">
          <strong className="text-ink">PO-2611 is still the case worth looking at.</strong> MgO is covered
          on quantity — 610 against a reorder point of 480 — but the material lands nine days after the
          line runs dry. That is a timing problem, so the answer is to expedite the open order, not to
          raise a second one. The system does not buy its way out of a late delivery.
        </p>
      </div>
    </Card>
  )
}
