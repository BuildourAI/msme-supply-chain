'use client'
import { useEffect, useRef, useState } from 'react'
import { Dialog } from '@/components/ui/Dialog'
import { Chips, Field, NumberInput, Select, TextInput } from '@/components/ui/Field'
import { Icon } from '@/components/ui/icons'
import { useWorkspace } from '@/components/workspace/store'
import { num, shortDate } from '@/lib/domain/format'
import { downloadCsv, toCsv } from '@/lib/sheet/csv'
import { readFile } from '@/lib/sheet/read'
import {
  addFoundLot, foundProblem, readFilledSheet, recount, recountProblem, sheetLots, sheetOf, sheetRows,
  walk, walkProblem, type WalkRow,
} from '@/lib/workspace/counting'
import { lotOf, trail } from '@/lib/workspace/ledger'
import { scrapRateOf, setLotState, writeOff, writeOffProblem } from '@/lib/workspace/losses'
import { placeLot } from '@/lib/workspace/racks'
import { RackSelect } from './RackSelect'

function Foot({ onClose, label, onSave, disabled }: {
  onClose: () => void; label: string; onSave: () => void; disabled?: boolean
}) {
  return (
    <footer className="flex items-center justify-end gap-2 border-t border-line-soft px-4 py-3">
      <button type="button" onClick={onClose}
        className="press rounded-lg px-2.5 py-2 text-[13px] text-ink-2 hover:text-ink">Cancel</button>
      <button type="button" onClick={onSave} disabled={disabled}
        className="press rounded-lg border border-accent-ink bg-accent-ink px-3.5 py-2 text-[13px] font-semibold text-on-accent hover:bg-accent disabled:opacity-40">
        {label}
      </button>
    </footer>
  )
}

/**
 * One lot's history, with the balance after every line.
 *
 * The answer to "why does the book say that?" — every receipt, issue, send-out,
 * count and write-off that made the number, each naming its document, and the
 * rack moves between them. The last balance is the book, always.
 */
export function TrailDialog({ lotId, onClose }: { lotId: string | null; onClose: () => void }) {
  const { workspace } = useWorkspace()
  if (!lotId || !workspace) return null
  const lot = lotOf(workspace, lotId)
  if (!lot) return null
  const item = workspace.items.find((i) => i.id === lot.itemId)
  const uom = item?.uom ?? ''
  const rows = trail(workspace, lotId)

  return (
    <Dialog open onClose={onClose} wide
      title={`${item?.name ?? 'Lot'} · ${lot.batchNo}`}
      sub={`${lot.id} · book ${num(lot.qty, 3)} ${uom}`}>
      <div className="px-4 py-4">
        {rows.length === 0 ? (
          <p className="text-[12.5px] text-ink-3">Nothing has been written against this lot yet.</p>
        ) : (
          <div className="scroll-x overflow-x-auto rounded-lg border border-line">
            <table className="w-full border-collapse text-[12.5px]">
              <thead>
                <tr className="border-b border-line text-left text-[12px] text-ink-3">
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">What happened</th>
                  <th className="px-3 py-2 font-medium">Document</th>
                  <th className="px-3 py-2 text-right font-medium">Moved</th>
                  <th className="px-3 py-2 text-right font-medium">Balance</th>
                  <th className="px-3 py-2 font-medium">By</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-line-soft last:border-0">
                    <td className="whitespace-nowrap px-3 py-2 text-ink-2">{shortDate(r.on)}</td>
                    <td className="px-3 py-2">
                      <span className={r.kind === 'transfer' ? 'text-ink-3' : 'text-ink'}>{r.what}</span>
                      {r.note && <span className="block text-[11.5px] text-ink-3">{r.note}</span>}
                    </td>
                    <td className="mono whitespace-nowrap px-3 py-2 text-[11.5px] text-ink-2">{r.doc}</td>
                    <td className={`num whitespace-nowrap px-3 py-2 text-right ${
                      r.qty === undefined ? 'text-ink-4' : r.qty < 0 ? 'text-critical' : 'text-good'}`}>
                      {r.qty === undefined ? '—' : `${r.qty > 0 ? '+' : ''}${num(r.qty, 3)}`}
                    </td>
                    <td className="num whitespace-nowrap px-3 py-2 text-right font-medium">{num(r.balance, 3)} {uom}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-ink-3">{r.actor || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-[11.5px] leading-relaxed text-ink-3">
          Nobody types a balance. Every change is a line against the document that made it, and
          the last line is what the book says.
        </p>
      </div>
    </Dialog>
  )
}

/** A lot put on another rack. The quantity does not move, so nothing but the trail changes. */
export function MoveRackDialog({ lotId, onClose }: { lotId: string | null; onClose: () => void }) {
  const { workspace, update, today, session } = useWorkspace()
  const [rack, setRack] = useState('')

  useEffect(() => {
    if (!lotId || !workspace) return
    setRack(lotOf(workspace, lotId)?.rack ?? '')
  }, [lotId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!lotId || !workspace) return null
  const lot = lotOf(workspace, lotId)
  if (!lot) return null
  const item = workspace.items.find((i) => i.id === lot.itemId)
  const same = (lot.rack ?? '') === rack

  const save = () => {
    update((w) => placeLot(w, lotId, rack || undefined, today, session.actor))
    onClose()
  }

  return (
    <Dialog open onClose={onClose}
      title={lot.rack ? 'Move to another rack' : 'Put it on a rack'}
      sub={`${item?.name ?? 'Lot'} · ${lot.batchNo} · ${num(lot.qty, 3)} ${item?.uom ?? ''}`}>
      <div className="space-y-3 px-4 py-4">
        <Field label="Which rack is it on now?" htmlFor="mv-rack"
          hint="The move is kept on the lot's trail, dated and with your name.">
          <RackSelect id="mv-rack" value={rack} onChange={setRack} />
        </Field>
      </div>
      <Foot onClose={onClose} onSave={save} disabled={same}
        label={rack ? 'Move it' : 'Take it off the rack'} />
    </Dialog>
  )
}

/* ---------------------------------------------------------------- counting */

const n = (v: string) => (v.trim() === '' ? NaN : Number(v.replace(/,/g, '')))

/** The difference a count makes, said against the class's tolerance. */
function DiffLine({ book, counted, tolerance, uom }: {
  book: number; counted: number; tolerance: number; uom: string
}) {
  if (!Number.isFinite(counted)) return null
  const diff = Math.round((counted - book) * 1000) / 1000
  if (diff === 0) return <p className="text-[12.5px] text-good">Agrees with the book.</p>
  const pct = book === 0 ? null : Math.abs(diff / book) * 100
  const over = pct !== null && pct > tolerance
  return (
    <p className={`text-[12.5px] ${over ? 'text-critical' : 'text-warn'}`}>
      {diff > 0 ? '+' : ''}{num(diff, 3)} {uom} against the book
      {pct !== null && <> — {num(pct, 1)}%, {over ? `outside the ${tolerance}% this class allows` : `inside the ${tolerance}% allowed`}</>}.
      {diff < 0 && ' The shortfall goes on the loss ledger.'}
    </p>
  )
}

/** One lot, counted. */
export function CountDialog({ lotId, onClose }: { lotId: string | null; onClose: () => void }) {
  const { workspace, update, today, session } = useWorkspace()
  const [qty, setQty] = useState('')
  const [note, setNote] = useState('')
  const [tried, setTried] = useState(false)

  useEffect(() => {
    if (!lotId) return
    setQty(''); setNote(''); setTried(false)
  }, [lotId])

  if (!lotId || !workspace) return null
  const lot = lotOf(workspace, lotId)
  if (!lot) return null
  const item = workspace.items.find((i) => i.id === lot.itemId)
  const uom = item?.uom ?? ''
  const tol = workspace.policy.countTolerancePct[item?.itemClass ?? 'C']
  const r = { lotId, countedQty: n(qty), on: today, counter: session.actor, note }
  const problem = recountProblem(workspace, r)

  const save = () => {
    setTried(true)
    if (problem) return
    update((w) => recount(w, r)[0])
    onClose()
  }

  return (
    <Dialog open onClose={onClose} title="Count this lot"
      sub={`${item?.name ?? 'Lot'} · ${lot.batchNo}${lot.rack ? ` · ${(workspace.racks ?? []).find((x) => x.id === lot.rack)?.name ?? ''}` : ''}`}>
      <div className="space-y-3 px-4 py-4">
        <p className="rounded-md border border-line bg-surface-2 px-2.5 py-2 text-[12.5px] text-ink-2">
          The book says <strong className="text-ink">{num(lot.qty, 3)} {uom}</strong>. Count what is
          physically there before you look at that figure too hard.
        </p>
        <Field label="What is on the rack" htmlFor="ct-qty" error={tried ? problem ?? undefined : undefined}>
          <NumberInput id="ct-qty" value={qty} onChange={setQty} unit={uom} autoFocus invalid={tried && !!problem} />
        </Field>
        <DiffLine book={lot.qty} counted={n(qty)} tolerance={tol} uom={uom} />
        <Field label="What you found" hint="Needed when the count differs — a miscount, a roll in the wrong place, damage." htmlFor="ct-note">
          <TextInput id="ct-note" value={note} onChange={setNote} onEnter={save} placeholder="Two rolls found on A-2" />
        </Field>
      </div>
      <Foot onClose={onClose} onSave={save} label="Save the count" />
    </Dialog>
  )
}

/**
 * A walk: every lot on one rack — or of one material, in a store with no
 * racks — with the book beside a box for what is there.
 *
 * The sheet can go to paper and come back: download it, walk the rack with a
 * pen, fill the Counted column, bring it back here. Nothing is written until
 * the sheet is closed, so every difference is seen before it lands. A blank
 * is "not counted", never nought.
 */
export function CountSheetDialog({ scope, onClose }: {
  scope: { rackId?: string; itemId?: string } | null
  onClose: () => void
}) {
  const { workspace, update, today, session } = useWorkspace()
  const [counted, setCounted] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [tried, setTried] = useState(false)
  const [read, setRead] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const file = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!scope) return
    setCounted({}); setNotes({}); setTried(false); setRead(null)
  }, [scope])

  if (!scope || !workspace) return null
  const ws = workspace
  const lots = sheetLots(ws, scope, today)
  const rack = scope.rackId ? (ws.racks ?? []).find((r) => r.id === scope.rackId) : undefined
  const item = scope.itemId ? ws.items.find((i) => i.id === scope.itemId) : undefined
  const title = rack ? `Walk ${rack.name}` : item ? `Count ${item.name}` : 'Count the store'

  const rows: WalkRow[] = lots
    .filter((l) => (counted[l.lot.id] ?? '').trim() !== '')
    .map((l) => ({ lotId: l.lot.id, countedQty: n(counted[l.lot.id]), note: notes[l.lot.id] }))
  const problem = walkProblem(ws, rows, today, session.actor)
  const differ = rows.filter((r) => {
    const l = lots.find((x) => x.lot.id === r.lotId)
    return l && Math.round((r.countedQty - l.lot.qty) * 1000) !== 0
  }).length

  const download = () => {
    const name = `Count sheet ${rack?.name ?? item?.name ?? 'store'} ${today}.csv`.replace(/[\\/:*?"<>|]+/g, '-')
    downloadCsv(name, toCsv(sheetRows(ws, lots)))
  }
  const upload = async (f: File) => {
    try {
      const sheet = await readFile(f)
      const got = readFilledSheet(sheet.rows, lots)
      const found = Object.keys(got.counted).length
      setCounted((s) => ({ ...s, ...Object.fromEntries(Object.entries(got.counted).map(([k, v]) => [k, v.qty])) }))
      setNotes((s) => ({ ...s, ...Object.fromEntries(Object.entries(got.counted).filter(([, v]) => v.note).map(([k, v]) => [k, v.note])) }))
      setRead(`${found} count${found === 1 ? '' : 's'} read from ${sheet.source}${got.unmatched ? ` · ${got.unmatched} row${got.unmatched === 1 ? '' : 's'} matched no lot on this sheet` : ''}. Check them, then close the sheet.`)
    } catch (e) {
      setRead(e instanceof Error ? e.message : 'That file could not be read.')
    }
  }

  const save = () => {
    setTried(true)
    if (problem) return
    update((w) => walk(w, sheetOf(scope, today), rows, today, session.actor)[0])
    onClose()
  }

  return (
    <>
      <Dialog open onClose={onClose} wide title={title}
        sub={`${lots.length} lot${lots.length === 1 ? '' : 's'} on the book · counted by ${session.actor || 'you'}, ${shortDate(today)}`}>
        <div className="space-y-3 px-4 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={download}
              className="press inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[12.5px] font-medium hover:bg-surface-2">
              <Icon name="download" className="size-3.5" /> Download the sheet
            </button>
            <button type="button" onClick={() => file.current?.click()}
              className="press inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[12.5px] font-medium hover:bg-surface-2">
              <Icon name="upload" className="size-3.5" /> Fill from a filled sheet
            </button>
            <input ref={file} type="file" accept=".xlsx,.csv" className="hidden" aria-label="A filled count sheet"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = '' }} />
            <span className="text-[11.5px] text-ink-3">Walk with paper, bring it back — nothing is written until you close the sheet.</span>
          </div>
          {read && <p className="rounded-md border border-line bg-surface-2 px-2.5 py-2 text-[12.5px] text-ink-2">{read}</p>}

          {lots.length === 0 ? (
            <p className="text-[12.5px] text-ink-3">Nothing is on the book {rack ? `on ${rack.name}` : 'here'}. Found something? Add it below.</p>
          ) : (
            <div className="scroll-x overflow-x-auto rounded-lg border border-line">
              <table className="w-full border-collapse text-[12.5px]">
                <thead>
                  <tr className="border-b border-line text-left text-[12px] text-ink-3">
                    <th className="px-3 py-2 font-medium">Material</th>
                    <th className="px-3 py-2 font-medium">Lot</th>
                    <th className="px-3 py-2 text-right font-medium">Book</th>
                    <th className="w-32 px-3 py-2 font-medium">Counted</th>
                    <th className="px-3 py-2 font-medium">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {lots.map((l) => {
                    const c = n(counted[l.lot.id] ?? '')
                    const diff = Number.isFinite(c) ? Math.round((c - l.lot.qty) * 1000) / 1000 : null
                    return (
                      <tr key={l.lot.id} className="border-b border-line-soft last:border-0">
                        <td className="px-3 py-2">
                          <span className="block font-medium text-ink">{l.item?.name}</span>
                          {!rack && l.rack && <span className="block text-[11px] text-ink-3">{l.rack.name}</span>}
                        </td>
                        <td className="mono px-3 py-2 text-[11.5px] text-ink-2">{l.lot.batchNo}</td>
                        <td className="num whitespace-nowrap px-3 py-2 text-right">{num(l.lot.qty, 3)} <span className="text-ink-3">{l.uom}</span></td>
                        <td className="px-3 py-2">
                          <input aria-label={`Counted ${l.item?.name ?? ''} ${l.lot.batchNo}`} inputMode="decimal"
                            value={counted[l.lot.id] ?? ''}
                            onChange={(e) => setCounted((s) => ({ ...s, [l.lot.id]: e.target.value }))}
                            className="num w-full rounded-md border border-line bg-surface px-2 py-1.5 text-right text-[13px] outline-none focus:border-accent" />
                          {diff !== null && diff !== 0 && (
                            <span className={`mt-0.5 block text-right text-[11px] ${diff < 0 ? 'text-critical' : 'text-warn'}`}>
                              {diff > 0 ? '+' : ''}{num(diff, 3)}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <input aria-label={`Note on ${l.item?.name ?? ''} ${l.lot.batchNo}`}
                            value={notes[l.lot.id] ?? ''} placeholder={diff ? 'What did you find?' : ''}
                            onChange={(e) => setNotes((s) => ({ ...s, [l.lot.id]: e.target.value }))}
                            className="w-full rounded-md border border-line bg-surface px-2 py-1.5 text-[12.5px] outline-none focus:border-accent" />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          <button type="button" onClick={() => setAdding(true)}
            className="press inline-flex items-center gap-1 text-[12.5px] font-medium text-accent-ink hover:underline">
            <Icon name="plus" className="size-3.5" /> Found something that is not on the book
          </button>
          {tried && problem && <p className="text-[12.5px] text-critical">{problem}</p>}
          {rows.length > 0 && !problem && (
            <p className="text-[12.5px] text-ink-2">
              {rows.length} counted{differ > 0 ? ` · ${differ} differ from the book, and the book will follow the rack` : ' · every one agrees with the book'}.
            </p>
          )}
        </div>
        <Foot onClose={onClose} onSave={save}
          label={rows.length ? `Close the sheet · ${rows.length} counted` : 'Close the sheet'} />
      </Dialog>
      <AddLotDialog open={adding} onClose={() => setAdding(false)}
        preset={{ rackId: scope.rackId, itemId: scope.itemId }} />
    </>
  )
}

/**
 * A lot the book did not know about: found on a rack, a remnant put back, an
 * opening lot missed at the first count. It goes on as a count with nothing
 * on the book, and where it came from is always asked.
 */
export function AddLotDialog({ open, onClose, preset }: {
  open: boolean
  onClose: () => void
  preset?: { rackId?: string; itemId?: string }
}) {
  const { workspace, update, today, session } = useWorkspace()
  const [itemId, setItemId] = useState('')
  const [qty, setQty] = useState('')
  const [rack, setRack] = useState('')
  const [note, setNote] = useState('')
  const [kind, setKind] = useState<'usable' | 'remnant' | 'held'>('usable')
  const [pieces, setPieces] = useState('')
  const [reason, setReason] = useState('')
  const [tried, setTried] = useState(false)

  useEffect(() => {
    if (!open || !workspace) return
    setItemId(preset?.itemId ?? workspace.items[0]?.id ?? ''); setQty(''); setRack(preset?.rackId ?? '')
    setNote(''); setKind('usable'); setPieces(''); setReason(''); setTried(false)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open || !workspace) return null
  const ws = workspace
  const item = ws.items.find((i) => i.id === itemId)
  const f = {
    itemId, qty: n(qty), on: today, counter: session.actor, note, rack: rack || undefined,
    usability: kind === 'held' ? 'qc_hold' as const : 'usable' as const,
    reason: kind === 'held' ? reason : undefined,
    remnant: kind === 'remnant', pieces: kind === 'remnant' && pieces.trim() ? n(pieces) : undefined,
  }
  const problem = foundProblem(ws, f)

  const save = () => {
    setTried(true)
    if (problem) return
    update((w) => addFoundLot(w, f)[0])
    onClose()
  }

  return (
    <Dialog open onClose={onClose} title="Add a lot the book does not have"
      sub="It goes on as a count: nothing on the book, this much on the rack.">
      <div className="space-y-3 px-4 py-4">
        <Field label="Material" htmlFor="al-item">
          <Select id="al-item" value={itemId} onChange={setItemId}
            options={ws.items.map((i) => ({ value: i.id, label: i.name }))} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="How much" htmlFor="al-qty">
            <NumberInput id="al-qty" value={qty} onChange={setQty} unit={item?.uom} autoFocus />
          </Field>
          {(ws.racks ?? []).length > 0 && (
            <Field label="On which rack" htmlFor="al-rack">
              <RackSelect id="al-rack" value={rack} onChange={setRack} />
            </Field>
          )}
        </div>
        <Field label="What it is">
          <Chips value={kind} onChange={(v) => setKind(v as typeof kind)} options={[
            { value: 'usable', label: 'Usable stock' },
            { value: 'remnant', label: 'A remnant — short pieces', hint: 'On the book, never counted as cover' },
            { value: 'held', label: 'Something wrong with it' },
          ]} />
        </Field>
        {kind === 'remnant' && (
          <Field label="How many pieces" htmlFor="al-pieces">
            <NumberInput id="al-pieces" value={pieces} onChange={setPieces} unit="pieces" step="1" />
          </Field>
        )}
        {kind === 'held' && (
          <Field label="What is wrong with it" htmlFor="al-reason">
            <TextInput id="al-reason" value={reason} onChange={setReason} placeholder="Water damage on the outer wraps" />
          </Field>
        )}
        <Field label="Where it came from" htmlFor="al-note" error={tried ? problem ?? undefined : undefined}
          hint="Always asked — a lot from nowhere is a question somebody will ask later.">
          <TextInput id="al-note" value={note} onChange={setNote} onEnter={save} placeholder="Found behind A-2 on the count" />
        </Field>
      </div>
      <Foot onClose={onClose} onSave={save} label="Add the lot" />
    </Dialog>
  )
}

/** Hold, release, or write off — what happens to a lot other than being used. */
export function LotStateDialog({ lotId, mode, onClose }: {
  lotId: string | null
  mode: 'hold' | 'release' | 'write-off'
  onClose: () => void
}) {
  const { workspace, update, today, session } = useWorkspace()
  const [qty, setQty] = useState('')
  const [why, setWhy] = useState('')
  const [to, setTo] = useState<'qc_hold' | 'damaged' | 'expired'>('qc_hold')
  const [tried, setTried] = useState(false)

  useEffect(() => {
    if (!lotId || !workspace) return
    setQty(String(lotOf(workspace, lotId)?.qty ?? '')); setWhy(''); setTo('qc_hold'); setTried(false)
  }, [lotId, mode]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!lotId || !workspace) return null
  const lot = lotOf(workspace, lotId)
  if (!lot) return null
  const item = workspace.items.find((i) => i.id === lot.itemId)
  const uom = item?.uom ?? ''
  const rate = scrapRateOf(workspace, lot.itemId)

  const problem = mode === 'write-off'
    ? writeOffProblem(workspace, { lotId, qty: n(qty), on: today, actor: session.actor, note: why })
    : mode === 'hold' && why.trim().length < 3 ? 'Say what is wrong with it.' : null

  const save = () => {
    setTried(true)
    if (problem) return
    update((w) => (mode === 'write-off'
      ? writeOff(w, { lotId, qty: n(qty), on: today, actor: session.actor, note: why })[0]
      : setLotState(w, lotId, mode === 'hold' ? to : 'usable', why, today, session.actor)))
    onClose()
  }

  const title = mode === 'write-off' ? 'Write it off' : mode === 'hold' ? 'Put it on hold' : 'Release it'
  return (
    <Dialog open onClose={onClose} title={title}
      sub={`${item?.name ?? 'Lot'} · ${lot.batchNo} · ${num(lot.qty, 3)} ${uom}`}>
      <div className="space-y-3 px-4 py-4">
        {mode === 'write-off' && (
          <>
            <Field label="How much goes" htmlFor="ls-qty">
              <NumberInput id="ls-qty" value={qty} onChange={setQty} unit={uom} autoFocus />
            </Field>
            <p className="text-[12px] text-ink-3">
              {rate > 0
                ? `A scrap dealer pays ₹${num(rate, 2)} per ${uom} for this — it goes on the loss ledger as recovery owed.`
                : 'Nothing is recovered — it goes on the loss ledger as dead loss.'}
            </p>
          </>
        )}
        {mode === 'hold' && (
          <Field label="What is wrong">
            <Chips value={to} onChange={(v) => setTo(v as typeof to)} options={[
              { value: 'qc_hold', label: 'On hold — to be checked' },
              { value: 'damaged', label: 'Damaged' },
              { value: 'expired', label: 'Past its date' },
            ]} />
          </Field>
        )}
        {mode === 'release' && lot.usabilityReason && (
          <p className="text-[12.5px] text-ink-2">Held because: {lot.usabilityReason}</p>
        )}
        <Field label={mode === 'release' ? 'Why it is fine after all' : 'Why'} htmlFor="ls-why"
          error={tried ? problem ?? undefined : undefined}>
          <TextInput id="ls-why" value={why} onChange={setWhy} onEnter={save} autoFocus={mode !== 'write-off'}
            placeholder={mode === 'release' ? 'Rechecked — shade within limits' : 'Water damage, whole roll'} />
        </Field>
        <p className="text-[11.5px] text-ink-3">
          {mode === 'write-off' ? 'Comes off the book as a write-off against a loss record, on the lot’s trail.'
            : 'No quantity moves. The change is on the lot’s trail, dated and with your name.'}
        </p>
      </div>
      <Foot onClose={onClose} onSave={save} label={title} />
    </Dialog>
  )
}
