/**
 * Reading a PDF that somebody's supplier sent them.
 *
 * Most quotes and price lists that arrive by email are text PDFs — the words
 * are in the file, laid out by coordinate, and nothing has to be guessed from
 * pixels. That is the case worth handling properly, and it is handled here.
 *
 * Why a dependency at all, in a build that hand-rolled its own zip reader
 * rather than take the `xlsx` package: that package was refused for an unfixed
 * high-severity advisory on exactly the untrusted-file path this feature lives
 * on, not for being a dependency. And a PDF text extractor is not a weekend of
 * work the way a zip central directory is — font subsetting, CID maps and
 * per-glyph encodings are the whole problem, and pdf.js has spent fifteen years
 * on them.
 *
 * It is loaded lazily, exactly as jsPDF is in `lib/rfq/document.ts`, so an owner
 * who never uploads a PDF never downloads one.
 *
 * What comes out is `string[][]` — the same shape `lib/sheet/read.ts` returns
 * for a spreadsheet. That is deliberate: a PDF, a photograph, a spreadsheet and
 * text typed by hand all converge on one shape, and everything after this point
 * is a pure function that has never heard of a file.
 */

/**
 * One run of text, and where on the page it sat.
 *
 * **x right, y down, origin top-left** — the screen's convention, not the PDF's.
 * A PDF measures y upwards from the bottom, so this file flips it at the point
 * of reading. That matters more than it sounds: OCR reports y downwards, and
 * two producers disagreeing about which way is up would turn one of their
 * tables upside down while still looking entirely plausible.
 */
export interface TextCell {
  s: string
  x: number
  y: number
  /** advance width of the run */
  w: number
  /** glyph height, which is how row tolerance is scaled */
  h: number
}

export interface PdfRead {
  rows: string[][]
  pages: number
  /**
   * Pages whose text layer was empty or near-empty. That is a scan — a photo of
   * paper wrapped in a PDF — and it needs the OCR path rather than this one.
   */
  scanned: number[]
}

/** A page with less text than this is not a document, it is a picture of one. */
const SCAN_FLOOR = 40

/** Enough for a long price list; past it, the owner is told what was dropped. */
export const MAX_PDF_ROWS = 300
const MAX_PAGES = 20

/**
 * Whether this browser can read a PDF at all.
 *
 * Checked before the file picker rather than after, so somebody on an old phone
 * is told up front instead of watching a spinner — the same courtesy
 * `canReadXlsx` does in `lib/sheet/unzip.ts`.
 */
export const canReadPdf = (): boolean =>
  typeof Worker !== 'undefined' && typeof URL !== 'undefined'

/* ------------------------------------------------------------------ pure -- */

/**
 * Text runs back into table rows.
 *
 * Two joins, in order. Runs sharing a baseline are one row — "sharing" being
 * within half a glyph height, because a superscript or a slightly larger font
 * in one cell must not start a new line. Then runs inside a row that all but
 * touch are one cell, because a PDF is free to split "CRCA SHEET" into two runs
 * and frequently does; the gap test is a quarter of the glyph height, roughly a
 * thin space, so a real column break survives it.
 *
 * Kept free of pdf.js so it can be tested with nothing but an array.
 */
export function cellsToRows(cells: TextCell[]): string[][] {
  const kept = cells.filter((c) => c.s.trim() !== '')
  if (kept.length === 0) return []

  const heights = kept.map((c) => c.h).filter((h) => h > 0).sort((a, b) => a - b)
  const median = heights.length > 0 ? heights[Math.floor(heights.length / 2)] : 9

  /*
   * Take the tilt out of the page before anything else looks at it.
   *
   * A PDF is square and this comes back as zero. A photograph never is, and a
   * degree and a half — which is a steady hand — drops the far end of a wide
   * row by more than a line's height. Grouped without correcting for it, the
   * description lands on one row and its rate on the next, and every line
   * silently loses its price. Not hypothetical: it is what a real photograph
   * did here, and no tolerance fixes it, because the slack that would cover
   * the tilt also swallows the row below.
   */
  const slope = tiltOf(kept, median)
  const flat = kept.map((c) => ({ ...c, y: c.y - slope * c.x }))

  const sameLine = Math.max(2, median * 0.5)
  /*
   * How close two runs have to be to be one cell, in glyph heights.
   *
   * Two producers with different habits. A PDF splits a phrase into runs that
   * all but touch, so almost any threshold joins them. OCR reports one box per
   * WORD with a real space between — around half a glyph height — and a
   * threshold tuned for the PDF leaves every word in a column of its own,
   * which turns a letterhead into a priced line and a description into
   * whichever of its words happens to be longest.
   *
   * 1.2 sits well above a word space and well below a column gap, which in a
   * real table is several heights wide.
   */
  const sameCell = Math.max(1, median * 1.2)

  const sorted = [...flat].sort((a, b) => (a.y - b.y) || (a.x - b.x))
  const lines: TextCell[][] = []
  for (const c of sorted) {
    const last = lines[lines.length - 1]
    if (last && Math.abs(last[0].y - c.y) <= sameLine) last.push(c)
    else lines.push([c])
  }

  return lines.map((line) => {
    const byX = line.sort((a, b) => a.x - b.x)
    const out: string[] = []
    let edge = -Infinity
    let height = median
    let tail = ''
    for (const c of byX) {
      const space = c.x - edge
      if (out.length > 0 && space <= sameCell) {
        const joiner = space > 0.05 * height || /\s$/.test(tail) || /^\s/.test(c.s) ? ' ' : ''
        out[out.length - 1] = `${out[out.length - 1]}${joiner}${c.s.trim()}`
      } else {
        out.push(c.s.trim())
      }
      edge = c.x + c.w
      height = c.h || height
      tail = c.s
    }
    return out
  })
}

/**
 * How far the page leans, as a slope.
 *
 * Measured from pairs of runs sitting side by side — close enough in y to be
 * the same line of text, far enough apart in x for the difference between them
 * to mean anything. The median of those is the tilt; an average would be
 * dragged about by the one pair that straddles two rows.
 *
 * Clamped, and zero when there is too little side-by-side text to judge from.
 * Correcting hard for noise is worse than not correcting at all.
 */
function tiltOf(cells: TextCell[], median: number): number {
  const byY = [...cells].sort((a, b) => (a.y - b.y) || (a.x - b.x))
  const slopes: number[] = []
  for (let i = 1; i < byY.length; i += 1) {
    const a = byY[i - 1]
    const b = byY[i]
    const dx = b.x - a.x
    /*
     * Wide pairs only. Two words a few pixels apart vertically and eighty
     * apart horizontally imply a slope of 0.08 — steeper than any real page —
     * purely because the divisor is small. Requiring a span of several glyph
     * heights keeps the estimate out of the hands of adjacent words.
     */
    if (dx < median * 4) continue
    if (Math.abs(b.y - a.y) > median * 1.5) continue
    slopes.push((b.y - a.y) / dx)
  }
  if (slopes.length < 3) return 0
  slopes.sort((p, q) => p - q)
  const mid = slopes[Math.floor(slopes.length / 2)]
  // about four degrees either way; past that it is not a tilt, it is a mistake
  return Math.max(-0.07, Math.min(0.07, mid))
}

/* ------------------------------------------------------------- the binding -- */

/*
 * pdf.js is typed loosely on purpose. Importing its types at the top of a file
 * that is only sometimes used would pull the package into the module graph of
 * everything that touches intake, which is the opposite of loading it lazily.
 */
interface PdfjsLike {
  GlobalWorkerOptions: { workerSrc: string; workerPort: unknown }
  getDocument: (src: Record<string, unknown>) => PdfTaskLike
}
interface PdfTaskLike {
  promise: Promise<PdfDocLike>
  /** releases the worker; the document proxy itself has no such method in v6 */
  destroy: () => Promise<void>
}
interface PdfDocLike {
  numPages: number
  getPage: (n: number) => Promise<PdfPageLike>
}
interface PdfPageLike {
  getTextContent: () => Promise<{ items: unknown[] }>
  getViewport: (o: { scale: number }) => { width: number; height: number }
  render: (o: { canvasContext: CanvasRenderingContext2D; viewport: unknown; canvas: HTMLCanvasElement })
  => { promise: Promise<void> }
}

export type PdfjsLoader = () => Promise<PdfjsLike>

let cached: Promise<PdfjsLike> | null = null

/**
 * The browser build, with its worker bundled rather than fetched.
 *
 * Two deliberate choices here.
 *
 * `new URL(..., import.meta.url)` is the form the bundler recognises, so the
 * worker ships as part of the app. The default — a script URL on a CDN — would
 * mean a supplier's quote could not be read on a bad connection, behind a
 * corporate proxy, or on a factory floor with no internet, which are three of
 * the places this most needs to work.
 *
 * And the `legacy` build rather than the modern one, which is not a hedge. The
 * modern build calls `Map.prototype.getOrInsertComputed`, a 2025 addition that
 * the browser on somebody's three-year-old Android does not have — so drawing
 * a page threw `getOrInsertComputed is not a function` on a Chromium from last
 * year, and would throw on most phones this is meant for. Legacy is a little
 * larger and it loads lazily, so what it costs is nothing that matters.
 */
const browserPdfjs: PdfjsLoader = () => {
  cached ??= (async () => {
    const mod = await import('pdfjs-dist/legacy/build/pdf.mjs') as unknown as PdfjsLike
    mod.GlobalWorkerOptions.workerPort = new Worker(
      new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url),
      { type: 'module' },
    )
    return mod
  })()
  return cached
}

/**
 * Every line of text in a PDF, as rows.
 *
 * `load` exists so the tests can hand in pdf.js's Node build and read the real
 * fixture file. Nothing else passes it.
 */
export async function readPdf(
  buf: ArrayBuffer,
  load: PdfjsLoader = browserPdfjs,
): Promise<PdfRead> {
  const pdfjs = await load()
  const task = pdfjs.getDocument({
    data: new Uint8Array(buf),
    /*
     * This file is untrusted by definition — a supplier sent it. `isEvalSupported`
     * off closes the font-compilation path that every known pdf.js RCE has gone
     * through, and `disableFontFace` means no font from the document is ever
     * handed to the browser. Neither costs anything here: this reads text and
     * never draws a glyph.
     */
    isEvalSupported: false,
    disableFontFace: true,
    disableAutoFetch: true,
  })
  const doc = await task.promise

  try {
    const pages = Math.min(doc.numPages, MAX_PAGES)
    const rows: string[][] = []
    const scanned: number[] = []

    for (let n = 1; n <= pages; n += 1) {
      const page = await doc.getPage(n)
      const height = page.getViewport({ scale: 1 }).height
      const content = await page.getTextContent()
      const cells = content.items
        .map((raw) => toCell(raw, height))
        .filter((c): c is TextCell => c !== null)
      const text = cells.reduce((a, c) => a + c.s.trim().length, 0)
      if (text < SCAN_FLOOR) { scanned.push(n); continue }
      rows.push(...cellsToRows(cells))
    }

    return { rows: rows.slice(0, MAX_PDF_ROWS), pages: doc.numPages, scanned }
  } finally {
    // the worker holds the whole file in memory until this runs
    await task.destroy()
  }
}

/** One of pdf.js's text items, if that is what it is. Marked content is not. */
function toCell(raw: unknown, pageHeight: number): TextCell | null {
  const it = raw as { str?: unknown; transform?: unknown; width?: unknown; height?: unknown }
  if (typeof it.str !== 'string' || !Array.isArray(it.transform)) return null
  const t = it.transform as number[]
  const h = Number(it.height) || Math.abs(t[3]) || 9
  return {
    s: it.str,
    x: Number(t[4]) || 0,
    // flipped here, once, so everything downstream reads top to bottom
    y: pageHeight - (Number(t[5]) || 0),
    w: Number(it.width) || 0,
    h,
  }
}

/* ----------------------------------------------------------------- drawing -- */

export interface PageImage {
  blob: Blob
  pages: number
}

/**
 * One page of a PDF, as a picture.
 *
 * Two jobs, and they are the same job. Showing the owner the document they
 * uploaded — for which the browser's own PDF viewer would do, except that it
 * arrives wrapped in a dark toolbar displaying the blob's internal id where a
 * filename should be, which is both ugly and a detail nobody should be shown.
 * And handing a scanned page to the reader of photographs, which needs pixels
 * rather than a file.
 *
 * Scale is capped by total pixels rather than set flat: a two-times render of
 * an A0 drawing is a hundred megabytes of canvas and a dead tab.
 */
export async function renderPage(
  buf: ArrayBuffer,
  page = 1,
  scale = 2,
  load: PdfjsLoader = browserPdfjs,
): Promise<PageImage> {
  const pdfjs = await load()
  const task = pdfjs.getDocument({
    data: new Uint8Array(buf),
    isEvalSupported: false,
    disableAutoFetch: true,
  })
  const doc = await task.promise

  try {
    const n = Math.min(Math.max(page, 1), doc.numPages)
    const p = await doc.getPage(n)
    const base = p.getViewport({ scale: 1 })
    const capped = Math.min(scale, Math.sqrt(MAX_PIXELS / (base.width * base.height)))
    const viewport = p.getViewport({ scale: Math.max(0.5, capped) })

    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('This browser cannot draw the page.')

    await p.render({ canvasContext: ctx, viewport, canvas }).promise

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/png')
    })
    if (!blob) throw new Error('This browser could not turn the page into a picture.')
    return { blob, pages: doc.numPages }
  } finally {
    await task.destroy()
  }
}

/** About sixteen megapixels — generous for a quotation, survivable for a drawing. */
const MAX_PIXELS = 16_000_000
