/**
 * An owner's shipping bay, built the way an owner builds one: materials
 * counted in, a product with its material list, a style planned and output
 * booked off it, two customers, two carriers. Nothing from the sample.
 */
import { applyCount } from '@/lib/workspace/count'
import { addCarrier, addCustomer } from '@/lib/workspace/customers'
import { emptyWorkspace } from '@/lib/workspace/defaults'
import { addJob, setJobNumbering } from '@/lib/workspace/jobs'
import { bookOutput } from '@/lib/workspace/output'
import { planJob } from '@/lib/workspace/plan'
import { addProduct } from '@/lib/workspace/products'
import { addOrder, type OrderLineInput } from '@/lib/workspace/sales'
import type { Workspace } from '@/lib/workspace/types'
import type { Item } from '@/lib/domain/types'

export const TODAY = '2026-09-23' // a Wednesday

const item = (over: Partial<Item> = {}): Item => ({
  id: 'IT-001', code: 'DEN-14', name: 'Denim 14 oz', uom: 'm', itemClass: 'A',
  coverageCeilingMonths: 2, moq: 100, safetyStock: 0, avgDailyConsumption: 40,
  floorConsumptionPerDay: 40, lastPurchaseRate: 240, feeds: ['Slim-fit jeans'], ...over,
})

/** The company, its store and its product — no style, no customer yet. */
export function shop(): Workspace {
  let ws: Workspace = {
    ...emptyWorkspace({ id: 'WS-1', createdAt: '2026-01-01', ownerName: 'R. Mehta', contact: '', companyName: 'Indigo Threads', makes: 'Jeans' }),
    items: [item()],
  }
  ws = { ...ws, company: { ...ws.company, gstin: '27AABCI1234K1Z5', address: 'Bhiwandi, Thane' } }
  ws = applyCount(ws, '2026-09-01', { 'IT-001': { good: 500 } }, 'R. Mehta')
  ;[ws] = addProduct(ws, { name: 'Slim-fit jeans', code: 'SF-32', uom: 'nos', standardCost: 420, hsn: '6203', bom: [{ itemId: 'IT-001', qtyPerUnit: 1.5 }] })
  ws = setJobNumbering(ws, { word: 'style', prefix: 'ST' })
  return ws
}

/** Two customers — one in the company's own state, one across the line — and two carriers. */
export function bay(): Workspace {
  let ws = shop()
  ;[ws] = addCustomer(ws, { name: 'Bharat Panels', gstin: '27AABCB1234K1Z2', shipTo: 'Chakan MIDC, Pune', distanceKm: 150, phone: '98220 11234' })
  ;[ws] = addCustomer(ws, { name: 'Deccan Retail', gstin: '29AABCD1234K1Z9', shipTo: 'Peenya, Bengaluru', distanceKm: 840 })
  ;[ws] = addCarrier(ws, { name: 'VRL Logistics', mode: 'part', ratePerKgKm: 0.05 })
  ;[ws] = addCarrier(ws, { name: 'Our own vehicle', mode: 'own' })
  return ws
}

/** ST-1 planned for 300 at 20 a day from the 16th, and 120 good booked off it: 120 on the shelf. */
export function made(good = 120): Workspace {
  let ws = bay()
  ;[ws] = addJob(ws, { no: 'ST-1', openedOn: '2026-09-15' })
  ws = planJob(ws, 'JB-001', { productId: 'PR-001', qty: 300, plannedStart: '2026-09-16', plannedFinish: '2026-09-30', perDay: 20 })
  if (good > 0) [ws] = bookOutput(ws, { jobId: 'JB-001', on: '2026-09-22', good, rejected: 0, actor: 'K. Rao' }, TODAY)
  return ws
}

export const line = (qty: number, rate: number, over: Partial<OrderLineInput> = {}): OrderLineInput =>
  ({ productId: 'PR-001', qty, rate, ...over })

/** SO-1 to Bharat, promised the 20th (past); SO-2 to Deccan, promised the 25th. */
export function booked(good = 120): Workspace {
  let ws = made(good)
  ;[ws] = addOrder(ws, { customerId: 'CU-001', takenOn: '2026-09-10', promisedDate: '2026-09-20', lines: [line(100, 900)] })
  ;[ws] = addOrder(ws, { customerId: 'CU-002', takenOn: '2026-09-15', promisedDate: '2026-09-25', lines: [line(200, 950)] })
  return ws
}
