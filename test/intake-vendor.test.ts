/**
 * Who a document is from, read off the document.
 *
 * The rows below are what the PDF reader actually returns for
 * `test/fixtures/quote.pdf` — a letterhead, an address, a GSTIN line, the word
 * QUOTATION beside a reference, and then the table. A fixture invented to suit
 * the parser would prove nothing; this is the shape of the thing.
 */
import { describe, expect, it } from 'vitest'
import { readHeader, readVendor } from '@/lib/intake/vendor'
import { readExtraColumns, rowsToLines } from '@/lib/intake/lines'
import type { Vendor } from '@/lib/domain/types'

const QUOTE: string[][] = [
  ['SHAH METALS & ALLOYS'],
  ['Plot 44, GIDC Phase II, Vatva, Ahmedabad 382445'],
  ['GSTIN 24AABCS1429L1Z8 | sales@shahmetals.in | +91 98250 11234'],
  ['QUOTATION', 'No. SMA/Q/2026/1184'],
  ['Date: 12/09/2026'],
  ['Valid until: 15/10/2026'],
  ['Description', 'Qty', 'Unit', 'Rate', 'Amount'],
  ['C.R.C.A. SHEET 1.2MM 1250 WIDE (PRIME)', '12', 'MT', '62,800.00', '7,53,600.00'],
]

const vendor = (id: string, name: string): Vendor => ({ id, name, paymentTermsDays: 30 })

describe('a supplier already on the list', () => {
  it('is recognised from the letterhead', () => {
    const hit = readVendor(QUOTE, [vendor('VN-007', 'Shah Metals & Alloys')], 'Patel Heaters')
    expect(hit).toEqual({ name: 'Shah Metals & Alloys', vendorId: 'VN-007' })
  })

  it('whatever they do with the ampersand', () => {
    // one copy of a quotation says "&", the next says "and", and neither is a
    // different supplier
    const rows = [['SHAH METALS AND ALLOYS PVT LTD'], ...QUOTE.slice(1)]
    expect(readVendor(rows, [vendor('VN-007', 'Shah Metals & Alloys')], '')?.vendorId)
      .toBe('VN-007')
  })

  it('and is found even when the name is in the footer rather than the top', () => {
    const rows = [...QUOTE.slice(1), ['For SHAH METALS & ALLOYS — Authorised Signatory']]
    expect(readVendor(rows, [vendor('VN-007', 'Shah Metals & Alloys')], '')?.vendorId)
      .toBe('VN-007')
  })

  it('and the fuller name wins over a shorter one inside it', () => {
    const list = [vendor('VN-001', 'Shah Metals'), vendor('VN-002', 'Shah Metals & Alloys')]
    expect(readVendor(QUOTE, list, '')?.vendorId).toBe('VN-002')
  })
})

describe('a supplier nobody has entered yet', () => {
  it('comes back as a name to fill the box with, and no id', () => {
    expect(readVendor(QUOTE, [], 'Patel Heaters')).toEqual({ name: 'SHAH METALS & ALLOYS' })
  })

  it('is never the word QUOTATION, or a reference, or an address', () => {
    const rows = QUOTE.slice(1) // letterhead removed
    const hit = readVendor(rows, [], 'Patel Heaters')
    expect(hit?.name ?? '').not.toMatch(/quotation|gstin|plot 44|^no\./i)
  })

  it('is never the owner themselves', () => {
    /*
     * A quotation is addressed to somebody, so the owner's name is on it too.
     * Picking it would be worse than picking nothing, because it is confidently
     * wrong rather than merely absent.
     */
    const rows = [['PATEL HEATERS PVT LTD'], ['Kind attention: Purchase'], ...QUOTE.slice(1)]
    expect(readVendor(rows, [], 'Patel Heaters')?.name).not.toMatch(/patel/i)
  })

  it('says nothing at all about a page with no name on it', () => {
    expect(readVendor([['Description', 'Qty', 'Rate'], ['ITEM A', '1', '10']], [], '')).toBeNull()
    expect(readVendor([], [], '')).toBeNull()
  })
})

describe('the rest of the letterhead block', () => {
  it('reads the quotation number', () => {
    expect(readHeader(QUOTE).docNo).toBe('SMA/Q/2026/1184')
  })

  it('reads the date on the document, which is not the day it was uploaded', () => {
    // day-first, as it is written in India and everywhere else in this build
    expect(readHeader(QUOTE).date).toBe('2026-09-12')
  })

  it('and tells that date apart from the one it is valid until', () => {
    const h = readHeader(QUOTE)
    expect(h.validUntil).toBe('2026-10-15')
    expect(h.date).not.toBe(h.validUntil)
  })

  it('leaves out what is not there rather than guessing', () => {
    expect(readHeader([['SOME SUPPLIER'], ['Description', 'Rate']])).toEqual({})
  })
})

/* ================================================== the payment terms block */

describe('the payment terms printed on a quotation', () => {
  const head = (...lines: string[]) => readHeader(lines.map((l) => [l]))

  it('comes back as days, ready for the comparison to use', () => {
    expect(head('Payment terms: 45 days from invoice').termsDays).toBe(45)
    expect(head('Terms : 30 Days').termsDays).toBe(30)
  })

  it('and as the words the supplier actually wrote', () => {
    expect(head('Payment terms: 45 days from invoice').terms).toBe('45 days from invoice')
  })

  it('reads every way of saying there is no credit as nothing', () => {
    expect(head('Payment Terms: 100% advance').termsDays).toBe(0)
    expect(head('Terms: Cash against delivery').termsDays).toBe(0)
    expect(head('Payment terms: COD').termsDays).toBe(0)
  })

  it('does not take a delivery time for a payment term', () => {
    /*
     * The mistake this is shaped to avoid. "Delivery: 15 days" sits two inches
     * from the terms on most letterheads, and taking the first number on the
     * row would swap a lead time into the one landed-cost component the build
     * derives rather than asks for.
     */
    const h = head('Delivery: 15 days ex-works', 'Payment terms: 45 days')
    expect(h.termsDays).toBe(45)
  })

  it('says nothing at all when the document does not', () => {
    const h = head('Quotation No. QTR-2026-118', 'Date: 14/09/2026')
    expect(h.terms).toBeUndefined()
    expect(h.termsDays).toBeUndefined()
  })

  it('keeps the words when they cannot be read as a number of days', () => {
    // "as agreed" is worth showing the owner and is not worth guessing at
    const h = head('Payment terms: As mutually agreed')
    expect(h.terms).toBe('As mutually agreed')
    expect(h.termsDays).toBeUndefined()
  })
})

describe('the quotation number', () => {
  const head = (...lines: string[]) => readHeader(lines.map((l) => [l]))

  it('is the number, not the title printed beside it', () => {
    expect(head('QUOTATION Quotation No. SDM/QTN/2026/0418').docNo).toBe('SDM/QTN/2026/0418')
    expect(head('Quote valid upto 31/03/2027', 'Ref: KLH/Q/2026/077').docNo).toBe('KLH/Q/2026/077')
  })

  it('and a word is never a number', () => {
    expect(head('QUOTATION FOR DENIM FABRIC').docNo).toBeUndefined()
  })
})

/* ================================================ the delivery promise */

describe('the delivery time printed on a quotation', () => {
  const head = (...lines: string[]) => readHeader(lines.map((l) => [l]))

  it('comes back as days, however it is worded', () => {
    expect(head('Delivery: 21 days from PO').leadDays).toBe(21)
    expect(head('Lead time: 12 days').leadDays).toBe(12)
    expect(head('Dispatch within 2 weeks of order').leadDays).toBe(14)
    expect(head('Ready stock — dispatch in 3 working days').leadDays).toBe(3)
  })

  it('takes the far end of a range, the end a line stops on', () => {
    expect(head('Delivery 10-14 days ex-works').leadDays).toBe(14)
    expect(head('Delivery: 15 to 20 days').leadDays).toBe(20)
  })

  it('never reads the payment terms as a delivery time, on one line or two', () => {
    expect(head('Payment terms: 30 days from invoice').leadDays).toBeUndefined()
    const h = head('Terms: 30 days from invoice. Freight extra. Delivery 10-14 days ex-works.')
    expect(h.leadDays).toBe(14)
    expect(h.termsDays).toBe(30)
  })

  it('does not read a delivery date as a number of days', () => {
    expect(head('Delivery by: 15/10/2026').leadDays).toBeUndefined()
  })

  it('and "Delivery terms" are not payment terms', () => {
    const h = head('Delivery terms: 15 days ex-works', 'Payment terms: 45 days from invoice')
    expect(h.termsDays).toBe(45)
    expect(h.leadDays).toBe(15)
    expect(head('Delivery terms: 15 days').termsDays).toBeUndefined()
  })

  it('says nothing when nothing is printed', () => {
    expect(head('Quotation No. QTR-2026-118', 'Date: 14/09/2026').leadDays).toBeUndefined()
  })
})

/* ============================================ columns the build never knew */

/**
 * The cells a quotation carries that this build has no field for.
 *
 * The reader kept four figures and threw the rest away, which is exactly what
 * sends somebody back to a spreadsheet for the one thing their trade happens
 * to need — an HSN code, a brand, a pack size, a warranty.
 */
describe('reading a table for columns nobody planned for', () => {
  const TABLE = [
    ['Sr', 'Description', 'HSN', 'Qty', 'Rate', 'Amount', 'Brand'],
    ['1', 'CRCA sheet 1.2 mm', '7209', '12', '61400', '736800', 'Tata'],
    ['2', 'GI sheet 2 mm', '7210', '5', '58200', '291000', 'Jindal'],
    ['3', 'MS angle 40x40', '7216', '8', '54100', '432800', 'Tata'],
  ]

  it('finds the ones it has no field for and leaves the ones it does', () => {
    const cols = readExtraColumns(TABLE).map((c) => c.label)
    expect(cols).toEqual(['HSN', 'Brand'])
  })

  it('and lines every value up with the row it was printed on', () => {
    const hsn = readExtraColumns(TABLE).find((c) => c.label === 'HSN')!
    expect(hsn.values).toEqual(['7209', '7210', '7216'])
    // the same order `rowsToLines` returns, which is what the wizard relies on
    expect(rowsToLines(TABLE).map((l) => l.raw)).toEqual([
      'CRCA sheet 1.2 mm', 'GI sheet 2 mm', 'MS angle 40x40',
    ])
  })

  it('ignores a heading with almost nothing under it', () => {
    // a stray cell from a table that read badly is not a column anybody wants
    const sparse = [
      TABLE[0],
      ['1', 'CRCA sheet 1.2 mm', '7209', '12', '61400', '736800', 'Tata'],
      ['2', 'GI sheet 2 mm', '', '5', '58200', '291000', ''],
      ['3', 'MS angle 40x40', '', '8', '54100', '432800', ''],
    ]
    expect(readExtraColumns(sparse).map((c) => c.label)).toEqual([])
  })

  it('has nothing to say about a document with no heading row', () => {
    expect(readExtraColumns([
      ['CRCA sheet 1.2 mm', '12', '61400'],
      ['GI sheet 2 mm', '5', '58200'],
    ])).toEqual([])
  })

  it('and never offers two columns under the same heading', () => {
    const twice = [
      ['Sr', 'Description', 'HSN', 'Qty', 'Rate', 'HSN'],
      ['1', 'CRCA sheet 1.2 mm', '7209', '12', '61400', '7209'],
      ['2', 'GI sheet 2 mm', '7210', '5', '58200', '7210'],
    ]
    expect(readExtraColumns(twice).map((c) => c.label)).toEqual(['HSN'])
  })
})
