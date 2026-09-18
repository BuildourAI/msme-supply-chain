/**
 * One way in, whatever the person had to hand.
 *
 * A file they picked, a file they dropped, or a block of cells they copied out
 * of Google Sheets. The last of those matters more than it looks: Sheets has no
 * download this build can reach across the network, and telling somebody to
 * export, find the file and upload it is three steps where copy-and-paste is
 * one. Pasting cells gives tab-separated text, which is a format already.
 */
import { decodeText, parseDelimited, sniffDelimiter } from './csv'
import { readWorkbook, type SheetTab } from './xlsx'

export interface Sheet {
  /** what to call it on screen — the file name, or "Pasted" */
  source: string
  tabs: SheetTab[]
  /** which tab is being read; only ever more than one for .xlsx */
  tab: string
  rows: string[][]
  /** re-read the same workbook at another tab */
  switchTab?: (path: string) => Sheet
}

const PASTED: SheetTab[] = [{ name: 'Pasted', path: 'pasted' }]

export function readPasted(text: string): Sheet {
  const rows = parseDelimited(text, sniffDelimiter(text))
  if (rows.length === 0) throw new Error('There was nothing in what you pasted.')
  return { source: 'Pasted', tabs: PASTED, tab: 'pasted', rows }
}

export async function readFile(file: File): Promise<Sheet> {
  const name = file.name
  const lower = name.toLowerCase()

  if (lower.endsWith('.xlsx') || lower.endsWith('.xlsm')) {
    const wb = await readWorkbook(await file.arrayBuffer())
    const at = (path: string): Sheet => ({
      source: name,
      tabs: wb.tabs,
      tab: path,
      rows: wb.rowsOf(path),
      switchTab: at,
    })
    return at(wb.tabs[0].path)
  }

  if (lower.endsWith('.csv') || lower.endsWith('.tsv') || lower.endsWith('.txt')) {
    const text = decodeText(await file.arrayBuffer())
    const rows = parseDelimited(text, sniffDelimiter(text))
    if (rows.length === 0) throw new Error(`${name} is empty.`)
    return { source: name, tabs: [{ name, path: 'file' }], tab: 'file', rows }
  }

  /*
   * .xls is the pre-2007 binary format, and it is not .xlsx with a different
   * extension — nothing here can read it. Saying which formats DO work is more
   * use than saying this one does not.
   */
  if (lower.endsWith('.xls')) {
    throw new Error('That is the old .xls format. Open it in Excel and use Save As → .xlsx.')
  }
  throw new Error('Bring in a .xlsx or .csv file, or paste the cells straight in.')
}

/**
 * The header row and the rows under it.
 *
 * A header is assumed rather than asked about, because every sheet a person
 * keeps suppliers in has one, and the matching step shows sample values
 * underneath each column — so a sheet with no header is obvious there and can
 * be fixed by matching the columns by hand.
 */
export function splitHeader(rows: string[][]): { header: string[]; body: string[][] } {
  if (rows.length === 0) return { header: [], body: [] }
  const [head, ...rest] = rows
  // An unnamed column still needs a stable label, or two of them collide.
  const header = head.map((h, i) => (h.trim() === '' ? `Column ${i + 1}` : h.trim()))
  return { header, body: rest }
}
