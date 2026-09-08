'use client'
import { useEffect, useState } from 'react'
import { Button, Card, Pill, StatusPill } from '@/components/ui/bits'
import { Dialog } from '@/components/ui/Dialog'
import { Num } from '@/components/ui/Num'
import { money, num, qtyText, shortDate } from '@/lib/domain/format'
import { CAUSE_MOVES_STOCK, LOSS_LABEL } from '@/lib/domain/inventory'
import type { LossCause } from '@/lib/domain/types'
import { useInventory, type LossRow } from './store'

/* ------------------------------------------------------- record a wastage -- */

const FLOOR_CAUSES: LossCause[] = ['process_scrap', 'store_spoilage']

function RecordLossDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { recordLoss, stockRows } = useInventory()
  const items = [...new Map(stockRows.map((r) => [r.item.id, r])).values()]
  const [itemId, setItemId] = useState('')
  const [qty, setQty] = useState('')
  const [cause, setCause] = useState<LossCause>('process_scrap')
  const [wo, setWo] = useState('')
  const [note, setNote] = useState('')

  useEffect(() => {
    if (!open) return
    setItemId(items[0]?.item.id ?? ''); setQty(''); setCause('process_scrap'); setWo(''); setNote('')
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null
  const row = items.find((r) => r.item.id === itemId)
  const n = Number(qty) || 0
  const ok = row != null && n > 0

  return (
    <Dialog open onClose={onClose} title="Record wastage"
      sub="The one place a person types a loss. Every other cause is posted by an event.">
      <div className="space-y-3 px-4 py-4">
        <label className="block text-[12.5px]">
          <span className="block text-ink-2">Material</span>
          <select value={itemId} onChange={(e) => setItemId(e.target.value)}
            className="mt-1 w-full rounded-md border border-line bg-surface px-2 py-1.5 text-[12.5px] outline-none focus:border-accent">
            {items.map((r) => (
              <option key={r.item.id} value={r.item.id}>{r.item.code} — {r.item.name}</option>
            ))}
          </select>
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-[12.5px]">
            <span className="block text-ink-2">Quantity lost</span>
            <input type="number" step="0.001" min={0} value={qty} onChange={(e) => setQty(e.target.value)}
              className="num mt-1 w-full rounded-md border border-line bg-surface px-2 py-1 outline-none focus:border-accent" />
            {row && <span className="mono ml-1 text-[11px] text-ink-3">{row.uom}</span>}
          </label>
          <label className="block text-[12.5px]">
            <span className="block text-ink-2">Work order <span className="text-ink-3">(optional)</span></span>
            <input value={wo} onChange={(e) => setWo(e.target.value)} placeholder="WO-8830"
              className="mono mt-1 w-full rounded-md border border-line bg-surface px-2 py-1 outline-none focus:border-accent" />
          </label>
        </div>

        <div>
          <span className="block text-[12.5px] text-ink-2">Cause</span>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {FLOOR_CAUSES.map((c) => (
              <Button key={c} size="sm" variant={cause === c ? 'primary' : 'default'}
                onClick={() => setCause(c)}>
                {LOSS_LABEL[c]}
              </Button>
            ))}
          </div>
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-3">
            The other five causes are never typed: kerf and undersized offcuts come from a cut record,
            a shortage from a count, a jobwork allowance from a closed challan, and a gate rejection
            from a GRN. A loss you have to remember to enter is a loss nobody enters.
          </p>
        </div>

        <label className="block text-[12.5px]">
          <span className="block text-ink-2">Note <span className="text-ink-3">(optional)</span></span>
          <input value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="Element rejected after swaging · powder spilled on transfer"
            className="mt-1 w-full rounded-md border border-line bg-surface px-2 py-1.5 outline-none focus:border-accent" />
        </label>

        {row && n > 0 && (
          <p className="rounded-md border border-warn/30 bg-warn-soft p-2.5 text-[12px] leading-relaxed text-ink-2">
            {qtyText(n, row.uom)} of {row.item.code} costs{' '}
            <strong className="text-ink">{money(n * row.item.lastPurchaseRate)}</strong> at the valuation
            basis. Recording it moves that item’s scrap percentage, because the percentage is computed
            from this ledger rather than stored.
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!ok}
            onClick={() => { recordLoss(itemId, n, cause, wo.trim(), note.trim()); onClose() }}>
            Record the loss
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

/* ------------------------------------------------------------ the marginals */

export function LossSummary() {
  const { netLoss, unrealised, byCause, lossRows, scrapRows, policy } = useInventory()
  const [by, setBy] = useState<'cause' | 'item'>('cause')
  const [recording, setRecording] = useState(false)
  const max = by === 'cause'
    ? Math.max(...byCause.map((c) => c.net), 1)
    : Math.max(...scrapRows.map((s) => s.net.value), 1)

  return (
    <>
      <Card index={1} title="Where the material went" live
        sub="INV-03 · the same total read two ways — by cause for the owner, by item for the floor"
        actions={<div className="flex flex-wrap items-center gap-3">
          <span className="text-[12px] text-ink-3">Net loss <Num d={netLoss} format="money" tone="critical" /></span>
          <Button size="sm" variant="primary" onClick={() => setRecording(true)}>Record wastage</Button>
        </div>}>
        <div className="p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div role="group" aria-label="Split by" className="inline-flex rounded-md border border-line bg-surface-2 p-0.5">
              {(['cause', 'item'] as const).map((o) => (
                <button key={o} type="button" aria-pressed={by === o} onClick={() => setBy(o)}
                  className={`rounded px-2.5 py-1 text-[12px] font-medium transition-colors ${
                    by === o ? 'bg-surface text-ink shadow-sm' : 'text-ink-3 hover:text-ink-2'}`}>
                  By {o}
                </button>
              ))}
            </div>
            <Pill tone="neutral">{lossRows.length} loss records</Pill>
            <Pill tone={unrealised.value > 0 ? 'warn' : 'good'}>
              {money(unrealised.value)} still in the bin
            </Pill>
          </div>

          <div key={by} className="anim-fade-in space-y-2">
            {by === 'cause'
              ? byCause.map((c, i) => (
                  <div key={c.cause} style={{ '--i': Math.min(i, 6) } as React.CSSProperties} className="anim-fade-up">
                    <div className="flex flex-wrap items-baseline gap-x-2 text-[12.5px]">
                      <span>{LOSS_LABEL[c.cause]}</span>
                      <span className="mono text-[10.5px] text-ink-3">
                        {CAUSE_MOVES_STOCK[c.cause] ? 'moves stock' : 'inside another movement'}
                      </span>
                      <span className="text-[11px] text-ink-3">{c.qtyItems} material{c.qtyItems === 1 ? '' : 's'}</span>
                      <span className="num ml-auto font-medium">{money(c.net)}</span>
                      {c.gross !== c.net && (
                        <span className="text-[11px] text-good">{money(c.gross - c.net)} recovered</span>
                      )}
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
                      <div className="anim-reveal h-full rounded-full bg-critical"
                        style={{ width: `${(c.net / max) * 100}%`, '--i': Math.min(i, 6) } as React.CSSProperties} />
                    </div>
                  </div>
                ))
              : scrapRows.map((s, i) => (
                  <div key={s.item.id} style={{ '--i': Math.min(i, 6) } as React.CSSProperties} className="anim-fade-up">
                    <div className="flex flex-wrap items-baseline gap-x-2 text-[12.5px]">
                      <span className="mono text-[11px] text-ink-3">{s.item.code}</span>
                      <span>{s.item.name}</span>
                      <span className="num ml-auto font-medium">{money(s.net.value)}</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
                      <div className="anim-reveal h-full rounded-full bg-critical"
                        style={{ width: `${(s.net.value / max) * 100}%`, '--i': Math.min(i, 6) } as React.CSSProperties} />
                    </div>
                  </div>
                ))}
          </div>

          <p className="mt-4 rounded-md border border-line bg-surface-2 p-3 text-[12px] leading-relaxed text-ink-2">
            <strong className="text-ink">Net loss, not gross.</strong> Steel, brass, nichrome and stainless
            come back as money at the scrap dealer; fired ceramic, mineral wool and moisture-ruined MgO do
            not. Quoting gross would make the number bigger and the decision worse. Both marginals sum to{' '}
            <Num d={netLoss} format="money" /> — the same figure, split two ways, and they cannot disagree
            because they are the same records.
          </p>
        </div>
      </Card>

      <RecordLossDialog open={recording} onClose={() => setRecording(false)} />
    </>
  )
}

/* ----------------------------------------------------------- scrap vs target */

export function ScrapVsTarget() {
  const { scrapRows, policy } = useInventory()
  const over = scrapRows.filter((s) => s.over)
  return (
    <Card index={2} className="mt-3" title="Scrap against target" live
      sub="Derived from the loss ledger over the issue ledger — §9.2 carried this as a stored constant">
      <div className="scroll-x overflow-x-auto">
        <table className="w-full min-w-[46rem] border-collapse text-[12.5px]">
          <thead className="bg-surface-2">
            <tr className="text-[11px] uppercase tracking-wide text-ink-3">
              {['Material', 'Class', 'Issued', 'Lost', 'Scrap %', 'Target', 'Net loss', 'Against target'].map((h, i) => (
                <th key={h} className={`whitespace-nowrap border-b border-line px-3 py-2 font-medium ${
                  i >= 2 && i <= 6 ? 'text-right' : 'text-left'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {scrapRows.map((s) => (
              <tr key={s.item.id} className="border-b border-line-soft">
                <td className="px-3 py-2">
                  <span className="mono block text-[11px] text-ink-3">{s.item.code}</span>
                  {s.item.name}
                </td>
                <td className="px-3 py-2"><Pill tone="neutral" mono>{s.cls}</Pill></td>
                <td className="num px-3 py-2 text-right text-ink-3">{num(s.issued, 3)} {s.uom}</td>
                <td className="num px-3 py-2 text-right">{num(s.lost, 3)} {s.uom}</td>
                <td className="num px-3 py-2 text-right">
                  <Num d={s.pct} format="raw" dp={2} suffix="%" tone={s.over ? 'critical' : undefined} />
                </td>
                <td className="num px-3 py-2 text-right text-ink-3">{s.target}%</td>
                <td className="num px-3 py-2 text-right"><Num d={s.net} format="money" /></td>
                <td className="px-3 py-2">
                  {s.over
                    ? <StatusPill tone="critical" label={`Over by ${num(s.pct.value - s.target, 2)} points`} />
                    : <StatusPill tone="good" label="Within target" />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-line-soft px-4 py-3 text-[12px] leading-relaxed text-ink-2">
        {over.length > 0 ? (
          <>
            <strong className="text-ink">
              {over.length === 1 ? 'One material is' : `${over.length} materials are`} over target
            </strong>{' '}
            by more than the {policy.scrapTolerancePct}-point tolerance. Targets are per item class and
            live on the Policy tab, which is where §13-5 says they belong — agreed with the client, not
            picked by a developer.
          </>
        ) : (
          <>Every material is inside its class target. The targets are per class and live on the Policy tab.</>
        )}{' '}
        The percentage is against material <em>issued</em>, not material bought — so a quiet month does
        not flatter it.
      </p>
    </Card>
  )
}

/* --------------------------------------------------------- the loss records */

export function LossLedger() {
  const { lossRows, sellScrap, unrealised } = useInventory()
  const shown = lossRows.slice(0, 14)
  return (
    <Card index={3} className="mt-3" title="Loss records" live
      sub="Every loss names a cause and the document behind it — there is no “miscellaneous”"
      actions={<span className="text-[12px] text-ink-3">
        Unrealised <Num d={unrealised} format="money" tone={unrealised.value > 0 ? 'warn' : 'good'} />
      </span>}>
      <div className="scroll-x overflow-x-auto">
        <table className="w-full min-w-[52rem] border-collapse text-[12.5px]">
          <thead className="bg-surface-2">
            <tr className="text-[11px] uppercase tracking-wide text-ink-3">
              {['Date', 'Material', 'Quantity', 'Cause', 'Document', 'Cost', 'Recoverable', ''].map((h, i) => (
                <th key={h || i} className={`whitespace-nowrap border-b border-line px-3 py-2 font-medium ${
                  i === 2 || i === 5 || i === 6 ? 'text-right' : 'text-left'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.loss.id} className="border-b border-line-soft">
                <td className="whitespace-nowrap px-3 py-2 text-ink-3">{shortDate(r.loss.on)}</td>
                <td className="px-3 py-2">
                  <span className="mono text-[11px] text-ink-3">{r.item.code}</span>
                </td>
                <td className="num px-3 py-2 text-right">{num(r.loss.qty, 3)} {r.uom}</td>
                <td className="px-3 py-2">
                  {LOSS_LABEL[r.loss.cause]}
                  <span className="mono block text-[10px] text-ink-3">
                    {CAUSE_MOVES_STOCK[r.loss.cause] ? 'carried its own movement' : 'inside a movement already posted'}
                  </span>
                </td>
                <td className="mono px-3 py-2 text-[11.5px] text-ink-3">{r.loss.sourceRef}</td>
                <td className="num px-3 py-2 text-right"><Num d={r.cost} format="money" /></td>
                <td className="num px-3 py-2 text-right">
                  {r.loss.recoveryRate > 0
                    ? <Num d={r.recovery} format="money" tone={r.sold ? 'good' : 'warn'} />
                    : <span className="text-ink-3">dead loss</span>}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  {r.loss.recoveryRate > 0 && (
                    r.sold
                      ? <span className="text-[11px] text-good">sold {shortDate(r.loss.soldOn!)}</span>
                      : <Button size="sm" onClick={() => sellScrap(r)}>Record a scrap sale</Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-line-soft px-4 py-3 text-[11.5px] leading-relaxed text-ink-3">
        {lossRows.length > shown.length && `${lossRows.length - shown.length} older records not shown. `}
        A loss record either carries its own stock movement — a write-off, a count shortage, a scrapped
        gate rejection — or it names a component of a movement already posted, like the kerf inside a
        cut’s issue. That is why the two ledgers never double-count, and why the stock balances still
        reconcile to §9.1 with the whole loss ledger sitting alongside them.
      </p>
    </Card>
  )
}
