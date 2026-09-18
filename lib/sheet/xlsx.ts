/**
 * An .xlsx, read into rows of strings.
 *
 * Everything arrives as text and stays as text. A supplier's GST number is
 * `27AABCS1429B1ZX`, a phone number has a leading zero or a `+`, and a part
 * code is `0012-A` — coercing those to numbers because they look numeric is how
 * an import quietly corrupts the thing it was asked to bring in. What numbers
 * are FOR is decided later, by the field the column was matched to.
 *
 * The one conversion made here is dates, because an Excel date is not text at
 * all — it is a day count sitting behind a number format, and handing `45951`
 * to somebody who typed `15/10/2026` would be useless.
 *
 * Parsed with regexes rather than DOMParser, which does not exist in the test
 * runner. The schema this walks is small, fixed and machine-written, which is
 * the narrow case where that is a reasonable thing to do.
 */
import { unzip } from './unzip'

/** Excel's built-in number formats that mean "this is a date". */
const BUILTIN_DATE_FMT = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47])

const XML_ENTITY: Record<string, string> = {
  '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&amp;': '&',
}

/** `&amp;` last, always — undoing it first would re-decode `&amp;lt;` into `<`. */
function unescapeXml(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&(lt|gt|quot|apos|amp);/g, (m) => XML_ENTITY[m])
}

/**
 * Every `<t>` inside a chunk, joined.
 *
 * A shared string is several runs whenever any part of the cell is formatted —
 * "Shah Metals" with the first word bold is two `<r>` elements — so taking the
 * first `<t>` silently truncates. Phonetic guides are dropped: they are a
 * reading aid stored alongside the text, not part of it.
 */
const textOf = (xml: string) =>
  [...xml.replace(/<rPh[\s\S]*?<\/rPh>/g, '').matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)]
    .map((m) => unescapeXml(m[1])).join('')

/** `C` → 2. The digits are the row, and are not part of the column. */
function columnIndex(ref: string): number {
  let n = 0
  for (const ch of ref.replace(/\d+/g, '')) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

/**
 * Excel's day count, as an ISO date.
 *
 * The epoch is 1899-12-30 rather than 1900-01-01 because Excel believes 1900
 * was a leap year. Anchoring two days early is the conventional fix and lands
 * every real date — anything from 1900-03-01 on — on the right day.
 */
function serialToIso(serial: number): string {
  const ms = Date.UTC(1899, 11, 30) + Math.round(serial * 86400000)
  return new Date(ms).toISOString().slice(0, 10)
}

/** Which style indexes carry a date format, so a bare number can be read as one. */
function dateStyles(stylesXml: string): Set<number> {
  const custom = new Map<number, string>()
  for (const m of stylesXml.matchAll(/<numFmt[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)) {
    custom.set(Number(m[1]), unescapeXml(m[2]))
  }
  const block = /<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(stylesXml)?.[1] ?? ''
  const out = new Set<number>()
  let i = 0
  for (const xf of block.matchAll(/<xf\b[^>]*>/g)) {
    const id = Number(/numFmtId="(\d+)"/.exec(xf[0])?.[1] ?? 0)
    const code = custom.get(id)
    // a custom format is a date format when it positions days or years and is
    // not just an elapsed-time or a currency mask
    const looksLikeDate = code ? /[dy]/i.test(code.replace(/\[[^\]]*\]|"[^"]*"/g, '')) : false
    if (BUILTIN_DATE_FMT.has(id) || looksLikeDate) out.add(i)
    i++
  }
  return out
}

export interface SheetTab {
  name: string
  /** the part inside the archive, e.g. `xl/worksheets/sheet1.xml` */
  path: string
}

/** The tabs in the workbook, in the order the tab strip shows them. */
function tabsOf(files: Map<string, Uint8Array>, dec: TextDecoder): SheetTab[] {
  const workbook = dec.decode(files.get('xl/workbook.xml') ?? new Uint8Array())
  const rels = dec.decode(files.get('xl/_rels/workbook.xml.rels') ?? new Uint8Array())

  const target = new Map<string, string>()
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = /Id="([^"]+)"/.exec(m[0])?.[1]
    const t = /Target="([^"]+)"/.exec(m[0])?.[1]
    if (id && t) target.set(id, t.replace(/^\/?(xl\/)?/, 'xl/'))
  }

  const tabs: SheetTab[] = []
  for (const m of workbook.matchAll(/<sheet\b[^>]*>/g)) {
    const name = /name="([^"]*)"/.exec(m[0])?.[1]
    const rid = /r:id="([^"]+)"/.exec(m[0])?.[1]
    const path = rid ? target.get(rid) : undefined
    if (name && path && files.has(path)) tabs.push({ name: unescapeXml(name), path })
  }

  // A workbook with no readable relationships still has its sheet parts; fall
  // back to them rather than refusing a file that would otherwise import fine.
  if (tabs.length === 0) {
    for (const path of files.keys()) {
      if (/^xl\/worksheets\/sheet\d+\.xml$/.test(path)) {
        tabs.push({ name: `Sheet ${tabs.length + 1}`, path })
      }
    }
  }
  return tabs
}

export interface Workbook {
  tabs: SheetTab[]
  /** rows of one tab, ragged rows padded to the widest */
  rowsOf: (path: string) => string[][]
}

export async function readWorkbook(buf: ArrayBuffer): Promise<Workbook> {
  const files = await unzip(buf)
  const dec = new TextDecoder()

  const sharedXml = dec.decode(files.get('xl/sharedStrings.xml') ?? new Uint8Array())
  const shared = [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]))
  const dated = dateStyles(dec.decode(files.get('xl/styles.xml') ?? new Uint8Array()))

  const tabs = tabsOf(files, dec)
  if (tabs.length === 0) throw new Error('That .xlsx file has no sheets in it.')

  const rowsOf = (path: string): string[][] => {
    const xml = dec.decode(files.get(path) ?? new Uint8Array())
    const rows: string[][] = []
    let widest = 0

    for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells: string[] = []
      // two alternatives, because an empty cell is written self-closing
      for (const c of rowMatch[1].matchAll(/<c\b([^>]*)\/>|<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
        const attrs = c[1] ?? c[2] ?? ''
        const body = c[3] ?? ''
        const ref = /r="([A-Z]+\d+)"/.exec(attrs)?.[1]
        const type = /t="([^"]+)"/.exec(attrs)?.[1]
        const style = Number(/s="(\d+)"/.exec(attrs)?.[1] ?? -1)
        const raw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? ''

        let value: string
        if (type === 's') value = shared[Number(raw)] ?? ''
        else if (type === 'inlineStr') value = textOf(body)
        else if (type === 'b') value = raw === '1' ? 'Yes' : 'No'
        else if (type === 'e') value = ''                       // an error cell
        else if (type === 'str') value = unescapeXml(raw)        // a formula's text
        /*
         * A date can arrive two ways. Excel writes a day count behind a date
         * format, which is the `dated` branch below. The spec also allows an
         * ISO 8601 string in a `t="d"` cell, which several writers use — and
         * without this it falls through to the raw branch and imports as
         * "2026-10-15T00:00:00.000Z".
         */
        else if (type === 'd') value = unescapeXml(raw).slice(0, 10)
        else if (raw !== '' && dated.has(style) && Number.isFinite(Number(raw))) {
          value = serialToIso(Number(raw))
        } else value = unescapeXml(raw)

        const at = ref ? columnIndex(ref) : cells.length
        cells[at] = value
      }
      const dense = Array.from({ length: cells.length }, (_, i) => cells[i] ?? '')
      widest = Math.max(widest, dense.length)
      rows.push(dense)
    }
    return rows.map((r) => Array.from({ length: widest }, (_, i) => r[i] ?? ''))
  }

  return { tabs, rowsOf }
}
