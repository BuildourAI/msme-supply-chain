/**
 * The purchase order, as a piece of paper.
 *
 * An order that exists only in this app is not an order: the supplier needs
 * something with your GSTIN on it, the rate you agreed and the date you expect
 * it. What is checked here is the model behind that page rather than the
 * drawing of it — jsPDF needs a browser, and the arithmetic is what a supplier
 * would dispute.
 */
import { describe, expect, it } from 'vitest'
import { buildPo, linesOf, poMessageFor, poSubjectFor, renderPo } from '@/lib/paper/po'
import { readPdf } from '@/lib/intake/pdf'
import { rowsToLines } from '@/lib/intake/lines'
import { fileName, forPrint, undrawable } from '@/lib/paper/render'
import { emptyWorkspace } from '@/lib/workspace/defaults'
import { addField, setValue } from '@/lib/workspace/fields'
import { buildVendor } from '@/lib/workspace/records'
import type { PurchaseOrder, Workspace } from '@/lib/workspace/types'
import type { Item } from '@/lib/domain/types'

const TODAY = '2026-09-20'

const item = (over: Partial<Item> = {}): Item => ({
  id: 'IT-001', code: 'CRCA', name: 'CRCA sheet 1.2 mm', uom: 'MT', itemClass: 'B',
  coverageCeilingMonths: 2, moq: 1, safetyStock: 0, avgDailyConsumption: 1,
  floorConsumptionPerDay: 1, lastPurchaseRate: 0, feeds: [], ...over,
})

const line = (over: Partial<PurchaseOrder> = {}): PurchaseOrder => ({
  id: 'PO-001', no: 'PO-1', vendorId: 'VN-001', itemId: 'IT-001',
  qty: 12, unitPrice: 61400, orderedOn: '2026-09-18', expectedOn: '2026-09-25',
  state: 'confirmed', ...over,
})

const seeded = (over: Partial<Workspace> = {}): Workspace => {
  const ws = emptyWorkspace({
    id: 'WS-1', createdAt: TODAY, ownerName: 'R. Mehta', contact: '+91 98250 00000',
    companyName: 'Patel Heaters', makes: 'heaters',
  })
  return {
    ...ws,
    company: {
      ...ws.company,
      address: 'Shed 12, Odhav Estate, Ahmedabad 382415',
      gstin: '24AAACP1234F1Z5',
      phone: '+91 98250 00000',
    },
    items: [item(), item({ id: 'IT-002', code: 'GI', name: 'GI sheet 2 mm' })],
    vendors: [buildVendor({ id: 'VN-001', name: 'Shah Metals & Alloys', paymentTermsDays: 45 })],
    vendorContact: { 'VN-001': { address: 'Plot 44, GIDC Phase II, Vatva' } },
    orders: [line()],
    ...over,
  }
}

describe('one order, however many lines are on it', () => {
  it('collects every line sharing the number', () => {
    const ws = seeded({
      orders: [line(), line({ id: 'PO-002', itemId: 'IT-002', qty: 5, unitPrice: 58200 })],
    })
    expect(linesOf(ws, 'PO-1')).toHaveLength(2)
    expect(buildPo(ws, 'PO-1')!.rows).toHaveLength(2)
  })

  it('and the total is the sum of them, not a figure derived twice', () => {
    const ws = seeded({
      orders: [line(), line({ id: 'PO-002', itemId: 'IT-002', qty: 5, unitPrice: 58200 })],
    })
    const doc = buildPo(ws, 'PO-1')!
    // 12 × 61,400 = 736,800; 5 × 58,200 = 291,000
    expect(doc.rows.map((r) => r.value)).toEqual([736800, 291000])
    expect(doc.total).toBe('₹10,27,800')
  })

  it('leaves a cancelled line off the page', () => {
    // a supplier should not be handed a page with a line you have called off
    const ws = seeded({
      orders: [line(), line({ id: 'PO-002', itemId: 'IT-002', state: 'cancelled' })],
    })
    expect(buildPo(ws, 'PO-1')!.rows).toHaveLength(1)
  })

  it('and has no document at all when every line is off it', () => {
    const ws = seeded({ orders: [line({ state: 'cancelled' })] })
    expect(buildPo(ws, 'PO-1')).toBeNull()
    expect(buildPo(seeded(), 'PO-404')).toBeNull()
  })

  it('promises the latest date on the order, not the first', () => {
    /*
     * A page headed with the earliest of three expected dates promises the
     * supplier something the other two lines were never going to meet.
     */
    const ws = seeded({
      orders: [line(), line({ id: 'PO-002', itemId: 'IT-002', expectedOn: '2026-10-09' })],
    })
    expect(buildPo(ws, 'PO-1')!.expectedOn).toBe('9 Oct 2026')
  })
})

describe('what is printed on it', () => {
  it('carries your letterhead, because a supplier has to know who ordered', () => {
    const doc = buildPo(seeded(), 'PO-1')!
    expect(doc.company.name).toBe('Patel Heaters')
    expect(doc.company.lines.join(' ')).toContain('24AAACP1234F1Z5')
    expect(doc.company.lines.join(' ')).toContain('Odhav Estate')
  })

  it('and their address, which is why a supplier has one', () => {
    expect(buildPo(seeded(), 'PO-1')!.vendorAddress).toBe('Plot 44, GIDC Phase II, Vatva')
  })

  it('states their payment terms rather than leaving them to be argued about', () => {
    const terms = (ws: Workspace) => buildPo(ws, 'PO-1')!.terms
      .find((t) => t.label === 'Payment')?.value
    expect(terms(seeded())).toBe('45 days from invoice')

    const cash = seeded({
      vendors: [buildVendor({ id: 'VN-001', name: 'Shah Metals & Alloys', paymentTermsDays: 0 })],
    })
    // zero days is not "0 days from invoice" — it is cash, and says so
    expect(terms(cash)).toBe('Against delivery')
  })

  it('prints a column the owner marked for the document', () => {
    let ws = seeded()
    const made = addField(ws, { entity: 'order', label: 'Works order', kind: 'text', onDoc: true })
    ws = setValue(made.ws, 'PO-001', made.id, 'WO-2026-88')
    expect(buildPo(ws, 'PO-1')!.extras).toEqual([{ label: 'Works order', value: 'WO-2026-88' }])
  })

  it('and leaves off one nobody marked', () => {
    let ws = seeded()
    const made = addField(ws, { entity: 'order', label: 'Internal note', kind: 'text' })
    ws = setValue(made.ws, 'PO-001', made.id, 'chase on Tuesday')
    expect(buildPo(ws, 'PO-1')!.extras).toEqual([])
  })

  it('names the field a character it cannot draw came from', () => {
    const ws = seeded({
      vendors: [buildVendor({ id: 'VN-001', name: 'शाह मेटल्स', paymentTermsDays: 45 })],
    })
    const doc = buildPo(ws, 'PO-1')!
    expect(doc.problems.map((p) => p.where)).toContain('the supplier name')
  })

  it('and draws the rupee sign as the rupee is written on Indian paper', () => {
    expect(forPrint('₹10,27,800')).toBe('Rs.10,27,800')
    expect(undrawable('₹10,27,800')).toEqual([])
  })
})

describe('the order in words, for when the PDF does not travel', () => {
  it('names every line, the total and the date', () => {
    const ws = seeded({
      orders: [line(), line({ id: 'PO-002', itemId: 'IT-002', qty: 5, unitPrice: 58200 })],
    })
    const msg = poMessageFor(buildPo(ws, 'PO-1')!)

    expect(msg).toContain('CRCA sheet 1.2 mm')
    expect(msg).toContain('GI sheet 2 mm')
    expect(msg).toContain('Total: ₹10,27,800')
    expect(msg).toContain('Delivery by: 25 Sep 2026')
    expect(msg).toContain('45 days from invoice')
  })

  it('and the subject says which order it is', () => {
    expect(poSubjectFor(buildPo(seeded(), 'PO-1')!)).toContain('PO-1')
  })
})

describe('the file it lands under', () => {
  it('names the supplier, so two orders do not overwrite each other', () => {
    expect(fileName('PO-1', 'Shah Metals & Alloys')).toBe('PO-1-Shah-Metals-Alloys.pdf')
  })

  it('and copes with a name that is all punctuation', () => {
    expect(fileName('PO-1', '!!!')).toBe('PO-1-.pdf')
  })
})

/* ================================================ the page actually drawn == */

/**
 * The order rendered and read back.
 *
 * jsPDF runs in Node, and so does pdf.js, so the page a supplier receives can
 * be built here and parsed with the very reader this build points at incoming
 * quotations. That is a stronger check than asserting the model: it catches a
 * column that collides with the one beside it, an amount that wrapped, or a
 * line that never made it onto the paper — none of which the model knows about.
 */
const nodePdfjs = async () => {
  const mod = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const m = mod as unknown as { GlobalWorkerOptions: { workerSrc: string } }
  m.GlobalWorkerOptions.workerSrc =
    new URL('../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs', import.meta.url).href
  return mod as never
}

describe('the page a supplier receives', () => {
  const twoLines = () => seeded({
    orders: [line(), line({ id: 'PO-002', itemId: 'IT-002', qty: 5, unitPrice: 58200 })],
  })

  const read = async () => {
    const blob = await renderPo(buildPo(twoLines(), 'PO-1')!)
    const { rows } = await readPdf(await blob.arrayBuffer(), nodePdfjs)
    return rows
  }

  it('says what it is, so nobody mistakes it for an enquiry', async () => {
    const flat = (await read()).map((r) => r.join(' ')).join(' | ')
    expect(flat).toContain('PURCHASE ORDER')
    expect(flat).toContain('PATEL HEATERS')
    expect(flat).toContain('PO-1')
  })

  it('addresses it to the supplier, at the address on file', async () => {
    const flat = (await read()).map((r) => r.join(' ')).join(' | ')
    expect(flat).toContain('Shah Metals & Alloys')
    expect(flat).toContain('GIDC Phase II')
  })

  it('and every line is on it, with its own rate and amount', async () => {
    const rows = await read()
    const crca = rows.find((r) => r.join(' ').includes('CRCA sheet'))!
    const gi = rows.find((r) => r.join(' ').includes('GI sheet'))!

    expect(crca.join(' ')).toContain('61,400')
    expect(crca.join(' ')).toContain('7,36,800')
    expect(gi.join(' ')).toContain('58,200')
    expect(gi.join(' ')).toContain('2,91,000')
  })

  it('names the currency once, in the column head, not in every cell', async () => {
    const flat = (await read()).map((r) => r.join(' ')).join(' | ')
    expect(flat).toContain('Amount (Rs.)')
    // "Rs.61,400.00" in every cell reads as noise and parses as nothing
    expect(flat).not.toContain('Rs.61,400')
  })

  it('totals them, in the rupees a built-in font can actually draw', async () => {
    const flat = (await read()).map((r) => r.join(' ')).join(' | ')
    // ₹ is not in cp1252; "Rs." is what Indian business paper prints anyway
    expect(flat).toContain('Rs.10,27,800')
    expect(flat).not.toContain('₹')
  })

  it('and carries the terms it was placed on', async () => {
    const flat = (await read()).map((r) => r.join(' ')).join(' | ')
    expect(flat).toContain('45 days from invoice')
    expect(flat).toContain('24AAACP1234F1Z5')
  })

  it('reads back through this build\'s own reader as a table with lines on it', async () => {
    /*
     * The round trip. If the amount column ever ran into the rate column the
     * reader would fold them into one cell and this would see one figure where
     * there should be two.
     */
    const rows = await read()
    const priced = rowsToLines(rows)
    expect(priced.map((l) => l.rate)).toContain(61400)
    expect(priced.map((l) => l.rate)).toContain(58200)
  })
})
