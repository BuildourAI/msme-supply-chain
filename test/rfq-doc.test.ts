/**
 * The request document and the links that carry it.
 *
 * The PDF bytes are not asserted — what matters is the model that goes into
 * them, the character check that decides whether they can be drawn at all, and
 * the URLs, which are the two places where getting it wrong opens somebody
 * else's chat or sends a truncated message.
 */
import { describe, expect, it } from 'vitest'
import { emptyWorkspace, issueId } from '@/lib/workspace/defaults'
import { addField, setValue } from '@/lib/workspace/fields'
import { buildItem, buildVendor } from '@/lib/workspace/records'
import { buildDoc, docsFor, forPrint, quoteByDate, undrawable } from '@/lib/rfq/document'
import { mailtoUrl, messageFor, waNumber, whatsappUrl } from '@/lib/rfq/share'
import type { Rfq, Workspace } from '@/lib/workspace/types'

const TODAY = '2026-09-18'

function seeded() {
  let ws: Workspace = emptyWorkspace({
    id: 'WS-T', createdAt: TODAY, ownerName: 'R. Mehta', contact: '+91 98220 11234',
    companyName: 'Patel Heaters', makes: 'heating elements',
  })
  ws = {
    ...ws,
    company: {
      ...ws.company,
      address: 'Plot 44, MIDC Bhosari, Pune 411026',
      gstin: '27AABCP1234M1Z5',
      phone: '+91 98220 11234',
      email: 'buying@patelheaters.in',
    },
  }
  const [w1, v1] = issueId(ws, 'VN')
  const [w2, v2] = issueId(w1, 'VN')
  ws = {
    ...w2,
    vendors: [
      buildVendor({ id: v1, name: 'Shah Metals', paymentTermsDays: 30 }),
      buildVendor({ id: v2, name: 'Bombay Metals', paymentTermsDays: 45 }),
    ],
    vendorContact: {
      [v1]: { phone: '98220 11234', email: 'sales@shahmetals.in' },
    },
  }
  const [w3, itemId] = issueId(ws, 'IT')
  ws = {
    ...w3,
    items: [buildItem(w3, {
      id: itemId, name: 'Copper strip 25 mm', code: 'COPP-STRI',
      uom: 'kg', moq: 0, daily: 10, cushionDays: 5,
    })],
  }
  const [w4, rfqId] = issueId(ws, 'RF')
  const rfq: Rfq = {
    id: rfqId, no: 'RFQ-1', itemId, qty: 500, neededBy: '2026-10-15',
    vendorIds: [v1, v2], state: 'draft', raisedOn: TODAY,
    note: 'IS 613 grade ETP, half-hard',
  }
  ws = { ...w4, rfqs: [rfq] }
  return { ws, rfq, v1, v2, itemId }
}

describe('the document', () => {
  it('is one addressed copy per supplier, not one file for everybody', () => {
    /*
     * A single multi-page file shared to the first supplier shows them you also
     * asked the other three, which in this market is a real commercial harm.
     */
    const { ws, rfq } = seeded()
    const docs = docsFor(ws, rfq, TODAY)
    expect(docs).toHaveLength(2)
    expect(docs.map((d) => d.vendor?.name)).toEqual(['Shah Metals', 'Bombay Metals'])
    for (const d of docs) expect(JSON.stringify(d)).not.toContain(
      d.vendor?.name === 'Shah Metals' ? 'Bombay Metals' : 'Shah Metals')
  })

  it('still produces a copy when nobody has been picked yet', () => {
    // a request may name no supplier at all — a draft is a note to yourself
    const { ws, rfq } = seeded()
    const docs = docsFor(ws, { ...rfq, vendorIds: [] }, TODAY)
    expect(docs).toHaveLength(1)
    expect(docs[0].vendor).toBeNull()
  })

  it('carries the letterhead, the ask and the reference back', () => {
    const { ws, rfq, v1 } = seeded()
    const doc = buildDoc(ws, rfq, ws.vendors[0], TODAY)
    expect(doc.company.name).toBe('Patel Heaters')
    expect(doc.company.lines[0]).toContain('MIDC Bhosari')
    expect(doc.company.lines[1]).toContain('GSTIN 27AABCP1234M1Z5')
    expect(doc.item).toBe('Copper strip 25 mm')
    expect(doc.qty).toBe('500 kg')
    expect(doc.neededBy).toBe('15 Oct 2026')
    expect(doc.spec).toContain('IS 613')
    // so a price coming back can be matched to what was asked
    expect(doc.terms.find((t) => t.label === 'Quote against')?.value).toBe('RFQ-1')
    expect(v1).toBeTruthy()
  })

  it('degrades rather than printing undefined when the letterhead is bare', () => {
    // every workspace that existed before these fields did has none of them
    const { ws, rfq } = seeded()
    const bare = { ...ws, company: { name: 'Patel Heaters', makes: '' } }
    const doc = buildDoc(bare, rfq, ws.vendors[0], TODAY)
    expect(doc.company.lines).toEqual([])
    expect(JSON.stringify(doc)).not.toContain('undefined')
  })

  it('prints only the custom fields marked for the document', () => {
    let { ws, rfq } = seeded()
    const drawing = addField(ws, { entity: 'rfq', label: 'Drawing no', kind: 'text', onDoc: true })
    ws = drawing.ws
    const internal = addField(ws, { entity: 'rfq', label: 'Buyer note', kind: 'text' })
    ws = internal.ws
    ws = setValue(ws, rfq.id, drawing.id, 'DRG-4471')
    ws = setValue(ws, rfq.id, internal.id, 'chase on Friday')

    const doc = buildDoc(ws, rfq, ws.vendors[0], TODAY)
    expect(doc.extras).toEqual([{ label: 'Drawing no', value: 'DRG-4471' }])
  })

  it('asks for a price by a date that is never after the date it is needed', () => {
    const { rfq } = seeded()
    expect(quoteByDate(rfq, TODAY)).toBe('2026-09-25')
    // a request needed in three days cannot ask for quotes in seven
    expect(quoteByDate({ ...rfq, neededBy: '2026-09-21' }, TODAY)).toBe('2026-09-21')
  })
})

describe('what a built-in font can draw', () => {
  it('substitutes the characters that have an accepted equivalent', () => {
    expect(forPrint('₹1,200')).toBe('Rs.1,200')
    expect(forPrint('Shah’s Metals')).toBe("Shah's Metals")
    expect(forPrint('Rate — 800')).toBe('Rate - 800')
    expect(forPrint('50 × 2')).toBe('50 x 2')
  })

  it('does not refuse a document over a curly quote or an em dash', () => {
    /*
     * The trap: jsPDF's fonts are cp1252, not Latin-1, so a naive
     * `charCode > 255` test rejects the exact characters people paste out of
     * Word — and would push almost every real document to the print fallback.
     */
    expect(undrawable('Shah’s Metals — "quoted" …')).toEqual([])
    expect(undrawable('₹1,200 per kg')).toEqual([])
  })

  it('names what genuinely cannot be drawn', () => {
    expect(undrawable('पटेल हीटर्स')).not.toHaveLength(0)
  })

  it('reports the field a problem came from, not just the character', () => {
    const { ws, rfq } = seeded()
    const hindi = { ...ws, company: { ...ws.company, name: 'पटेल हीटर्स' } }
    const doc = buildDoc(hindi, rfq, ws.vendors[0], TODAY)
    expect(doc.problems.map((p) => p.where)).toContain('your company name')
  })

  it('finds no problem in an ordinary document', () => {
    const { ws, rfq } = seeded()
    expect(buildDoc(ws, rfq, ws.vendors[0], TODAY).problems).toEqual([])
  })
})

describe('handing it over', () => {
  it('puts a country code on a bare Indian mobile', () => {
    expect(waNumber('98220 11234')).toBe('919822011234')
    expect(waNumber('+91 98220 11234')).toBe('919822011234')
    expect(waNumber('098220 11234')).toBe('919822011234')
    expect(waNumber('0091 98220 11234')).toBe('919822011234')
  })

  it('refuses a number it would guess at rather than opening the wrong chat', () => {
    expect(waNumber('12345')).toBeNull()
    expect(waNumber('')).toBeNull()
    expect(waNumber(undefined)).toBeNull()
  })

  it('writes a message that stands on its own without the attachment', () => {
    // on a phone the realistic outcome is that the text is sent and the PDF is
    // not, so a supplier has to be able to quote from the words alone
    const { ws, rfq } = seeded()
    const msg = messageFor(buildDoc(ws, rfq, ws.vendors[0], TODAY))
    expect(msg).toContain('RFQ-1')
    expect(msg).toContain('Copper strip 25 mm')
    expect(msg).toContain('500 kg')
    expect(msg).toContain('15 Oct 2026')
    expect(msg).toContain('R. Mehta')
  })

  it('encodes the message into the links rather than breaking them', () => {
    const { ws, rfq } = seeded()
    const doc = buildDoc(ws, rfq, ws.vendors[0], TODAY)

    const wa = whatsappUrl(doc, ws.vendorContact[ws.vendors[0].id].phone)!
    expect(wa.startsWith('https://wa.me/919822011234?text=')).toBe(true)
    expect(wa).not.toMatch(/[\n ]/)
    expect(decodeURIComponent(wa.split('text=')[1])).toContain('Copper strip 25 mm')

    const mail = mailtoUrl(doc, ws.vendorContact[ws.vendors[0].id].email)
    expect(mail).toContain('sales%40shahmetals.in')
    expect(decodeURIComponent(mail.split('subject=')[1].split('&')[0])).toBe(
      'Request for quotation RFQ-1 — Copper strip 25 mm')
  })

  it('has no WhatsApp link for a supplier with no number', () => {
    const { ws, rfq } = seeded()
    const doc = buildDoc(ws, rfq, ws.vendors[1], TODAY)
    expect(whatsappUrl(doc, ws.vendorContact[ws.vendors[1].id]?.phone)).toBeNull()
  })

  it('keeps a mail body short enough that clients do not truncate it', () => {
    let { ws, rfq } = seeded()
    const long = addField(ws, { entity: 'rfq', label: 'Spec', kind: 'text', onDoc: true })
    ws = setValue(long.ws, rfq.id, long.id, 'x'.repeat(5000))
    const mail = mailtoUrl(buildDoc(ws, rfq, ws.vendors[0], TODAY), 'a@b.c')
    expect(decodeURIComponent(mail.split('body=')[1]).length).toBeLessThanOrEqual(1500)
  })
})
