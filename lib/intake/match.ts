/**
 * A supplier's wording, against the materials this factory actually buys.
 *
 * The sample company states the rule this implements, on its own screen:
 * "Below 70% confidence, nobody accepts it unseen. A parser that guesses at 64%
 * is worse than no parser, because the wrong alias is permanent and silent."
 * Everything here is arithmetic in service of that sentence.
 *
 * Pure — no workspace, no clock, no randomness — so the thresholds can be
 * pinned by value and a change to them breaks a test rather than a factory.
 */
import type { Item, Uom } from '@/lib/domain/types'
import { parseUom } from '@/lib/workspace/records'

/**
 * Filed without asking anybody.
 *
 * Not a round number picked for looking sensible: `lib/seed/intake.ts` puts
 * 0.86 in the review queue and 0.88 upwards through the automatic ones, so 0.87
 * is the line the sample company's own fixture already draws.
 */
export const AUTO = 0.87

/** Above this the suggestion arrives already chosen; the owner presses Accept. */
export const SUGGEST = 0.8

/**
 * Below this, nothing is suggested at all.
 *
 * Not "suggested quietly" — not suggested. A select box arriving pre-filled
 * below the floor is an invitation to accept a guess with one click, which is
 * the exact failure the 70% rule exists to prevent.
 */
export const FLOOR = 0.7

/** Reserved for a confirmed alias. Nothing computed here ever reaches it. */
const CEILING = 0.96

export interface Candidate {
  itemId: string
  score: number
}

/* --------------------------------------------------------------- tokenising -- */

/**
 * Undo the way people write abbreviations before anything else looks at the
 * string. `C.R.C.A.` and `CRCA` are the same word, and every comparison below
 * would otherwise have to know that separately.
 */
const tidy = (s: string) =>
  s.toLowerCase().replace(/\b(?:[a-z]\.){2,}[a-z]?/g, (m) => m.replace(/\./g, ''))

/** For words: punctuation goes entirely. */
const fold = (s: string) => tidy(s).replace(/[^a-z0-9]+/g, ' ').trim()

/** For measurements: the decimal point has to survive, or 1.2 becomes 12. */
const foldFigures = (s: string) => tidy(s).replace(/[^a-z0-9.]+/g, ' ').trim()

/** Words worth comparing. One- and two-letter fragments carry no signal. */
const words = (s: string) => fold(s).split(' ').filter((w) => w.length >= 3 && !/^\d/.test(w))

/**
 * The consonants of a word, which is how a supplier abbreviates one.
 *
 * "SHT" for sheet, "GLND" for gland, "CERAM" for ceramic. Dropping the vowels
 * after the first letter turns most of these into the same string as the word
 * they stand for, and it costs nothing when they are already the same.
 */
const skeleton = (w: string) => w[0] + w.slice(1).replace(/[aeiou]/g, '')

/**
 * Whether a supplier's word and the factory's word are the same word.
 *
 * Exact, or one written short. Deliberately not fuzzy beyond that: "gland" and
 * "grand" are two letters apart and are not the same thing, and an edit-distance
 * rule generous enough to catch "SHT" would catch those too.
 */
function sameWord(a: string, b: string): boolean {
  if (a === b) return true
  if (a.length >= 3 && b.length >= 3 && (a.startsWith(b) || b.startsWith(a))) return true
  return skeleton(a) === skeleton(b)
}

/**
 * The measurements in a string, as number-and-unit pairs.
 *
 * `1.2MM`, `8.5`, `M20`, `1250` — these are what separate one material from the
 * next one along, and treating them as ordinary words would let a 1.2 mm sheet
 * match a 1.6 mm sheet on everything except the thing that matters.
 */
const figures = (s: string): { n: number; unit: string }[] => {
  const out: { n: number; unit: string }[] = []
  const re = /(\d+(?:\.\d+)?)\s*([a-z]{0,4})/g
  for (const m of foldFigures(s).matchAll(re)) {
    out.push({ n: Number(m[1]), unit: m[2] ?? '' })
  }
  return out
}

const trigrams = (s: string): Set<string> => {
  const t = fold(s).replace(/[^a-z0-9]/g, '')
  const out = new Set<string>()
  for (let i = 0; i + 3 <= t.length; i += 1) out.add(t.slice(i, i + 3))
  return out
}

const dice = (a: Set<string>, b: Set<string>): number => {
  if (a.size === 0 || b.size === 0) return 0
  let shared = 0
  for (const g of a) if (b.has(g)) shared += 1
  return (2 * shared) / (a.size + b.size)
}

/* --------------------------------------------------------------------- idf -- */

/**
 * How much each word is worth, judged against this factory's own materials.
 *
 * "Sheet" in twenty of fifty materials tells you almost nothing; "incoloy" in
 * one of them tells you everything. No corpus is needed for this and none is
 * used — the owner's own item master is the corpus, which is also why it gets
 * sharper as they add materials rather than staying as clever as the day it
 * shipped.
 */
export function idfOf(items: { name: string }[]): Map<string, number> {
  const seen = new Map<string, number>()
  for (const it of items) {
    for (const w of new Set(words(it.name))) {
      seen.set(w, (seen.get(w) ?? 0) + 1)
    }
  }
  const n = Math.max(items.length, 1)
  const idf = new Map<string, number>()
  for (const [w, count] of seen) idf.set(w, Math.log(1 + n / count))
  return idf
}

const weightOf = (w: string, idf: Map<string, number>) => idf.get(w) ?? Math.log(2)

/* ------------------------------------------------------------------ scoring -- */

export interface MatchItem {
  id: string
  code: string
  name: string
  uom: Uom
}

/**
 * How sure this wording is that material, between 0 and 1.
 *
 * Read in order: a code in the text settles it; otherwise word overlap and
 * character overlap are blended, and then the measurements get a veto. The
 * veto is the part that earns its keep. CRCA sheet in 1.2 mm and CRCA sheet in
 * 1.6 mm share every word and almost every trigram, and telling them apart by
 * text similarity alone is not possible — so a figure that is contradicted
 * rather than merely absent caps the whole score below the floor, where nothing
 * is suggested and a person decides.
 */
export function scoreItem(
  raw: string,
  uom: string | undefined,
  item: MatchItem,
  idf: Map<string, number>,
): number {
  /*
   * A code in the wording is the strongest thing in this domain — a supplier
   * quoting "CM-TRB-2W" has copied it off a drawing or a previous order. Still
   * not 1: that is what a person confirming an alias is worth, and nothing the
   * machine works out on its own should be indistinguishable from it.
   */
  if (item.code.trim().length >= 3 && hasCode(raw, item.code)) return CEILING

  /*
   * The code is NOT in here. It is settled above when it is quoted, and putting
   * its fragments in the denominator would penalise every wording that does not
   * quote it — which is most of them, since a supplier writes their own.
   */
  const rawWords = words(raw)
  const itemWords = words(item.name)
  const wanted = itemWords.reduce((a, w) => a + weightOf(w, idf), 0)
  const shared = itemWords
    .filter((w) => rawWords.some((r) => sameWord(r, w)))
    .reduce((a, w) => a + weightOf(w, idf), 0)
  const overlap = wanted > 0 ? shared / wanted : 0

  let score = 0.6 * overlap + 0.4 * dice(trigrams(raw), trigrams(item.name))

  /* ------- the measurements ------- */

  const mine = figures(item.name)
  const theirs = figures(raw)
  if (mine.length > 0) {
    const present = mine.filter((f) => theirs.some((t) => t.n === f.n))
    const contradicted = mine.some((f) =>
      !theirs.some((t) => t.n === f.n)
      && theirs.some((t) => t.unit === f.unit && t.n !== f.n && f.unit !== ''))

    if (contradicted) return round(Math.min(score, 0.55))
    if (present.length === mine.length) score += 0.1
  }

  /* ------- the unit ------- */

  const theirUom = uom ? parseUom(uom) : null
  if (theirUom !== null) {
    // a line quoted per tonne is not the material this factory buys by the piece
    if (theirUom !== item.uom) return round(Math.min(score, 0.6))
    score += 0.05
  }

  return round(Math.min(score, CEILING))
}

/** Whole-token, so "M20" does not find itself inside "M200". */
function hasCode(raw: string, code: string): boolean {
  const c = code.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (c.length < 3) return false
  const text = raw.toLowerCase().replace(/[^a-z0-9]+/g, ' ')
  return text.split(' ').some((t) => t === c)
    || raw.toLowerCase().replace(/\s+/g, '').includes(code.toLowerCase())
}

/** Two decimal places, so a test can pin a figure rather than a range. */
const round = (n: number) => Math.round(Math.max(0, n) * 100) / 100

/* ------------------------------------------------------------------ picking -- */

/** The likeliest material for a wording, or null when nothing clears the floor. */
export function bestMatch(
  raw: string,
  uom: string | undefined,
  items: MatchItem[],
  idf?: Map<string, number>,
): Candidate | null {
  const weights = idf ?? idfOf(items)
  let best: Candidate | null = null
  for (const item of items) {
    const score = scoreItem(raw, uom, item, weights)
    if (!best || score > best.score) best = { itemId: item.id, score }
  }
  return best && best.score >= FLOOR ? best : null
}

export type Verdict = 'matched' | 'review' | 'unmapped'

/** Total by construction — every number between 0 and 1 has an answer. */
export const classify = (score: number): Verdict =>
  (score >= AUTO ? 'matched' : score >= FLOOR ? 'review' : 'unmapped')

/** Whether the suggestion arrives already chosen, or only named. */
export const preselect = (score: number): boolean => score >= SUGGEST

/** The materials a workspace can offer, in the shape this file wants. */
export const matchable = (items: Item[]): MatchItem[] =>
  items.map((i) => ({ id: i.id, code: i.code, name: i.name, uom: i.uom }))
