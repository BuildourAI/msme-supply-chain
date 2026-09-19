/**
 * Approving a document, and taking it back.
 *
 * Approval is the only thing in this feature that writes, so it is the only
 * thing that can destroy something. The undo half of this file matters more
 * than the apply half: an approval that writes the wrong rate is a bad
 * afternoon, and an undo that eats work done afterwards is unrecoverable.
 */
import { describe, expect, it } from 'vitest'
import { applyApproval, planApproval, stillUndoable, type Approval } from '@/lib/intake/apply'
import { resolveAlias } from '@/lib/intake/alias'
import { undoImport } from '@/lib/sheet/import'
import { emptyWorkspace } from '@/lib/workspace/defaults'
import type { Workspace } from '@/lib/workspace/types'
import type { DocLine, SupplierDoc } from '@/lib/intake/types'
import type { Item, VendorItem } from '@/lib/domain/types'

const TODAY = '2026-09-19'

const base = (): Workspace => emptyWorkspace({
  id: 'WS-1', createdAt: TODAY, ownerName: 'R. Mehta', contact: '98200 11223',
  companyName: 'Patel Heaters', makes: 'industrial heaters',
})

const material = (over: Partial<Item> = {}): Item => ({
  id: 'IT-001', code: 'RM-CRC-120', name: 'CRCA sheet 1.2 mm', uom: 'MT', itemClass: 'B',
  coverageCeilingMonths: 3, moq: 1, safetyStock: 5, avgDailyConsumption: 1,
  floorConsumptionPerDay: 1, lastPurchaseRate: 0, feeds: [], ...over,
})

const line = (over: Partial<DocLine> = {}): DocLine => ({
  id: 'SD-001/1', raw: 'C.R.C.A. SHEET 1.2MM 1250 WIDE', rate: 62800, qty: 12, uom: 'MT',
  itemId: 'IT-001', confidence: 0.91, via: 'matched', ...over,
})

const doc = (over: Partial<SupplierDoc> = {}): SupplierDoc => ({
  id: 'SD-001', vendorName: 'Shah Metals & Alloys',
  fileName: 'SMA-Q-1184.pdf', mime: 'application/pdf', bytes: 7245,
  channel: 'email', read: 'pdf-text', receivedAt: '2026-09-12', addedAt: TODAY,
  lines: [line()], status: 'draft', ...over,
})

const approval = (over: Partial<Approval> = {}): Approval => ({
  doc: doc(),
  vendorName: 'Shah Metals & Alloys',
  actor: 'R. Mehta',
  today: TODAY,
  lines: [{ raw: 'C.R.C.A. SHEET 1.2MM 1250 WIDE', itemId: 'IT-001', rate: 62800, learn: true }],
  ...over,
})

/*
 * One material, and the id counter where a real workspace would have it. The
 * counter only ever moves forward and `migrate` seeds it from the data on the
 * way in, so a workspace holding IT-001 with a counter of zero cannot occur —
 * writing the fixture that way once made an approval issue IT-001 a second time
 * and quietly replace the material that was already there.
 */
const withMaterial = (): Workspace => ({ ...base(), items: [material()], nextIds: { IT: 1 } })

/* ================================================================ approving == */

describe('a document from a supplier nobody has entered yet', () => {
  it('puts them in the suppliers table', () => {
    const { ws } = applyApproval(withMaterial(), approval())
    expect(ws.vendors).toHaveLength(1)
    expect(ws.vendors[0].name).toBe('Shah Metals & Alloys')
    expect(ws.vendors[0].id).toBe('VN-001')
  })

  it('gives them terms rather than leaving it at nothing', () => {
    // zero reads as cash on delivery to every screen that uses it, which is a
    // worse lie about a supplier nobody has asked than a conservative default
    const { ws } = applyApproval(withMaterial(), approval())
    expect(ws.vendors[0].paymentTermsDays).toBe(30)
  })

  it('and prices what they quoted', () => {
    const { ws } = applyApproval(withMaterial(), approval())
    expect(ws.vendorItems).toHaveLength(1)
    expect(ws.vendorItems[0]).toMatchObject({ vendorId: 'VN-001', itemId: 'IT-001', rate: 62800 })
  })

  it('fills the valuation basis for a material nobody had bought', () => {
    // §13-1 values stock at last purchase price; leaving it at zero values the
    // material, and every screen that sums stock, at nothing
    const { ws } = applyApproval(withMaterial(), approval())
    expect(ws.items[0].lastPurchaseRate).toBe(62800)
  })
})

describe('a document from somebody already on the list', () => {
  const known = (): Workspace => ({
    ...withMaterial(),
    vendors: [{ id: 'VN-009', name: 'shah metals & alloys', paymentTermsDays: 45 }],
    nextIds: { VN: 9 },
  })

  it('does not enter them twice, whatever the casing', () => {
    const { ws } = applyApproval(known(), approval())
    expect(ws.vendors).toHaveLength(1)
    expect(ws.vendors[0].id).toBe('VN-009')
    expect(ws.vendors[0].paymentTermsDays).toBe(45)
  })

  it('keeps what has been measured about them, and moves only what was quoted', () => {
    /*
     * A trailing lead time and a rejection rate are things this build has
     * watched happen. A quotation is a claim. Overwriting the first with the
     * second would throw away the only figures on the record that were earned.
     */
    const previous: VendorItem = {
      vendorId: 'VN-009', itemId: 'IT-001', rate: 60900, quotedLeadTimeDays: 21,
      trailingLeadTimeDays: 27, freightPerUnit: 1800, nonCreditableGst: 0,
      paymentTermCost: 0, rejectionAllowance: 0, trailingRejectionRate: 0.04,
      onTimePct: 82, score: 0, quoteValidUntil: '',
    }
    const { ws } = applyApproval({ ...known(), vendorItems: [previous] }, approval())

    expect(ws.vendorItems[0].rate).toBe(62800)
    expect(ws.vendorItems[0].trailingLeadTimeDays).toBe(27)
    expect(ws.vendorItems[0].trailingRejectionRate).toBe(0.04)
    expect(ws.vendorItems[0].freightPerUnit).toBe(1800)
  })
})

describe('a line naming something this factory does not have', () => {
  const unknown = (): Approval => approval({
    doc: doc({ lines: [line({ itemId: undefined, via: 'unmapped', confidence: 0.2 })] }),
    lines: [{ raw: 'C.R.C.A. SHEET 1.2MM 1250 WIDE', itemId: '', rate: 62800 }],
  })

  it('is left out unless the owner asked for it', () => {
    const { ws } = applyApproval(base(), unknown())
    expect(ws.items).toEqual([])
    expect(ws.vendorItems).toEqual([])
    expect(planApproval(base(), unknown()).skipped[0].reason).toMatch(/no material/i)
  })

  it('becomes a material when they did', () => {
    const a = unknown()
    a.lines[0] = { ...a.lines[0], creates: true, newName: 'CRCA sheet 1.2 mm', newUom: 'MT' }
    const { ws } = applyApproval(base(), a)

    expect(ws.items).toHaveLength(1)
    expect(ws.items[0].name).toBe('CRCA sheet 1.2 mm')
    expect(ws.items[0].lastPurchaseRate).toBe(62800)
  })

  it('and arrives with nothing invented about how fast it is used', () => {
    /*
     * A reorder point computed from a supplier's quotation is a number somebody
     * would act on, and nobody has measured what this factory draws in a day.
     */
    const a = unknown()
    a.lines[0] = { ...a.lines[0], creates: true, newName: 'CRCA sheet 1.2 mm', newUom: 'MT' }
    const { ws } = applyApproval(base(), a)

    expect(ws.items[0].avgDailyConsumption).toBe(0)
    expect(ws.items[0].safetyStock).toBe(0)
  })

  it('never reuses the id of a material already there', () => {
    const a = approval({
      doc: doc({ lines: [line({ itemId: undefined })] }),
      lines: [{
        raw: 'C.R.C.A. SHEET 1.2MM 1250 WIDE', itemId: '', rate: 62800,
        creates: true, newName: 'Rockwool slab 50 mm', newUom: 'm2',
      }],
    })
    const { ws } = applyApproval(withMaterial(), a)
    expect(ws.items.map((i) => i.id)).toEqual(['IT-001', 'IT-002'])
    expect(ws.items[0].name).toBe('CRCA sheet 1.2 mm')
  })

  it('never hands two new materials the same id', () => {
    const a = approval({
      doc: doc({ lines: [line({ id: 'SD-001/1' }), line({ id: 'SD-001/2', raw: 'ROCKWOOL SLAB 50MM' })] }),
      lines: [
        { raw: 'C.R.C.A. SHEET 1.2MM 1250 WIDE', itemId: '', rate: 62800, creates: true, newName: 'CRCA sheet', newUom: 'MT' },
        { raw: 'ROCKWOOL SLAB 50MM', itemId: '', rate: 164, creates: true, newName: 'Rockwool slab 50 mm', newUom: 'm2' },
      ],
    })
    const { ws } = applyApproval(base(), a)
    expect(ws.items.map((i) => i.id)).toEqual(['IT-001', 'IT-002'])
  })
})

describe('a line with no rate on it', () => {
  it('is left out, and said to be', () => {
    const a = approval({
      lines: [{ raw: 'C.R.C.A. SHEET 1.2MM 1250 WIDE', itemId: 'IT-001', rate: 0 }],
    })
    expect(planApproval(withMaterial(), a).skipped[0].reason).toMatch(/no rate/i)
    expect(applyApproval(withMaterial(), a).ws.vendorItems).toEqual([])
  })
})

describe('the preview and the write', () => {
  it('agree, because they are the same function', () => {
    const a = approval()
    const plan = planApproval(withMaterial(), a)
    const { ws } = applyApproval(withMaterial(), a)

    expect(plan.vendor.status).toBe('new')
    expect(plan.ratesSet).toBe(ws.vendorItems.length)
    expect(plan.itemsCreated).toBe(0)
    expect(plan.aliasesLearned).toBe(ws.aliases.length)
  })
})

describe('what the document remembers afterwards', () => {
  it('says it was approved, and which lines were taken', () => {
    const { ws } = applyApproval(withMaterial(), approval())
    expect(ws.docs[0].status).toBe('approved')
    expect(ws.docs[0].vendorId).toBe('VN-001')
    expect(ws.docs[0].lines[0].decision).toBe('accepted')
  })

  it('learns the supplier\'s wording, so it never comes back for review', () => {
    const { ws } = applyApproval(withMaterial(), approval())
    expect(resolveAlias(ws.aliases, 'VN-001', 'crca sheet 1.2mm 1250 wide')).toBe('IT-001')
  })

  it('carries an id of its own, so two approvals in a day cannot collide', () => {
    const one = applyApproval(withMaterial(), approval())
    const two = applyApproval(one.ws, approval({ doc: doc({ id: 'SD-002' }) }))
    expect(one.undo.id).not.toBe(two.undo.id)
  })

  it('knows when it can still be put back, and when it cannot', () => {
    const { ws } = applyApproval(withMaterial(), approval())
    expect(stillUndoable(ws, ws.docs[0])).toBe(true)
    // something else was undone or imported since
    expect(stillUndoable({ ...ws, lastImport: undefined }, ws.docs[0])).toBe(false)
  })
})

/* ================================================================== undoing == */

describe('taking an approval back', () => {
  it('removes a supplier it invented, and their rates with them', () => {
    const start = withMaterial()
    const { ws } = applyApproval(start, approval())
    const back = undoImport(ws)

    expect(back.vendors).toEqual([])
    expect(back.vendorItems).toEqual([])
  })

  it('puts a rate it overwrote back to the figure that was there', () => {
    /*
     * The case `vendorItemsBefore` was declared for and, until documents
     * existed, was produced by nothing and read by nothing — so this could not
     * have passed before.
     */
    const previous: VendorItem = {
      vendorId: 'VN-009', itemId: 'IT-001', rate: 60900, quotedLeadTimeDays: 21,
      trailingLeadTimeDays: 27, freightPerUnit: 1800, nonCreditableGst: 0,
      paymentTermCost: 0, rejectionAllowance: 0, trailingRejectionRate: 0.04,
      onTimePct: 82, score: 0, quoteValidUntil: '',
    }
    const start: Workspace = {
      ...withMaterial(),
      vendors: [{ id: 'VN-009', name: 'Shah Metals & Alloys', paymentTermsDays: 45 }],
      vendorItems: [previous],
      nextIds: { VN: 9 },
    }

    const { ws } = applyApproval(start, approval())
    expect(ws.vendorItems[0].rate).toBe(62800)

    const back = undoImport(ws)
    expect(back.vendorItems).toEqual([previous])
  })

  it('puts the valuation basis back with it', () => {
    const start: Workspace = {
      ...base(),
      items: [material({ lastPurchaseRate: 60900 })],
      vendors: [{ id: 'VN-009', name: 'Shah Metals & Alloys', paymentTermsDays: 45 }],
      vendorItems: [{
        vendorId: 'VN-009', itemId: 'IT-001', rate: 60900, quotedLeadTimeDays: 21,
        trailingLeadTimeDays: 21, freightPerUnit: 0, nonCreditableGst: 0,
        paymentTermCost: 0, rejectionAllowance: 0, trailingRejectionRate: 0,
        onTimePct: 0, score: 0, quoteValidUntil: '',
      }],
      nextIds: { VN: 9 },
    }
    // an item that already had a rate is not back-filled, so nothing to restore
    const { ws } = applyApproval(start, approval())
    expect(undoImport(ws).items[0].lastPurchaseRate).toBe(60900)

    // and one that did not, is put back to zero rather than left on a quote
    const fresh = applyApproval(withMaterial(), approval())
    expect(fresh.ws.items[0].lastPurchaseRate).toBe(62800)
    expect(undoImport(fresh.ws).items[0].lastPurchaseRate).toBe(0)
  })

  it('un-learns the wordings it taught', () => {
    /*
     * An alias is permanent on purpose — but an approval being taken back never
     * happened, and leaving its lessons behind would silently resolve the next
     * document against a decision the owner has just reversed.
     */
    const { ws } = applyApproval(withMaterial(), approval())
    expect(ws.aliases).toHaveLength(1)
    expect(undoImport(ws).aliases).toEqual([])
  })

  it('leaves a wording learned some other time alone', () => {
    const start: Workspace = {
      ...withMaterial(),
      aliases: [{
        vendorId: 'VN-002', raw: 'MGO ELECT GRADE', itemId: 'IT-001',
        confirmedBy: 'R. Mehta', confirmedAt: '2026-08-01',
      }],
    }
    const { ws } = applyApproval(start, approval())
    expect(undoImport(ws).aliases).toEqual(start.aliases)
  })

  it('puts the document back to waiting, rather than leaving it filed', () => {
    const { ws } = applyApproval(withMaterial(), approval())
    const back = undoImport(ws)

    expect(back.docs[0].status).toBe('draft')
    expect(back.docs[0].appliedUndoId).toBeUndefined()
    expect(back.docs[0].lines[0].decision).toBeUndefined()
  })

  it('leaves work done afterwards exactly where it was', () => {
    /*
     * The whole reason undo is a delta rather than a snapshot. Approve on
     * Monday, add a supplier on Tuesday, undo on Wednesday — Tuesday survives.
     */
    const { ws } = applyApproval(withMaterial(), approval())
    const later: Workspace = {
      ...ws,
      vendors: [...ws.vendors, { id: 'VN-050', name: 'Gujarat Sheet Co.', paymentTermsDays: 30 }],
      items: [...ws.items, material({ id: 'IT-099', code: 'MGO', name: 'Magnesium oxide' })],
    }

    const back = undoImport(later)
    expect(back.vendors.map((v) => v.id)).toEqual(['VN-050'])
    expect(back.items.map((i) => i.id)).toEqual(['IT-001', 'IT-099'])
  })

  it('takes a material it created, and leaves one it did not', () => {
    const a = approval({
      doc: doc({ lines: [line({ itemId: undefined })] }),
      lines: [{
        raw: 'C.R.C.A. SHEET 1.2MM 1250 WIDE', itemId: '', rate: 62800,
        creates: true, newName: 'CRCA sheet 1.2 mm', newUom: 'MT',
      }],
    })
    const { ws } = applyApproval(withMaterial(), a)
    expect(ws.items).toHaveLength(2)
    expect(undoImport(ws).items.map((i) => i.id)).toEqual(['IT-001'])
  })
})

describe('the sheet import is untouched by any of this', () => {
  it('still produces none of the new fields', () => {
    // the four branches added to `undoImport` are all guarded, so an import
    // written before documents existed reverses exactly as it always did
    const { ws } = applyApproval(withMaterial(), approval())
    const asImport = { ...ws, lastImport: { ...ws.lastImport!,
      vendorItemsBefore: undefined, itemRatesBefore: undefined,
      aliasesCreated: undefined, docApproved: undefined } }

    expect(() => undoImport(asImport)).not.toThrow()
    expect(undoImport(asImport).vendors).toEqual([])
  })

  it('and an undo with nothing to undo still changes nothing', () => {
    const ws = withMaterial()
    expect(undoImport(ws)).toEqual(ws)
  })
})
