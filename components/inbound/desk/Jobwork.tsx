'use client'
import { useEffect, useState } from 'react'
import { ListPage } from '@/components/ui/ListPage'
import { DataTable, StatePill, type PillTone } from '@/components/ui/DataTable'
import { Tabs } from '@/components/ui/Tabs'
import { Icon } from '@/components/ui/icons'
import { DeskTools } from '@/components/sheet/DeskTools'
import { buildColumns, type DrawnColumn } from '@/components/sheet/columns'
import { ConfirmDelete } from '@/components/sourcing/ConfirmDelete'
import { JobworkerWizard } from '@/components/onboard/wizards/JobworkerWizard'
import { useWorkspace } from '@/components/workspace/store'
import { useApp } from '@/state/app-store'
import { money, num, shortDate } from '@/lib/domain/format'
import { challanRows, jobworkerHoldings, type ChallanRow } from '@/lib/workspace/inbound'
import { challanLedger, registerLedger, removeChallan, type LedgerKind } from '@/lib/workspace/jobwork'
import { isOpen } from '@/lib/workspace/receipts'
import { ChaseDialog } from './ChaseDialog'
import { InspectForm } from './InspectForm'
import { GrnDocument } from './GrnDocument'
import { CloseChallanDialog, ExtendDueDialog, ReturnForm, SendOutForm } from './JobworkDialogs'

/**
 * Material out at jobworkers, and where every unit of it is.
 *
 * Once material leaves for jobwork it is neither on the shelf nor consumed,
 * and a challan book that stops at "sent" says nothing about it. Here every
 * unit that left is one of five things — back in stock, back at the gate,
 * still with the jobworker, allowed process loss, or unaccounted — and the
 * five always add up to what went out. It is the sample company's INB-03,
 * over the owner's own challans.
 *
 * Two views of one book. The register is a card per challan, with the split
 * as a bar. The ledger is every movement, dated, each naming the document it
 * moved on, with what was still out after it — sent, back, a date re-agreed,
 * closed.
 */
type View = 'register' | 'ledger'

const SPLIT = (r: ChallanRow) => [
  { key: 'returned', label: 'Back, in stock', qty: r.acct.returned.value, cls: 'bg-good' },
  { key: 'inQc', label: 'Back, at the gate', qty: r.acct.inQc.value, cls: 'bg-accent/45' },
  { key: 'atVendor', label: 'With the jobworker', qty: r.acct.atVendor.value, cls: 'bg-accent' },
  { key: 'loss', label: 'Allowed process loss', qty: r.acct.processLoss.value, cls: 'bg-ink-3/40' },
  { key: 'unacc', label: 'Unaccounted', qty: r.acct.unaccounted.value, cls: 'bg-critical' },
].filter((s) => s.qty > 0.0001)

const KIND_WORD: Record<LedgerKind, string> = {
  sent: 'Sent', returned: 'Back', extended: 'New date', closed: 'Closed',
}
const KIND_TONE: Record<LedgerKind, PillTone> = {
  sent: 'info', returned: 'good', extended: 'warn', closed: 'neutral',
}

export function Jobwork() {
  const { workspace, update, today } = useWorkspace()
  const [view, setView] = useState<View>('register')
  const [sending, setSending] = useState(false)
  const [adding, setAdding] = useState(false)
  const [returning, setReturning] = useState<string | null>(null)
  const [pending, setPending] = useState<string | null>(null)
  const [inspecting, setInspecting] = useState<string | null>(null)
  const [papering, setPapering] = useState<string | null>(null)
  const [extending, setExtending] = useState<string | null>(null)
  const [closing, setClosing] = useState<string | null>(null)
  const [chasing, setChasing] = useState<ChallanRow | null>(null)
  const [deleting, setDeleting] = useState<ChallanRow | null>(null)

  // what just came back goes straight on to its inspection
  useEffect(() => {
    if (!pending || !workspace) return
    const made = (workspace.receipts ?? [])
      .filter((r) => r.challanId === pending && isOpen(r))
      .sort((a, b) => b.id.localeCompare(a.id))[0]
    if (made) { setInspecting(made.id); setPending(null) }
  }, [pending, workspace])

  if (!workspace) return null
  const ws = workspace
  const rows = challanRows(ws, today)
  const holdings = jobworkerHoldings(ws, today)
  const ledger = registerLedger(ws)

  const drawn: Record<string, DrawnColumn<ChallanRow>> = {
    no: {
      cell: (r) => <span className="mono whitespace-nowrap text-[12.5px] font-semibold text-ink">{r.challan.no}</span>,
      text: (r) => r.challan.no,
    },
    state: {
      cell: (r) => <StatePill {...statePill(r)} />,
      text: (r) => statePill(r).label,
    },
    vendor: { cell: (r) => r.vendor?.name ?? '—', text: (r) => r.vendor?.name ?? '' },
    item: {
      cell: (r) => <span className="font-medium text-ink">{r.item?.name ?? 'Unknown material'}</span>,
      text: (r) => r.item?.name ?? '',
    },
    process: { cell: (r) => r.challan.process ?? <span className="text-ink-4">—</span>, text: (r) => r.challan.process ?? '' },
    sent: { align: 'right', cell: (r) => `${num(r.challan.qtySent, 3)} ${r.uom}`, text: (r) => String(r.challan.qtySent) },
    sentOn: { align: 'right', cell: (r) => shortDate(r.challan.sentOn), text: (r) => r.challan.sentOn },
    dueBack: { align: 'right', cell: (r) => shortDate(r.challan.dueBack), text: (r) => r.challan.dueBack },
    back: {
      align: 'right',
      cell: (r) => num(r.acct.returned.value + r.acct.inQc.value, 3),
      text: (r) => String(r.acct.returned.value + r.acct.inQc.value),
    },
    out: {
      align: 'right',
      cell: (r) => num(r.acct.atVendor.value, 3),
      text: (r) => String(r.acct.atVendor.value),
    },
  }
  const kit = buildColumns<ChallanRow>(ws, 'challan', (r) => r.challan.id, drawn)
  const exportRows = (): string[][] => view === 'register'
    ? kit.toRows(rows)
    : [['Date', 'Challan', 'Jobworker', 'Material', 'What happened', 'Quantity', 'Document', 'Still out', 'Note'],
      ...ledger.map((e) => [e.on, e.challanNo, e.jobworker, e.item, KIND_WORD[e.kind],
        e.qty === undefined ? '' : String(e.qty), e.doc, String(e.stillOut), e.note])]

  return (
    <>
      <ListPage
        title="Jobwork" noun="challan" rows={rows}
        search={(r) => `${r.challan.no} ${r.vendor?.name ?? ''} ${r.item?.name ?? ''} ${r.challan.process ?? ''}`}
        filter={{
          label: 'Out and closed',
          options: [{ value: 'out', label: 'Out' }, { value: 'closed', label: 'Closed' }],
          of: (r) => r.challan.status,
        }}
        action={{ label: 'Send material out', icon: 'truck', onClick: () => setSending(true) }}
        tools={<DeskTools entity="challan" noun="challan" title={view === 'register' ? 'Challans' : 'Jobwork ledger'} rows={exportRows} />}
        empty={{
          line: 'Nothing is out with a jobworker. When material leaves for cutting, bending or plating, write the challan here — it comes off the shelf, and back through the gate when it returns.',
          cta: 'Send material out',
        }}>
        {(shown) => {
          const out = shown.filter((r) => r.challan.status === 'out')
          const closed = shown.filter((r) => r.challan.status === 'closed')
          const ids = new Set(shown.map((r) => r.challan.no))
          return (
            <div className="space-y-5">
              <Tabs<View> label="Register or ledger" value={view} onChange={setView}
                items={[
                  { id: 'register', label: 'Register', badge: <Count n={out.length} /> },
                  { id: 'ledger', label: 'Ledger', badge: <Count n={ledger.filter((e) => ids.has(e.challanNo)).length} /> },
                ]} />

              {view === 'register' ? (
                <div className="space-y-7">
                  {holdings.length > 0 && (
                    <section>
                      <Heading icon="factory" title="Who is holding what" count={holdings.length}
                        sub={`the most you allow one jobworker to hold is ${money(ws.policy.jobworkerExposureCeiling)}`} />
                      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {holdings.map((h) => {
                          const pct = Math.min(100, (h.held.value / Math.max(1, ws.policy.jobworkerExposureCeiling)) * 100)
                          return (
                            <li key={h.vendor.id} data-holding={h.vendor.name}
                              className={`rounded-xl px-3.5 py-3 ${h.over ? 'bg-critical-soft' : 'bg-surface-2'}`}>
                              <div className="flex items-baseline gap-2">
                                <span className="min-w-0 flex-1 truncate text-[13px] font-bold">{h.vendor.name}</span>
                                <HeldValue h={h.held} over={h.over} />
                              </div>
                              <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-surface">
                                <span className={`anim-reveal block h-full rounded-full ${h.over ? 'bg-critical' : 'bg-accent'}`}
                                  style={{ width: `${pct}%` }} />
                              </span>
                              <p className="mt-1.5 text-[11px] text-ink-3">
                                {h.over ? 'over the most you allow' : `${Math.round(pct)}% of the most you allow`}
                                {h.unaccounted > 0 && <span className="text-critical"> · {money(h.unaccounted)} unaccounted</span>}
                              </p>
                            </li>
                          )
                        })}
                      </ul>
                    </section>
                  )}

                  {out.length > 0 && (
                    <section>
                      <Heading icon="truck" title="Out" count={out.length}
                        sub={`${money(out.reduce((a, r) => a + r.valueOut.value, 0))} of material neither on your shelf nor used`} />
                      <ul className="grid items-start gap-3 md:grid-cols-2">
                        {out.map((r, i) => (
                          <ChallanCard key={r.challan.id} r={r} i={i}
                            onReturn={() => setReturning(r.challan.id)}
                            onChase={() => setChasing(r)}
                            onExtend={() => setExtending(r.challan.id)}
                            onClose={() => setClosing(r.challan.id)}
                            onInspect={(id) => setInspecting(id)}
                            onDelete={() => setDeleting(r)} />
                        ))}
                      </ul>
                    </section>
                  )}

                  {closed.length > 0 && (
                    <section>
                      <Heading icon="check" title="Closed" count={closed.length}
                        sub="Settled, each against a written reason" />
                      <DataTable columns={kit.columns} rows={closed} keyOf={(r) => r.challan.id} />
                    </section>
                  )}
                </div>
              ) : (
                <LedgerTable entries={ledger.filter((e) => ids.has(e.challanNo))}
                  onDoc={(doc) => { if (doc.startsWith('GR-')) setPapering(doc) }} />
              )}
            </div>
          )
        }}
      </ListPage>

      <SendOutForm open={sending} onClose={() => setSending(false)} onAddJobworker={() => setAdding(true)} />
      <JobworkerWizard open={adding} onClose={() => setAdding(false)} />
      <ReturnForm challanId={returning} onClose={() => setReturning(null)} onBooked={(id) => setPending(id)} />
      <InspectForm receiptId={inspecting} onClose={() => setInspecting(null)} onClosed={(id) => setPapering(id)} />
      <GrnDocument open={papering !== null} receiptId={papering} onClose={() => setPapering(null)} />
      <ExtendDueDialog challanId={extending} onClose={() => setExtending(null)} />
      <CloseChallanDialog challanId={closing} onClose={() => setClosing(null)} />
      {chasing && (
        <ChaseDialog open onClose={() => setChasing(null)}
          title={`Chase ${chasing.vendor?.name ?? 'the jobworker'} on ${chasing.challan.no}`}
          sub={`${chasing.item?.name ?? 'Material'} · promised back ${shortDate(chasing.challan.dueBack)}`}
          vendorId={chasing.challan.vendorId}
          subject={`Challan ${chasing.challan.no} — balance with you`}
          text={chasing.chase} />
      )}
      <ConfirmDelete
        open={deleting !== null}
        what={deleting?.challan.no ?? ''}
        impact={{ clean: false, losses: deleting
          ? [`the record that ${num(deleting.challan.qtySent, 3)} ${deleting.uom} went to ${deleting.vendor?.name ?? 'them'} — it goes back on your shelf`]
          : [] }}
        onClose={() => setDeleting(null)}
        onConfirm={() => { if (deleting) update((w) => removeChallan(w, deleting.challan.id)) }}
      />
    </>
  )
}

function statePill(r: ChallanRow): { label: string; tone: PillTone } {
  if (r.challan.status === 'closed') {
    return (r.challan.writtenOff ?? 0) > 0
      ? { label: `Closed · ${num(r.challan.writtenOff!, 3)} written off`, tone: 'critical' }
      : { label: 'Closed', tone: 'good' }
  }
  if (r.overdue) return { label: `${r.late.value} day${r.late.value === 1 ? '' : 's'} overdue`, tone: 'critical' }
  if (r.atGate.length > 0) return { label: 'Back at the gate', tone: 'warn' }
  const left = -r.late.value
  return { label: left === 0 ? 'Due back today' : `Due in ${left} day${left === 1 ? '' : 's'}`, tone: 'info' }
}

function Count({ n }: { n: number }) {
  return <span className="mono rounded-full bg-surface-2 px-1.5 py-px text-[10.5px] font-semibold text-ink-2">{n}</span>
}

function HeldValue({ h, over }: { h: ChallanRow['valueOut']; over: boolean }) {
  const { openInspect } = useApp()
  return (
    <button type="button" onClick={() => openInspect(h)} title="How this is worked out"
      className={`press num text-[13px] font-bold underline decoration-dotted decoration-ink-3/40 underline-offset-[3px] ${over ? 'text-critical' : ''}`}>
      {money(h.value)}
    </button>
  )
}

function Heading({ icon, title, count, sub }: {
  icon: 'truck' | 'check' | 'factory'; title: string; count: number; sub: string
}) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-line pb-2">
      <span aria-hidden className="grid size-6 place-items-center self-center rounded-md bg-surface-2 text-ink-2">
        <Icon name={icon} className="size-3.5" />
      </span>
      <h2 className="text-[13.5px] font-bold tracking-[-0.01em]">{title}</h2>
      <Count n={count} />
      <span className="text-[12px] text-ink-3">{sub}</span>
    </div>
  )
}

/**
 * One challan out. The bar is the point: every unit that left, as one of
 * five colours, summing to what was sent.
 */
function ChallanCard({ r, i, onReturn, onChase, onExtend, onClose, onInspect, onDelete }: {
  r: ChallanRow
  i: number
  onReturn: () => void
  onChase: () => void
  onExtend: () => void
  onClose: () => void
  onInspect: (receiptId: string) => void
  onDelete: () => void
}) {
  const { workspace } = useWorkspace()
  const c = r.challan
  const segs = SPLIT(r)
  const pill = statePill(r)
  const back = r.acct.returned.value + r.acct.inQc.value
  const fill = r.overdue ? 'bg-critical-soft' : r.atGate.length > 0 ? 'bg-warn-soft' : 'bg-surface-2'
  const entries = workspace ? challanLedger(workspace, c.id) : []
  const hasReturns = (workspace?.receipts ?? []).some((x) => x.challanId === c.id)
  return (
    <li style={{ '--i': i } as React.CSSProperties} data-challan={c.no}
      className={`anim-fade-up rounded-xl px-3.5 py-3 ${fill}`}>
      <div className="flex items-start gap-3">
        <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-surface text-ink-2">
          <Icon name="factory" className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-bold">
            <span className="mono">{c.no}</span> · {r.item?.name ?? 'Unknown material'}
          </span>
          <span className="block truncate text-[11.5px] text-ink-2">
            {num(c.qtySent, 3)} {r.uom} to {r.vendor?.name ?? 'Unknown jobworker'}
            {c.process && <> · {c.process.toLowerCase()}</>}
          </span>
        </span>
        <StatePill label={pill.label} tone={pill.tone} />
      </div>

      {/* the five-way split, summing to what was sent */}
      <span className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-surface" data-split
        title={segs.map((s) => `${s.label} — ${num(s.qty, 3)} ${r.uom}`).join(' · ')}>
        {segs.map((s, k) => (
          <span key={s.key} data-seg={s.key} className={`anim-reveal h-full ${s.cls}`}
            style={{ width: `${(s.qty / Math.max(c.qtySent, 0.0001)) * 100}%`, '--i': k } as React.CSSProperties} />
        ))}
      </span>
      <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
        {segs.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5 text-ink-3">
            <span aria-hidden className={`size-2 rounded-[2px] ${s.cls}`} />
            {s.label} <span className="num font-semibold text-ink-2">{num(s.qty, 3)}</span>
          </li>
        ))}
      </ul>

      <dl className="mt-2.5 grid grid-cols-3 gap-2 text-[11.5px]">
        <div>
          <dt className="text-ink-3">Back so far</dt>
          <dd className="num font-semibold">{num(back, 3)} of {num(r.expected.value, 3)}</dd>
        </div>
        <div>
          <dt className="text-ink-3">Due back</dt>
          <dd className="num font-semibold">{shortDate(c.dueBack)}{c.extensions?.length ? <span className="text-warn"> · moved</span> : null}</dd>
        </div>
        <div>
          <dt className="text-ink-3">Worth, still out</dt>
          <dd className="num font-semibold">{money(r.valueOut.value)}</dd>
        </div>
      </dl>

      {r.atGate.length > 0 && (
        <p className="mt-2.5 flex flex-wrap items-center gap-2 rounded-lg bg-surface/70 px-2.5 py-2 text-[11.5px] text-ink-2">
          <Icon name="tray" className="size-3.5 text-warn" />
          {num(r.acct.inQc.value, 3)} {r.uom} back at the gate, not yet inspected
          <button type="button" onClick={() => onInspect(r.atGate[0].id)}
            className="press ml-auto rounded-md border border-line bg-surface px-2 py-0.5 text-[11.5px] font-semibold hover:bg-surface-2">
            Inspect
          </button>
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={onReturn}
          className="press rounded-lg border border-accent-ink bg-accent-ink px-3 py-1.5 text-[12.5px] font-semibold text-on-accent hover:bg-accent">
          It came back
        </button>
        <Quiet onClick={onChase}>Chase</Quiet>
        <Quiet onClick={onExtend}>New date</Quiet>
        <Quiet onClick={onClose}>Close</Quiet>
        {!hasReturns && (
          <button type="button" onClick={onDelete} title={`Delete ${c.no}`}
            className="press ml-auto rounded-md p-1.5 text-ink-4 hover:bg-critical-soft hover:text-critical">
            <Icon name="trash" className="size-4" />
            <span className="sr-only">Delete {c.no}</span>
          </button>
        )}
      </div>

      <details className="mt-2.5">
        <summary className="cursor-pointer select-none text-[11.5px] text-ink-3 hover:text-ink-2">
          Its ledger · {entries.length} {entries.length === 1 ? 'movement' : 'movements'}
        </summary>
        <ol className="mt-1.5 space-y-1 border-l-2 border-line pl-3">
          {entries.map((e, k) => (
            <li key={k} className="text-[11.5px]">
              <span className="mono">{shortDate(e.on)}</span>{' '}
              <span className="font-semibold">{KIND_WORD[e.kind]}</span>{' '}
              <span className="mono text-ink-3">{e.doc}</span>
              <span className="block text-ink-2">{e.note}</span>
              <span className="block text-ink-3">still out: <span className="num">{num(e.stillOut, 3)}</span></span>
            </li>
          ))}
        </ol>
      </details>
    </li>
  )
}

function Quiet({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className="press rounded-lg border border-line bg-surface px-3 py-1.5 text-[12.5px] font-medium hover:bg-surface-2">
      {children}
    </button>
  )
}

/**
 * Every movement across every challan, newest first — each dated, each naming
 * its document, each with what was still out after it.
 */
function LedgerTable({ entries, onDoc }: {
  entries: ReturnType<typeof registerLedger>
  onDoc: (doc: string) => void
}) {
  if (entries.length === 0) {
    return <p className="rounded-xl border border-line bg-surface px-6 py-10 text-center text-[13px] text-ink-2">Nothing has moved yet.</p>
  }
  return (
    <div className="rounded-xl border border-line bg-surface">
      <div className="relative overflow-x-auto px-3 py-2">
        <table className="w-full min-w-[720px] border-collapse text-[12px]" data-ledger>
          <thead>
            <tr className="border-b border-line text-left text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-3">
              <th className="whitespace-nowrap py-1.5 pr-2 font-semibold">Date</th>
              <th className="whitespace-nowrap py-1.5 pr-2 font-semibold">Challan</th>
              <th className="py-1.5 pr-2 font-semibold">What happened</th>
              <th className="whitespace-nowrap py-1.5 pr-2 text-right font-semibold">Quantity</th>
              <th className="whitespace-nowrap py-1.5 pr-2 font-semibold">Document</th>
              <th className="whitespace-nowrap py-1.5 text-right font-semibold">Still out</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft">
            {entries.map((e, k) => (
              <tr key={k} data-ledger-row={e.kind} className="align-top hover:bg-surface-2">
                <td className="mono whitespace-nowrap py-2 pr-2 text-[11.5px]">{shortDate(e.on)}</td>
                <td className="whitespace-nowrap py-2 pr-2">
                  <span className="mono text-[11.5px] font-semibold">{e.challanNo}</span>
                  <span className="block text-[11px] text-ink-3">{e.jobworker}</span>
                </td>
                <td className="py-2 pr-2">
                  <StatePill label={KIND_WORD[e.kind]} tone={KIND_TONE[e.kind]} />
                  <span className="mt-0.5 block text-[11.5px] text-ink-2">{e.item} — {e.note}</span>
                </td>
                <td className="num whitespace-nowrap py-2 pr-2 text-right">{e.qty === undefined ? '—' : num(e.qty, 3)}</td>
                <td className="whitespace-nowrap py-2 pr-2">
                  {e.doc.startsWith('GR-')
                    ? <button type="button" onClick={() => onDoc(e.doc)}
                        className="press mono text-[11.5px] text-accent-ink underline underline-offset-2">{e.doc}</button>
                    : <span className="mono text-[11.5px]">{e.doc}</span>}
                </td>
                <td className="num whitespace-nowrap py-2 text-right font-semibold">{num(e.stillOut, 3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
