'use client'
import { useEffect, useState } from 'react'
import { Button, Card, Pill, Segmented, StatusPill } from '@/components/ui/bits'
import { Dialog } from '@/components/ui/Dialog'
import { HeadFilter, HeadSort } from '@/components/ui/HeadFilter'
import { Icon, type IconName } from '@/components/ui/icons'
import { Num } from '@/components/ui/Num'
import { money, num, qtyText, shortDate } from '@/lib/domain/format'
import { CAUSE_MOVES_STOCK, LOSS_LABEL } from '@/lib/domain/inventory'
import type { LossCause } from '@/lib/domain/types'
import { Note } from '@/components/ui/Note'
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
            <Segmented label="Split by" value={by} onChange={setBy}
              options={[{ id: 'cause', label: 'By cause' }, { id: 'item', label: 'By item' }]} />
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
      <Note foot label="What a class target is measured against">
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
      </Note>
    </Card>
  )
}

/* --------------------------------------------------------- the loss records */

/**
 * A cause, as a glyph and a short word.
 *
 * The full sentence a cause deserves — "Rejected at the gate and scrapped",
 * and whether it moved stock or sat inside a movement already posted — is on
 * the title and in the row's own detail. On the face it needs to be findable at
 * a glance down a column of twelve, which is what the glyph is for. The word
 * stays beside it: a colour and a shape never carry a meaning on their own.
 */
const CAUSE_MARK: Record<LossCause, { icon: IconName; short: string }> = {
  cut_kerf: { icon: 'ruler', short: 'kerf' },
  cut_offcut_scrap: { icon: 'arrow-down', short: 'undersized' },
  process_scrap: { icon: 'factory', short: 'floor scrap' },
  store_spoilage: { icon: 'boxes', short: 'spoiled' },
  jobwork_loss: { icon: 'truck', short: 'at jobworker' },
  count_shortage: { icon: 'hash', short: 'count short' },
  grn_rejection: { icon: 'tray', short: 'gate reject' },
}

/**
 * Where the money is, in one badge.
 *
 * "Recoverable" and "Actual" were two money columns that between them were a
 * dash or the words "dead loss" on most rows. They are one column now, because
 * they are one question with four answers: nothing to recover, booked but not
 * collected, sold for this much, or offered and nobody bought it.
 */
type Recovery = 'dead' | 'booked' | 'sold' | 'no_sale'
const recoveryOf = (r: LossRow): Recovery =>
  r.loss.recoveryRate <= 0 ? 'dead' : !r.settled ? 'booked' : r.noSale ? 'no_sale' : 'sold'

const RECOVERY_LABEL: Record<Recovery, string> = {
  dead: 'dead loss', booked: 'awaiting a sale', sold: 'sold', no_sale: 'no sale',
}

/**
 * One line of the ledger. A recoverable loss still in the bin carries an
 * editable Actual: the money the scrap really fetched, which is the figure net
 * loss is then computed on. It is prefilled with the booked estimate so a sale
 * at the expected price stays one click, and it is a separate field from that
 * estimate so a sale below it leaves a trail instead of quietly agreeing.
 *
 * Beside it, `No sale` settles the record at nothing recovered — a dead loss by
 * decision, which is a different fact from a material that was never worth
 * anything, and the record keeps the two apart.
 */
function LossRowView({ r, open, onToggle }: { r: LossRow; open: boolean; onToggle: () => void }) {
  const { sellScrap, noSale } = useInventory()
  const expected = r.recovery.value as number
  const recoverable = r.loss.recoveryRate > 0
  const [actual, setActual] = useState('')
  const typed = actual.trim() === '' ? expected : Number(actual)
  const valid = Number.isFinite(typed) && typed >= 0

  const mark = CAUSE_MARK[r.loss.cause]
  const state = recoveryOf(r)
  const owed = state === 'booked'

  return (
    <tbody className={`border-b border-line-soft ${open ? 'bg-surface-2/60' : owed ? 'bg-warn-soft/25' : ''}`}>
      <tr onClick={onToggle} className={`cursor-pointer transition-colors ${open ? '' : 'hover:bg-surface-2'}`}>
        <td className="py-1 pl-2 pr-1">
          <button type="button" aria-expanded={open}
            onClick={(e) => { e.stopPropagation(); onToggle() }}
            title={`${open ? 'Hide' : 'Show'} what is behind this loss`}
            className="press flex size-5 items-center justify-center rounded text-ink-3 hover:text-ink">
            <Icon name="chevron" className={`size-3.5 transition-transform duration-200 ${open ? 'rotate-90' : ''}`} />
            <span className="sr-only">{open ? 'Hide' : 'Show'} the detail for {r.loss.id}</span>
          </button>
        </td>

        <td className="mono whitespace-nowrap py-1 pr-2 text-[11px] text-ink-3">{shortDate(r.loss.on)}</td>

        <td className="max-w-[16rem] py-1 pr-2">
          <span className="flex items-baseline gap-1.5">
            <span className="min-w-0 truncate" title={r.item.name}>{r.item.name}</span>
            <span className="mono shrink-0 text-[10.5px] text-ink-3">{r.item.code}</span>
          </span>
        </td>

        <td className="num whitespace-nowrap py-1 pl-4 pr-2 text-right">{num(r.loss.qty, 3)} {r.uom}</td>

        <td className="whitespace-nowrap py-1 pr-2">
          <span className="inline-flex items-center gap-1.5"
            title={`${LOSS_LABEL[r.loss.cause]} — ${CAUSE_MOVES_STOCK[r.loss.cause]
              ? 'carried its own movement' : 'inside a movement already posted'}`}>
            <Icon name={mark.icon} className="size-3.5 shrink-0 text-ink-3" />
            <span className="text-ink-2">{mark.short}</span>
          </span>
        </td>

        <td className="mono whitespace-nowrap py-1 pr-2 text-[11px] text-ink-3">{r.loss.sourceRef}</td>

        <td className="num whitespace-nowrap py-1 pl-4 pr-2 text-right">
          <Num d={r.cost} format="money" size="sm" />
        </td>

        {/* where the money is: booked, collected, refused, or never there */}
        <td className="whitespace-nowrap py-1 pl-4 pr-2">
          {state === 'dead' ? (
            <span className="inline-flex items-center gap-1.5 text-ink-3"
              title="Nothing recoverable at the dealer — this material does not come back as money.">
              <Icon name="close" className="size-3.5 shrink-0" />
              dead loss
            </span>
          ) : state === 'booked' ? (
            <span className="inline-flex items-center gap-1.5"
              title="Booked to fetch this at the dealer, and not collected yet.">
              <Icon name="cash" className="size-3.5 shrink-0 text-warn" />
              <Num d={r.recovery} format="money" size="sm" tone="warn" />
              <span className="text-ink-3">booked</span>
            </span>
          ) : state === 'sold' ? (
            <span className="inline-flex items-center gap-1.5"
              title={`Sold on ${shortDate(r.loss.soldOn!)} — net loss is computed on this figure, not on the estimate.`}>
              <Icon name="check" className="size-3.5 shrink-0 text-good" />
              <Num d={r.realised} format="money" size="sm" tone="good" />
              <span className="text-ink-3">sold {shortDate(r.loss.soldOn!)}</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-critical"
              title="Offered and nobody bought it — settled at nothing recovered, by decision.">
              <Icon name="close" className="size-3.5 shrink-0" />
              no sale · {shortDate(r.loss.noSaleOn!)}
            </span>
          )}
        </td>

        <td className="w-full whitespace-nowrap py-1 pr-2 text-right" onClick={(e) => e.stopPropagation()}>
          {recoverable && !r.settled && (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1">
                <span aria-hidden className="text-[11px] text-ink-3">₹</span>
                <input type="number" step="0.01" min={0} value={actual} placeholder={String(expected)}
                  aria-label={`Actual received for ${r.item.code} scrap, in rupees`}
                  onChange={(e) => setActual(e.target.value)}
                  className="num w-24 rounded-md border border-line bg-surface px-1.5 py-1 text-right text-[12px] outline-none focus:border-accent" />
              </span>
              <Button size="sm" disabled={!valid} onClick={() => sellScrap(r, typed)}>Record a scrap sale</Button>
              <Button size="sm" variant="danger" title="Nobody bought it — settle this record at nothing recovered"
                onClick={() => noSale(r)}>No sale</Button>
            </span>
          )}
        </td>
      </tr>

      <tr hidden={!open}>
        <td colSpan={9} className="px-3 pb-2.5 pt-0.5">
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-ink-3">
            <span>
              <span className="text-ink-2">{LOSS_LABEL[r.loss.cause]}</span> —{' '}
              {CAUSE_MOVES_STOCK[r.loss.cause]
                ? 'carried its own movement'
                : 'inside a movement already posted'}
            </span>
            <span>Document <span className="mono">{r.loss.sourceRef}</span></span>
            {r.loss.workOrder && <span>Job <span className="mono">{r.loss.workOrder}</span></span>}
            <span>
              <span className="num">{num(r.loss.qty, 3)} {r.uom}</span> × {money(r.rate)}/{r.uom} ={' '}
              <Num d={r.cost} format="money" size="sm" />
            </span>
          </p>

          <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-2">
            {state === 'dead' ? (
              <>Nothing recoverable at the dealer — fired ceramic, mineral wool and moisture-ruined MgO
              do not come back as money, so the whole cost is the loss.</>
            ) : state === 'sold' ? (
              <>Booked at {money(r.loss.recoveryRate)}/{r.uom} — <Num d={r.recovery} format="money" size="sm" /> expected,{' '}
              <Num d={r.realised} format="money" size="sm" tone="good" /> realised on {shortDate(r.loss.soldOn!)}.
              Net loss is computed on what it fetched, never on the estimate.</>
            ) : state === 'no_sale' ? (
              <>Booked at {money(r.loss.recoveryRate)}/{r.uom} — <Num d={r.recovery} format="money" size="sm" /> expected,
              and nobody bought it. Settled on {shortDate(r.loss.noSaleOn!)} at nothing recovered: a dead
              loss by decision, which the trail keeps distinct from a material that was never worth selling.</>
            ) : (
              <>Booked at {money(r.loss.recoveryRate)}/{r.uom} — <Num d={r.recovery} format="money" size="sm" /> expected,
              not collected. Type what the dealer actually paid into Actual before recording the sale;
              net loss is then computed on that figure.</>
            )}
          </p>
        </td>
      </tr>
    </tbody>
  )
}

type LossFilterKey = 'material' | 'cause' | 'recovery'

export function LossLedger() {
  const { lossRows, unrealised } = useInventory()
  const [filters, setFilters] = useState<Partial<Record<LossFilterKey, string>>>({})
  const [sort, setSort] = useState<{ col: 'on' | 'cost'; dir: 'asc' | 'desc' } | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)

  const setF = (k: LossFilterKey, v?: string) => setFilters((f) => ({ ...f, [k]: v }))
  const clear = () => setFilters({})
  const active = Object.values(filters).filter(Boolean).length

  const matches = (r: LossRow, f: Partial<Record<LossFilterKey, string>>) =>
    (!f.material || r.item.id === f.material) &&
    (!f.cause || r.loss.cause === f.cause) &&
    (!f.recovery || recoveryOf(r) === f.recovery)

  const all = lossRows.filter((r) => matches(r, filters))
  if (sort) {
    const d = sort.dir === 'asc' ? 1 : -1
    all.sort((a, b) => sort.col === 'cost'
      ? ((a.cost.value as number) - (b.cost.value as number)) * d
      : a.loss.on.localeCompare(b.loss.on) * d)
  }
  const shown = all.slice(0, 14)

  const toggleSort = (col: 'on' | 'cost') => setSort((s) => {
    if (s?.col !== col) return { col, dir: 'desc' }
    if (s.dir === 'desc') return { col, dir: 'asc' }
    return null
  })

  /* Each option is counted with its own filter lifted and the others still on,
     so no choice in a menu leads to an empty table. */
  const others = (k: LossFilterKey) => lossRows.filter((r) => matches(r, { ...filters, [k]: undefined }))
  const countWhere = (k: LossFilterKey, pred: (r: LossRow) => boolean) => others(k).filter(pred).length

  const materialOptions = Array.from(new Map(lossRows.map((r) => [r.item.id, r.item])).values())
    .map((it) => ({ value: it.id, label: it.name,
      meta: `${countWhere('material', (r) => r.item.id === it.id)} records` }))
    .filter((o) => !o.meta.startsWith('0 '))
  const causeOptions = (Object.keys(LOSS_LABEL) as LossCause[])
    .map((c) => ({ value: c, label: LOSS_LABEL[c],
      meta: `${countWhere('cause', (r) => r.loss.cause === c)} records` }))
    .filter((o) => !o.meta.startsWith('0 '))
  const recoveryOptions = (['booked', 'sold', 'no_sale', 'dead'] as Recovery[])
    .map((v) => ({ value: v, label: RECOVERY_LABEL[v],
      meta: `${countWhere('recovery', (r) => recoveryOf(r) === v)} records` }))
    .filter((o) => !o.meta.startsWith('0 '))

  const chip = (v: Recovery, label: string, icon: IconName, tone: 'warn' | 'neutral') => (
    <button key={v} type="button" onClick={() => setF('recovery', filters.recovery === v ? undefined : v)}
      aria-pressed={filters.recovery === v}
      title={filters.recovery === v ? 'Showing only these records — click for every record' : `Show only the ${label} records`}
      className={`press inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
        filters.recovery === v ? 'border-accent bg-accent-soft text-accent-ink'
        : tone === 'warn' ? 'border-warn/40 bg-warn-soft text-ink-2 hover:border-warn'
        : 'border-line text-ink-2 hover:bg-surface-2'}`}>
      <Icon name={icon} className="size-3 shrink-0" />
      {lossRows.filter((r) => recoveryOf(r) === v).length} {label}
    </button>
  )

  return (
    <Card index={3} className="mt-3" title="Loss records" live
      sub="Every loss names a cause and the document behind it — there is no “miscellaneous”"
      actions={<span className="text-[12px] text-ink-3">
        Unrealised <Num d={unrealised} format="money" tone={unrealised.value > 0 ? 'warn' : 'good'} />
      </span>}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 px-3 pb-1.5 pt-2.5">
        {chip('booked', 'awaiting a sale', 'cash', 'warn')}
        {chip('dead', 'dead loss', 'close', 'neutral')}
        {active > 0 && (
          <button type="button" onClick={clear}
            className="press text-[11px] text-ink-3 underline underline-offset-2 hover:text-ink">
            Show every record
          </button>
        )}
        <span className="mono ml-auto text-[10.5px] text-ink-3">
          showing {shown.length} of {lossRows.length}
        </span>
      </div>

      <div className="scroll-x relative overflow-x-auto px-3 pb-2">
        <table className="w-full min-w-[62rem] border-collapse text-[12px]">
          <thead>
            <tr className="mono border-b border-line text-left text-[9.5px] uppercase tracking-wider text-ink-3">
              <th className="w-6 py-1 pl-2 pr-1" />
              <th className="whitespace-nowrap py-1 pr-2 font-normal">
                <HeadSort label="Date" active={sort?.col === 'on'} dir={sort?.dir ?? 'desc'}
                  onSort={() => toggleSort('on')} title="Sort by the day the loss was recorded"
                  className="uppercase tracking-wider" />
              </th>
              <th className="whitespace-nowrap py-1 pr-2 font-normal">
                <HeadFilter label="Material" options={materialOptions} value={filters.material}
                  onPick={(v) => setF('material', v)} allLabel="Every material"
                  allMeta={`${others('material').length} records`} className="uppercase tracking-wider" />
              </th>
              <th className="whitespace-nowrap py-1 pl-4 pr-2 text-right font-normal">Qty</th>
              <th className="whitespace-nowrap py-1 pr-2 font-normal">
                <HeadFilter label="Cause" options={causeOptions} value={filters.cause}
                  onPick={(v) => setF('cause', v)} allLabel="Every cause"
                  allMeta={`${others('cause').length} records`} className="uppercase tracking-wider" />
              </th>
              <th className="whitespace-nowrap py-1 pr-2 font-normal">Document</th>
              <th className="whitespace-nowrap py-1 pl-4 pr-2 text-right font-normal">
                <HeadSort label="Cost ₹" active={sort?.col === 'cost'} dir={sort?.dir ?? 'desc'}
                  onSort={() => toggleSort('cost')} title="Sort by what the loss cost"
                  className="uppercase tracking-wider" />
              </th>
              <th className="whitespace-nowrap py-1 pl-4 pr-2 font-normal">
                <HeadFilter label="Recovery" options={recoveryOptions} value={filters.recovery}
                  onPick={(v) => setF('recovery', v)} allLabel="Every record"
                  allMeta={`${others('recovery').length} records`} className="uppercase tracking-wider" />
              </th>
              <th className="w-full whitespace-nowrap py-1 pr-2 text-right font-normal">Action</th>
            </tr>
          </thead>

          {shown.map((r) => (
            <LossRowView key={r.loss.id} r={r} open={openId === r.loss.id}
              onToggle={() => setOpenId(openId === r.loss.id ? null : r.loss.id)} />
          ))}
        </table>

        {shown.length === 0 && (
          <p className="px-1 py-4 text-center text-[12.5px] text-ink-2">
            No loss record matches that. <button type="button" onClick={clear}
              className="text-accent-ink underline underline-offset-2">Show every record</button>
          </p>
        )}
      </div>

      <Note foot label="Recoverable is the estimate; Actual is the money">
        {all.length > shown.length && `${all.length - shown.length} older records not shown. `}
        <strong className="text-ink">Recoverable is the estimate; Actual is the money.</strong> The
        scrap rate is booked when the loss is recorded, so the booked figure is only what the ledger
        assumed. Type what the dealer actually paid into Actual before recording the sale — net loss is
        then computed on that figure, never on the estimate. If nobody bought it, <em>No sale</em>
        settles the record at nothing recovered: a dead loss by decision, which the trail keeps distinct
        from a material that was never worth selling.{' '}
        A loss record either carries its own stock movement — a write-off, a count shortage, a scrapped
        gate rejection — or it names a component of a movement already posted, like the kerf inside a
        cut’s issue. That is why the two ledgers never double-count, and why the stock balances still
        reconcile to §9.1 with the whole loss ledger sitting alongside them.
      </Note>
    </Card>
  )
}
