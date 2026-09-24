/**
 * Who the company sells to, and who carries it there.
 *
 * A customer needs little to be a customer: a name. The GSTIN is what the
 * delivery challan and the e-way bill want, and the state is read off it; a
 * distance is only asked because a carrier's rate per kilogram-kilometre is
 * useless without one. A carrier is a name and how it moves goods — "our own
 * vehicle" is a carrier too, so a note sent in the company's tempo is booked
 * like any other.
 */
import { issueId } from './defaults'
import { GST_STATE, STATES, customerState, isGstin } from './gst'
import type { CarrierMode, DispatchRules, Workspace, WsCarrier, WsCustomer } from './types'

/* ------------------------------------------------------------ the rules -- */

/** ₹50,000 is the e-way bill threshold for an inter-state movement; 95% is a fair OTIF target. */
export const DEFAULT_DISPATCH_RULES: DispatchRules = {
  ewayThreshold: 50000,
  otifTargetPct: 95,
  promiseDays: 7,
  returnDays: 7,
}

export const dispatchRulesOf = (ws: Workspace): DispatchRules => ws.dispatchRules ?? DEFAULT_DISPATCH_RULES

/* ------------------------------------------------------------ customers -- */

export const customerOf = (ws: Workspace, id?: string): WsCustomer | undefined =>
  id ? (ws.customers ?? []).find((c) => c.id === id) : undefined

export interface CustomerInput {
  name: string
  gstin?: string
  state?: string
  shipTo?: string
  phone?: string
  email?: string
  distanceKm?: number
  paymentTerms?: number
  note?: string
}

export function customerProblem(ws: Workspace, c: CustomerInput, exceptId?: string): string | null {
  const name = c.name.trim()
  if (name.length < 2) return 'Give the customer a name.'
  const twin = (ws.customers ?? []).find((x) => x.id !== exceptId && x.name.trim().toLowerCase() === name.toLowerCase())
  if (twin) return `${twin.name} is already a customer.`
  const g = c.gstin?.trim()
  if (g && !isGstin(g)) return 'That GSTIN is not in the right shape — fifteen characters, starting with the state code.'
  if (c.distanceKm !== undefined && (!Number.isFinite(c.distanceKm) || c.distanceKm < 0)) return 'Distance is kilometres, or blank.'
  if (c.paymentTerms !== undefined && (!Number.isInteger(c.paymentTerms) || c.paymentTerms < 0)) return 'Payment terms are whole days, or blank.'
  return null
}

const cleanCustomer = (c: CustomerInput): Omit<WsCustomer, 'id'> => ({
  name: c.name.trim(),
  gstin: c.gstin?.trim().toUpperCase() || undefined,
  state: c.state?.trim() || undefined,
  shipTo: c.shipTo?.trim() || undefined,
  phone: c.phone?.trim() || undefined,
  email: c.email?.trim() || undefined,
  distanceKm: c.distanceKm,
  paymentTerms: c.paymentTerms,
  note: c.note?.trim() || undefined,
})

export function addCustomer(ws: Workspace, c: CustomerInput): [Workspace, string] {
  if (customerProblem(ws, c)) return [ws, '']
  const [w, id] = issueId(ws, 'CU')
  return [{ ...w, customers: [...(w.customers ?? []), { id, ...cleanCustomer(c) }] }, id]
}

export function updateCustomer(ws: Workspace, id: string, c: CustomerInput): Workspace {
  if (!customerOf(ws, id) || customerProblem(ws, c, id)) return ws
  return { ...ws, customers: (ws.customers ?? []).map((x) => (x.id === id ? { id, ...cleanCustomer(c) } : x)) }
}

export function removeCustomerProblem(ws: Workspace, id: string): string | null {
  const n = (ws.customerOrders ?? []).filter((o) => o.customerId === id).length
  return n ? `${n} order${n === 1 ? ' names' : 's name'} them. Their record has to stay with ${n === 1 ? 'it' : 'those'}.` : null
}

export const removeCustomer = (ws: Workspace, id: string): Workspace =>
  (removeCustomerProblem(ws, id) ? ws : { ...ws, customers: (ws.customers ?? []).filter((c) => c.id !== id) })

export interface CustomerRow {
  customer: WsCustomer
  state?: string
  openOrders: number
  /** units dispatched to them this month */
  dispatchedThisMonth: number
}

export function customerRows(ws: Workspace, today: string): CustomerRow[] {
  const month = today.slice(0, 7)
  return [...(ws.customers ?? [])]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((customer) => ({
      customer,
      state: customerState(customer),
      openOrders: (ws.customerOrders ?? []).filter((o) => o.customerId === customer.id && o.state === 'open').length,
      dispatchedThisMonth: (ws.dispatchNotes ?? []).filter((n) => n.customerId === customer.id && n.on.slice(0, 7) === month)
        .reduce((a, n) => a + n.lines.reduce((b, l) => b + l.qty, 0), 0),
    }))
}

/* ------------------------------------------------------------- carriers -- */

export const CARRIER_MODE: Record<CarrierMode, string> = {
  own: 'Our own vehicle',
  part: 'Part load',
  full: 'Full truck',
  courier: 'Courier',
  other: 'Other',
}

const squash = (s: string) => s.trim().toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '')

/** The words people write for how a carrier moves goods, squashed. */
const MODE_WORDS: Record<CarrierMode, string[]> = {
  own: ['own', 'ownvehicle', 'ourownvehicle', 'ourvehicle', 'self', 'companyvehicle', 'inhouse', 'owntempo'],
  part: ['part', 'partload', 'ptl', 'ltl', 'parttruckload', 'lessthantruckload', 'sharedtruck'],
  full: ['full', 'fulltruck', 'fulltruckload', 'ftl', 'fullload', 'truck', 'fullvehicle'],
  courier: ['courier', 'couriers', 'express', 'parcel'],
  other: ['other', 'others'],
}

/** "FTL", "Part load", "our own vehicle" → a mode; anything else is not guessed at. */
export function readCarrierMode(word: string): CarrierMode | undefined {
  const w = squash(word)
  if (!w) return undefined
  return (Object.keys(MODE_WORDS) as CarrierMode[]).find((m) => MODE_WORDS[m].includes(w) || squash(CARRIER_MODE[m]) === w)
}

/** Old names people still write on a sheet. */
const STATE_ALIASES: Record<string, string> = {
  orissa: 'Odisha', pondicherry: 'Puducherry', newdelhi: 'Delhi', nctofdelhi: 'Delhi',
  uttaranchal: 'Uttarakhand', jk: 'Jammu and Kashmir', jandk: 'Jammu and Kashmir', andamanandnicobar: 'Andaman and Nicobar Islands',
  damananddiu: 'Dadra and Nagar Haveli and Daman and Diu', dadraandnagarhaveli: 'Dadra and Nagar Haveli and Daman and Diu',
}

/** A state as written on a sheet — its name, an old name, or its two-digit GST code. */
export function readState(word: string): string | undefined {
  const raw = word.trim()
  if (!raw) return undefined
  if (/^\d{1,2}$/.test(raw)) return GST_STATE[raw.padStart(2, '0')]
  const w = squash(raw)
  return STATES.find((s) => squash(s) === w) ?? STATE_ALIASES[w]
}

export const carrierOf = (ws: Workspace, id?: string): WsCarrier | undefined =>
  id ? (ws.carriers ?? []).find((c) => c.id === id) : undefined

export interface CarrierInput { name: string; mode: CarrierMode; ratePerKgKm?: number; phone?: string; note?: string }

export function carrierProblem(ws: Workspace, c: CarrierInput, exceptId?: string): string | null {
  const name = c.name.trim()
  if (name.length < 2) return 'Give the carrier a name.'
  const twin = (ws.carriers ?? []).find((x) => x.id !== exceptId && x.name.trim().toLowerCase() === name.toLowerCase())
  if (twin) return `${twin.name} is already a carrier.`
  if (!CARRIER_MODE[c.mode]) return 'Say how they carry it.'
  if (c.ratePerKgKm !== undefined && (!Number.isFinite(c.ratePerKgKm) || c.ratePerKgKm < 0)) return 'The rate is rupees per kg per km, or blank.'
  return null
}

const cleanCarrier = (c: CarrierInput): Omit<WsCarrier, 'id'> => ({
  name: c.name.trim(), mode: c.mode, ratePerKgKm: c.ratePerKgKm,
  phone: c.phone?.trim() || undefined, note: c.note?.trim() || undefined,
})

export function addCarrier(ws: Workspace, c: CarrierInput): [Workspace, string] {
  if (carrierProblem(ws, c)) return [ws, '']
  const [w, id] = issueId(ws, 'CR')
  return [{ ...w, carriers: [...(w.carriers ?? []), { id, ...cleanCarrier(c) }] }, id]
}

export function updateCarrier(ws: Workspace, id: string, c: CarrierInput): Workspace {
  if (!carrierOf(ws, id) || carrierProblem(ws, c, id)) return ws
  return { ...ws, carriers: (ws.carriers ?? []).map((x) => (x.id === id ? { id, ...cleanCarrier(c) } : x)) }
}

export function removeCarrierProblem(ws: Workspace, id: string): string | null {
  const n = (ws.consignments ?? []).filter((c) => c.carrierId === id).length
  return n ? `${n} consignment${n === 1 ? ' went' : 's went'} with them. Their record has to stay with ${n === 1 ? 'it' : 'those'}.` : null
}

export const removeCarrier = (ws: Workspace, id: string): Workspace =>
  (removeCarrierProblem(ws, id) ? ws : { ...ws, carriers: (ws.carriers ?? []).filter((c) => c.id !== id) })
