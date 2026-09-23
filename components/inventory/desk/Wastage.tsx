'use client'
import { useEffect, useState } from 'react'
import { ListPage } from '@/components/ui/ListPage'
import { DataTable, StatePill, Tag } from '@/components/ui/DataTable'
import { Dialog } from '@/components/ui/Dialog'
import { Field, NumberInput } from '@/components/ui/Field'
import { Icon } from '@/components/ui/icons'
import { Tabs } from '@/components/ui/Tabs'
import { DeskTools } from '@/components/sheet/DeskTools'
import { buildColumns, type DrawnColumn } from '@/components/sheet/columns'
import { useWorkspace } from '@/components/workspace/store'
import { CAUSE_MOVES_STOCK, LOSS_LABEL } from '@/lib/domain/inventory'
import { money, num, shortDate } from '@/lib/domain/format'
import {
  byCause, lossRows, netLossOf, noSale, scrapNotedKey, scrapRows, sellProblem, sellScrap, unrealised,
  type LossRow, type ScrapRow,
} from '@/lib/workspace/losses'
import { WasteForm } from './IssueDialogs'
import { LotStateDialog } from './LedgerDialogs'
import { lotRows } from '@/lib/workspace/ledger'

type View = 'losses' | 'cause' | 'scrap'

const STATE: Record<LossRow['state'], { label: string; tone: 'neutral' | 'warn' | 'good' | 'critical' }> = {
  dead: { label: 'Dead loss', tone: 'neutral' },
  owed: { label: 'Scrap unsold', tone: 'warn' },
  sold: { label: 'Sold', tone: 'good' },
  no_sale: { label: 'No sale', tone: 'neutral' },
}

function Count({ n }: { n: number }) {
  return n > 0 ? <span className="mono rounded-full bg-surface-3 px-1.5 text-[10.5px] leading-[17px] text-ink-3">{n}</span> : null
}

/**
 * What left the store without going into anything, and what it cost.
 *
 * Two causes are typed by a person — wastage on a job, spoilage in the
 * store. The rest post themselves from the event they came of: a short count,
 * a jobworker who kept more than the process allowed, a rejection at the gate
 * that was scrapped — and, where material is cut, the kerf and the pieces too
 * small to keep. Net loss is what it cost less what the scrap fetched, and
 * scrap that was booked as money and never collected is named until somebody
 * sells it or says nobody will.
 */
export function Wastage() {
  const { workspace, update, today } = useWorkspace()
  const [view, setView] = useState<View>('losses')
  const [selling, setSelling] = useState<string | null>(null)
  const [wasting, setWasting] = useState(false)
  const [spoiling, setSpoiling] = useState(false)
  const [writing, setWriting] = useState<string | null>(null)

  if (!workspace) return null
  const ws = workspace
  const rows = lossRows(ws, today)
  const month = today.slice(0, 7)

  const drawn: Record<string, DrawnColumn<LossRow>> = {
    on: { cell: (r) => shortDate(r.loss.on), text: (r) => r.loss.on },
    cause: {
      cell: (r) => <span className="text-ink">{LOSS_LABEL[r.loss.cause]}</span>,
      text: (r) => LOSS_LABEL[r.loss.cause],
    },
    item: { cell: (r) => <span className="font-medium text-ink">{r.item?.name ?? 'Unknown material'}</span>, text: (r) => r.item?.name ?? '' },
    qty: { align: 'right', cell: (r) => <>{num(r.loss.qty, 3)} <span className="text-ink-3">{r.uom}</span></>, text: (r) => String(r.loss.qty) },
    doc: { cell: (r) => <Tag>{r.loss.sourceRef}</Tag>, text: (r) => r.loss.sourceRef },
    job: { cell: (r) => (r.job ? <span className="mono text-[12px]">{r.job}</span> : <span className="text-ink-4">—</span>), text: (r) => r.job ?? '' },
    cost: {
      align: 'right',
      cell: (r) => (r.cost.value > 0 ? money(r.cost.value) : <span className="text-ink-4" title="No purchase price on record">—</span>),
      text: (r) => String(r.cost.value),
    },
    recovery: {
      cell: (r) => (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <StatePill label={STATE[r.state].label} tone={STATE[r.state].tone}
            title={r.state === 'owed' ? `Booked at ₹${num(r.loss.recoveryRate, 2)} per ${r.uom}` : undefined} />
          {r.state === 'owed' && <span className="num text-[12px] text-ink-2">{money(r.recovery.value)} owed</span>}
          {r.state === 'sold' && <span className="num text-[12px] text-ink-2">{money(r.realised.value)} on {shortDate(r.loss.soldOn!)}</span>}
        </span>
      ),
      text: (r) => `${STATE[r.state].label}${r.state === 'sold' ? ` ${r.realised.value}` : ''}`,
    },
    note: { cell: (r) => <span className="text-ink-2">{r.loss.note ?? ''}</span>, text: (r) => r.loss.note ?? '' },
  }
  const kit = buildColumns<LossRow>(ws, 'loss', (r) => r.loss.id, drawn)

  const causes = [...new Set(rows.map((r) => r.loss.cause))]

  return (
    <>
      <ListPage
        title="Wastage & loss" noun="loss record" rows={rows}
        search={(r) => `${r.item?.name ?? ''} ${LOSS_LABEL[r.loss.cause]} ${r.loss.sourceRef} ${r.job ?? ''} ${r.loss.note ?? ''} ${kit.searchText(r)}`}
        filter={causes.length > 1 ? {
          label: 'Every cause',
          options: causes.map((c) => ({ value: c, label: LOSS_LABEL[c] })),
          of: (r) => r.loss.cause,
        } : undefined}
        action={{ label: 'Record wastage', onClick: () => setWasting(true) }}
        tools={
          <>
            <button type="button" onClick={() => setSpoiling(true)}
              className="press inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-[13px] font-medium hover:bg-surface-2">
              <Icon name="trash" className="size-3.5" /> Spoiled in the store
            </button>
            <DeskTools entity="loss" noun="loss record" title="Loss ledger" rows={() => kit.toRows(rows)} />
          </>
        }
        empty={{
          line: 'Nothing lost yet. Wastage on a job and spoilage in the store are recorded here; a short count, a jobworker who kept too much, and a rejection scrapped at the gate post themselves.',
          cta: 'Record wastage on a job',
          second: { label: 'Something spoiled in the store', onClick: () => setSpoiling(true) },
        }}>
        {(shown) => {
          const losses = shown.map((r) => r.loss)
          const net = netLossOf(ws, losses)
          const owed = unrealised(ws, today)
          const causeRows = byCause(ws, losses)
          const scrap = scrapRows(ws, month)
          const over = scrap.filter((s) => s.over && !s.noted).length
          return (
            <div className="space-y-3">
              <p className="text-[12.5px] text-ink-3">
                <span className="num font-semibold text-ink">{money(net.value)}</span> net loss on what is shown
                {owed.value > 0 && <> · <span className="text-warn">{money(owed.value)} of scrap booked and not yet sold</span></>}
              </p>
              <Tabs<View> label="Losses, causes or scrap against target" value={view} onChange={setView}
                items={[
                  { id: 'losses', label: 'Losses', badge: <Count n={shown.filter((r) => r.state === 'owed').length} /> },
                  { id: 'cause', label: 'By cause' },
                  { id: 'scrap', label: 'Scrap vs target', badge: <Count n={over} /> },
                ]} />

              {view === 'losses' && (
                <DataTable columns={kit.columns} rows={shown} keyOf={(r) => r.loss.id}
                  extra={{
                    icon: 'cash',
                    label: (r) => (r.state === 'owed' || r.state === 'dead' ? `Record a sale of ${r.loss.id}` : 'Settled'),
                    onClick: (r) => { if (r.state === 'owed' || r.state === 'dead') setSelling(r.loss.id) },
                  }}
                  extra2={{
                    icon: 'close',
                    label: (r) => (r.state === 'owed' ? `No sale for ${r.loss.id}` : 'Nothing to settle'),
                    onClick: (r) => { if (r.state === 'owed') update((w) => noSale(w, r.loss.id, today)) },
                  }}
                />
              )}

              {view === 'cause' && (
                <ul className="space-y-2">
                  {causeRows.map((c) => {
                    const worst = Math.max(...causeRows.map((x) => x.gross), 1)
                    return (
                      <li key={c.cause} className="rounded-xl border border-line bg-surface px-4 py-3">
                        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                          <span className="text-[13.5px] font-semibold text-ink">{LOSS_LABEL[c.cause]}</span>
                          <span className="text-[11.5px] text-ink-3">
                            {CAUSE_MOVES_STOCK[c.cause] ? 'moves stock itself' : 'part of a movement already written'}
                            {' · '}{c.qtyItems} material{c.qtyItems === 1 ? '' : 's'}
                          </span>
                          <span className="num ml-auto text-[13.5px] font-semibold">{money(c.net)}</span>
                        </div>
                        <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-surface-3">
                          <span className="block h-full rounded-full bg-critical" style={{ width: `${(c.gross / worst) * 100}%` }} />
                        </span>
                        <p className="mt-1 text-[11.5px] text-ink-3">{money(c.gross)} at cost · {money(c.gross - c.net)} back as scrap</p>
                      </li>
                    )
                  })}
                  {causeRows.length === 0 && <li className="text-[12.5px] text-ink-3">Nothing to show.</li>}
                </ul>
              )}

              {view === 'scrap' && (scrap.length === 0
                ? <p className="rounded-xl border border-line bg-surface px-6 py-10 text-center text-[13px] text-ink-2">
                  Nothing issued this month. Scrap against target is floor losses over what was issued — it needs both.
                </p>
                : <ScrapTable rows={scrap} month={month}
                  onNote={(r) => update((w) => ({ ...w, drafts: { ...w.drafts, [scrapNotedKey(r.item.id, month)]: true } }))} />)}
            </div>
          )
        }}
      </ListPage>

      <SellScrapDialog lossId={selling} onClose={() => setSelling(null)} />
      <WasteForm open={wasting} onClose={() => setWasting(false)} />
      <SpoiledPicker open={spoiling} onClose={() => setSpoiling(false)}
        onPick={(lotId) => { setSpoiling(false); setWriting(lotId) }} />
      <LotStateDialog lotId={writing} mode="write-off" onClose={() => setWriting(null)} />
    </>
  )
}

function ScrapTable({ rows, month, onNote }: { rows: ScrapRow[]; month: string; onNote: (r: ScrapRow) => void }) {
  return (
    <>
      <p className="text-[12px] text-ink-3">
        {month}: scrap on the floor — wastage on jobs, cutting losses, what a jobworker kept — as a share of what
        was issued. Spoilage, count shortages and gate rejections are losses, but not scrap, and are left out.
      </p>
      <DataTable rows={rows} keyOf={(r) => r.item.id}
        columns={[
          { key: 'item', head: 'Material', cell: (r) => <span className="font-medium text-ink">{r.item.name}</span> },
          { key: 'cls', head: 'Class', cell: (r) => r.cls },
          { key: 'issued', head: 'Issued', align: 'right', cell: (r) => `${num(r.issued, 3)} ${r.item.uom}` },
          { key: 'lost', head: 'Scrap', align: 'right', cell: (r) => `${num(r.lost, 3)} ${r.item.uom}` },
          { key: 'pct', head: 'Scrap %', align: 'right', cell: (r) => <strong>{num(r.pct.value, 2)}%</strong> },
          { key: 'target', head: 'Target', align: 'right', cell: (r) => `${r.target}%` },
          { key: 'net', head: 'Net loss', align: 'right', cell: (r) => (r.net > 0 ? money(r.net) : '—') },
          {
            key: 'state', head: 'Against target',
            cell: (r) => (r.over
              ? <StatePill label={`Over by ${num(r.pct.value - r.target, 1)} points${r.noted ? ' · noted' : ''}`} tone={r.noted ? 'neutral' : 'critical'} />
              : <StatePill label="Within target" tone="good" />),
          },
        ]}
        extra={{
          icon: 'check',
          label: (r) => (r.over && !r.noted ? `Noted — scrap on ${r.item.name}` : 'Nothing to note'),
          onClick: (r) => { if (r.over && !r.noted) onNote(r) },
        }} />
    </>
  )
}

/** The scrap sold — for what it actually fetched, which is rarely what was booked. */
export function SellScrapDialog({ lossId, onClose }: { lossId: string | null; onClose: () => void }) {
  const { workspace, update, today } = useWorkspace()
  const [amount, setAmount] = useState('')
  const [tried, setTried] = useState(false)

  useEffect(() => {
    if (!lossId || !workspace) return
    const l = (workspace.losses ?? []).find((x) => x.id === lossId)
    setAmount(l ? String(Math.round(l.qty * l.recoveryRate)) : ''); setTried(false)
  }, [lossId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!lossId || !workspace) return null
  const l = (workspace.losses ?? []).find((x) => x.id === lossId)
  if (!l) return null
  const item = workspace.items.find((i) => i.id === l.itemId)
  const booked = Math.round(l.qty * l.recoveryRate * 100) / 100
  const got = amount.trim() === '' ? NaN : Number(amount)
  const problem = sellProblem(workspace, lossId, got)

  const save = () => {
    setTried(true)
    if (problem) return
    update((w) => sellScrap(w, lossId, { on: today, realised: got }))
    onClose()
  }

  return (
    <Dialog open onClose={onClose} title="Record the scrap sale"
      sub={`${num(l.qty, 3)} ${item?.uom ?? ''} of ${item?.name ?? 'material'} · ${LOSS_LABEL[l.cause]} · ${l.sourceRef}`}>
      <div className="space-y-3 px-4 py-4">
        <Field label="What the dealer paid" htmlFor="sc-amount" error={tried ? problem ?? undefined : undefined}
          hint={booked > 0 ? `Booked at ${money(booked)}. Put in what actually arrived — net loss counts that, not the estimate.` : 'Nothing was booked for it; whatever it fetched comes off the loss.'}>
          <NumberInput id="sc-amount" value={amount} onChange={setAmount} unit="₹" autoFocus />
        </Field>
        {Number.isFinite(got) && booked > 0 && got !== booked && (
          <p className={`text-[12.5px] ${got < booked ? 'text-warn' : 'text-good'}`}>
            {got < booked ? `${money(booked - got)} less than booked.` : `${money(got - booked)} more than booked.`}
          </p>
        )}
      </div>
      <footer className="flex items-center justify-end gap-2 border-t border-line-soft px-4 py-3">
        <button type="button" onClick={onClose}
          className="press rounded-lg px-2.5 py-2 text-[13px] text-ink-2 hover:text-ink">Cancel</button>
        <button type="button" onClick={save}
          className="press rounded-lg border border-accent-ink bg-accent-ink px-3.5 py-2 text-[13px] font-semibold text-on-accent hover:bg-accent">
          Record the sale
        </button>
      </footer>
    </Dialog>
  )
}

/** Which lot spoiled — anything on the shelf. */
function SpoiledPicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (lotId: string) => void }) {
  const { workspace, today } = useWorkspace()
  if (!open || !workspace) return null
  const lots = lotRows(workspace, today).filter((r) => !r.correction && r.lot.qty > 0)
  return (
    <Dialog open onClose={onClose} title="What spoiled?" sub="Pick the lot. It comes off the book as spoilage, with a reason.">
      <ul className="grid gap-1.5 px-4 py-4">
        {lots.map((r) => (
          <li key={r.lot.id}>
            <button type="button" onClick={() => onPick(r.lot.id)}
              className="press flex w-full items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2.5 text-left hover:bg-surface-2">
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold text-ink">{r.item?.name}</span>
                <span className="mono block text-[11.5px] text-ink-3">{r.lot.batchNo}{r.rack ? ` · ${r.rack.name}` : ''}</span>
              </span>
              <span className="num text-[12.5px] text-ink-2">{num(r.lot.qty, 3)} {r.uom}</span>
            </button>
          </li>
        ))}
        {lots.length === 0 && <li className="text-[12.5px] text-ink-3">Nothing is on the book.</li>}
      </ul>
    </Dialog>
  )
}
