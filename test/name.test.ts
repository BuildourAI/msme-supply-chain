/**
 * The supplier's wording, as a name for one of your materials.
 *
 * The item master is what YOU call a material. Ticking "add this as a new
 * material" used to copy the supplier's string into it verbatim, so a
 * quotation shouting `C.R.C.A. SHEET 1.2MM 1250 WIDE (PRIME)` produced a
 * material called exactly that — unreadable, and the wrong vocabulary: the
 * alias table exists so that their wording maps to your name, and a material
 * named in their wording gives the next supplier's wording nothing to attach
 * to.
 */
import { describe, expect, it } from 'vitest'
import { tidyName } from '@/lib/intake/name'

describe('a name proposed from a supplier\'s line', () => {
  it('stops it shouting', () => {
    expect(tidyName('MAGNESIUM OXIDE ELECT GRADE')).toBe('Magnesium oxide elect grade')
    expect(tidyName('BRASS CABLE GLAND 20MM')).toBe('Brass cable gland 20 mm')
  })

  it('and keeps the abbreviations this trade actually writes', () => {
    /*
     * The case a rule cannot settle. CRCA and SLAB are both four letters with
     * one vowel; only knowing the trade tells them apart, so the trade is
     * written down rather than guessed at.
     */
    expect(tidyName('C.R.C.A. SHEET 1.2MM 1250 WIDE (PRIME)'))
      .toBe('CRCA sheet 1.2 mm 1250 wide (prime)')
    expect(tidyName('ROCKWOOL SLAB 50MM 100KG/M3')).toBe('Rockwool slab 50 mm 100 kg/m3')
    expect(tidyName('MS ANGLE 40X40X5')).toBe('MS angle 40x40x5')
  })

  it('keeps a short one whether the trade lists it or not', () => {
    // two letters read as themselves at any size; and no vowels at all is
    // enough on its own, which catches the ones nobody thought to list
    expect(tidyName('INCOLOY-800 SHEATH TUBE 8.5MM OD')).toBe('Incoloy-800 sheath tube 8.5 mm OD')
    expect(tidyName('TERMINAL BLK CERAMIC 2WAY 30A')).toBe('Terminal BLK ceramic 2way 30A')
  })

  it('separates a figure from the unit it ran into', () => {
    expect(tidyName('SHEET 1.2MM')).toBe('Sheet 1.2 mm')
    expect(tidyName('WIRE 500MTR')).toBe('Wire 500 mtr')
    // and leaves a figure that ran into something else alone
    expect(tidyName('GRADE 304L')).toBe('Grade 304L')
  })

  it('leaves alone a supplier who cased it themselves', () => {
    /*
     * Second-guessing somebody who already wrote "CRCA Sheet" would be the
     * same mistake in the other direction. Only the unit is brought into line.
     */
    expect(tidyName('CRCA Sheet 1.2mm 1250 wide')).toBe('CRCA Sheet 1.2 mm 1250 wide')
    expect(tidyName('Copper strip 25 mm')).toBe('Copper strip 25 mm')
  })

  it('and copes with nothing at all', () => {
    expect(tidyName('')).toBe('')
    expect(tidyName('   ')).toBe('')
    expect(tidyName('12.5')).toBe('12.5')
  })
})
