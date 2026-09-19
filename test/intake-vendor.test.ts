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
