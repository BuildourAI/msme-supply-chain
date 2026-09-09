/**
 * SRC-02 · the documents behind the review queue.
 *
 * The intake page now opens each document and shows every line on it. That only
 * means anything if the lines agree with the rest of the build — a quotation
 * that says one rate and a landed-cost comparison that says another would be
 * two demos wearing one skin. These are the joins that have to hold.
 */
import { describe, expect, it } from 'vitest'
import {
  docMeta, documentLines, reviewQueue, seededAliases, supplierDocuments,
} from '@/lib/seed/intake'
import { vendorItems, vendors } from '@/lib/seed/sourcing'

const linesOf = (id: string) => documentLines[id] ?? []
const rateFor = (vendorName: string, itemId: string) => {
  const v = vendors.find((x) => x.name === vendorName)
  return v ? vendorItems.find((x) => x.vendorId === v.id && x.itemId === itemId)?.rate : undefined
}

describe('every document in the list can actually be opened', () => {
  it('has lines, and exactly as many as the list claims', () => {
    for (const d of supplierDocuments) {
      expect(linesOf(d.id).length, `${d.id} line count`).toBe(d.lineCount)
    }
  })

  it('has a reference number and terms to render', () => {
    for (const d of supplierDocuments) {
      expect(docMeta[d.id], `${d.id} meta`).toBeTruthy()
      expect(docMeta[d.id].docNo.length).toBeGreaterThan(3)
      expect(docMeta[d.id].terms.length).toBeGreaterThan(3)
    }
  })

  it('says what the picture is of, on every WhatsApp photograph', () => {
    // an email attachment renders as itself; a photograph of paper needs the
    // caption, because the screen is drawing a facsimile rather than a scan
    for (const d of supplierDocuments.filter((x) => x.channel === 'whatsapp')) {
      expect(docMeta[d.id].photoNote, `${d.id} photo note`).toBeTruthy()
    }
  })

  it('gives every line a unique id scoped to its document', () => {
    const all = Object.entries(documentLines).flatMap(([id, ls]) => ls.map((l) => ({ id, l })))
    expect(new Set(all.map((x) => x.l.id)).size).toBe(all.length)
    for (const { id, l } of all) expect(l.id.startsWith(`${id}/`), l.id).toBe(true)
  })

  it('adds up to the 55 lines the page header quotes', () => {
    expect(Object.values(documentLines).flat().length).toBe(55)
    expect(supplierDocuments.reduce((a, d) => a + d.lineCount, 0)).toBe(55)
  })
})

describe('a document and the rest of the build tell one story', () => {
  it('quotes the same rate the landed-cost comparison uses', () => {
    for (const d of supplierDocuments) {
      for (const l of linesOf(d.id)) {
        if (!l.itemId) continue
        const master = rateFor(d.vendorName, l.itemId)
        if (master === undefined) continue // vendor quotes it but is not in the master for it
        expect(l.rate, `${l.id} · ${d.vendorName} ${l.itemId}`).toBe(master)
      }
    }
  })

  it('marks a document pending exactly when a line on it needs a person', () => {
    for (const d of supplierDocuments) {
      const needsPerson = linesOf(d.id).some((l) => l.via === 'review')
      expect(needsPerson, `${d.id} status`).toBe(d.status === 'pending')
    }
  })

  it('backs every review-queue entry with a real line on a real document', () => {
    for (const q of reviewQueue) {
      const doc = supplierDocuments.find((d) => d.id === q.documentId)
      expect(doc, `${q.id} document`).toBeTruthy()
      expect(doc!.vendorName).toBe(q.vendorName)
      const l = linesOf(q.documentId).find((x) => x.rawText === q.rawItemText)
      expect(l, `${q.id} line`).toBeTruthy()
      expect(l!.rate).toBe(q.rate)
      expect(l!.uom).toBe(q.uom)
      expect(l!.confidence).toBe(q.confidence)
      expect(l!.itemId).toBe(q.suggestedItemId)
      expect(l!.via).toBe('review')
    }
  })

  it('never sends a line to a person that an alias already answers', () => {
    // the whole promise of the alias table: a vendor's confirmed wording is
    // never asked about twice
    for (const [id, ls] of Object.entries(documentLines)) {
      const vendorName = supplierDocuments.find((d) => d.id === id)!.vendorName
      for (const l of ls.filter((x) => x.via === 'review')) {
        const known = seededAliases.some((a) => a.vendorName === vendorName && a.rawText === l.rawText)
        expect(known, `${l.id} is already aliased but still in the queue`).toBe(false)
      }
    }
  })

  it('keeps the confidence floor honest in both directions', () => {
    for (const l of Object.values(documentLines).flat()) {
      if (l.via === 'review') expect(l.confidence!, l.id).toBeLessThan(0.87)
      if (l.via === 'matched') expect(l.confidence!, l.id).toBeGreaterThanOrEqual(0.8)
      // an alias is not a guess — it is a decision somebody already made
      if (l.via === 'alias') expect(l.confidence, l.id).toBe(1)
      if (l.via === 'unmapped') expect(l.itemId, l.id).toBeUndefined()
      if (l.via !== 'unmapped') expect(l.itemId, l.id).toBeTruthy()
    }
  })

  it('resolves an aliased line only where the alias actually exists', () => {
    for (const [id, ls] of Object.entries(documentLines)) {
      const vendorName = supplierDocuments.find((d) => d.id === id)!.vendorName
      for (const l of ls.filter((x) => x.via === 'alias')) {
        const a = seededAliases.find((x) => x.vendorName === vendorName && x.rawText === l.rawText)
        expect(a, `${l.id} claims an alias that is not in the table`).toBeTruthy()
        expect(l.itemId).toBe(a!.itemId)
      }
    }
  })

  it('does not pretend a price list is mostly things this factory buys', () => {
    // 15 of 55 lines map. If that ratio ever inverts, the demo has started
    // flattering itself — a real price list is mostly other people's materials.
    const all = Object.values(documentLines).flat()
    const mapped = all.filter((l) => l.itemId).length
    expect(mapped).toBeLessThan(all.length / 2)
    const priceLists = supplierDocuments.filter((d) => d.kind === 'price_list')
    for (const d of priceLists) {
      const m = linesOf(d.id).filter((l) => l.itemId).length
      expect(m, `${d.id} mapped`).toBeLessThanOrEqual(2)
    }
  })
})
