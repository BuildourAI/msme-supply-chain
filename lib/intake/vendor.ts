/**
 * Working out who a document is from, off the document.
 *
 * Every quotation carries the sender's name at the top — it is the one thing a
 * letterhead is for. Leaving the owner to type it while the name sits in the
 * first line they just uploaded is the kind of small stupidity that makes a
 * system feel like data entry, and the sample company never has to: its
 * documents know their vendor because the fixture says so.
 *
 * Pure, so what it decides can be pinned without a file or a browser.
 */
import { toIsoDate } from '@/lib/sheet/match'
import type { Vendor } from '@/lib/domain/types'

export interface VendorGuess {
  /** what the document appears to call them */
  name: string
  /** set only when it is one of the owner's existing suppliers */
  vendorId?: string
}

/** How far down a page a letterhead can reasonably be. */
const HEAD = 12

const fold = (s: string) => s.toLowerCase()
  .replace(/&/g, ' and ')
  .replace(/\b(pvt|private|ltd|limited|llp|inc|co|company|corp|enterprises|industries)\b/g, ' ')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()

const squash = (s: string) => fold(s).replace(/ /g, '')

/** Things printed in the same place as a company name that are not one. */
const NOT_A_NAME = new RegExp(
  '^(quotation|quote|proforma|pro\\s*forma|invoice|tax\\s*invoice|estimate|'
  + 'price\\s*list|offer|bill|delivery\\s*challan|purchase\\s*order|statement|'
  + 'to|from|m\\s*/\\s*s|dear\\s|sub(ject)?\\b|ref\\b|date\\b|gstin|pan\\b|'
  + 'phone|mobile|email|e-?mail|www\\.|description|particulars|sr\\b|s\\.?no)',
  'i',
)

/** A line that is an address, a number or a code rather than a name. */
const looksLikeDetail = (s: string) =>
  /\d{5,}/.test(s)                       // a PIN code, a GSTIN, a phone number
  || /@|https?:|www\./i.test(s)          // an email or a website
  || (s.match(/\d/g) ?? []).length > s.length / 4

/**
 * Who sent it.
 *
 * An existing supplier named anywhere on the page wins outright — that is not a
 * guess, it is them, and it is what makes their learned wordings apply on the
 * very first read rather than never. Failing that, the letterhead is offered as
 * a name to fill the box with, and the owner can correct it.
 *
 * The owner's own company is never the answer. A quotation is addressed to
 * somebody, so their name is on it too, and choosing it would be worse than
 * choosing nothing.
 */
export function readVendor(
  rows: string[][],
  vendors: Vendor[],
  ownCompany = '',
): VendorGuess | null {
  const lines = rows.slice(0, 60).map((r) => r.join(' ').trim()).filter(Boolean)
  if (lines.length === 0) return null

  const page = ` ${lines.map(fold).join(' | ')} `
  const flat = squash(lines.join(' '))
  const mine = squash(ownCompany)

  /* -------- somebody already on the list -------- */

  const named = vendors
    .filter((v) => squash(v.name).length >= 4)
    .filter((v) => page.includes(` ${fold(v.name)} `) || flat.includes(squash(v.name)))
    // the longest match, so "Shah Metals" does not win over "Shah Metals & Alloys"
    .sort((a, b) => b.name.length - a.name.length)[0]

  if (named) return { name: named.name, vendorId: named.id }

  /* -------- the letterhead -------- */

  for (const line of lines.slice(0, HEAD)) {
    const text = line.replace(/\s+/g, ' ').trim()
    if (text.length < 4 || text.length > 60) continue
    if (NOT_A_NAME.test(text)) continue
    if (looksLikeDetail(text)) continue
    if (mine.length >= 4 && squash(text).includes(mine)) continue
    // a name has letters in it, and mostly letters
    if (!/[a-z]{3}/i.test(text)) continue
    return { name: text }
  }

  return null
}

export interface DocHeader {
  docNo?: string
  /** the date printed on it, which is rarely the day it was uploaded */
  date?: string
  validUntil?: string
  /** the payment terms as printed — "30 days", "100% advance" */
  terms?: string
  /**
   * Those terms as a number of days, when they can be read as one.
   *
   * Separate from the text because the text is what the supplier wrote and
   * this is what the build can do arithmetic with. It matters more than it
   * looks: payment terms are the one landed-cost component derived rather
   * than entered, so a quotation saying "45 days" is a figure the comparison
   * can use the moment it is filed.
   */
  termsDays?: number
  /**
   * How many days they say delivery takes — "Delivery: 21 days", "Lead time
   * 12 days", "Dispatch within 2 weeks". A range takes its far end, because
   * the far end is the one a line stops on. Absent when nothing is printed,
   * and then the build's own default stands and says it is a default.
   */
  leadDays?: number
}

/**
 * A delivery promise, in days. The keyword has to come first and the figure
 * within a short reach of it, without crossing a sentence — "Payment terms:
 * 30 days. Delivery 10-14 days" must give 14, never 30.
 */
const LEAD = /\b(?:delivery|lead\s*time|dispatch|despatch|supply|ready)\b[^.|]{0,30}?\b(\d{1,3})(?:\s*(?:-|–|to)\s*(\d{1,3}))?\s*(?:working\s+)?(days?|weeks?|wks?)\b/i

/** Terms that belong to something other than paying — "Delivery terms: 15 days". */
const NOT_PAYMENT = /\b(?:delivery|dispatch|despatch|shipping|freight|price|supply)\s*$/i

/** Terms that mean there is no credit, however they are written. */
const NO_CREDIT = /\b(advance|against\s+delivery|before\s+dispatch|cash|c\.?o\.?d\.?|immediate|proforma)\b/i

/**
 * What a letterhead block is worth reading.
 *
 * All of them already fields on a supplier document, and all left empty until
 * the reader learned to fill them. The principle is the same each time: asking
 * somebody for something printed two inches above is a question that answers
 * itself. The date and the payment terms matter most — the terms because they
 * are the one landed-cost component this build derives rather than asks for.
 */
export function readHeader(rows: string[][]): DocHeader {
  const lines = rows.slice(0, 40).map((r) => r.join(' ').trim()).filter(Boolean)
  const out: DocHeader = {}

  for (const line of lines) {
    if (!out.docNo) {
      /*
       * Every candidate on the line, not just the first. A letterhead that
       * prints "QUOTATION" beside "Quotation No. SDM/QTN/0418" offered the
       * second word as the number, and "Quote valid upto" offered "valid". A
       * document number has a digit in it; a word does not.
       */
      for (const m of line.matchAll(/\b(?:no|ref|quotation|quote|invoice|bill)\.?\s*[:#-]?\s*([A-Z0-9][A-Z0-9/\\-]{3,})/gi)) {
        // a date is not a document number, however much it looks like one
        if (/\d/.test(m[1]) && !toIsoDate(m[1])) { out.docNo = m[1]; break }
      }
    }
    if (!out.validUntil) {
      const m = /\bvalid\s*(?:until|upto|up\s*to|till|through)?\s*[:-]?\s*([\d./-]{6,10})/i.exec(line)
      const iso = m ? toIsoDate(m[1]) : null
      if (iso) out.validUntil = iso
    }
    if (!out.date) {
      const m = /\bdate[d]?\s*[:-]?\s*([\d./-]{6,10})/i.exec(line)
      const iso = m ? toIsoDate(m[1]) : null
      // "valid until" carries a date too, and it is not this one
      if (iso && !/valid/i.test(line)) out.date = iso
    }
    if (out.leadDays === undefined) {
      const m = LEAD.exec(line)
      if (m) {
        const n = Number(m[2] ?? m[1])
        const days = /^w/i.test(m[3]) ? n * 7 : n
        if (days > 0 && days <= 365) out.leadDays = days
      }
    }
    if (!out.terms) {
      /*
       * Read off the phrase rather than the whole line, because "Payment
       * terms: 30 days from invoice" sits two inches from "Delivery: 15 days"
       * and taking the first number on the row would swap them. And "Delivery
       * terms: 15 days" is not about paying at all, so terms named for
       * something else are passed over.
       */
      const all = [...line.matchAll(/\b(?:payment\s*)?terms?\s*[:-]\s*([^|]{2,64})/gi)]
      const m = all.find((x) => !NOT_PAYMENT.test(line.slice(0, x.index ?? 0)))
      if (m) {
        /*
         * One sentence, not the rest of the row. Letterheads run the terms and
         * whatever else is agreed together — "30 days from invoice. Freight
         * extra at actuals." — and quoting the freight policy back as somebody's
         * payment terms is worse than saying nothing. Cut at a sentence break
         * rather than at any full stop, so "C.O.D." survives.
         */
        const phrase = m[1].split(/\.\s/)[0].trim()
          .replace(/[.\s]+$/, '').replace(/\s+/g, ' ')
        out.terms = phrase
        const days = /(\d{1,3})\s*days?/i.exec(phrase)
        if (days) out.termsDays = Number(days[1])
        else if (NO_CREDIT.test(phrase)) out.termsDays = 0
      }
    }
  }

  return out
}
