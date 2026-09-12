'use client'
import { createContext, useCallback, useContext, useMemo, useReducer } from 'react'
import * as P from '@/lib/domain/dispatch'
import { daysBetween } from '@/lib/domain/calc'
import { money, qtyText } from '@/lib/domain/format'
import { useApp } from '@/state/app-store'
import { salesOrders } from '@/lib/seed/linewatch'
import {
  AT_RISK_ORDER_CUSTOMER, AT_RISK_ORDER_TAKEN, carriers, consignments as seedConsignments,
  customers, DESPATCHER, despatchNotes as seedNotes, extraOrders, fgItems, fgOpening,
  fgProduction, fgReturns, orderLines, rmas as seedRmas, SALES, TODAY_DISPATCH,
} from '@/lib/seed/dispatch'
import type {
  Carrier, Consignment, Customer, Derived, DespatchNote, FgItem, FgMovement, Rma,
} from '@/lib/domain/types'

export { TODAY_DISPATCH }

export const fgById = (id: string): FgItem | undefined => fgItems.find((f) => f.id === id)
const customerById = (id: string): Customer => customers.find((c) => c.id === id)!
const carrierById = (id: string): Carrier => carriers.find((c) => c.id === id)!

/* ------------------------------------------------------------------- state */

interface State {
  extraNotes: DespatchNote[]
  extraConsignments: Consignment[]
  /** delivery marks, keyed by despatch number */
  delivered: Record<string, { on: string; by: string }>
  extraRmas: Rma[]
  rmaState: Record<string, { state: Rma['state']; receivedOn?: string; grnRef?: string }>
  despatchingSo: string | null
  documentsFor: string | null
  deliveringDn: string | null
}

const initial: State = {
  extraNotes: [], extraConsignments: [], delivered: {},
  extraRmas: [], rmaState: {},
  despatchingSo: null, documentsFor: null, deliveringDn: null,
}

type Action =
  | { t: 'despatch'; note: DespatchNote; consignment: Consignment }
  | { t: 'deliver'; dnNo: string; on: string; by: string }
  | { t: 'rma'; rma: Rma }
  | { t: 'rmaState'; id: string; state: Rma['state']; receivedOn?: string; grnRef?: string }
  | { t: 'despatching'; soNo: string | null }
  | { t: 'documents'; dnNo: string | null }
  | { t: 'delivering'; dnNo: string | null }
  | { t: 'reset' }

function reducer(s: State, a: Action): State {
  switch (a.t) {
    case 'despatch':
      return {
        ...s,
        extraNotes: [...s.extraNotes, a.note],
        extraConsignments: [...s.extraConsignments, a.consignment],
        despatchingSo: null,
      }
    case 'deliver':
      return { ...s, delivered: { ...s.delivered, [a.dnNo]: { on: a.on, by: a.by } }, deliveringDn: null }
    case 'rma':
      return { ...s, extraRmas: [...s.extraRmas, a.rma] }
    case 'rmaState':
      return { ...s, rmaState: { ...s.rmaState, [a.id]: { state: a.state, receivedOn: a.receivedOn, grnRef: a.grnRef } } }
    case 'despatching': return { ...s, despatchingSo: a.soNo }
    case 'documents': return { ...s, documentsFor: a.dnNo }
    case 'delivering': return { ...s, deliveringDn: a.dnNo }
    case 'reset': return initial
    default: return s
  }
}

/* ----------------------------------------------------------------- context */

interface Ctx {
  today: string
  fgItems: FgItem[]
  customers: Customer[]
  carriers: Carrier[]
  fgRows: { fg: FgItem; balance: Derived; movements: FgMovement[] }[]
  fgValue: Derived
  orders: P.OrderRow[]
  openOrders: P.OrderRow[]
  notes: DespatchNote[]
  despatchedValue: Derived
  overdueValue: Derived
  consignmentRows: P.ConsignmentRow[]
  inTransit: P.ConsignmentRow[]
  otif: Derived
  cycleTime: Derived
  freightPerUnit: Derived
  carrierRows: P.CarrierRow[]
  rmaRows: P.RmaRow[]
  rmaRate: Derived
  shippedUnits: number
  despatchingOrder: P.OrderRow | null
  documentsNote: { note: DespatchNote; order: P.OrderRow; consignment?: P.ConsignmentRow } | null
  deliveringRow: P.ConsignmentRow | null
  raiseDespatch: (order: P.OrderRow, qty: number, carrierId: string, authorisedBy: string) => void
  markDelivered: (row: P.ConsignmentRow, on: string, by: string) => void
  authoriseReturn: (row: P.ConsignmentRow, qty: number, reason: string) => void
  receiveReturn: (row: P.RmaRow) => void
  showDespatch: (soNo: string | null) => void
  showDocuments: (dnNo: string | null) => void
  showDelivery: (dnNo: string | null) => void
  reset: () => void
}

const DispatchCtx = createContext<Ctx>(null!)
export const useDispatch = () => useContext(DispatchCtx)

export function DispatchProvider({ children }: { children: React.ReactNode }) {
  const { log, say } = useApp()
  const [state, dispatch] = useReducer(reducer, initial)
  const today = TODAY_DISPATCH

  const notes = useMemo(() => [...seedNotes, ...state.extraNotes], [state.extraNotes])

  /* ------------------------------------------------------------ DSP-01 --- */

  const movements = useMemo<FgMovement[]>(
    () => [...fgOpening, ...fgProduction, ...fgReturns, ...P.despatchMovements(notes)]
      .sort((a, b) => a.on.localeCompare(b.on)),
    [notes],
  )

  const fgRows = useMemo(() => fgItems.map((fg) => ({
    fg,
    balance: P.fgBalance(movements, fg),
    movements: movements.filter((m) => m.fgId === fg.id),
  })), [movements])

  const fgValue = useMemo<Derived>(() => {
    const v = fgRows.reduce((a, r) => a + (r.balance.value as number) * r.fg.standardCost, 0)
    return {
      value: Math.round(v * 100) / 100,
      label: 'Finished goods on the bay',
      formula: 'Σ (balance × standard cost)',
      inputs: fgRows.map((r) => ({
        name: r.fg.code,
        value: Math.round((r.balance.value as number) * r.fg.standardCost * 100) / 100,
        unit: '₹', source: `${r.balance.value} ${r.fg.uom} at ₹${r.fg.standardCost}`,
      })),
      unit: '₹',
      note: 'The third leg of the stock picture. Raw material and work in progress were already measured; this is the one the executive split had to assume.',
    }
  }, [fgRows])

  const orders = useMemo<P.OrderRow[]>(() => {
    const all = [
      ...salesOrders.map((s) => ({
        soNo: s.soNo, customerId: AT_RISK_ORDER_CUSTOMER[s.soNo],
        takenOn: AT_RISK_ORDER_TAKEN[s.soNo], promisedDate: s.promisedDate, description: s.description,
      })),
      ...extraOrders,
    ]
    return all.map((o) => {
      const lines = orderLines.filter((l) => l.soNo === o.soNo)
      const mine = notes.filter((n) => n.soNo === o.soNo)
      const ordered = lines.reduce((a, l) => a + l.qty, 0)
      const despatched = mine.reduce((a, n) => a + n.lines.reduce((b, l) => b + l.qty, 0), 0)
      const fg = fgById(lines[0]?.fgId ?? '')
      const complete = despatched >= ordered
      return {
        soNo: o.soNo, customer: customerById(o.customerId), takenOn: o.takenOn,
        promisedDate: o.promisedDate, description: o.description, lines,
        value: P.orderValue(lines, o.soNo),
        ordered, despatched,
        pending: P.pendingQty(o.soNo, ordered, despatched, fg?.uom ?? 'nos'),
        notes: mine, complete,
        overdue: !complete && o.promisedDate < today,
      }
    }).sort((a, b) => a.promisedDate.localeCompare(b.promisedDate))
  }, [notes, today])

  const openOrders = useMemo(() => orders.filter((o) => !o.complete), [orders])
  const despatchedValueD = useMemo(() => P.despatchedValue(notes, fgById), [notes])
  const overdueValueD = useMemo(() => P.overdueValue(orders), [orders])

  /* ------------------------------------------------------------ DSP-03 --- */

  const consignmentRows = useMemo<P.ConsignmentRow[]>(() => {
    const all = [...seedConsignments, ...state.extraConsignments]
    return all.map((c) => {
      const mark = state.delivered[c.dnNo]
      const con: Consignment = mark ? { ...c, deliveredOn: mark.on, confirmedBy: mark.by } : c
      const note = notes.find((n) => n.dnNo === c.dnNo)!
      const ordered = orderLines.filter((l) => l.soNo === note.soNo).reduce((a, l) => a + l.qty, 0)
      const onNote = note.lines.reduce((a, l) => a + l.qty, 0)
      const delivered = !!con.deliveredOn
      return {
        consignment: con, note, carrier: carrierById(c.carrierId),
        customer: customerById(note.customerId),
        delivered,
        onTime: delivered ? con.deliveredOn! <= con.promisedDate : false,
        inFull: onNote >= ordered,
        drift: delivered ? daysBetween(con.promisedDate, con.deliveredOn!) : 0,
        late: !delivered && con.promisedDate < today,
        transitDays: delivered ? daysBetween(note.despatchedOn, con.deliveredOn!) : null,
      }
    }).sort((a, b) => b.note.despatchedOn.localeCompare(a.note.despatchedOn))
  }, [notes, state.extraConsignments, state.delivered, today])

  const inTransit = useMemo(() => consignmentRows.filter((r) => !r.delivered), [consignmentRows])
  const otif = useMemo(() => P.customerOtif(consignmentRows), [consignmentRows])

  const cycleTimeD = useMemo(() => P.cycleTime(
    notes.map((n) => {
      const o = orders.find((x) => x.soNo === n.soNo)
      return { takenOn: o?.takenOn ?? n.despatchedOn, despatchedOn: n.despatchedOn, soNo: `${n.soNo} · ${n.dnNo}` }
    }),
  ), [notes, orders])

  const freightPerUnitD = useMemo(() => P.freightPerUnit(consignmentRows), [consignmentRows])

  const carrierRows = useMemo<P.CarrierRow[]>(() => carriers.map((c) => {
    const mine = consignmentRows.filter((r) => r.carrier.id === c.id)
    return {
      carrier: c,
      shipped: mine.length,
      delivered: mine.filter((r) => r.delivered).length,
      late: mine.filter((r) => r.delivered && !r.onTime).length,
      drift: P.carrierDrift(c, mine),
      freight: mine.reduce((a, r) => a + r.consignment.freight, 0),
      weightKg: mine.reduce((a, r) => a + r.note.weightKg, 0),
    }
  }).filter((r) => r.shipped > 0), [consignmentRows])

  /* ------------------------------------------------------------ DSP-04 --- */

  const shippedUnits = useMemo(
    () => notes.reduce((a, n) => a + n.lines.reduce((b, l) => b + l.qty, 0), 0), [notes],
  )

  const rmaRows = useMemo<P.RmaRow[]>(() => {
    const all = [...seedRmas, ...state.extraRmas]
    return all.map((r) => {
      const patch = state.rmaState[r.id]
      const rma = patch ? { ...r, ...patch } : r
      const fg = fgById(rma.fgId)!
      return {
        rma, fg, customer: customerById(rma.customerId),
        overdue: rma.state === 'authorised' && rma.dueBy < today,
        daysOut: daysBetween(rma.raisedOn, rma.receivedOn ?? today),
        value: P.rmaValue(rma, fg),
      }
    }).sort((a, b) => b.rma.raisedOn.localeCompare(a.rma.raisedOn))
  }, [state.extraRmas, state.rmaState, today])

  const rmaRateD = useMemo(
    () => P.rmaRate(rmaRows.reduce((a, r) => a + r.rma.qty, 0), shippedUnits),
    [rmaRows, shippedUnits],
  )

  /* ------------------------------------------------------------- actions -- */

  /**
   * The smallest honest first step for this stage: a note naming what left,
   * against which order, on whose authority — and it posts the movement that
   * takes the goods off the bay. The consignment is raised with it, because
   * goods that leave without a carrier and a promised date are exactly the
   * shipment nobody can chase afterwards.
   */
  const raiseDespatch = useCallback((order: P.OrderRow, qty: number, carrierId: string, authorisedBy: string) => {
    const fg = fgById(order.lines[0].fgId)!
    const dnNo = `DN-${1046 + orderSeq(order.soNo)}`
    const carrier = carrierById(carrierId)
    const weightKg = round2(qty * unitWeight(fg.id))
    const freight = round2(weightKg * order.customer.distanceKm * carrier.ratePerKgKm)
    const pending = order.pending.value as number
    const note: DespatchNote = {
      id: dnNo, dnNo, soNo: order.soNo, customerId: order.customer.id, despatchedOn: today,
      lines: [{ fgId: fg.id, qty }], weightKg, authorisedBy, actor: DESPATCHER,
      note: qty < pending ? 'part shipment' : undefined,
    }
    const consignment: Consignment = {
      id: `CN-${dnNo.slice(3)}`, dnNo, carrierId,
      lrNo: `${carrier.id.slice(3)}-${dnNo.slice(3)}`,
      promisedDate: order.promisedDate, freight,
    }
    dispatch({ t: 'despatch', note, consignment })
    log({
      entity: 'despatch_note', entityId: dnNo, action: 'Goods despatched',
      detail: `${order.soNo} · ${order.customer.name} · ${qtyText(qty, fg.uom)} ${fg.code} · ${money(qty * fg.standardCost)} at cost · ${carrier.name}`,
      before: `${pending} of ${order.ordered} still to go`,
      after: `${pending - qty} still to go · promised ${order.promisedDate}`,
      reason: `authorised by ${authorisedBy}`,
    })
    say(`${dnNo} raised. ${qtyText(qty, fg.uom)} left the bay against ${order.soNo}, the balance is on the order, and the finished-goods stock moved — the outbound gate is recorded now rather than remembered.`)
  }, [log, say, today])

  const markDelivered = useCallback((row: P.ConsignmentRow, on: string, by: string) => {
    const drift = daysBetween(row.consignment.promisedDate, on)
    dispatch({ t: 'deliver', dnNo: row.note.dnNo, on, by })
    log({
      entity: 'consignment', entityId: row.note.dnNo, action: 'Delivery confirmed',
      detail: `${row.customer.name} · ${row.carrier.name} · ${row.consignment.lrNo} · ${drift > 0 ? `${drift} days late` : drift < 0 ? `${-drift} days early` : 'on the promised day'}`,
      reason: by,
      before: `in transit · promised ${row.consignment.promisedDate}`, after: `delivered ${on}`,
    })
    say(drift > 0
      ? `Delivered ${drift} days after the date the customer was given. Customer OTIF moves, because it is counted now rather than assumed.`
      : `Delivered on time. One more observation behind the OTIF figure, which nothing in this build could compute before this stage.`)
  }, [log, say])

  const authoriseReturn = useCallback((row: P.ConsignmentRow, qty: number, reason: string) => {
    const fg = fgById(row.note.lines[0].fgId)!
    const rmaNo = `RMA-0${15 + state.extraRmas.length}`
    const dueBy = addDays(today, 7)
    const rma: Rma = {
      id: rmaNo, rmaNo, soNo: row.note.soNo, dnNo: row.note.dnNo, customerId: row.customer.id,
      fgId: fg.id, qty, reason, raisedOn: today, dueBy, owner: SALES, state: 'authorised',
    }
    dispatch({ t: 'rma', rma })
    log({
      entity: 'rma', entityId: rmaNo, action: 'Return authorised',
      detail: `${row.customer.name} · ${qtyText(qty, fg.uom)} ${fg.code} against ${row.note.dnNo} · ${money(qty * fg.standardCost)} at cost`,
      reason, before: 'a phone call', after: `authorised, due back ${dueBy}, ${SALES} owns it`,
    })
    say(`${rmaNo} raised with an owner and a deadline of ${dueBy}. The goods come home through the same gate a purchase does, so they get the same checks.`)
  }, [log, say, state.extraRmas.length, today])

  const receiveReturn = useCallback((row: P.RmaRow) => {
    const grnRef = `GRN-R${row.rma.rmaNo.slice(-3)}`
    dispatch({ t: 'rmaState', id: row.rma.id, state: 'received', receivedOn: today, grnRef })
    log({
      entity: 'rma', entityId: row.rma.rmaNo, action: 'Return received',
      detail: `${row.customer.name} · ${qtyText(row.rma.qty, row.fg.uom)} ${row.fg.code} booked in through ${grnRef}`,
      before: `authorised, due back ${row.rma.dueBy}`, after: `received ${today} — through the INB-01 gate`,
    })
    say(`Back on the shelf through ${grnRef}. A return that reaches the gate gets the same spec checks a purchase does, which is the half of reverse logistics that was already built.`)
  }, [log, say, today])

  const despatchingOrder = useMemo(
    () => orders.find((o) => o.soNo === state.despatchingSo) ?? null, [orders, state.despatchingSo],
  )
  const documentsNote = useMemo(() => {
    const note = notes.find((n) => n.dnNo === state.documentsFor)
    if (!note) return null
    const order = orders.find((o) => o.soNo === note.soNo)!
    return { note, order, consignment: consignmentRows.find((c) => c.note.dnNo === note.dnNo) }
  }, [notes, orders, consignmentRows, state.documentsFor])
  const deliveringRow = useMemo(
    () => consignmentRows.find((r) => r.note.dnNo === state.deliveringDn) ?? null,
    [consignmentRows, state.deliveringDn],
  )

  const value: Ctx = {
    today, fgItems, customers, carriers,
    fgRows, fgValue,
    orders, openOrders, notes, despatchedValue: despatchedValueD, overdueValue: overdueValueD,
    consignmentRows, inTransit, otif, cycleTime: cycleTimeD, freightPerUnit: freightPerUnitD, carrierRows,
    rmaRows, rmaRate: rmaRateD, shippedUnits,
    despatchingOrder, documentsNote, deliveringRow,
    raiseDespatch, markDelivered, authoriseReturn, receiveReturn,
    showDespatch: (soNo) => dispatch({ t: 'despatching', soNo }),
    showDocuments: (dnNo) => dispatch({ t: 'documents', dnNo }),
    showDelivery: (dnNo) => dispatch({ t: 'delivering', dnNo }),
    reset: () => { dispatch({ t: 'reset' }); say('Dispatch reset to the state the seed describes.') },
  }
  return <DispatchCtx.Provider value={value}>{children}</DispatchCtx.Provider>
}

/* --------------------------------------------------------------- helpers -- */

const round2 = (n: number) => Math.round(n * 100) / 100

/** A stable per-order suffix, so a despatch number does not change between renders. */
const orderSeq = (soNo: string) => Number(soNo.replace(/\D/g, '')) % 90

/**
 * Despatch weight per unit. A production system takes this from the product
 * master; here it is read back from the seeded notes, so a new despatch weighs
 * what the existing ones weigh and its freight bill lands in the right range.
 */
function unitWeight(fgId: string): number {
  const seen = seedNotes.flatMap((n) => n.lines.filter((l) => l.fgId === fgId).map((l) => n.weightKg / l.qty))
  return seen.length ? seen.reduce((a, b) => a + b, 0) / seen.length : 10
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
