/**
 * Rows of a document, back into lines somebody quoted a price for.
 *
 * Every reader — the PDF text layer, a photograph, a spreadsheet, text typed by
 * hand — produces `string[][]` and stops there, so this is the single place
 * that decides what a row means. The alternative was four parsers that would
 * have disagreed with each other within a release.
 *
 * What it does NOT do is guess a material. That is `match.ts`, and keeping the
 * two apart matters: reading a row wrongly and matching it wrongly have
 * different causes and different fixes, and one function doing both would make
 * a bad match look like a bad parse.
 */
import { parseNumber, parseUom } from '@/lib/workspace/records'
import { MAX_DOC_LINES } from './types'

export interface RawLine {
  /** the supplier's own wording */
  raw: string
  qty?: number
  /** as written, not as understood — `parseUom` gets its say later */
  uom?: string
  rate?: number
}

/**
 * Words that mean this row is the table's heading, not a line of it.
 *
 * Matched against the row as a whole rather than cell by cell, because a
 * material genuinely called "Description board" exists and a row containing the
 * word "description" is not automatically a header.
 */
const HEADING = /^(sr|s\.?no|#|item|description|particulars|goods|material|product)\b/i
const HEADING_MATE = /\b(qty|quantity|rate|price|amount|value|unit|uom|hsn|gst|tax|total)\b/i

/**
 * Rows that summarise the ones above them.
 *
 * A total is a number with no material behind it, and letting one through would
 * put "Grand Total 12,31,500" into the item master as a thing this factory
 * buys — which is the kind of mistake nobody notices until it is old.
 */
const SUMMARY = new RegExp(
  '^(sub[\\s-]?total|grand\\s*total|total|net|gross|amount\\s+in\\s+words|'
  + 'c?gst|sgst|igst|vat|tax|freight|packing|forwarding|insurance|discount|'
  + 'round(ing)?\\s*off|advance|balance|terms?|e\\.?\\s*&\\s*o\\.?e)\\b',
  'i',
)

/** How close two figures have to be for one to be the product of the others. */
const NEAR = 0.01

/**
 * The priced lines on a document.
 *
 * Capped, and the caller is expected to say so rather than quietly truncating —
 * the same courtesy the spreadsheet import pays with its own row limit.
 */
export function rowsToLines(rows: string[][]): RawLine[] {
  const out: RawLine[] = []
  for (const row of rows) {
    const line = toLine(row)
    if (line) out.push(line)
    if (out.length >= MAX_DOC_LINES) break
  }
  return out
}

/** Whether more was there than `rowsToLines` returned. */
export const overflowed = (rows: string[][]): boolean =>
  rows.reduce((n, r) => n + (toLine(r) ? 1 : 0), 0) > MAX_DOC_LINES

/* ------------------------------------------- columns the build never knew -- */

/**
 * Headings that mean a column this reader already understands.
 *
 * Everything else on the heading row is something the build has never heard
 * of — an HSN code, a brand, a pack size, a warranty — and throwing it away is
 * what sends somebody back to a spreadsheet for the one field their trade
 * happens to need.
 */
const KNOWN_HEAD = new RegExp(
  '^(sr|s\\.?\\s?no|serial|#|item|description|particulars|goods|material|product|'
  + 'qty|quantity|rate|price|unit\\s*(price|rate)?|uom|amount|value|total|per)\\b',
  'i',
)

export interface DocColumn {
  /** the heading as printed on the document */
  label: string
  /** what it holds on each priced line, in `rowsToLines` order */
  values: string[]
}

/**
 * The columns on a document that this build has no field for.
 *
 * Deliberately built by walking the rows again with the very same `toLine`
 * rather than by taking indices off `rowsToLines`. The two must stay in step —
 * a value handed to the wrong line is worse than no value — and one function
 * deciding what a priced line is, used twice, is the only way to guarantee it.
 *
 * A column is only offered when most of the priced lines actually carry
 * something in it. A heading with two values under forty lines is a stray cell
 * from a badly-read table, not a column somebody wants.
 */
export function readExtraColumns(rows: string[][]): DocColumn[] {
  const head = rows.find((row) => {
    const cells = row.map((c) => c.trim()).filter((c) => c !== '')
    return cells.length >= 3 && HEADING.test(cells[0]) && HEADING_MATE.test(cells.join(' '))
  })
  if (!head) return []

  const body: string[][] = []
  for (const row of rows) {
    if (toLine(row)) body.push(row)
    if (body.length >= MAX_DOC_LINES) break
  }
  if (body.length === 0) return []

  const out: DocColumn[] = []
  const seen = new Set<string>()
  for (let at = 0; at < head.length; at += 1) {
    const label = (head[at] ?? '').trim().replace(/\s+/g, ' ')
    if (label.length < 2 || label.length > 40) continue
    if (KNOWN_HEAD.test(label)) continue
    // two columns headed the same thing is a read that went wrong, not two columns
    if (seen.has(label.toLowerCase())) continue

    const values = body.map((r) => (r[at] ?? '').trim())
    const filled = values.filter((v) => v !== '').length
    if (filled * 2 < body.length) continue

    seen.add(label.toLowerCase())
    out.push({ label, values })
  }
  return out
}

function toLine(row: string[]): RawLine | null {
  const cells = row.map((c) => c.trim()).filter((c) => c !== '')
  if (cells.length === 0) return null

  const joined = cells.join(' ')
  if (SUMMARY.test(cells[0])) return null
  if (HEADING.test(cells[0]) && HEADING_MATE.test(joined)) return null

  /*
   * Numbers in the order they appear, remembering where they were. A cell like
   * "1.2MM" is not a number and `parseNumber` says so, which is what keeps a
   * thickness out of the running for a rate.
   */
  const nums = cells
    .map((c, i) => ({ i, v: parseNumber(c) }))
    .filter((n): n is { i: number; v: number } => n.v !== null)

  const { qty, rate, used } = figures(nums)
  if (rate === undefined || rate <= 0) return null

  /*
   * The wording is the longest cell that is neither a figure this row is using
   * nor a unit. Longest rather than first because a document is free to put a
   * serial number, an HSN code or a brand in front of it.
   */
  const words = cells
    .map((c, i) => ({ c, i }))
    .filter(({ c, i }) => !used.has(i) && parseNumber(c) === null && parseUom(c) === null)
    .sort((a, b) => b.c.length - a.c.length)[0]

  if (!words || words.c.length < 3) return null

  const unit = cells.find((c, i) => !used.has(i) && i !== words.i && parseUom(c) !== null)

  return { raw: words.c, qty, rate, uom: unit }
}

/**
 * Which of a row's numbers is the rate.
 *
 * The hard case is telling a rate from a line total, and the answer is
 * arithmetic rather than column position: if the last three multiply out, the
 * last one is an amount and the rate is the one before it. A document that
 * omits the amount column falls through to "the last number is the rate", which
 * is what a two-column price list means.
 *
 * Position would have been the obvious rule and it is wrong often — plenty of
 * quotations lead with a serial number, and plenty put HSN between the wording
 * and the quantity.
 */
function figures(nums: { i: number; v: number }[]):
{ qty?: number; rate?: number; used: Set<number> } {
  const used = new Set<number>()
  if (nums.length === 0) return { used }

  if (nums.length >= 3) {
    const [q, r, amount] = nums.slice(-3)
    if (q.v > 0 && r.v > 0 && Math.abs(q.v * r.v - amount.v) <= Math.abs(amount.v) * NEAR) {
      used.add(q.i); used.add(r.i); used.add(amount.i)
      return { qty: q.v, rate: r.v, used }
    }
  }

  if (nums.length >= 2) {
    const [q, r] = nums.slice(-2)
    used.add(q.i); used.add(r.i)
    return { qty: q.v, rate: r.v, used }
  }

  used.add(nums[0].i)
  return { rate: nums[0].v, used }
}
