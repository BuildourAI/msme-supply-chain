/**
 * Delimited text, both directions.
 *
 * Reading: a character-at-a-time parser rather than a split on commas, because
 * a supplier called "Bombay Metals, Pune" and an address with a line break in
 * it are both ordinary and both defeat a split. RFC 4180 quoting, `""` for an
 * embedded quote, and CRLF or LF line endings.
 *
 * Writing: the same rules in reverse, plus one defence that is not in the RFC —
 * see `cell` below.
 */

/** What a copy out of Google Sheets or Excel puts on the clipboard. */
export const TAB = '\t'
export const COMMA = ','
/** Excel writes this instead of a comma wherever the decimal separator is one. */
export const SEMICOLON = ';'

/**
 * Guess the delimiter from the first line.
 *
 * Pasted cells are tab-separated and a downloaded file is comma-separated, but
 * people paste the contents of a .csv too. Counting both on the header line
 * gets it right without asking, and asking about delimiters is exactly the kind
 * of question this import is trying not to put in front of anybody.
 */
export function sniffDelimiter(text: string): string {
  const line = text.split(/\r?\n/, 1)[0] ?? ''
  const count: Record<string, number> = { [TAB]: 0, [COMMA]: 0, [SEMICOLON]: 0 }
  let quoted = false
  for (const ch of line) {
    if (ch === '"') quoted = !quoted
    else if (!quoted && ch in count) count[ch] += 1
  }
  // ties go to the comma, which is the one everything can read
  const best = [TAB, SEMICOLON, COMMA].reduce((a, b) => (count[b] > count[a] ? b : a), COMMA)
  return count[best] > 0 ? best : COMMA
}

/**
 * Text out of a file the app did not write.
 *
 * Excel on a Windows machine saves "CSV" as the system code page, not UTF-8 —
 * in practice cp1252 — and decoding that as UTF-8 turns every accented letter
 * and every curly quote into a replacement character. Decoding strictly first
 * and falling back is the only way to tell the two apart, because a cp1252 byte
 * sequence is usually invalid UTF-8 and that is exactly what `fatal` reports.
 */
export function decodeText(buf: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf)
  } catch {
    return new TextDecoder('windows-1252').decode(buf)
  }
}

/** Rows of cells. Ragged rows are padded to the widest, so a header lines up. */
export function parseDelimited(text: string, delimiter = COMMA): string[][] {
  // A byte-order mark survives a download and would otherwise become part of
  // the first header, so the first column matches nothing.
  const src = text.replace(/^﻿/, '')
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false

  for (let i = 0; i < src.length; i++) {
    const ch = src[i]

    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++ }   // an escaped quote
        else quoted = false
      } else cell += ch
      continue
    }

    if (ch === '"' && cell === '') { quoted = true; continue }
    if (ch === delimiter) { row.push(cell); cell = ''; continue }
    if (ch === '\r') continue
    if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; continue }
    cell += ch
  }
  // whatever is in hand when the text runs out is a final cell, unless the file
  // simply ended with a newline
  if (cell !== '' || row.length > 0) { row.push(cell); rows.push(row) }

  const widest = rows.reduce((m, r) => Math.max(m, r.length), 0)
  return rows
    .map((r) => Array.from({ length: widest }, (_, i) => (r[i] ?? '').trim()))
    .filter((r) => r.some((c) => c !== ''))
}

/**
 * One cell, quoted when it has to be.
 *
 * The leading apostrophe is the part that is not in any spec. A cell beginning
 * `=`, `+`, `-` or `@` is run as a formula when the file is opened in Excel or
 * Sheets, so exporting a supplier called `-Alpha` hands whoever opens it
 * something executable. Prefixing a quote makes it text. It is the one place
 * this build changes a value on the way out, and it changes it to protect the
 * person who opens the file.
 */
function cell(value: string): string {
  const v = value ?? ''
  const risky = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v
  return /["\n\r,\t]/.test(risky) ? `"${risky.replace(/"/g, '""')}"` : risky
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows
    .map((r) => r.map((c) => cell(c == null ? '' : String(c))).join(COMMA))
    .join('\r\n')
}

/**
 * Hand the browser a file.
 *
 * The BOM is what makes Excel open a UTF-8 CSV as UTF-8 rather than as the
 * system code page, which is the difference between a supplier's name and
 * mojibake. Sheets and LibreOffice cope either way.
 */
export function downloadCsv(name: string, csv: string): void {
  download(name, new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
}

export function download(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoking immediately cancels the download in some browsers; a turn of the
  // event loop is enough for the click to have been taken up.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
