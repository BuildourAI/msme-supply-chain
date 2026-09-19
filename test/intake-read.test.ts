/**
 * Reading a document, and working out what it is about.
 *
 * Three pure functions between a file and the owner's item master: what counts
 * as a priced line, how sure the system is that a line is a particular
 * material, and what a supplier's wording was decided to mean last time.
 *
 * The sample company's own fixture is used as the source of hard cases, because
 * it was written to be realistic about what arrives from suppliers and it has
 * already survived twelve tests of its own.
 */
import { describe, expect, it } from 'vitest'
import { overflowed, rowsToLines } from '@/lib/intake/lines'
import {
  AUTO, FLOOR, SUGGEST, bestMatch, classify, idfOf, preselect, scoreItem,
  type MatchItem,
} from '@/lib/intake/match'
import { aliasKey, forgetAlias, learnAlias, resolveAlias } from '@/lib/intake/alias'
import { emptyWorkspace } from '@/lib/workspace/defaults'
import type { Workspace } from '@/lib/workspace/types'
import type { VendorAlias } from '@/lib/intake/types'

/* =============================================================== the lines == */

describe('a quotation with a full set of columns', () => {
  const rows = [
    ['Description', 'Qty', 'Unit', 'Rate', 'Amount'],
    ['C.R.C.A. SHEET 1.2MM 1250 WIDE (PRIME)', '12', 'MT', '62,800.00', '7,53,600.00'],
    ['INCOLOY-800 SHEATH TUBE 8.5MM OD', '1,000', 'm', '212.00', '2,12,000.00'],
    ['Total', '', '', '', '12,31,500.00'],
  ]

  it('takes the rate and not the line total', () => {
    /*
     * The one that would be wrong most expensively. Position cannot decide it —
     * plenty of quotations lead with a serial number or put HSN in the middle —
     * so it is decided by arithmetic: the last three multiply out, therefore
     * the last one is an amount.
     */
    const lines = rowsToLines(rows)
    expect(lines).toHaveLength(2)
    expect(lines[0]).toEqual({
      raw: 'C.R.C.A. SHEET 1.2MM 1250 WIDE (PRIME)', qty: 12, uom: 'MT', rate: 62800,
    })
  })

  it('leaves the heading and the total out', () => {
    expect(rowsToLines(rows).map((l) => l.raw)).not.toContain('Total')
    expect(rowsToLines(rows).map((l) => l.raw)).not.toContain('Description')
  })
})

describe('a price list with two columns and nothing else', () => {
  it('reads the only number as the rate', () => {
    const lines = rowsToLines([['BRASS CABLE GLAND 20MM', '46.00']])
    expect(lines).toEqual([{ raw: 'BRASS CABLE GLAND 20MM', qty: undefined, rate: 46, uom: undefined }])
  })

  it('and with a quantity, reads the last as the rate', () => {
    // two numbers that do not multiply out into a third: qty then rate
    const lines = rowsToLines([['ROCKWOOL SLAB 50MM', '250', '164.00']])
    expect(lines[0]).toMatchObject({ qty: 250, rate: 164 })
  })
})

describe('what a row has to have before it counts as a line', () => {
  it('ignores a letterhead, which has words and no price', () => {
    expect(rowsToLines([['SHAH METALS & ALLOYS'], ['Plot 44, GIDC Phase II']])).toEqual([])
  })

  it('ignores the tax and freight rows under a total', () => {
    const rows = [['CGST 9%', '55,417.50'], ['Freight', '4,200.00'], ['Round off', '0.50']]
    expect(rowsToLines(rows)).toEqual([])
  })

  it('ignores a row that is only a number', () => {
    expect(rowsToLines([['', '12,31,500.00']])).toEqual([])
  })

  it('reads a rupee sign and Indian grouping the way the rest of the build does', () => {
    expect(rowsToLines([['MAGNESIUM OXIDE ELECT GRADE', '₹1,48,500']])[0].rate).toBe(148500)
  })

  it('does not mistake a thickness in the wording for a figure', () => {
    // "1.2MM" is not a number, so it can never be taken for a rate
    const l = rowsToLines([['CRCA SHEET 1.2MM 1250 WIDE', '62800']])[0]
    expect(l.rate).toBe(62800)
    expect(l.qty).toBeUndefined()
  })

  it('finds the wording even when a serial number comes first', () => {
    const l = rowsToLines([['1', 'HSN 7209', 'INCOLOY-800 SHEATH TUBE 8.5MM OD', '1000', 'm', '212', '212000']])
    expect(l[0].raw).toBe('INCOLOY-800 SHEATH TUBE 8.5MM OD')
    expect(l[0].rate).toBe(212)
  })
})

describe('a document longer than anybody will read', () => {
  const many = Array.from({ length: 420 }, (_, n) => [`MATERIAL NUMBER ${n} GRADE A`, '100'])

  it('stops at the cap', () => {
    expect(rowsToLines(many)).toHaveLength(300)
  })

  it('and says so, rather than truncating quietly', () => {
    expect(overflowed(many)).toBe(true)
    expect(overflowed([['BRASS CABLE GLAND 20MM', '46']])).toBe(false)
  })
})

/* ============================================================== the matcher == */

const ITEMS: MatchItem[] = [
  { id: 'IT-001', code: 'RM-CRC-120', name: 'CRCA sheet 1.2 mm 1250 wide', uom: 'MT' },
  { id: 'IT-002', code: 'RM-CRC-160', name: 'CRCA sheet 1.6 mm 1250 wide', uom: 'MT' },
  { id: 'IT-003', code: 'EL-TUB-INC85', name: 'Incoloy 800 sheath tube 8.5 mm', uom: 'm' },
  { id: 'IT-004', code: 'CM-TRB-2W', name: 'Terminal block ceramic 2 way 30A', uom: 'nos' },
  { id: 'IT-005', code: 'RM-MGO-EG', name: 'Magnesium oxide electrical grade', uom: 'kg' },
  { id: 'IT-006', code: 'HW-GLD-M20', name: 'Brass cable gland 20 mm', uom: 'nos' },
]
const IDF = idfOf(ITEMS)
const score = (raw: string, id: string, uom?: string) =>
  scoreItem(raw, uom, ITEMS.find((i) => i.id === id)!, IDF)

describe('the three thresholds', () => {
  it('are where the sample company already drew them', () => {
    /*
     * Not round numbers chosen for looking sensible. `lib/seed/intake.ts` puts
     * 0.86 in the review queue and 0.88 upwards through the auto-filed ones, so
     * 0.87 is the line its own fixture draws. A change here should break this
     * test, not a factory.
     */
    expect(AUTO).toBe(0.87)
    expect(SUGGEST).toBe(0.8)
    expect(FLOOR).toBe(0.7)
  })

  it('sort every possible score into exactly one answer', () => {
    expect(classify(1)).toBe('matched')
    expect(classify(0.87)).toBe('matched')
    expect(classify(0.86)).toBe('review')
    expect(classify(0.7)).toBe('review')
    expect(classify(0.69)).toBe('unmapped')
    expect(classify(0)).toBe('unmapped')
  })

  it('offer a pre-chosen suggestion only above the middle one', () => {
    // below it the suggestion is named but not selected: a pre-filled box under
    // the floor is an invitation to accept a guess with one click
    expect(preselect(0.8)).toBe(true)
    expect(preselect(0.79)).toBe(false)
  })
})

describe('what the supplier wrote, against what the factory calls it', () => {
  it('settles it when they quote the factory\'s own code', () => {
    expect(score('2 WAY CERAMIC TERMINAL CM-TRB-2W', 'IT-004')).toBeGreaterThanOrEqual(AUTO)
  })

  it('never reaches 1, because that belongs to a person', () => {
    expect(score('CM-TRB-2W', 'IT-004')).toBeLessThan(1)
    expect(score('CRCA sheet 1.2 mm 1250 wide', 'IT-001')).toBeLessThan(1)
  })

  it('files a wording that is plainly the same material', () => {
    expect(classify(score('INCOLOY-800 SHEATH TUBE 8.5MM', 'IT-003'))).toBe('matched')
  })

  it('sends a plausible-but-not-certain wording to a person', () => {
    // the sample's own review-queue line, and it belongs in review here too
    expect(classify(score('TERMINAL BLK CERAMIC 2WAY 30A', 'IT-004', 'nos'))).toBe('review')
  })

  it('does not care about punctuation or case', () => {
    expect(score('C.R.C.A. SHEET 1.2MM 1250 WIDE', 'IT-001'))
      .toBe(score('crca sheet 1.2 mm 1250 wide', 'IT-001'))
  })
})

describe('the measurements get a veto', () => {
  it('refuses a 1.6 mm sheet against the 1.2 mm material', () => {
    /*
     * The single most expensive confusion in this domain. The two wordings
     * share every word and nearly every trigram, so no amount of text
     * similarity can separate them — only the figure can. A contradicted
     * figure caps the score under the floor, where nothing is suggested at all.
     */
    const wrong = score('C.R.C.A. SHT 1.6MM 1250W (PRIME)', 'IT-001', 'MT')
    expect(wrong).toBeLessThan(FLOOR)
    expect(classify(wrong)).toBe('unmapped')
  })

  it('and picks the 1.6 mm material for it instead', () => {
    const best = bestMatch('C.R.C.A. SHT 1.6MM 1250W (PRIME)', 'MT', ITEMS, IDF)
    expect(best?.itemId).toBe('IT-002')
  })

  it('rewards a wording that carries every figure', () => {
    expect(score('SHEATH TUBE INCOLOY 800 8.5 MM', 'IT-003'))
      .toBeGreaterThan(score('SHEATH TUBE INCOLOY 800', 'IT-003'))
  })
})

describe('the unit gets a veto too', () => {
  it('refuses a line quoted by the tonne against something bought by the piece', () => {
    const wrong = score('BRASS CABLE GLAND 20MM', 'IT-006', 'MT')
    expect(wrong).toBeLessThan(FLOOR)
  })

  it('and helps when it agrees', () => {
    expect(score('BRASS CABLE GLAND 20MM', 'IT-006', 'nos'))
      .toBeGreaterThan(score('BRASS CABLE GLAND 20MM', 'IT-006', 'MT'))
  })
})

describe('a word that everybody uses is worth almost nothing', () => {
  it('will not carry a match on its own', () => {
    /*
     * "Sheet" appears in two of six materials here and would appear in twenty
     * of fifty in a real item master. A line that shares only that has told you
     * nothing, and must not clear the floor.
     */
    expect(bestMatch('MS SHEET SCRAP LOOSE', undefined, ITEMS, IDF)).toBeNull()
  })

  it('while a rare one at least points at the right material', () => {
    /*
     * Two wordings of the same shape, each sharing exactly one word with an
     * item. The only difference is how many of this factory's materials use
     * that word — "incoloy" one, "sheet" two of six and twenty of fifty in a
     * real master.
     *
     * What rarity buys is the ranking, not the confidence. Neither wording
     * clears the floor, and neither should: "INCOLOY GRADE STOCK" is not enough
     * to file anything against. But the rare word puts the right material at
     * the top of the list a person is shown, and the common one leaves the
     * ordering meaningless.
     */
    const rank = (raw: string) => [...ITEMS]
      .map((i) => ({ id: i.id, s: scoreItem(raw, undefined, i, IDF) }))
      .sort((a, b) => b.s - a.s)

    expect(rank('INCOLOY GRADE STOCK')[0].id).toBe('IT-003')
    expect(bestMatch('INCOLOY GRADE STOCK', undefined, ITEMS, IDF)).toBeNull()

    // nothing to choose between the two sheets on a shared common word
    const sheets = rank('SHEET GRADE STOCK')
    expect(sheets[0].s).toBeLessThan(FLOOR)
  })
})

describe('picking the best of them', () => {
  it('returns nothing at all when nothing clears the floor', () => {
    expect(bestMatch('HDPE GRANULES NATURAL 55KG BAG', undefined, ITEMS, IDF)).toBeNull()
    expect(bestMatch('anything', undefined, [], idfOf([]))).toBeNull()
  })

  it('gives the same answer twice', () => {
    const a = bestMatch('MAGNESIUM OXIDE ELECT GRADE', 'kg', ITEMS, IDF)
    const b = bestMatch('MAGNESIUM OXIDE ELECT GRADE', 'kg', ITEMS, IDF)
    expect(a).toEqual(b)
    expect(a?.itemId).toBe('IT-005')
  })
})

/* ============================================================== the aliases == */

const base = (): Workspace => emptyWorkspace({
  id: 'WS-1', createdAt: '2026-09-19', ownerName: 'R. Mehta', contact: '',
  companyName: 'Patel Heaters', makes: 'heaters',
})

const alias = (over: Partial<VendorAlias> = {}): VendorAlias => ({
  vendorId: 'VN-001', raw: 'TERMINAL BLK CERAMIC 2WAY 30A', itemId: 'IT-004',
  confirmedBy: 'R. Mehta', confirmedAt: '2026-09-19', ...over,
})

describe('a wording somebody has already decided', () => {
  it('folds spacing and punctuation, because a second copy of a quotation differs in those', () => {
    expect(aliasKey('C.R.C.A. SHEET 1.2MM')).toBe(aliasKey('crca sheet 1.2mm'))
    expect(aliasKey('TERMINAL BLK  CERAMIC')).toBe(aliasKey('terminal-blk_ceramic'))
  })

  it('resolves for the supplier who said it', () => {
    const ws = learnAlias(base(), alias())
    expect(resolveAlias(ws.aliases, 'VN-001', 'terminal blk ceramic 2way 30a')).toBe('IT-004')
  })

  it('and for nobody else', () => {
    /*
     * The same words from a different supplier are a different claim. A table
     * that resolved both would be worse than no table, because it would be
     * confidently wrong rather than merely silent.
     */
    const ws = learnAlias(base(), alias())
    expect(resolveAlias(ws.aliases, 'VN-002', 'TERMINAL BLK CERAMIC 2WAY 30A')).toBeNull()
    expect(resolveAlias(ws.aliases, undefined, 'TERMINAL BLK CERAMIC 2WAY 30A')).toBeNull()
  })

  it('replaces rather than stacks when it is taught again', () => {
    const ws = learnAlias(learnAlias(base(), alias()), alias({ itemId: 'IT-005' }))
    expect(ws.aliases).toHaveLength(1)
    expect(resolveAlias(ws.aliases, 'VN-001', 'TERMINAL BLK CERAMIC 2WAY 30A')).toBe('IT-005')
  })

  it('can be forgotten, so the line comes back for review', () => {
    // the sample company's table cannot do this; copying that would turn its own
    // warning about permanent silent mistakes into a trap
    const ws = forgetAlias(learnAlias(base(), alias()), 'VN-001', 'terminal blk ceramic 2way 30a')
    expect(ws.aliases).toEqual([])
  })

  it('and forgetting one leaves every other supplier alone', () => {
    let ws = learnAlias(base(), alias())
    ws = learnAlias(ws, alias({ vendorId: 'VN-002' }))
    ws = forgetAlias(ws, 'VN-001', 'TERMINAL BLK CERAMIC 2WAY 30A')
    expect(ws.aliases).toHaveLength(1)
    expect(ws.aliases[0].vendorId).toBe('VN-002')
  })
})
