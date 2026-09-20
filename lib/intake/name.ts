/**
 * The supplier's wording, as a name for one of your materials.
 *
 * Ticking "add this as a new material" used to put the supplier's string into
 * the item master exactly as it was printed, so a quotation shouting
 * `C.R.C.A. SHEET 1.2MM 1250 WIDE (PRIME)` produced a material called that,
 * for ever, in every list and on every document you send.
 *
 * Which is wrong twice over. It is unreadable, and it is the wrong vocabulary:
 * the item master is what YOU call a material, and the whole point of the
 * alias table is that a supplier's wording maps to your name. A material named
 * in their wording defeats it — the next supplier's name for the same thing
 * has nothing to attach to and becomes a second material.
 *
 * So a name is proposed rather than copied. It is only ever a proposal: the
 * wizard puts it in an editable box, and the raw string is still what the
 * alias records, so nothing about matching changes.
 */

/** Units that get a space in front of them when a figure runs into them. */
const UNITS = [
  'mm', 'cm', 'mtr', 'mt', 'km', 'kg', 'gm', 'ltr', 'ml',
  'nos', 'pcs', 'sqm', 'sqft', 'm2', 'm3', 'swg', 'ga', 'gsm',
]

const UNIT = new Set(UNITS)

/**
 * Abbreviations this trade actually writes, which stay as they are.
 *
 * A list rather than a rule, because no rule separates them. The obvious one
 * — "an acronym has no vowels" — makes CRCA into "Crca"; loosening it to
 * "few vowels" makes SLAB into "SLAB". CRCA and SLAB are both four letters
 * with one vowel, and the only thing that tells them apart is knowing the
 * trade. So the trade is written down, and anything not on it is treated as
 * a shouted ordinary word.
 */
const ABBREVIATIONS = new Set([
  'crca', 'hrca', 'hr', 'cr', 'ms', 'ss', 'gi', 'ci', 'al',
  'od', 'id', 'nb', 'dia', 'thk', 'sch', 'blk', 'sq', 'rnd',
  'pvc', 'ptfe', 'hdpe', 'ldpe', 'abs', 'frp', 'mcb', 'mccb',
  'hsn', 'moc', 'igbt', 'smd', 'led', 'pcb', 'awg',
])

/**
 * Whether a run of letters is an abbreviation worth leaving alone.
 *
 * Two letters or fewer always — OD, MS, GI, ID read as themselves at any
 * size. Beyond that, either the trade recognises it or it has no vowels in it
 * at all, which catches the ones nobody thought to list.
 */
const isAbbreviation = (s: string) =>
  s.length <= 2 || ABBREVIATIONS.has(s.toLowerCase()) || !/[aeiou]/i.test(s)

/**
 * A readable name for a material, from the line a supplier printed.
 *
 * Deliberately conservative. Casing is only touched when the string is
 * SHOUTING — no lowercase letter anywhere — because a supplier who wrote
 * "CRCA Sheet 1.2mm" has already cased it and second-guessing them would be
 * the same mistake in the other direction.
 */
export function tidyName(raw: string): string {
  let s = (raw ?? '').trim().replace(/\s+/g, ' ')
  if (s === '') return s

  // C.R.C.A. is one word, not four — the matcher takes the same view
  s = s.replace(/\b(?:[A-Za-z]\.){2,}[A-Za-z]?/g, (m) => m.replace(/\./g, ''))

  // a figure run into its unit: 1.2MM, 100KG, 50mm
  s = s.replace(
    /(\d)([A-Za-z]+)/g,
    (m, n: string, word: string) => (UNIT.has(word.toLowerCase()) ? `${n} ${word}` : m),
  )

  /*
   * Runs that start with a letter, so "M3" is seen whole and recognised as a
   * unit while "INCOLOY-800" stops at the hyphen and "30A" offers only its
   * "A". Matching the letters alone would leave "kg/M3" behind.
   */
  const shouting = !/[a-z]/.test(s)
  s = s.replace(/[A-Za-z][A-Za-z0-9]*/g, (run) => {
    if (UNIT.has(run.toLowerCase())) return run.toLowerCase()
    // a person who cased it already gets left alone past this point
    if (!shouting) return run
    return isAbbreviation(run) ? run : run.toLowerCase()
  })

  // 40X40X5 is a size, and the x in it is a multiplication sign
  s = s.replace(/(\d)X(\d)/g, '$1x$2')

  // and it reads as a name, so it starts like one
  const first = s.search(/[A-Za-z]/)
  if (first >= 0) {
    const run = /^[A-Za-z]+/.exec(s.slice(first))![0]
    if (!isAbbreviation(run) || /[a-z]/.test(run)) {
      s = s.slice(0, first) + s[first].toUpperCase() + s.slice(first + 1)
    }
  }
  return s
}
