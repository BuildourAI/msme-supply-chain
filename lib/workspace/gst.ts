/**
 * Where a supply is made from and to, for GST.
 *
 * A GSTIN's first two digits are the state it is registered in, so the state
 * is read off a GSTIN rather than asked twice. A company or customer with no
 * GSTIN types a state instead. Intra-state supply carries CGST and SGST;
 * inter-state carries IGST — the tax itself is the accounts package's to
 * raise, but the delivery challan has to say which it is.
 */
import type { Workspace, WsCustomer } from './types'

/** The GST state codes, as the GSTN publishes them. */
export const GST_STATE: Record<string, string> = {
  '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh',
  '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh',
  '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur',
  '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal',
  '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat',
  '26': 'Dadra and Nagar Haveli and Daman and Diu', '27': 'Maharashtra', '29': 'Karnataka',
  '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands', '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh',
}

export const STATES: string[] = [...new Set(Object.values(GST_STATE))].sort()

const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/

/** A GSTIN in the shape the GSTN issues: fifteen characters, a known state first. */
export const isGstin = (v: string): boolean => GSTIN.test(v.trim().toUpperCase()) && Boolean(GST_STATE[v.trim().slice(0, 2)])

export const stateOfGstin = (gstin?: string): string | undefined =>
  gstin && isGstin(gstin) ? GST_STATE[gstin.trim().slice(0, 2)] : undefined

/** The company's own state: typed, or read off its GSTIN. */
export const companyState = (ws: Workspace): string | undefined =>
  ws.company.state?.trim() || stateOfGstin(ws.company.gstin)

export const customerState = (c?: WsCustomer): string | undefined =>
  c ? c.state?.trim() || stateOfGstin(c.gstin) : undefined

/** Intra-state (CGST + SGST) or inter-state (IGST); unknown until both states are. */
export function supplyType(from?: string, to?: string): 'intra' | 'inter' | undefined {
  if (!from || !to) return undefined
  return from.trim().toLowerCase() === to.trim().toLowerCase() ? 'intra' : 'inter'
}
