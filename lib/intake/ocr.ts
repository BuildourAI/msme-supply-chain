/**
 * Reading a photograph of a quotation.
 *
 * The case this exists for is the one the sample company calls the point of the
 * whole module: three of its fourteen documents are photographs sent to a
 * WhatsApp number, "and in every factory in the source set that is where the
 * price history goes to die."
 *
 * Two things are said plainly rather than buried.
 *
 * It runs on the device. tesseract.js would otherwise fetch its wasm and its
 * language data from a CDN at the moment somebody uploads a picture of their
 * supplier's prices; every path here points at our own origin instead, copied
 * there by `scripts/ocr-assets.mjs`. Nothing about the photograph leaves the
 * browser, and the screen says so while it works.
 *
 * And it is the least certain thing in this feature. A printed quotation comes
 * back well; a hand-filled pad photographed at an angle comes back as confident
 * nonsense. Which is why every line it produces lands in an editable table
 * below a confidence bar, why a low mean confidence puts a sentence on the
 * screen, and why "type the lines in myself" sits beside the picker rather than
 * behind a failure.
 */
import { cellsToRows, type TextCell } from './pdf'

/** Where `scripts/ocr-assets.mjs` puts everything. Same origin, always. */
const BASE = '/ocr'

/** Below this the owner is told the photograph was hard to read. */
export const SHAKY = 0.6

let checked: Promise<boolean> | null = null

/**
 * Whether the assets are actually there.
 *
 * A build that skipped the copy step, or a deployment that dropped it, must not
 * produce a spinner that never ends. Asked once and remembered.
 */
export function ocrAvailable(): Promise<boolean> {
  checked ??= (async () => {
    if (typeof fetch === 'undefined') return false
    try {
      const r = await fetch(`${BASE}/eng.traineddata.gz`, { method: 'HEAD' })
      return r.ok
    } catch {
      return false
    }
  })()
  return checked
}

interface Word {
  text: string
  confidence: number
  bbox: { x0: number; y0: number; x1: number; y1: number }
}

/**
 * A photograph, as rows.
 *
 * Positions come back as bounding boxes measured downwards from the top, which
 * is the convention `cellsToRows` already reads — so a photograph and a PDF
 * turn into a table through exactly the same code, and there is one set of
 * grouping rules to get right rather than two.
 */
export async function readImage(
  file: Blob,
  onProgress?: (pct: number) => void,
): Promise<{ rows: string[][]; confidence: number }> {
  if (!(await ocrAvailable())) {
    throw new Error(
      'Reading a photograph is not set up on this server. You can still type the lines in yourself.',
    )
  }

  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('eng', 1, {
    corePath: BASE,
    workerPath: `${BASE}/worker.min.js`,
    langPath: BASE,
    logger: (m: { status?: string; progress?: number }) => {
      if (typeof m.progress === 'number') onProgress?.(Math.round(m.progress * 100))
    },
  })

  try {
    const { data } = await worker.recognize(file, {}, { blocks: true })
    const words = wordsOf(data)
    const cells: TextCell[] = words
      .filter((w) => w.text.trim() !== '')
      .map((w) => ({
        s: w.text,
        x: w.bbox.x0,
        y: w.bbox.y0,
        w: w.bbox.x1 - w.bbox.x0,
        h: Math.max(w.bbox.y1 - w.bbox.y0, 1),
      }))

    return {
      rows: cellsToRows(cells),
      // tesseract reports 0–100; everything else in this build talks in 0–1
      confidence: typeof data.confidence === 'number' ? data.confidence / 100 : 0,
    }
  } finally {
    // the worker holds the whole model in memory until this runs
    await worker.terminate()
  }
}

/**
 * The words, wherever this version of tesseract put them.
 *
 * v5 onwards returns them nested under blocks and paragraphs and only when
 * asked; older shapes put a flat `words` array on the result. Reading both
 * costs a dozen lines and saves a silent empty read on a version bump.
 */
function wordsOf(data: unknown): Word[] {
  const d = data as { words?: Word[]; blocks?: unknown[] }
  if (Array.isArray(d.words) && d.words.length > 0) return d.words

  const out: Word[] = []
  for (const block of (d.blocks ?? []) as { paragraphs?: unknown[] }[]) {
    for (const para of (block.paragraphs ?? []) as { lines?: unknown[] }[]) {
      for (const line of (para.lines ?? []) as { words?: Word[] }[]) {
        out.push(...(line.words ?? []))
      }
    }
  }
  return out
}
