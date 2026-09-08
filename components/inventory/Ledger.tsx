'use client'
import { useEffect, useState } from 'react'
import { Button, Card, Pill, StatusPill } from '@/components/ui/bits'
import { Dialog } from '@/components/ui/Dialog'
import { Num } from '@/components/ui/Num'
import { money, num, qtyText, shortDate } from '@/lib/domain/format'
import { MOVEMENT_LABEL, SOURCE_LABEL } from '@/lib/domain/inventory'
import { useInventory, type LotRow } from './store'

const USABILITY_LABEL: Record<string, string> = {
  usable: 'Usable', qc_hold: 'QC hold', damaged: 'Damaged', expired: 'Expired',
}

/* ----------------------------------------------------- the movement history */

function MovementSheet() {
  const { selected, select } = useInventory()
  if (!selected) return null
  const r = selected
  let running = 0
  return (
    <Dialog open wide onClose={() => select(null)}
      title={`${r.item.name} · ${r.lot.batchNo}`}
      sub={`Every document behind a balance of ${qtyText(r.balance.value, r.uom)}`}>
      <div className="max-h-[62vh] overflow-y-auto px-4 py-4">
        <div className="scroll-x overflow-x-auto">
          <table className="w-full min-w-[40rem] border-collapse text-[12.5px]">
            <thead className="bg-surface-2">
              <tr className="text-[11px] uppercase tracking-wide text-ink-3">
                {['Date', 'What happened', 'Document', 'Movement', 'Balance'].map((h, i) => (
                  <th key={h} className={`whitespace-nowrap border-b border-line px-3 py-2 font-medium ${i > 2 ? 'text-right' : 'text-left'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {r.movements.map((m) => {
                running += m.qty
                const opening = m.kind === 'opening'
                return (
                  <tr key={m.id} className={`border-b border-line-soft ${opening ? 'bg-surface-2' : ''}`}>
                    <td className="mono whitespace-nowrap px-3 py-2 text-[11.5px] text-ink-3">{shortDate(m.on)}</td>
                    <td className="px-3 py-2">
                      {MOVEMENT_LABEL[m.kind]}
                      {m.note && <span className="block text-[11px] text-ink-3">{m.note}</span>}
                    </td>
                    <td className="px-3 py-2">
                      <span className="mono text-[11.5px]">{m.sourceRef}</span>
                      <span className="block text-[10.5px] text-ink-3">{SOURCE_LABEL[m.source]}</span>
                    </td>
                    <td className={`num whitespace-nowrap px-3 py-2 text-right ${
                      opening ? 'text-ink-3' : m.qty > 0 ? 'text-good' : 'text-critical'}`}>
                      {opening ? '—' : `${m.qty > 0 ? '+' : ''}${num(m.qty, 3)}`}
                    </td>
                    <td className="num whitespace-nowrap px-3 py-2 text-right font-medium">
                      {num(Math.round(running * 1e6) / 1e6, 3)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="bg-surface-2">
                <td colSpan={4} className="px-3 py-2.5 text-right text-[12px] font-medium">
                  Balance on hand, {r.uom}
                </td>
                <td className="px-3 py-2.5 text-right">
                  <Num d={r.balance} format="raw" dp={3} className="font-semibold" />
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {r.counts.length > 0 && (
          <div className="mt-4">
            <p className="mono text-[10px] uppercase tracking-wider text-ink-3">Counts on this lot</p>
            <ul className="mt-1.5 space-y-1">
              {r.counts.map((c) => (
                <li key={c.id} className="flex flex-wrap items-baseline gap-x-2 text-[11.5px]">
                  <span className="mono text-ink-3">{shortDate(c.on)}</span>
                  <span>counted {num(c.countedQty, 3)} against a book of {num(c.bookQty, 3)}</span>
                  <span className={`num ml-auto ${c.countedQty === c.bookQty ? 'text-ink-3' : 'text-warn'}`}>
                    {c.countedQty === c.bookQty ? 'agreed' : `${c.countedQty > c.bookQty ? '+' : ''}${num(c.countedQty - c.bookQty, 3)}`}
                  </span>
                  {c.note && <span className="w-full text-[11px] italic text-ink-3">“{c.note}”</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="mt-4 rounded-md border border-line bg-surface-2 p-3 text-[12px] leading-relaxed text-ink-2">
          <strong className="text-ink">There is no stored quantity anywhere in this build.</strong> The
          balance is the sum of this list, and every line names a document — a goods receipt, a work
          order, a challan, a cut, a count. That is what makes the number on the screen and the number
          on the rack the same conversation instead of two different ones.
        </p>
      </div>
    </Dialog>
  )
}

/* ------------------------------------------------------------- the counting */

function CountSheet() {
  const { counting, startCount, recordCount, policy } = useInventory()
  const [counted, setCounted] = useState('')
  const [note, setNote] = useState('')
  useEffect(() => { if (counting) { setCounted(String(counting.balance.value)); setNote('') } }, [counting])
  if (!counting) return null

  const r = counting
  const n = Number(counted)
  const ok = Number.isFinite(n) && n >= 0
  const variance = Math.round((n - r.balance.value) * 1000) / 1000
  const pct = r.balance.value === 0 ? 0 : Math.abs(variance / r.balance.value) * 100
  const overTol = pct > policy.countTolerancePct[r.cls]
  const needsNote = variance !== 0

  return (
    <Dialog open onClose={() => startCount(null)}
      title={`Count ${r.item.name}`}
      sub={`${r.lot.batchNo} · class ${r.cls}, counted every ${policy.countCadenceDays[r.cls]} days`}>
      <div className="space-y-3 px-4 py-4">
        <div className="rounded-md border border-line bg-surface-2 p-3">
          <p className="mono text-[10px] uppercase tracking-wider text-ink-3">The book says</p>
          <p className="num mt-0.5 text-[20px]">{num(r.balance.value, 3)} <span className="text-[13px] text-ink-3">{r.uom}</span></p>
          <p className="mt-0.5 text-[11.5px] text-ink-3">
            Last confirmed {shortDate(r.lastConfirmed.value)}, {r.sinceConfirmed.value} day
            {r.sinceConfirmed.value === 1 ? '' : 's'} ago.
          </p>
        </div>

        <label className="block text-[12.5px]">
          <span className="block text-ink-2">What is on the rack?</span>
          <input type="number" step="0.001" min={0} value={counted} onChange={(e) => setCounted(e.target.value)}
            className="num mt-1 w-36 rounded-md border border-line bg-surface px-2 py-1 outline-none focus:border-accent" />
          <span className="mono ml-2 text-[11.5px] text-ink-3">{r.uom}</span>
        </label>

        {variance !== 0 && ok && (
          <p className={`rounded-md border p-2.5 text-[12px] leading-relaxed text-ink-2 ${
            overTol ? 'border-critical/30 bg-critical-soft' : 'border-warn/30 bg-warn-soft'}`}>
            {variance > 0 ? 'Surplus' : 'Shortage'} of{' '}
            <strong className="text-ink">{qtyText(Math.abs(variance), r.uom)}</strong> —{' '}
            {num(pct, 2)}% against a class {r.cls} tolerance of {policy.countTolerancePct[r.cls]}%.
            {overTol && ' That is outside tolerance, so it escalates as well as posting.'}
            {variance < 0 && ' A shortage also lands on the loss ledger with a cause.'}
            {' '}The old balance is not overwritten — the variance posts as its own movement.
          </p>
        )}
        {variance === 0 && ok && (
          <p className="rounded-md border border-good/30 bg-good-soft p-2.5 text-[12px] leading-relaxed text-ink-2">
            Agreed with the book. Nothing moves, but the balance is confirmed as of today — which is the
            difference between a number you believe and a number you have checked.
          </p>
        )}

        <label className="block text-[12.5px]">
          <span className="block text-ink-2">
            Note {needsNote ? '' : <span className="text-ink-3">(optional)</span>}
          </span>
          <input value={note} onChange={(e) => setNote(e.target.value)}
            placeholder={variance < 0 ? 'Loose stock, no bin card' : variance > 0 ? 'Found behind the pallet' : 'Counted with the bin card'}
            className="mt-1 w-full rounded-md border border-line bg-surface px-2 py-1.5 outline-none focus:border-accent" />
        </label>

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={() => startCount(null)}>Cancel</Button>
          <Button variant="primary" disabled={!ok || (needsNote && note.trim().length < 3)}
            title={needsNote && note.trim().length < 3 ? 'A variance needs a note saying what you found' : undefined}
            onClick={() => recordCount(r, n, note.trim())}>
            Post the count
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

/* ------------------------------------------------------------ write-off ---- */

function WriteOffSheet({ row, onClose }: { row: LotRow | null; onClose: () => void }) {
  const { writeOff } = useInventory()
  const [qty, setQty] = useState('')
  const [note, setNote] = useState('')
  useEffect(() => { if (row) { setQty(String(row.balance.value)); setNote('') } }, [row])
  if (!row) return null
  const n = Number(qty)
  const ok = Number.isFinite(n) && n > 0 && n <= row.balance.value && note.trim().length > 3
  return (
    <Dialog open onClose={onClose} title={`Write off ${row.item.name}`}
      sub={`${row.lot.batchNo} · ${USABILITY_LABEL[row.lot.usability]} · ${row.lot.usabilityReason ?? ''}`}>
      <div className="space-y-3 px-4 py-4">
        <label className="block text-[12.5px]">
          <span className="block text-ink-2">Quantity to write off</span>
          <input type="number" step="0.001" min={0} max={row.balance.value} value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="num mt-1 w-36 rounded-md border border-line bg-surface px-2 py-1 outline-none focus:border-accent" />
          <span className="mono ml-2 text-[11.5px] text-ink-3">{row.uom} of {num(row.balance.value, 3)}</span>
        </label>
        <p className="rounded-md border border-critical/30 bg-critical-soft p-2.5 text-[12px] leading-relaxed text-ink-2">
          This costs <strong className="text-ink">{money((Number(qty) || 0) * row.item.lastPurchaseRate)}</strong> at
          the valuation basis. The quantity leaves the balance as a write-off movement and lands on the
          loss ledger as spoilage in store, with your reason attached.
        </p>
        <label className="block text-[12.5px]">
          <span className="block text-ink-2">Why is it being written off?</span>
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="Re-drying failed · beyond shelf life · damaged past repair"
            className="mt-1 w-full rounded-md border border-line bg-surface px-2 py-1.5 outline-none focus:border-accent" />
        </label>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="danger" disabled={!ok}
            onClick={() => { writeOff(row, n, note.trim()); onClose() }}>
            Write off {money((Number(qty) || 0) * row.item.lastPurchaseRate)}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

/* ------------------------------------------------------------- the tables -- */

export function StockLedger() {
  const { stockRows, select, startCount, staleValue, accuracy, policy } = useInventory()
  const [writing, setWriting] = useState<LotRow | null>(null)
  const stale = stockRows.filter((r) => r.stale)

  return (
    <>
      <Card index={1} title="Stock truth" live
        sub="INV-01 · every quantity is the sum of its movements — click one to see the documents behind it"
        actions={<span className="flex flex-wrap gap-x-4 text-[12px] text-ink-3">
          <span>Record accuracy <Num d={accuracy} format="raw" dp={1} suffix="%" /></span>
          <span>Unconfirmed <Num d={staleValue} format="money"
            tone={staleValue.value > 0 ? 'warn' : 'good'} /></span>
        </span>}>
        <div className="scroll-x overflow-x-auto">
          <table className="w-full min-w-[56rem] border-collapse text-[12.5px]">
            <thead className="bg-surface-2">
              <tr className="text-[11px] uppercase tracking-wide text-ink-3">
                {['Material', 'Lot', 'State', 'Balance', 'Movements', 'Last confirmed', 'Value', ''].map((h, i) => (
                  <th key={h || i} className={`whitespace-nowrap border-b border-line px-3 py-2 font-medium ${
                    i === 3 || i === 6 ? 'text-right' : 'text-left'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stockRows.map((r) => {
                const good = r.lot.usability === 'usable'
                return (
                  <tr key={r.lot.id} className={`border-b border-line-soft ${good ? '' : 'bg-warn-soft/25'}`}>
                    <td className="px-3 py-2">
                      <span className="mono block text-[11px] text-ink-3">{r.item.code}</span>
                      {r.item.name}
                    </td>
                    <td className="mono px-3 py-2 text-[11.5px] text-ink-2">{r.lot.batchNo}</td>
                    <td className="px-3 py-2">
                      <Pill tone={good ? 'good' : 'warn'}>{USABILITY_LABEL[r.lot.usability]}</Pill>
                      {r.lot.usabilityReason && (
                        <span className="mt-0.5 block text-[10.5px] text-ink-3">{r.lot.usabilityReason}</span>
                      )}
                    </td>
                    <td className="num px-3 py-2 text-right">
                      <Num d={r.balance} format="raw" dp={3} suffix={` ${r.uom}`} />
                    </td>
                    <td className="px-3 py-2">
                      <button type="button" onClick={() => select(r.lot.id)}
                        className="text-[12px] text-accent underline decoration-dotted underline-offset-[3px] hover:no-underline">
                        {r.movements.length} document{r.movements.length === 1 ? '' : 's'}
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      {r.stale ? (
                        <StatusPill tone="warn" label={`Unconfirmed ${r.sinceConfirmed.value} days`}
                          explain={`Class ${r.cls} wants a count every ${policy.countCadenceDays[r.cls]} days.`} />
                      ) : (
                        <span className="text-[11.5px] text-ink-3">
                          {shortDate(r.lastConfirmed.value)} · {r.sinceConfirmed.value}d
                        </span>
                      )}
                    </td>
                    <td className="num px-3 py-2 text-right">
                      {good ? <span className="text-ink-3">—</span> : <Num d={r.value} format="money" />}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      <Button size="sm" onClick={() => startCount(r.lot.id)}>Count</Button>
                      {!good && (
                        <span className="ml-1.5 inline-block">
                          <Button size="sm" variant="ghost" onClick={() => setWriting(r)}>Write off</Button>
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {stale.length > 0 && (
          <p className="border-t border-line-soft px-4 py-3 text-[12.5px] leading-relaxed text-ink-2">
            <strong className="text-ink">
              {stale.length === 1 ? 'One balance is' : `${stale.length} balances are`} past the counting
              cadence for their class
            </strong>{' '}
            — {money(staleValue.value)} of stock nobody has physically confirmed. That is not stock that is
            wrong; it is stock that is unverified, and knowing the difference is the whole of “live and
            accurate”. Count one and watch the figure move.
            {stale.every((r) => r.lot.usability !== 'usable') && (
              <> It is also, exactly, the non-usable total on the Sourcing Desk — not a coincidence worth
              hiding: the lots nobody counts are the lots nobody can use. They sit in a corner, never come
              up on a job, and so never get looked at.</>
            )}
          </p>
        )}
      </Card>

      <MovementSheet />
      <CountSheet />
      <WriteOffSheet row={writing} onClose={() => setWriting(null)} />
    </>
  )
}

export function CountHistory() {
  const { countRows, accuracy, policy } = useInventory()
  return (
    <Card index={2} title="Cycle counts" live
      sub="A variance is posted, never overwritten — so “how often is the book right” becomes answerable">
      <div className="scroll-x overflow-x-auto">
        <table className="w-full min-w-[44rem] border-collapse text-[12.5px]">
          <thead className="bg-surface-2">
            <tr className="text-[11px] uppercase tracking-wide text-ink-3">
              {['Count', 'Date', 'Material', 'Counted', 'Book', 'Variance', 'Against tolerance'].map((h, i) => (
                <th key={h} className={`whitespace-nowrap border-b border-line px-3 py-2 font-medium ${
                  i >= 3 && i <= 5 ? 'text-right' : 'text-left'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {countRows.map((r) => (
              <tr key={r.count.id} className="border-b border-line-soft">
                <td className="mono whitespace-nowrap px-3 py-2 text-[11.5px]">{r.count.id}</td>
                <td className="whitespace-nowrap px-3 py-2 text-ink-3">{shortDate(r.count.on)}</td>
                <td className="px-3 py-2">
                  <span className="mono text-[11px] text-ink-3">{r.item.code}</span>
                  {r.count.note && <span className="block text-[11px] italic text-ink-3">“{r.count.note}”</span>}
                </td>
                <td className="num px-3 py-2 text-right">{num(r.count.countedQty, 3)}</td>
                <td className="num px-3 py-2 text-right text-ink-3">{num(r.count.bookQty, 3)}</td>
                <td className={`num px-3 py-2 text-right ${r.variance.value === 0 ? 'text-ink-3' : r.variance.value > 0 ? 'text-good' : 'text-critical'}`}>
                  <Num d={r.variance} format="raw" dp={3} />
                </td>
                <td className="px-3 py-2">
                  {r.variance.value === 0
                    ? <StatusPill tone="good" label="Agreed with the book" />
                    : r.overTolerance
                      ? <StatusPill tone="critical" label={`Outside the ${policy.countTolerancePct[r.cls]}% class ${r.cls} tolerance`} />
                      : <StatusPill tone="warn" label={`Inside the ${policy.countTolerancePct[r.cls]}% class ${r.cls} tolerance`} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-line-soft px-4 py-3 text-[11.5px] leading-relaxed text-ink-3">
        Record accuracy is {num(accuracy.value, 1)}% — counts that came in inside their class tolerance,
        over counts taken. It is deliberately not “is the stock right”, which nobody can answer. It is
        “how often is the book right when somebody checks”, which is measurable and which moves.
      </p>
    </Card>
  )
}
