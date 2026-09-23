/**
 * The owner's dispatch records in the domain's shapes.
 *
 * The domain's Stage 5 arithmetic — overdue value, OTIF, order-to-dock time,
 * carrier drift, freight per unit, return rate — was written against the
 * sample's records. The owner's carry the same facts under the owner's ids
 * and with fewer fields required, so these mappers fill what the domain
 * shape wants and the domain does the sums; nothing is recomputed here.
 */
import type {
  Carrier, Consignment, Customer, DespatchNote, SalesOrderLine,
} from '@/lib/domain/types'
import type { OrderRow as DomainOrderRow } from '@/lib/domain/dispatch'
import { customerState } from './gst'
import type { CustomerOrder, DispatchNote, WsCarrier, WsConsignment, WsCustomer } from './types'

export const asCustomer = (c: WsCustomer): Customer => ({
  id: c.id, name: c.name, gstin: c.gstin ?? '', state: customerState(c) ?? '',
  shipTo: c.shipTo ?? '', distanceKm: c.distanceKm ?? 0, paymentTerms: c.paymentTerms ?? 0,
})

export const asCarrier = (c: WsCarrier): Carrier => ({ id: c.id, name: c.name, mode: c.mode, ratePerKgKm: c.ratePerKgKm ?? 0 })

export const asLines = (o: CustomerOrder): SalesOrderLine[] =>
  o.lines.map((l) => ({ id: l.id, soNo: o.no, fgId: l.productId, qty: l.qty, rate: l.rate }))

export const asNote = (n: DispatchNote, orderNo: string): DespatchNote => ({
  id: n.id, dnNo: n.no, soNo: orderNo, customerId: n.customerId, despatchedOn: n.on,
  lines: n.lines.map((l) => ({ fgId: l.productId, qty: l.qty })),
  weightKg: n.weightKg ?? 0, authorisedBy: n.authorisedBy, actor: n.actor, note: n.note,
})

export const asConsignment = (c: WsConsignment, noteNo: string): Consignment => ({
  id: c.id, dnNo: noteNo, carrierId: c.carrierId, lrNo: c.lrNo ?? '', promisedDate: c.promisedDate,
  deliveredOn: c.deliveredOn, freight: c.freight ?? 0, confirmedBy: c.confirmedBy,
})

/** An order as the domain's order-book row, for `overdueValue`. */
export function asOrderRow(
  o: CustomerOrder, customer: WsCustomer | undefined, notes: DispatchNote[],
  r: Pick<DomainOrderRow, 'value' | 'pending' | 'ordered' | 'despatched' | 'complete' | 'overdue'>,
): DomainOrderRow {
  return {
    soNo: o.no,
    customer: customer ? asCustomer(customer) : { id: '', name: 'Unknown customer', gstin: '', state: '', shipTo: '', distanceKm: 0, paymentTerms: 0 },
    takenOn: o.takenOn,
    promisedDate: o.promisedDate,
    description: o.note ?? '',
    lines: asLines(o),
    notes: notes.map((n) => asNote(n, o.no)),
    ...r,
  }
}
