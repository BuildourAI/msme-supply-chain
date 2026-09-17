'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button, Card } from '@/components/ui/bits'
import { Dialog } from '@/components/ui/Dialog'
import { HeadFilter, HeadSort } from '@/components/ui/HeadFilter'
import { Icon } from '@/components/ui/icons'
import { Note } from '@/components/ui/Note'
import { Num } from '@/components/ui/Num'
import { money, num, qtyText, shortDate } from '@/lib/domain/format'
import { remnantMatch } from '@/lib/domain/inventory'
import { MIN_USABLE_REMNANT } from '@/lib/seed/inventory'
import { useInventory, type CutRow, type LotRow } from './store'

/**
 * Where a cut went, in 96px.
 *
 * Input splits into parts, kerf, usable remnants and scrap, and the four always
 * sum to what went in — that is the argument the bar is making. It does not need
 * to be full width with a five-item legend under every record to make it: a lane
 * in a column makes the same comparison, and the words are printed once under
 * the table instead of once per cut.
 */
const CUT_SPLIT = (r: { cut: { inputQty: number; partsQty: number; kerfQty: number }
                        usableRemnants: number; scrapRemnants: number }) => [
  { key: 'parts', label: 'Parts', qty: r.cut.partsQty, cls: 'bg-good' },
  { key: 'usable', label: 'Usable remnants', qty: r.usableRemnants, cls: 'bg-accent' },
  { key: 'kerf', label: 'Kerf', qty: r.cut.kerfQty, cls: 'bg-ink-3/40' },
  { key: 'scrap', label: 'Scrap at the cut', qty: r.scrapRemnants, cls: 'bg-critical' },
].filter((s) => s.qty > 1e-9)

function CutBar({ row }: { row: CutRow }) {
  const input = row.cut.inputQty
  const segs = CUT_SPLIT(row)
  return (
    <span className="flex h-2.5 w-24 overflow-hidden rounded-full bg-surface-3"
      title={segs.map((s) => `${s.label} — ${qtyText(s.qty, row.uom)}`).join(' · ')}>
      {segs.map((s, i) => (
        <span key={s.key} className={`anim-reveal h-full ${s.cls}`}
          style={{ width: `${input > 0 ? (s.qty / input) * 100 : 0}%`, '--i': i } as React.CSSProperties} />
      ))}
    </span>
  )
}

/** The same four, with their quantities, for the cut that has been opened. */
function CutLegend({ row }: { row: CutRow }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[11.5px]">
      {CUT_SPLIT(row).map((s) => (
        <li key={s.key} className="flex items-center gap-1.5 text-ink-3">
          <span aria-hidden className={`size-2 rounded-[2px] ${s.cls}`} />
          {s.label} <span className="num text-ink-2">{num(s.qty, 3)} {row.uom}</span>
        </li>
      ))}
    </ul>
  )
}

/** The four words the rows no longer repeat, printed once under a table. */
function SplitKey() {
  return (
    <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 px-1 text-[10.5px] text-ink-3">
      {[['bg-good', 'parts'], ['bg-accent', 'usable remnants'], ['bg-ink-3/40', 'kerf'],
        ['bg-critical', 'scrap at the cut']].map(([cls, label]) => (
        <li key={label} className="flex items-center gap-1.5">
          <span aria-hidden className={`inline-block h-2 w-4 rounded-full ${cls}`} />{label}
        </li>
      ))}
      <li>Click a cut for the quantities, the pieces and the remnants it made.</li>
    </ul>
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

/**
 * The offcut register, as one line per band.
 *
 * A remnant band is a lot in the same ledger as anything else, so it is read the
 * same way the stock ledger is read: a line each, the state as a glyph and its
 * word, the filters in the headings, and everything that explains a band — what
 * counts as usable for that material, how the piece count was arrived at, what
 * happens when a piece gets old — one click down on the row it belongs to.
 */
export function OffcutRegister() {
  const { offcutRows, offcutValue, select, policy } = useInventory()
  const [using, setUsing] = useState<LotRow | null>(null)
  const [filters, setFilters] = useState<{ material?: string; rack?: string; state?: string }>({})
  const [sort, setSort] = useState<{ col: 'value' | 'age'; dir: 'asc' | 'desc' } | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const aged = offcutRows.filter((r) => r.aged)

  const matches = (r: LotRow) =>
    (!filters.material || r.item.id === filters.material) &&
    (!filters.rack || r.band?.location === filters.rack) &&
    (!filters.state || (filters.state === 'aged' ? r.aged : !r.aged))
  const shown = offcutRows.filter(matches)
  if (sort) {
    const d = sort.dir === 'asc' ? 1 : -1
    shown.sort((a, b) => sort.col === 'value'
      ? (a.value.value - b.value.value) * d
      : ((a.age?.value ?? 0) - (b.age?.value ?? 0)) * d)
  }
  const setF = (k: 'material' | 'rack' | 'state', v?: string) => setFilters((f) => ({ ...f, [k]: v }))
  const toggleSort = (col: 'value' | 'age') => setSort((s) => {
    if (s?.col !== col) return { col, dir: 'desc' }
    if (s.dir === 'desc') return { col, dir: 'asc' }
    return null
  })
  const active = Object.values(filters).filter(Boolean).length

  const materialOptions = Array.from(new Map(offcutRows.map((r) => [r.item.id, r.item])).values())
    .map((it) => ({ value: it.id, label: it.name,
      meta: `${offcutRows.filter((r) => r.item.id === it.id).length} bands` }))
  const rackOptions = Array.from(new Set(offcutRows.map((r) => r.band?.location ?? '')))
    .filter(Boolean).map((loc) => ({ value: loc, label: loc,
      meta: `${offcutRows.filter((r) => r.band?.location === loc).length} bands` }))
  const stateOptions = [
    { value: 'moving', label: 'Moving', meta: `${offcutRows.filter((r) => !r.aged).length} bands` },
    { value: 'aged', label: `Older than ${policy.remnantAgeDays} days`, meta: `${aged.length} bands` },
  ].filter((o) => !o.meta.startsWith('0 '))

  return (
    <>
      <Card index={1} title="Offcut register" live
        sub="INV-02 · remnants are lots in the same ledger, not a list beside it"
        actions={<span className="flex flex-wrap items-center gap-x-3 text-[12px] text-ink-3">
          {active > 0 && (
            <button type="button" onClick={() => setFilters({})}
              className="press text-[11px] underline underline-offset-2 hover:text-ink">
              Show every band
            </button>
          )}
          <span>On the rack <Num d={offcutValue} format="money" tone="accent" /></span>
        </span>}>
        <div className="scroll-x relative overflow-x-auto px-3 pb-2 pt-2">
          <table className="w-full min-w-[54rem] border-collapse text-[12px]">
            <thead>
              <tr className="mono border-b border-line text-left text-[9.5px] uppercase tracking-wider text-ink-3">
                <th className="w-6 py-1 pl-2 pr-1" />
                <th className="whitespace-nowrap py-1 pr-2 font-normal">
                  <HeadFilter label="Material" options={materialOptions} value={filters.material}
                    onPick={(v) => setF('material', v)} allLabel="Every material"
                    allMeta={`${offcutRows.length} bands`} className="uppercase tracking-wider" />
                </th>
                <th className="whitespace-nowrap py-1 pr-2 font-normal">Band</th>
                <th className="whitespace-nowrap py-1 pr-2 font-normal">
                  <HeadFilter label="Rack" options={rackOptions} value={filters.rack}
                    onPick={(v) => setF('rack', v)} allLabel="Every rack"
                    allMeta={`${offcutRows.length} bands`} className="uppercase tracking-wider" />
                </th>
                <th className="whitespace-nowrap py-1 pl-4 pr-2 text-right font-normal">On the rack</th>
                <th className="whitespace-nowrap py-1 pr-2 text-right font-normal"
                  title="Derived from the band’s average piece size, never counted into the system by hand.">
                  Pieces
                </th>
                <th className="whitespace-nowrap py-1 pl-4 pr-2 text-right font-normal">
                  <HeadSort label="Value ₹" active={sort?.col === 'value'} dir={sort?.dir ?? 'desc'}
                    onSort={() => toggleSort('value')} title="Sort by what the band is worth"
                    className="uppercase tracking-wider" />
                </th>
                <th className="whitespace-nowrap py-1 pr-2 text-right font-normal">
                  <HeadSort label="Oldest" active={sort?.col === 'age'} dir={sort?.dir ?? 'desc'}
                    onSort={() => toggleSort('age')} title="Sort by the age of the oldest piece"
                    className="uppercase tracking-wider" />
                </th>
                <th className="whitespace-nowrap py-1 pr-2 font-normal">
                  <HeadFilter label="State" options={stateOptions} value={filters.state}
                    onPick={(v) => setF('state', v)} allLabel="Every state"
                    allMeta={`${offcutRows.length} bands`} className="uppercase tracking-wider" />
                </th>
                <th className="whitespace-nowrap py-1 pr-2 text-center font-normal">Docs</th>
                <th className="w-full whitespace-nowrap py-1 pr-2 text-right font-normal">Action</th>
              </tr>
            </thead>

            {shown.map((r) => {
              const open = openId === r.lot.id
              const toggle = () => setOpenId(open ? null : r.lot.id)
              const min = MIN_USABLE_REMNANT[r.item.id] ?? 0
              return (
                <tbody key={r.lot.id} className={`border-b border-line-soft ${
                  open ? 'bg-surface-2/60' : r.aged ? 'bg-warn-soft/25' : ''}`}>
                  <tr onClick={toggle} className={`cursor-pointer transition-colors ${open ? '' : 'hover:bg-surface-2'}`}>
                    <td className="py-1 pl-2 pr-1">
                      <button type="button" aria-expanded={open}
                        onClick={(e) => { e.stopPropagation(); toggle() }}
                        title={`${open ? 'Hide' : 'Show'} what is on ${r.band?.location}`}
                        className="press flex size-5 items-center justify-center rounded text-ink-3 hover:text-ink">
                        <Icon name="chevron" className={`size-3.5 transition-transform duration-200 ${open ? 'rotate-90' : ''}`} />
                        <span className="sr-only">{open ? 'Hide' : 'Show'} the detail for {r.band?.location}</span>
                      </button>
                    </td>

                    <td className="max-w-[16rem] py-1 pr-2">
                      <span className="flex items-baseline gap-1.5">
                        <span className="min-w-0 truncate" title={r.item.name}>{r.item.name}</span>
                        <span className="mono shrink-0 text-[10.5px] text-ink-3">{r.item.code}</span>
                      </span>
                    </td>

                    <td className="max-w-[16rem] py-1 pr-2">
                      <span className="block truncate text-ink-2" title={r.band?.spec}>{r.band?.spec}</span>
                    </td>

                    <td className="mono whitespace-nowrap py-1 pr-2 text-[11px] text-ink-2">{r.band?.location}</td>

                    <td className="num whitespace-nowrap py-1 pl-4 pr-2 text-right">
                      <Num d={r.balance} format="raw" dp={3} suffix={` ${r.uom}`} size="sm" />
                    </td>

                    <td className="num whitespace-nowrap py-1 pr-2 text-right text-ink-3">
                      {r.pieces
                        ? <span title={`About ${num(r.pieces.value, 0)} pieces, from an average piece size of ${num(r.band?.avgPieceSize ?? 0, 4)} ${r.uom}`}>
                            ≈<Num d={r.pieces} format="int" size="sm" className="text-[11px]" />
                          </span>
                        : '—'}
                    </td>

                    <td className="num whitespace-nowrap py-1 pl-4 pr-2 text-right">
                      <Num d={r.value} format="money" size="sm" />
                    </td>

                    <td className="num whitespace-nowrap py-1 pr-2 text-right text-ink-3">
                      {r.age ? `${r.age.value}d` : '—'}
                    </td>

                    <td className="whitespace-nowrap py-1 pr-2">
                      <span className="inline-flex items-center gap-1.5"
                        title={r.aged
                          ? `Past ${policy.remnantAgeDays} days a remnant is offered up for scrap or downgrade — offered, never scrapped automatically.`
                          : 'Inside the age window, and coming off the rack.'}>
                        <Icon name={r.aged ? 'clock' : 'check'}
                          className={`size-3.5 shrink-0 ${r.aged ? 'text-warn' : 'text-good'}`} />
                        <span className={r.aged ? 'text-ink-2' : 'text-ink-3'}>{r.aged ? 'Aged' : 'Moving'}</span>
                      </span>
                    </td>

                    <td className="py-1 pr-2 text-center">
                      <button type="button" onClick={(e) => { e.stopPropagation(); select(r.lot.id) }}
                        aria-label={`${r.movements.length} documents behind ${r.band?.location}`}
                        title={`Every document behind this band — ${r.movements.length} of them`}
                        className="press inline-flex items-center gap-1 rounded text-[11.5px] text-accent-ink hover:underline">
                        <Icon name="doc" className="size-3.5 shrink-0" />
                        <span className="num">{r.movements.length}</span>
                      </button>
                    </td>

                    <td className="whitespace-nowrap py-1 pr-2 text-right" onClick={(e) => e.stopPropagation()}>
                      <Button size="sm" onClick={() => setUsing(r)}>Use remnants</Button>
                    </td>
                  </tr>

                  <tr hidden={!open}>
                    <td colSpan={11} className="px-3 pb-2.5 pt-0.5">
                      <p className="flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-ink-3">
                        <span>
                          On the rack <Num d={r.balance} format="raw" dp={3} suffix={` ${r.uom}`} size="sm" />
                          {r.pieces && <> — about <Num d={r.pieces} format="int" size="sm" /> pieces</>}
                        </span>
                        <span>Worth <Num d={r.value} format="money" size="sm" /> at last purchase rate</span>
                        <span>Minimum usable {num(min, 4)} {r.uom} — anything shorter is scrap at the cut</span>
                        {r.age && <span>Oldest piece <Num d={r.age} format="int" suffix=" days" size="sm" /></span>}
                      </p>
                      {r.aged && (
                        <p className="mt-1.5 rounded-md border border-warn/30 bg-warn-soft p-2 text-[12px] leading-relaxed text-ink-2">
                          <strong className="text-ink">A piece here is older than {policy.remnantAgeDays} days.</strong>{' '}
                          It is offered up for scrap or downgrade, never scrapped automatically — the whole
                          point of the register is that a person decides whether a remnant is still material
                          or finally waste.
                        </p>
                      )}
                    </td>
                  </tr>
                </tbody>
              )
            })}
          </table>

          {shown.length === 0 && (
            <p className="px-1 py-4 text-center text-[12.5px] text-ink-2">
              No band matches that. <button type="button" onClick={() => setFilters({})}
                className="text-accent-ink underline underline-offset-2">Show every band</button>
            </p>
          )}
        </div>

        {aged.length > 0 && (
          <Note foot label={`${aged.length === 1 ? 'One band has' : `${aged.length} bands have`} a piece past the age window — what happens to it`}>
            <strong className="text-ink">
              {aged.length === 1 ? 'One band has' : `${aged.length} bands have`} a piece older than{' '}
              {policy.remnantAgeDays} days.
            </strong>{' '}
            Offered up for scrap or downgrade, never scrapped automatically — the whole point of the
            register is that a person decides whether a remnant is still material or finally waste.
          </Note>
        )}
      </Card>

      <UseRemnantDialog row={using} onClose={() => setUsing(null)} />
    </>
  )
}

/**
 * Cut records, as one line per cut.
 *
 * The record that matters is the arithmetic: input equals parts plus kerf plus
 * remnants, and the yield that falls out of it is comparable to the nest plan
 * because of that. The row carries the yield, where the material went as a lane,
 * and what reached the register; the quantities, the pieces and the individual
 * remnants — each one either register stock or scrap, by the minimum for that
 * material — are in the detail.
 */
export function CutRecords() {
  const { cutRows, policy } = useInventory()
  const [recording, setRecording] = useState(false)
  const [filters, setFilters] = useState<{ material?: string; plan?: string }>({})
  const [sort, setSort] = useState<{ col: 'on' | 'yield'; dir: 'asc' | 'desc' } | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const below = cutRows.filter((r) => r.belowPlan)

  const matches = (r: CutRow) =>
    (!filters.material || r.item.id === filters.material) &&
    (!filters.plan || (filters.plan === 'below' ? r.belowPlan : !r.belowPlan))
  const shown = cutRows.filter(matches)
  if (sort) {
    const d = sort.dir === 'asc' ? 1 : -1
    shown.sort((a, b) => sort.col === 'yield'
      ? (a.yielded.value - b.yielded.value) * d
      : a.cut.on.localeCompare(b.cut.on) * d)
  }
  const setF = (k: 'material' | 'plan', v?: string) => setFilters((f) => ({ ...f, [k]: v }))
  const toggleSort = (col: 'on' | 'yield') => setSort((s) => {
    if (s?.col !== col) return { col, dir: col === 'on' ? 'desc' : 'asc' }
    if (s.dir === (col === 'on' ? 'desc' : 'asc')) return { col, dir: col === 'on' ? 'asc' : 'desc' }
    return null
  })
  const active = Object.values(filters).filter(Boolean).length

  const materialOptions = Array.from(new Map(cutRows.map((r) => [r.item.id, r.item])).values())
    .map((it) => ({ value: it.id, label: it.name,
      meta: `${cutRows.filter((r) => r.item.id === it.id).length} cuts` }))
  const planOptions = [
    { value: 'at', label: 'At or above the nest plan', meta: `${cutRows.filter((r) => !r.belowPlan).length} cuts` },
    { value: 'below', label: `More than ${policy.yieldTolerancePct} points below plan`, meta: `${below.length} cuts` },
  ].filter((o) => !o.meta.startsWith('0 '))

  return (
    <>
      <Card index={2} className="mt-3" title="Cut records" live
        sub="Input = parts + kerf + remnants, on every record — so a yield figure means something"
        actions={<span className="flex items-center gap-2">
          {active > 0 && (
            <button type="button" onClick={() => setFilters({})}
              className="press text-[11px] text-ink-3 underline underline-offset-2 hover:text-ink">
              Show every cut
            </button>
          )}
          <Button size="sm" variant="primary" onClick={() => setRecording(true)}>Record a cut</Button>
        </span>}>
        <div className="scroll-x relative overflow-x-auto px-3 pb-2 pt-2">
          <table className="w-full min-w-[56rem] border-collapse text-[12px]">
            <thead>
              <tr className="mono border-b border-line text-left text-[9.5px] uppercase tracking-wider text-ink-3">
                <th className="w-6 py-1 pl-2 pr-1" />
                <th className="whitespace-nowrap py-1 pr-2 font-normal">Cut</th>
                <th className="whitespace-nowrap py-1 pr-2 font-normal">
                  <HeadFilter label="Material" options={materialOptions} value={filters.material}
                    onPick={(v) => setF('material', v)} allLabel="Every material"
                    allMeta={`${cutRows.length} cuts`} className="uppercase tracking-wider" />
                </th>
                <th className="whitespace-nowrap py-1 pr-2 font-normal">Job</th>
                <th className="whitespace-nowrap py-1 pr-2 font-normal">
                  <HeadSort label="Date" active={sort?.col === 'on'} dir={sort?.dir ?? 'desc'}
                    onSort={() => toggleSort('on')} title="Sort by the day it was cut"
                    className="uppercase tracking-wider" />
                </th>
                <th className="whitespace-nowrap py-1 pr-2 font-normal"
                  title="Where the input went: parts, usable remnants, kerf and scrap — and the four sum to what went in.">
                  Where it went
                </th>
                <th className="whitespace-nowrap py-1 pl-4 pr-2 text-right font-normal">
                  <HeadSort label="Yield" active={sort?.col === 'yield'} dir={sort?.dir ?? 'asc'}
                    onSort={() => toggleSort('yield')} title="Sort by yield against the nest plan"
                    className="uppercase tracking-wider" />
                </th>
                <th className="whitespace-nowrap py-1 pl-4 pr-2 text-right font-normal">To the register</th>
                <th className="w-full whitespace-nowrap py-1 pr-2 font-normal">
                  <HeadFilter label="Against plan" options={planOptions} value={filters.plan}
                    onPick={(v) => setF('plan', v)} allLabel="Every cut"
                    allMeta={`${cutRows.length} cuts`} className="uppercase tracking-wider" />
                </th>
              </tr>
            </thead>

            {shown.map((r) => {
              const open = openId === r.cut.id
              const toggle = () => setOpenId(open ? null : r.cut.id)
              const min = MIN_USABLE_REMNANT[r.item.id] ?? 0
              return (
                <tbody key={r.cut.id} className={`border-b border-line-soft ${
                  open ? 'bg-surface-2/60' : r.belowPlan ? 'bg-warn-soft/25' : ''}`}>
                  <tr onClick={toggle} className={`cursor-pointer transition-colors ${open ? '' : 'hover:bg-surface-2'}`}>
                    <td className="py-1 pl-2 pr-1">
                      <button type="button" aria-expanded={open}
                        onClick={(e) => { e.stopPropagation(); toggle() }}
                        title={`${open ? 'Hide' : 'Show'} the quantities behind ${r.cut.cutNo}`}
                        className="press flex size-5 items-center justify-center rounded text-ink-3 hover:text-ink">
                        <Icon name="chevron" className={`size-3.5 transition-transform duration-200 ${open ? 'rotate-90' : ''}`} />
                        <span className="sr-only">{open ? 'Hide' : 'Show'} the detail for {r.cut.cutNo}</span>
                      </button>
                    </td>

                    <td className="whitespace-nowrap py-1 pr-2">
                      <span className="flex items-center gap-1.5">
                        <Icon name={r.balances ? 'check' : 'alert'}
                          className={`size-3.5 shrink-0 ${r.balances ? 'text-good' : 'text-critical'}`}
                          />
                        <span className="mono text-[11.5px] font-medium">{r.cut.cutNo}</span>
                        <span className="sr-only">
                          {r.balances ? 'balances: input = parts + kerf + remnants' : 'DOES NOT BALANCE'}
                        </span>
                      </span>
                    </td>

                    <td className="max-w-[15rem] py-1 pr-2">
                      <span className="block truncate" title={r.item.name}>{r.item.name}</span>
                    </td>

                    <td className="mono whitespace-nowrap py-1 pr-2 text-[11px] text-ink-3">{r.cut.workOrder}</td>

                    <td className="mono whitespace-nowrap py-1 pr-2 text-[11px] text-ink-3">{shortDate(r.cut.on)}</td>

                    <td className="py-1 pr-2"><CutBar row={r} /></td>

                    <td className="num whitespace-nowrap py-1 pl-4 pr-2 text-right">
                      <span title={`${num(r.yielded.value, 2)}% against a nest plan of ${num(r.planned.value, 2)}%`}>
                        <Num d={r.yielded} format="raw" dp={2} suffix="%" size="sm"
                          tone={r.belowPlan ? 'warn' : undefined} />
                      </span>
                    </td>

                    <td className="num whitespace-nowrap py-1 pl-4 pr-2 text-right text-ink-3">
                      {r.usableRemnants > 0
                        ? <span title={`${num(r.usableRemnants, 3)} ${r.uom} to the offcut register`}>
                            {money(r.usableRemnants * r.item.lastPurchaseRate)}
                          </span>
                        : '—'}
                    </td>

                    <td className="whitespace-nowrap py-1 pr-2">
                      <span className="inline-flex items-center gap-1.5">
                        <Icon name={r.belowPlan ? 'alert' : 'check'}
                          className={`size-3.5 shrink-0 ${r.belowPlan ? 'text-warn' : 'text-good'}`} />
                        <span className={r.belowPlan ? 'text-ink-2' : 'text-ink-3'}>
                          {r.belowPlan
                            ? <><Num d={r.shortfall} format="raw" dp={2} size="sm" className="text-[11.5px]" /> points below the nest plan</>
                            : 'At or above the nest plan'}
                        </span>
                      </span>
                    </td>
                  </tr>

                  <tr hidden={!open}>
                    <td colSpan={9} className="px-3 pb-2.5 pt-0.5">
                      <CutLegend row={r} />
                      <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-ink-3">
                        <span>{r.cut.partsCount || '—'} pieces out</span>
                        <span>
                          To the register {num(r.usableRemnants, 3)} {r.uom}
                          {' · '}{money(r.usableRemnants * r.item.lastPurchaseRate)}
                        </span>
                        <span>Minimum usable {num(min, 4)} {r.uom}</span>
                        <span className="mono">
                          {r.balances
                            ? `balances — ${num(r.cut.partsQty, 3)} + ${num(r.cut.kerfQty, 3)} + ${num(r.usableRemnants + r.scrapRemnants, 3)} = ${num(r.cut.inputQty, 3)} ${r.uom} in`
                            : 'DOES NOT BALANCE'}
                        </span>
                      </p>

                      {r.cut.remnants.length > 0 && (
                        <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-3">
                          {r.cut.remnants.map((rem, j) => {
                            const use = rem.size >= min
                            return (
                              <li key={j} className={use ? 'text-accent-ink' : 'text-critical'}>
                                {rem.pieces} × {num(rem.size, 4)} {r.uom} — {use ? 'to the register' : 'scrap at the cut'}
                              </li>
                            )
                          })}
                        </ul>
                      )}

                      {r.belowPlan && (
                        <p className="mt-1.5 rounded-md border border-warn/30 bg-warn-soft p-2 text-[12px] leading-relaxed text-ink-2">
                          <strong className="text-ink">
                            <Num d={r.shortfall} format="raw" dp={2} size="sm" /> points below the nest plan.
                          </strong>{' '}
                          That is a nesting question, not a buying one. Buying more material does not fix a
                          nest that leaves parts on the floor.
                        </p>
                      )}
                    </td>
                  </tr>
                </tbody>
              )
            })}
          </table>

          {shown.length === 0 && (
            <p className="px-1 py-4 text-center text-[12.5px] text-ink-2">
              No cut matches that. <button type="button" onClick={() => setFilters({})}
                className="text-accent-ink underline underline-offset-2">Show every cut</button>
            </p>
          )}

          <SplitKey />
        </div>

        {below.length > 0 && (
          <Note foot label={`${below.length === 1 ? 'One cut came in' : `${below.length} cuts came in`} below the nest plan — why that is not a buying problem`}>
            <strong className="text-ink">
              {below.length === 1 ? 'One cut came in' : `${below.length} cuts came in`} more than{' '}
              {policy.yieldTolerancePct} points below the nest plan.
            </strong>{' '}
            That is a nesting question, not a buying one — and it is the first time this factory can
            tell the two apart. Buying more material does not fix a nest that leaves parts on the floor.
          </Note>
        )}
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
              <Link href="/sourcing/desk" className="font-medium text-accent-ink hover:underline">Open the desk →</Link>
            </p>
          </>
        )}
      </div>
    </Card>
  )
}
