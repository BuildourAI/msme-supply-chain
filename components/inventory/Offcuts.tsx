'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button, Card, Pill, StatusPill } from '@/components/ui/bits'
import { Dialog } from '@/components/ui/Dialog'
import { Num } from '@/components/ui/Num'
import { money, num, qtyText, shortDate } from '@/lib/domain/format'
import { remnantMatch } from '@/lib/domain/inventory'
import { MIN_USABLE_REMNANT } from '@/lib/seed/inventory'
import { useInventory, type LotRow } from './store'

/**
 * The bar that makes a cut record readable: input splits into parts, kerf,
 * usable remnants and scrap, and the four always sum to what went in.
 */
function CutBar({ input, parts, kerf, usable, scrap, uom }: {
  input: number; parts: number; kerf: number; usable: number; scrap: number; uom: string
}) {
  const pct = (n: number) => (input > 0 ? (n / input) * 100 : 0)
  const segs = [
    { label: 'Parts', qty: parts, cls: 'bg-good' },
    { label: 'Usable remnants', qty: usable, cls: 'bg-accent' },
    { label: 'Kerf', qty: kerf, cls: 'bg-ink-3/40' },
    { label: 'Scrap at the cut', qty: scrap, cls: 'bg-critical' },
  ].filter((s) => s.qty > 1e-9)
  return (
    <div className="mt-2">
      <div className="flex h-4 w-full overflow-hidden rounded-[3px] bg-surface-3">
        {segs.map((s, i) => (
          <div key={s.label} style={{ width: `${pct(s.qty)}%`, '--i': i } as React.CSSProperties}
               title={`${s.label} — ${qtyText(s.qty, uom)}`}
               className={`anim-reveal h-full ${s.cls}`} />
        ))}
      </div>
      <ul className="mt-1.5 flex flex-wrap gap-x-3.5 gap-y-1 text-[11px]">
        {segs.map((s) => (
          <li key={s.label} className="flex items-center gap-1.5 text-ink-3">
            <span aria-hidden className={`size-2 rounded-[2px] ${s.cls}`} />
            {s.label} <span className="num text-ink-2">{num(s.qty, 3)} {uom}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ------------------------------------------------------------ use a remnant */

function UseRemnantDialog({ row, onClose }: { row: LotRow | null; onClose: () => void }) {
  const { useRemnant } = useInventory()
  const [qty, setQty] = useState('')
  const [wo, setWo] = useState('')
  useEffect(() => { if (row) { setQty(''); setWo('') } }, [row])
  if (!row) return null
  const n = Number(qty)
  const ok = Number.isFinite(n) && n > 0 && n <= row.balance.value
  return (
    <Dialog open onClose={onClose} title={`Use remnants · ${row.item.name}`}
      sub={`${row.band?.spec} · ${row.band?.location} · ${qtyText(row.balance.value, row.uom)} on the rack`}>
      <div className="space-y-3 px-4 py-4">
        <label className="block text-[12.5px]">
          <span className="block text-ink-2">Quantity taken</span>
          <input type="number" step="0.001" min={0} max={row.balance.value} value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="num mt-1 w-36 rounded-md border border-line bg-surface px-2 py-1 outline-none focus:border-accent" />
          <span className="mono ml-2 text-[11.5px] text-ink-3">{row.uom}</span>
        </label>
        <label className="block text-[12.5px]">
          <span className="block text-ink-2">Work order <span className="text-ink-3">(optional)</span></span>
          <input value={wo} onChange={(e) => setWo(e.target.value)} placeholder="WO-8830"
            className="mono mt-1 w-40 rounded-md border border-line bg-surface px-2 py-1 outline-none focus:border-accent" />
        </label>
        <p className="rounded-md border border-good/30 bg-good-soft p-2.5 text-[12px] leading-relaxed text-ink-2">
          That is <strong className="text-ink">{money((Number(qty) || 0) * row.item.lastPurchaseRate)}</strong> of
          material already owned, used instead of bought. It posts as a movement off the band, so the
          register goes down and the repurchase-avoided figure goes up.
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!ok}
            onClick={() => { useRemnant(row, n, wo.trim()); onClose() }}>
            Take it off the rack
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

/* ------------------------------------------------------------- record a cut */

function RecordCutDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { recordCut, stockRows } = useInventory()
  const cuttable = stockRows.filter((r) => r.lot.usability === 'usable' && MIN_USABLE_REMNANT[r.item.id] != null)
  const [lotId, setLotId] = useState('')
  const [input, setInput] = useState('')
  const [parts, setParts] = useState('')
  const [kerf, setKerf] = useState('')
  const [size, setSize] = useState('')
  const [pieces, setPieces] = useState('')
  const [wo, setWo] = useState('')

  useEffect(() => {
    if (!open) return
    setLotId(cuttable[0]?.lot.id ?? ''); setInput(''); setParts(''); setKerf('')
    setSize(''); setPieces(''); setWo('')
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null
  const row = cuttable.find((r) => r.lot.id === lotId)
  const min = row ? MIN_USABLE_REMNANT[row.item.id] ?? 0 : 0
  const nIn = Number(input) || 0, nParts = Number(parts) || 0, nKerf = Number(kerf) || 0
  const nSize = Number(size) || 0, nPieces = Number(pieces) || 0
  const remnantTotal = nSize * nPieces
  const sum = Math.round((nParts + nKerf + remnantTotal) * 1e6) / 1e6
  const balances = row != null && nIn > 0 && Math.abs(sum - nIn) < 1e-6
  const overBalance = row != null && nIn > row.balance.value
  const usable = nSize >= min
  const ok = balances && !overBalance

  return (
    <Dialog open wide onClose={onClose} title="Record a cut"
      sub="Input = parts + kerf + remnants. The record will not save until it balances.">
      <div className="space-y-3 px-4 py-4">
        <label className="block text-[12.5px]">
          <span className="block text-ink-2">Material and lot</span>
          <select value={lotId} onChange={(e) => setLotId(e.target.value)}
            className="mt-1 w-full rounded-md border border-line bg-surface px-2 py-1.5 text-[12.5px] outline-none focus:border-accent">
            {cuttable.map((r) => (
              <option key={r.lot.id} value={r.lot.id}>
                {r.item.code} · {r.lot.batchNo} — {num(r.balance.value, 3)} {r.uom} on hand
              </option>
            ))}
          </select>
        </label>

        <div className="grid gap-3 sm:grid-cols-3">
          {([['Input', input, setInput], ['Parts out', parts, setParts], ['Kerf', kerf, setKerf]] as const).map(([label, v, set]) => (
            <label key={label} className="block text-[12.5px]">
              <span className="block text-ink-2">{label}</span>
              <input type="number" step="0.001" min={0} value={v} onChange={(e) => set(e.target.value)}
                className="num mt-1 w-full rounded-md border border-line bg-surface px-2 py-1 outline-none focus:border-accent" />
            </label>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-[12.5px]">
            <span className="block text-ink-2">Remnant size</span>
            <input type="number" step="0.001" min={0} value={size} onChange={(e) => setSize(e.target.value)}
              className="num mt-1 w-full rounded-md border border-line bg-surface px-2 py-1 outline-none focus:border-accent" />
          </label>
          <label className="block text-[12.5px]">
            <span className="block text-ink-2">Pieces</span>
            <input type="number" step="1" min={0} value={pieces} onChange={(e) => setPieces(e.target.value)}
              className="num mt-1 w-full rounded-md border border-line bg-surface px-2 py-1 outline-none focus:border-accent" />
          </label>
          <label className="block text-[12.5px]">
            <span className="block text-ink-2">Work order</span>
            <input value={wo} onChange={(e) => setWo(e.target.value)} placeholder="WO-8830"
              className="mono mt-1 w-full rounded-md border border-line bg-surface px-2 py-1 outline-none focus:border-accent" />
          </label>
        </div>

        {row && nSize > 0 && (
          <p className={`rounded-md border p-2.5 text-[12px] leading-relaxed text-ink-2 ${
            usable ? 'border-accent/30 bg-accent-soft' : 'border-warn/30 bg-warn-soft'}`}>
            {usable ? (
              <>A {nSize} {row.uom} piece is at or above the {min} {row.uom} minimum for {row.item.code}, so
              these {nPieces || 0} pieces become <strong className="text-ink">usable stock</strong> on the
              offcut register — {money(remnantTotal * row.item.lastPurchaseRate)} worth.</>
            ) : (
              <>A {nSize} {row.uom} piece is below the {min} {row.uom} minimum for {row.item.code}, so it is{' '}
              <strong className="text-ink">scrap at the cut</strong>, not an offcut. That rule is what
              stops the register filling with bits nobody will ever use.</>
            )}
          </p>
        )}

        <div className={`rounded-md border p-2.5 text-[12px] leading-relaxed ${
          nIn > 0 && !balances ? 'border-critical/30 bg-critical-soft text-ink-2' : 'border-line bg-surface-2 text-ink-2'}`}>
          <span className="mono">{num(nParts, 3)} parts + {num(nKerf, 3)} kerf + {num(remnantTotal, 3)} remnants
          {' '}= {num(sum, 3)}</span>{' '}
          against an input of <span className="mono">{num(nIn, 3)}</span>.
          {nIn > 0 && !balances && <strong className="block text-ink">Off by {num(Math.round((nIn - sum) * 1e6) / 1e6, 3)}. A cut that does not balance is not a record, it is a guess.</strong>}
          {overBalance && <strong className="block text-ink">More than the lot holds.</strong>}
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!ok}
            title={ok ? undefined : 'Input has to equal parts plus kerf plus remnants'}
            onClick={() => { recordCut(row!.item.id, lotId, nIn, nParts, nKerf, nSize, nPieces, wo.trim()); onClose() }}>
            Record the cut
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

/* --------------------------------------------------------- the two panels -- */

export function OffcutRegister() {
  const { offcutRows, offcutValue, select, policy } = useInventory()
  const [using, setUsing] = useState<LotRow | null>(null)
  const aged = offcutRows.filter((r) => r.aged)

  return (
    <>
      <Card index={1} title="Offcut register" live
        sub="INV-02 · remnants are lots in the same ledger, not a list beside it"
        actions={<span className="text-[12px] text-ink-3">
          On the rack <Num d={offcutValue} format="money" tone="accent" />
        </span>}>
        <div className="p-4">
          <ul className="space-y-3">
            {offcutRows.map((r, i) => (
              <li key={r.lot.id} style={{ '--i': Math.min(i, 5) } as React.CSSProperties}
                  className={`anim-fade-up lift rounded-lg border bg-surface p-3.5 ${
                    r.aged ? 'border-warn/40' : 'border-line'}`}>
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="mono text-[12.5px] font-medium">{r.item.code}</span>
                  <span className="text-[13px]">{r.band?.spec}</span>
                  <span className="mono text-[11px] text-ink-3">{r.band?.location}</span>
                  <span className="ml-auto">
                    {r.aged
                      ? <StatusPill tone="warn" label={`Oldest piece ${r.age?.value} days old`}
                          explain={`Past ${policy.remnantAgeDays} days a remnant is offered up for scrap or downgrade — offered, never scrapped automatically.`} />
                      : <StatusPill tone="good" label="Moving" />}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[12px]">
                  <span className="text-ink-3">
                    On the rack <Num d={r.balance} format="raw" dp={3} suffix={` ${r.uom}`} />
                  </span>
                  {r.pieces && (
                    <span className="text-ink-3">
                      about <Num d={r.pieces} format="int" /> pieces
                    </span>
                  )}
                  <span className="text-ink-3">Worth <Num d={r.value} format="money" /></span>
                  <span className="text-ink-3">
                    Minimum usable {num(MIN_USABLE_REMNANT[r.item.id] ?? 0, 4)} {r.uom}
                  </span>
                  {r.age && <span className="text-ink-3">Oldest <Num d={r.age} format="int" suffix=" days" /></span>}
                </div>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  <Button size="sm" variant="primary" onClick={() => setUsing(r)}>Use remnants</Button>
                  <Button size="sm" onClick={() => select(r.lot.id)}>
                    {r.movements.length} document{r.movements.length === 1 ? '' : 's'}
                  </Button>
                </div>
              </li>
            ))}
          </ul>

          {aged.length > 0 && (
            <p className="mt-3 rounded-md border border-warn/30 bg-warn-soft p-3 text-[12.5px] leading-relaxed text-ink-2">
              <strong className="text-ink">
                {aged.length === 1 ? 'One band has' : `${aged.length} bands have`} a piece older than{' '}
                {policy.remnantAgeDays} days.
              </strong>{' '}
              Offered up for scrap or downgrade, never scrapped automatically — the whole point of the
              register is that a person decides whether a remnant is still material or finally waste.
            </p>
          )}
        </div>
      </Card>

      <UseRemnantDialog row={using} onClose={() => setUsing(null)} />
    </>
  )
}

export function CutRecords() {
  const { cutRows, policy } = useInventory()
  const [recording, setRecording] = useState(false)
  const below = cutRows.filter((r) => r.belowPlan)

  return (
    <>
      <Card index={2} className="mt-3" title="Cut records" live
        sub="Input = parts + kerf + remnants, on every record — so a yield figure means something"
        actions={<Button size="sm" variant="primary" onClick={() => setRecording(true)}>Record a cut</Button>}>
        <div className="p-4">
          <ul className="space-y-3">
            {cutRows.map((r, i) => (
              <li key={r.cut.id} style={{ '--i': Math.min(i, 5) } as React.CSSProperties}
                  className={`anim-fade-up rounded-lg border bg-surface p-3.5 ${
                    r.belowPlan ? 'border-warn/40' : 'border-line'}`}>
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="mono text-[12.5px] font-medium">{r.cut.cutNo}</span>
                  <span className="text-[13px]">{r.item.name}</span>
                  <span className="mono text-[11px] text-ink-3">{r.cut.workOrder}</span>
                  <span className="text-[11px] text-ink-3">{shortDate(r.cut.on)}</span>
                  <span className="ml-auto">
                    {r.belowPlan
                      ? <StatusPill tone="warn" label={`${num(r.shortfall.value, 2)} points below the nest plan`} />
                      : <StatusPill tone="good" label="At or above the nest plan" />}
                  </span>
                </div>

                <CutBar input={r.cut.inputQty} parts={r.cut.partsQty} kerf={r.cut.kerfQty}
                  usable={r.usableRemnants} scrap={r.scrapRemnants} uom={r.uom} />

                <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[12px]">
                  <span className="text-ink-3">
                    Yield <Num d={r.yielded} format="raw" dp={2} suffix="%" />
                    <span className="ml-1 text-[11px]">of <Num d={r.planned} format="raw" dp={2} suffix="%" /> planned</span>
                  </span>
                  <span className="text-ink-3">{r.cut.partsCount || '—'} pieces out</span>
                  <span className="text-ink-3">
                    To the register {num(r.usableRemnants, 3)} {r.uom}
                    {' · '}{money(r.usableRemnants * r.item.lastPurchaseRate)}
                  </span>
                  <span className="mono ml-auto text-[11px] text-ink-3">
                    {r.balances ? 'balances' : 'DOES NOT BALANCE'}
                  </span>
                </div>

                {r.cut.remnants.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-3">
                    {r.cut.remnants.map((rem, j) => {
                      const min = MIN_USABLE_REMNANT[r.item.id] ?? 0
                      const use = rem.size >= min
                      return (
                        <li key={j} className={use ? 'text-accent' : 'text-critical'}>
                          {rem.pieces} × {num(rem.size, 4)} {r.uom} — {use ? 'to the register' : 'scrap at the cut'}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </li>
            ))}
          </ul>

          {below.length > 0 && (
            <p className="mt-3 rounded-md border border-warn/30 bg-warn-soft p-3 text-[12.5px] leading-relaxed text-ink-2">
              <strong className="text-ink">
                {below.length === 1 ? 'One cut came in' : `${below.length} cuts came in`} more than{' '}
                {policy.yieldTolerancePct} points below the nest plan.
              </strong>{' '}
              That is a nesting question, not a buying one — and it is the first time this factory can
              tell the two apart. Buying more material does not fix a nest that leaves parts on the floor.
            </p>
          )}
        </div>
      </Card>

      <RecordCutDialog open={recording} onClose={() => setRecording(false)} />
    </>
  )
}

/** The repurchase the register is meant to catch, shown against the live desk. */
export function RepurchaseCheck({ needs }: {
  needs: { code: string; name: string; itemId: string; needQty: number; uom: string; rate: number }[]
}) {
  const { offcutRows } = useInventory()
  const rows = needs.map((n) => {
    const band = offcutRows.find((r) => r.item.id === n.itemId)
    if (!band || band.balance.value <= 0) return null
    return { ...n, band, avoided: remnantMatch(n.needQty, band.balance.value, n.rate, n.uom) }
  }).filter(Boolean) as (typeof needs[number] & { band: LotRow; avoided: ReturnType<typeof remnantMatch> })[]

  const total = rows.reduce((a, r) => a + r.avoided.value, 0)

  return (
    <Card index={3} className="mt-3" title="About to be bought twice" live
      sub="Reorder suggestions on the desk that a remnant already on the rack covers part of">
      <div className="p-4">
        {rows.length === 0 ? (
          <p className="rounded-md border border-good/30 bg-good-soft p-3 text-[12.5px] leading-relaxed text-ink-2">
            Nothing on the desk overlaps a remnant. When it does, it shows here and on the approve
            dialog — the point is that it is impossible to raise the order without seeing it.
          </p>
        ) : (
          <>
            <ul className="space-y-2.5">
              {rows.map((r) => (
                <li key={r.itemId} className="rounded-md border border-accent/30 bg-accent-soft/40 p-3">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="mono text-[12px] font-medium">{r.code}</span>
                    <span className="text-[12.5px]">{r.name}</span>
                    <span className="ml-auto"><Num d={r.avoided} format="money" tone="accent" /></span>
                  </div>
                  <p className="mt-1 text-[12px] leading-relaxed text-ink-2">
                    The desk wants {qtyText(r.needQty, r.uom)}. There is already{' '}
                    {qtyText(r.band.balance.value, r.uom)} on {r.band.band?.location} —{' '}
                    {r.band.band?.spec}. Netting it off saves{' '}
                    <strong className="text-ink">{money(r.avoided.value)}</strong>.
                  </p>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[12.5px] leading-relaxed text-ink-2">
              <strong className="text-ink">{money(total)} of material this factory already owns</strong>,
              on a desk that is about to buy it again. Not because anyone is careless — because until now
              a remnant on Rack B-4 was not in any system that the buyer could see.{' '}
              <Link href="/sourcing/desk" className="font-medium text-accent hover:underline">Open the desk →</Link>
            </p>
          </>
        )}
      </div>
    </Card>
  )
}
