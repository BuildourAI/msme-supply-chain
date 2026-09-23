/**
 * Whatever the owner uploaded, as rows.
 *
 * One door for four kinds of file. A PDF with a text layer is read properly; a
 * spreadsheet goes through the reader that already existed; a photograph — or a
 * PDF that turns out to be a photograph in a wrapper — goes to whichever reader
 * of pictures is available, and when none is, the owner is told in a sentence
 * and offered the keyboard instead.
 *
 * The last part is not a failure path bolted on. A hand-filled quotation pad
 * photographed at an angle is not reliably readable by anything, and a screen
 * that only offers to read it is a screen that fails those people completely.
 */
import { readFile } from '@/lib/sheet/read'
import { canReadPdf, readPdf } from './pdf'
import type { DocRead } from './types'

export interface ReadResult {
  rows: string[][]
  read: DocRead
  /** what the owner should know about how this was read, if anything */
  note?: string
}

/** Reads a picture. Supplied by the OCR module when it is available. */
export type ImageReader = (file: Blob, onProgress?: (pct: number) => void)
=> Promise<{ rows: string[][]; confidence: number }>

const IMAGE = /\.(png|jpe?g|webp|gif|bmp)$/i
const SHEET = /\.(xlsx|xlsm|csv|tsv|txt)$/i
const HEIC = /\.(heic|heif)$/i

/** What the picker should accept, given what this browser can do. */
export const acceptFiles = (): string =>
  `${canReadPdf() ? '.pdf,' : ''}.png,.jpg,.jpeg,.webp,.gif,.xlsx,.xlsm,.csv`

export async function readDocument(
  file: File,
  ocr?: ImageReader,
  onProgress?: (pct: number) => void,
): Promise<ReadResult> {
  const name = file.name.toLowerCase()

  /*
   * An iPhone photo. Most browsers will not decode HEIC to a canvas, so it
   * cannot be read here — and saying that is much better than running it and
   * returning nothing, which looks like a document with no prices on it.
   */
  if (HEIC.test(name)) {
    throw new Error(
      'This is an iPhone photo (HEIC), which browsers cannot open. '
      + 'Share it as a JPEG, or type the lines in yourself.',
    )
  }

  if (SHEET.test(name)) {
    const sheet = await readFile(file)
    return { rows: sheet.rows, read: 'sheet' }
  }

  if (IMAGE.test(name)) {
    if (!ocr) {
      throw new Error(
        'Reading a photograph is not available on this device. '
        + 'You can still type the lines in yourself.',
      )
    }
    const { rows, confidence } = await ocr(file, onProgress)
    return {
      rows,
      read: 'photo',
      note: confidence < 0.6
        ? 'The photograph was hard to read. Check every line before approving.'
        : undefined,
    }
  }

  if (name.endsWith('.pdf')) {
    if (!canReadPdf()) {
      throw new Error('This browser cannot open a PDF. Try a newer one, or type the lines in.')
    }
    const { rows, scanned, pages } = await readPdf(await file.arrayBuffer())

    /*
     * No text at all means every page is a picture — a scan, or a photo somebody
     * wrapped in a PDF. Nothing was read, so nothing is claimed.
     */
    if (rows.length === 0 && scanned.length > 0) {
      throw new Error(
        'This PDF is a scan rather than a document — there is no text in it to read. '
        + 'You can type the lines in yourself.',
      )
    }

    return {
      rows,
      read: 'pdf-text',
      note: scanned.length > 0
        ? `${scanned.length} of ${pages} pages are scans and could not be read.`
        : undefined,
    }
  }

  throw new Error('Upload a PDF, a photograph, or a spreadsheet.')
}
