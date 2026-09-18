/**
 * The import layer, against a real .xlsx written by a real spreadsheet library.
 *
 * Every case below is one that silently corrupts data rather than failing
 * loudly, which is why they are pinned here rather than left to a browser
 * check: a blank cell shifting every later column one to the left looks like a
 * successful import right up until somebody reads a rate as a lead time.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseDelimited, sniffDelimiter, toCsv, COMMA, SEMICOLON, TAB } from '@/lib/sheet/csv'
import { readWorkbook } from '@/lib/sheet/xlsx'
import { looksLikeOldXls } from '@/lib/sheet/unzip'
import { splitHeader } from '@/lib/sheet/read'
import {
  choicesOf, guessKind, matchHeader, normalise, toIsoDate, toYesNo, type Target,
} from '@/lib/sheet/match'
import { parseNumber, parseUom } from '@/lib/workspace/records'

const load = (name: string) => {
  const b = readFileSync(new URL(`./fixtures/${name}`, import.meta.url))
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
}
const fixture = () => load('suppliers.xlsx')

describe('reading an .xlsx', () => {
  it('finds every tab by name, in tab-strip order', async () => {
    const wb = await readWorkbook(fixture())
    expect(wb.tabs.map((t) => t.name)).toEqual(['Suppliers', 'Materials'])
  })

  it('reads the header and every row', async () => {
    const wb = await readWorkbook(fixture())
    const rows = wb.rowsOf(wb.tabs[0].path)
    expect(rows).toHaveLength(4)
    expect(rows[0]).toEqual(['Supplier name', 'Type', 'Payment terms', 'GST number', 'Quoted on'])
  })

  it('keeps a blank cell in place instead of shifting the row left', async () => {
    /*
     * The row for Bombay Metals has no Type. An .xlsx simply omits that cell,
     * so a parser that reads cells positionally puts the payment terms in the
     * Type column and everything after it moves one to the left. Nothing about
     * that looks like a failure — it just imports the wrong numbers.
     */
    const wb = await readWorkbook(fixture())
    const rows = wb.rowsOf(wb.tabs[0].path)
    const bombay = rows.find((r) => r[0].startsWith('Bombay'))!
    expect(bombay[1]).toBe('')
    expect(bombay[2]).toBe('45')
    expect(bombay[3]).toBe('27AAACB2894G1ZZ')
  })

  it('decodes entities rather than printing them', async () => {
    const wb = await readWorkbook(fixture())
    const rows = wb.rowsOf(wb.tabs[0].path)
    expect(rows.some((r) => r[0] === 'Bombay Metals & Alloys')).toBe(true)
    expect(rows.some((r) => r[0].includes('&amp;'))).toBe(false)
  })

  it('keeps a comma inside a name', async () => {
    const wb = await readWorkbook(fixture())
    const rows = wb.rowsOf(wb.tabs[0].path)
    expect(rows.some((r) => r[0] === 'Nirmal Enterprises, Pune')).toBe(true)
  })

  it('reads an ISO date cell as a date rather than a timestamp', async () => {
    // the spec allows t="d" with an ISO 8601 string, which several writers use
    const wb = await readWorkbook(fixture())
    const rows = wb.rowsOf(wb.tabs[0].path)
    expect(rows[1][4]).toBe('2026-10-15')
    expect(rows[2][4]).toBe('2026-01-01')
    expect(rows[3][4]).toBe('2026-03-03')
  })

  it("reads Excel's own day count as a date, not a five-digit number", async () => {
    /*
     * This is how Excel itself stores a date: a serial number whose only clue
     * is a style pointing at a date format. Without walking styles.xml the
     * whole column imports as "46310", which looks like a quantity.
     */
    const wb = await readWorkbook(load('serial-dates.xlsx'))
    const rows = wb.rowsOf(wb.tabs[0].path)
    expect(rows[1]).toEqual(['Copper strip 25 mm', 'Kgs', '2026-10-15'])
    expect(rows[2][2]).toBe('2026-01-01')
  })

  it('leaves a GST number as text', async () => {
    const wb = await readWorkbook(fixture())
    const rows = wb.rowsOf(wb.tabs[0].path)
    expect(rows[1][3]).toBe('27AABCS1429B1ZX')
  })

  it('reads a tab other than the first', async () => {
    const wb = await readWorkbook(fixture())
    expect(wb.rowsOf(wb.tabs[1].path)[1]).toEqual(['Copper strip', 'Kgs'])
  })

  it('refuses a file that is not a spreadsheet, with a usable message', async () => {
    const junk = new TextEncoder().encode('this is not a spreadsheet at all').buffer
    await expect(readWorkbook(junk as ArrayBuffer)).rejects.toThrow(/does not look like/i)
  })

  it('recognises the old binary .xls by its magic, not its name', () => {
    const old = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]).buffer
    expect(looksLikeOldXls(old)).toBe(true)
    expect(looksLikeOldXls(new Uint8Array([0x50, 0x4b, 3, 4, 0, 0, 0, 0]).buffer)).toBe(false)
  })
})

describe('delimited text', () => {
  it('keeps a comma that is inside quotes', () => {
    const rows = parseDelimited('Name,Terms\r\n"Nirmal, Pune",30\r\n')
    expect(rows[1]).toEqual(['Nirmal, Pune', '30'])
  })

  it('handles an escaped quote and a newline inside a field', () => {
    const rows = parseDelimited('Name,Note\n"He said ""yes""","Line one\nLine two"\n')
    expect(rows[1][0]).toBe('He said "yes"')
    expect(rows[1][1]).toBe('Line one\nLine two')
  })

  it('drops a byte-order mark so the first column still matches', () => {
    const rows = parseDelimited('﻿Supplier name,Terms\nShah,30')
    expect(rows[0][0]).toBe('Supplier name')
  })

  it('sniffs tabs, semicolons and commas', () => {
    expect(sniffDelimiter('a\tb\tc')).toBe(TAB)
    expect(sniffDelimiter('a;b;c')).toBe(SEMICOLON)
    expect(sniffDelimiter('a,b,c')).toBe(COMMA)
    // a comma inside a quoted header must not win the count
    expect(sniffDelimiter('"Metals, Pune"\tTerms')).toBe(TAB)
    expect(sniffDelimiter('single')).toBe(COMMA)
  })

  it('pads a ragged row so the header still lines up', () => {
    const rows = parseDelimited('a,b,c\n1,2\n')
    expect(rows[1]).toEqual(['1', '2', ''])
  })

  it('writes back what it read', () => {
    const csv = toCsv([['Name', 'Note'], ['Nirmal, Pune', 'He said "yes"']])
    expect(parseDelimited(csv)[1]).toEqual(['Nirmal, Pune', 'He said "yes"'])
  })

  it('defuses a cell that a spreadsheet would run as a formula', () => {
    /*
     * A supplier called "-Alpha" or a note starting "=" is executed on open by
     * both Excel and Sheets. The leading quote makes it text again, and is the
     * one thing this build changes on the way out.
     */
    const csv = toCsv([['Name'], ['=cmd|x'], ['-Alpha'], ['+1'], ['@here']])
    for (const line of csv.split('\r\n').slice(1)) expect(line.startsWith("'")).toBe(true)
    expect(csv).not.toMatch(/\n=cmd/)
  })

  it('names the header row and keeps unnamed columns apart', () => {
    const { header, body } = splitHeader([['Name', '', 'Terms'], ['Shah', 'x', '30']])
    expect(header).toEqual(['Name', 'Column 2', 'Terms'])
    expect(body).toHaveLength(1)
  })
})

describe('matching a column to a field', () => {
  const targets: Target[] = [
    { key: 'name', label: 'Supplier', kind: 'text', aliases: ['supplier name', 'vendor'] },
    { key: 'terms', label: 'Payment', kind: 'number', aliases: ['payment terms', 'credit days'] },
    { key: 'lead', label: 'Lead time', kind: 'number' },
  ]

  it('ignores punctuation and case', () => {
    expect(normalise('GST No.')).toBe('gstno')
    expect(matchHeader('supplier_name', targets, new Set())).toBe('name')
    expect(matchHeader('Payment Terms', targets, new Set())).toBe('terms')
  })

  it('will not match the same field twice', () => {
    expect(matchHeader('Vendor', targets, new Set(['name']))).toBeNull()
  })

  it('leaves an unknown header alone', () => {
    expect(matchHeader('GST number', targets, new Set())).toBeNull()
  })

  it('takes an exact match even where something else also contains it', () => {
    const both: Target[] = [
      { key: 'a', label: 'Lead time', kind: 'number' },
      { key: 'b', label: 'Time', kind: 'number' },
    ]
    expect(matchHeader('time', both, new Set())).toBe('b')
  })

  it('refuses to guess when two fields fit equally loosely', () => {
    // neither is exact and both contain the header, so the person chooses —
    // a wrong match that looks right is only found later, in the data
    const ambiguous: Target[] = [
      { key: 'a', label: 'Lead time days', kind: 'number' },
      { key: 'b', label: 'Payment time days', kind: 'number' },
    ]
    expect(matchHeader('time days', ambiguous, new Set())).toBeNull()
  })
})

describe('guessing what a column holds', () => {
  it('reads a repeated short vocabulary as a choice', () => {
    expect(guessKind(['Mill', 'Trader', 'Mill', 'Trader', 'Mill'])).toBe('choice')
    expect(choicesOf(['Mill', 'Trader', 'mill', ''])).toEqual(['Mill', 'Trader'])
  })

  it('does not call five different values a choice', () => {
    expect(guessKind(['Pune', 'Nashik', 'Surat', 'Indore', 'Kolhapur'])).toBe('text')
  })

  it('recognises numbers, dates and yes/no', () => {
    expect(guessKind(['30', '45', '1,200'])).toBe('number')
    expect(guessKind(['2026-10-15', '2026-01-01'])).toBe('date')
    expect(guessKind(['Yes', 'no', 'Y'])).toBe('yesno')
  })

  it('ignores blanks rather than counting them against a guess', () => {
    expect(guessKind(['30', '', '45', ''])).toBe('number')
    expect(guessKind(['', ''])).toBe('text')
  })
})

describe('normalising a value on the way in', () => {
  it('reads a date written day-first', () => {
    expect(toIsoDate('15/10/2026')).toBe('2026-10-15')
    expect(toIsoDate('2026-10-15')).toBe('2026-10-15')
    expect(toIsoDate('3.4.26')).toBe('2026-04-03')
  })

  it('rejects a date that does not exist', () => {
    expect(toIsoDate('31/02/2026')).toBeNull()
    expect(toIsoDate('not a date')).toBeNull()
  })

  it('reads Indian digit grouping and a currency symbol', () => {
    expect(parseNumber('1,20,000')).toBe(120000)
    expect(parseNumber('₹1,200')).toBe(1200)
    expect(parseNumber(' 45 ')).toBe(45)
  })

  it('refuses a figure it would have to guess at', () => {
    // a range or an annotation is ambiguous, and a wrong rate is worse than a
    // row that stops and says why
    expect(parseNumber('1200-1400')).toBeNull()
    expect(parseNumber('1200 approx')).toBeNull()
    expect(parseNumber('')).toBeNull()
  })

  it('translates the units people actually write', () => {
    expect(parseUom('Kgs')).toBe('kg')
    expect(parseUom('MT')).toBe('MT')
    expect(parseUom('tonnes')).toBe('MT')
    expect(parseUom('Nos.')).toBe('nos')
    expect(parseUom('pcs')).toBe('nos')
    expect(parseUom('Mtr')).toBe('m')
  })

  it('refuses a unit it cannot place rather than guessing', () => {
    // guessing between MT and m on a material bought by the tonne is a
    // thousand-fold error in every figure downstream
    expect(parseUom('drums')).toBeNull()
    expect(parseUom('')).toBeNull()
  })

  it('reads yes and no in the forms a sheet uses', () => {
    expect(toYesNo('TRUE')).toBe('Yes')
    expect(toYesNo('1')).toBe('Yes')
    expect(toYesNo('n')).toBe('No')
    expect(toYesNo('maybe')).toBeNull()
  })
})
