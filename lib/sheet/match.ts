/**
 * Working out what a column in somebody's sheet is.
 *
 * Two jobs. Matching a header against a field this build already has, so a
 * column called "Payment terms" lands on payment terms without being told. And,
 * when nothing matches, guessing what KIND of thing the column holds, so
 * offering to create a field for it can arrive with the right type already
 * chosen rather than as another question.
 *
 * Both are suggestions. Every one of them is shown in the matching step with
 * three real values underneath, and every one can be overridden — a guess that
 * cannot be corrected is worse than no guess.
 */
import type { FieldKind } from '@/lib/workspace/types'

export interface Target {
  /** the column key or field id this maps to */
  key: string
  label: string
  /** other things people call it */
  aliases?: string[]
  kind: FieldKind
}

/** "GST No." and "gst_number" have to collide, so everything but letters goes. */
export const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/**
 * The best target for a header, or null.
 *
 * Exact on the normalised name first, then aliases, then a contains match in
 * either direction so that "Supplier name" finds "Supplier" and "Terms" finds
 * "Payment terms". Nothing fuzzier than that: a wrong match that looks right is
 * more expensive than no match, because no match is visible and a wrong one is
 * only found later, in the data.
 */
export function matchHeader(header: string, targets: Target[], taken: Set<string>): string | null {
  const h = normalise(header)
  if (h === '') return null
  const free = targets.filter((t) => !taken.has(t.key))

  const exact = free.find((t) => normalise(t.label) === h)
    ?? free.find((t) => (t.aliases ?? []).some((a) => normalise(a) === h))
  if (exact) return exact.key

  const partial = free.filter((t) => {
    const l = normalise(t.label)
    return l.includes(h) || h.includes(l)
      || (t.aliases ?? []).some((a) => { const n = normalise(a); return n.includes(h) || h.includes(n) })
  })
  // ambiguity is not a match — two candidates means the person should choose
  return partial.length === 1 ? partial[0].key : null
}

const YES = new Set(['yes', 'y', 'true', '1', '✓'])
const NO = new Set(['no', 'n', 'false', '0', '-', '—'])

const isNumber = (v: string) => /^-?[\d,]+(\.\d+)?$/.test(v.replace(/\s/g, '')) && /\d/.test(v)
const isDate = (v: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(v) || /^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$/.test(v)

/**
 * What kind of field would hold this column.
 *
 * Judged on the values, never the header — a column called "Rating" holding
 * "excellent"/"poor" is a choice, not a number. Blanks are ignored rather than
 * counted against a guess, since a half-filled column is normal.
 */
export function guessKind(values: string[]): FieldKind {
  const filled = values.map((v) => v.trim()).filter((v) => v !== '')
  if (filled.length === 0) return 'text'

  const all = (fn: (v: string) => boolean) => filled.every(fn)
  if (all((v) => YES.has(v.toLowerCase()) || NO.has(v.toLowerCase()))) return 'yesno'
  if (all(isDate)) return 'date'
  if (all(isNumber)) return 'number'

  /*
   * A short repeating vocabulary is a choice. Both halves matter: few distinct
   * values, and each one used more than once. Five suppliers with five
   * different cities is not a category, it is just a text column.
   */
  const distinct = new Set(filled.map((v) => v.toLowerCase()))
  if (filled.length >= 4 && distinct.size <= 8 && distinct.size * 2 <= filled.length) return 'choice'

  return 'text'
}

/** The distinct values of a choice column, in the order they first appear. */
export function choicesOf(values: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of values) {
    const v = raw.trim()
    if (v === '' || seen.has(v.toLowerCase())) continue
    seen.add(v.toLowerCase())
    out.push(v)
  }
  return out.slice(0, 20)
}

/** A number as this build stores it — "1,200" and " 1200 " are the same figure. */
export const cleanNumber = (v: string) => v.replace(/[,\s]/g, '')

/**
 * A date as ISO, whatever order it was written in.
 *
 * `15/10/2026` is the fifteenth of October everywhere this is used, and
 * day-first is assumed because that is how it is written in India. An ambiguous
 * pair like `03/04` is therefore read day-first too, which is right more often
 * here than the alternative and is at least consistent.
 */
export function toIsoDate(v: string): string | null {
  const t = v.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(t)
  if (!m) return null
  const day = Number(m[1]), month = Number(m[2])
  let year = Number(m[3])
  if (year < 100) year += year < 70 ? 2000 : 1900
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  // reject the 31st of a 30-day month rather than letting it roll into the next
  return new Date(iso + 'T00:00:00Z').toISOString().slice(0, 10) === iso ? iso : null
}

/** Yes/no, as stored. Anything unrecognised is left alone for the row to fail on. */
export function toYesNo(v: string): string | null {
  const t = v.trim().toLowerCase()
  if (YES.has(t)) return 'Yes'
  if (NO.has(t)) return 'No'
  return null
}
