/**
 * Putting a document on a page, once.
 *
 * Two things go on paper in this build — a request for prices and a purchase
 * order — and they share more than they differ: the same letterhead, the same
 * rules, the same font that cannot draw Devanagari, the same phone-first
 * preview, the same one-file-per-supplier rule. This is what they share.
 *
 * Extracted rather than copied because the two are the sort of thing that
 * drifts. A fix to the character substitution, or to the column width that
 * stopped a date wrapping, has to land on both, and the only reliable way to
 * guarantee that is for there to be one of it.
 *
 * jsPDF is imported by `page()` and nowhere else, and dynamically, so no route
 * in the build carries a third of a megabyte it never uses.
 */

/* ------------------------------------------------------------- characters -- */

/**
 * What the built-in fonts cannot draw, and what to draw instead.
 *
 * jsPDF's standard fonts are cp1252. The temptation is to test `charCode > 255`
 * and refuse anything above it, but cp1252 fills 0x80–0x9F with exactly the
 * characters people paste out of Word — curly quotes, en and em dashes,
 * ellipsis — so that test refuses documents that would have printed perfectly.
 *
 * Substituting first is both kinder and more accurate. "Rs." is what Indian
 * business paper prints anyway, and a curly apostrophe reads the same straight.
 * Only what survives this is genuinely undrawable.
 */
const SUBSTITUTE: [RegExp, string][] = [
  [/₹/g, 'Rs.'],
  [/[‘’‛]/g, "'"],
  [/[“”‟]/g, '"'],
  [/[–—−]/g, '-'],
  [/…/g, '...'],
  [/ /g, ' '],
  [/[×✕]/g, 'x'],
  [/•/g, '-'],
  [/[✅✓✔]/g, 'Yes'],
]

export function forPrint(text: string): string {
  return SUBSTITUTE.reduce((s, [re, to]) => s.replace(re, to), text ?? '')
}

/**
 * Whether a string can be drawn once substitution has had its turn.
 *
 * cp1252 is Latin-1 plus a filled 0x80–0x9F range, so the test is: after
 * substitution, is every character either below 0x100 or one of the handful
 * cp1252 adds? Anything else — Devanagari, Gujarati, Tamil — genuinely cannot
 * be drawn by a built-in font, and the person is told which field rather than
 * being handed a document with holes in it.
 */
const CP1252_EXTRA = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2020, 0x2021, 0x02c6, 0x2030,
  0x0160, 0x2039, 0x0152, 0x017d, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
])

export const undrawable = (text: string): string[] => {
  const out = new Set<string>()
  for (const ch of forPrint(text)) {
    const code = ch.codePointAt(0)!
    if (code > 0xff && !CP1252_EXTRA.has(code)) out.add(ch)
  }
  return [...out]
}

/* ------------------------------------------------------------------ dates -- */

export const dmy = (iso: string): string => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso
  const [y, m, d] = iso.split('-')
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m) - 1]
  return `${Number(d)} ${month} ${y}`
}

/* ------------------------------------------------------------ the shared bits */

/** A label and a value, which is most of what a business document is. */
export interface DocLine {
  label: string
  value: string
}

/** A letterhead, built the same way for every document this company sends. */
export interface Letterhead {
  name: string
  lines: string[]
}

export function letterhead(company: {
  name: string; address?: string; gstin?: string; phone?: string; email?: string
}): Letterhead {
  return {
    name: company.name,
    lines: [
      company.address ?? '',
      [company.gstin ? `GSTIN ${company.gstin}` : '', company.phone ?? '']
        .filter(Boolean).join(' · '),
      company.email ?? '',
    ].filter((l) => l.trim() !== ''),
  }
}

/** A field that could not be drawn, and where it came from. */
export interface Problem {
  where: string
  chars: string[]
}

/**
 * Every string bound for the page, checked once and named where it came from.
 *
 * Saying "the supplier name contains ॐ" is the difference between a person
 * fixing it in ten seconds and a person receiving a document with holes in it
 * and never knowing why.
 */
export const problemsIn = (fields: [string, string][]): Problem[] =>
  fields
    .map(([where, text]) => ({ where, chars: undrawable(text) }))
    .filter((p) => p.chars.length > 0)

/* -------------------------------------------------------------- the paper -- */

export const A4 = { w: 595.28, h: 841.89 }
export const MARGIN = 48
const RULE = '#d8dbe0'

export interface TextOpts {
  size?: number
  bold?: boolean
  align?: 'left' | 'right'
  grey?: boolean
}

/**
 * A page being written down, which keeps track of how far down it is.
 *
 * jsPDF does not flow text: it draws a string at a coordinate and forgets. So
 * every layout here is built in one pass and measured as it goes, or a long
 * note runs off the bottom of the page in silence.
 */
export interface Page {
  /** the current baseline, which every helper moves */
  y: number
  readonly right: number
  text: (s: string, x: number, opts?: TextOpts) => void
  /** a horizontal rule with air above and below it */
  rule: (gap?: number) => void
  /** wrapped body text, which breaks the page when it has to */
  paragraph: (s: string, x: number, width: number, size?: number) => void
  fill: (x: number, w: number, h: number) => void
  blob: () => Blob
}

export async function page(): Promise<Page> {
  const { jsPDF } = await import('jspdf')
  const d = new jsPDF({ unit: 'pt', format: 'a4' })

  const p: Page = {
    y: MARGIN + 8,
    right: A4.w - MARGIN,

    text(s, x, opts) {
      d.setFont('helvetica', opts?.bold ? 'bold' : 'normal')
      d.setFontSize(opts?.size ?? 10)
      d.setTextColor(opts?.grey ? 110 : 20)
      d.text(forPrint(s), x, p.y, { align: opts?.align ?? 'left' })
    },

    rule(gap = 10) {
      p.y += gap
      d.setDrawColor(RULE)
      d.setLineWidth(0.7)
      d.line(MARGIN, p.y, p.right, p.y)
      p.y += gap + 4
    },

    paragraph(s, x, width, size = 10) {
      d.setFont('helvetica', 'normal')
      d.setFontSize(size)
      d.setTextColor(20)
      const lines = d.splitTextToSize(forPrint(s), width) as string[]
      for (const line of lines) {
        if (p.y > A4.h - MARGIN - 40) { d.addPage(); p.y = MARGIN }
        d.text(line, x, p.y)
        p.y += size + 3
      }
    },

    fill(x, w, h) {
      d.setFillColor(246, 247, 249)
      d.rect(x, p.y - 11, w, h, 'F')
    },

    blob: () => d.output('blob'),
  }
  return p
}

/**
 * The letterhead block, and a title and reference opposite it.
 *
 * Shared because getting it wrong is visible: the number and date sit against
 * the first two letterhead lines, and whichever block is taller decides where
 * the rule goes. Two copies of that arithmetic would have diverged by an inch.
 */
export function head(p: Page, from: Letterhead, title: string, no: string, dated: string): void {
  const top = p.y
  p.text(from.name.toUpperCase(), MARGIN, { size: 15, bold: true })
  p.text(title, p.right, { size: 12, bold: true, align: 'right' })
  p.y += 15
  for (const line of from.lines) {
    p.text(line, MARGIN, { size: 9, grey: true })
    p.y += 11
  }

  const back = p.y
  p.y = top + 15
  p.text(no, p.right, { size: 11, bold: true, align: 'right' })
  p.y += 12
  p.text(dated, p.right, { size: 9, grey: true, align: 'right' })
  p.y = Math.max(back, p.y + 4)
}

/** "To — Shah Metals & Alloys", with their address under it when there is one. */
export function addressee(p: Page, name: string, address?: string): void {
  p.text('To', MARGIN, { size: 9, grey: true })
  p.text(name, MARGIN + 44, { size: 11, bold: true })
  p.y += 13
  if (address && address.trim() !== '') {
    p.paragraph(address, MARGIN + 44, 300, 9)
    p.y += 4
  } else {
    p.y += 9
  }
}

/** The file a document lands under, with the supplier in the name. */
export const fileName = (no: string, who?: string): string => {
  const tail = who ? `-${who.replace(/[^A-Za-z0-9]+/g, '-')}` : ''
  return `${no}${tail}.pdf`.replace(/-+/g, '-')
}
