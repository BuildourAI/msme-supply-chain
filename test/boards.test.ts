/**
 * What a dashboard shows beyond its figures, and the owner's choice of it.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  HEADLINES, PICTURES, SECTIONS, hiddenOn, pictureSpans, readBoardHidden, setHiddenOn, shownPictures, shows, type Board,
} from '@/lib/workspace/boards'
import { emptyWorkspace } from '@/lib/workspace/defaults'
import { parseStored } from '@/lib/workspace/storage'
import type { Workspace } from '@/lib/workspace/types'

const fresh = (): Workspace => emptyWorkspace({
  id: 'WS-1', createdAt: '2026-01-01', ownerName: 'K. Rao', contact: '', companyName: 'Indigo Threads', makes: 'Jeans',
})
const DESKS: Board[] = ['sourcing', 'inbound', 'inventory', 'production', 'dispatch']
const src = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8')
const charts = (code: string) => [...code.matchAll(/<OwnerCard chart="(\w+)"/g)].map((m) => m[1])

describe('every picture a dashboard draws can be chosen', () => {
  it('lists, for each desk, exactly the four pictures its dashboard draws, in order', () => {
    const code = src('components/desk/StagePictures.tsx')
    for (const board of DESKS) {
      const name = board[0].toUpperCase() + board.slice(1)
      const from = code.indexOf(`export function ${name}Pictures`)
      const to = code.indexOf(`export function ${name}Strip`)
      expect(charts(code.slice(from, to))).toEqual(PICTURES[board].map((p) => p.key))
    }
  })

  it('lists the Welcome page’s six, in order', () => {
    expect(charts(src('components/onboard/Gist.tsx'))).toEqual(PICTURES.welcome.map((p) => p.key))
  })

  it('offers each desk its strip and its recent list, and the Welcome page its goals and activity', () => {
    for (const board of DESKS) expect(SECTIONS[board].map((s) => s.key)).toEqual(['strip', 'recent'])
    expect(SECTIONS.welcome.map((s) => s.key)).toEqual(['goals', 'activity'])
    expect([...HEADLINES]).toEqual(['orderBook', 'dispatchedValue', 'onOrder', 'stockValue', 'atJobworkers'])
  })

  it('says what fills each one', () => {
    for (const board of Object.keys(PICTURES) as Board[]) {
      for (const p of [...PICTURES[board], ...SECTIONS[board]]) expect(p.what.length).toBeGreaterThan(20)
    }
  })
})

describe('the owner’s choice', () => {
  it('shows everything until something is switched off', () => {
    const ws = fresh()
    expect(ws.boardHidden).toBeUndefined()
    for (const board of Object.keys(PICTURES) as Board[]) {
      expect(shownPictures(ws, board)).toEqual(PICTURES[board])
      expect(shows(ws, board, 'recent')).toBe(true)
    }
  })

  it('keeps each dashboard’s choice to itself', () => {
    const ws = setHiddenOn(fresh(), 'dispatch', ['promise', 'strip'])
    expect(shows(ws, 'dispatch', 'promise')).toBe(false)
    expect(shows(ws, 'welcome', 'promise')).toBe(true)
    expect(shownPictures(ws, 'dispatch').map((p) => p.key)).toEqual(['road', 'customers', 'shelf'])
    expect(shows(ws, 'dispatch', 'strip')).toBe(false)
  })

  it('takes a money tile off the Welcome page like a picture', () => {
    const ws = setHiddenOn(fresh(), 'welcome', ['atJobworkers', 'goals'])
    expect([...hiddenOn(ws, 'welcome')]).toEqual(['atJobworkers', 'goals'])
  })

  it('drops what the dashboard does not have, and leaves nothing behind when all is back on', () => {
    const ws = setHiddenOn(fresh(), 'sourcing', ['orders', 'no-such-picture', 'atJobworkers'])
    expect(ws.boardHidden).toEqual({ sourcing: ['orders'] })
    expect(setHiddenOn(ws, 'sourcing', []).boardHidden).toBeUndefined()
  })

  it('survives a reload, and a stored list that makes no sense is read as nothing', () => {
    const ws = setHiddenOn(setHiddenOn(fresh(), 'inventory', ['loss']), 'welcome', ['spend', 'onOrder'])
    const back = parseStored(JSON.stringify({ workspace: ws, session: { actor: 'K. Rao', role: 'owner' } }))!.workspace
    expect(back.boardHidden).toEqual({ inventory: ['loss'], welcome: ['onOrder', 'spend'] })
    expect(readBoardHidden({ inventory: 'loss', nowhere: ['x'], dispatch: [3, 'road', 'gone'] })).toEqual({ dispatch: ['road'] })
    expect(readBoardHidden(null)).toBeUndefined()
  })
})

describe('the page closes up round what is left', () => {
  it('on a desk, an odd picture out takes the whole row', () => {
    expect(pictureSpans('production', ['plan', 'weekly', 'halts', 'firstpass'])).toEqual({ plan: '', weekly: '', halts: '', firstpass: '' })
    expect(pictureSpans('production', ['plan', 'weekly', 'halts'])).toEqual({ plan: '', weekly: '', halts: 'md:col-span-2' })
    expect(pictureSpans('production', ['weekly'])).toEqual({ weekly: 'md:col-span-2' })
  })

  it('on the Welcome page, three to a row on a laptop, and a short last row shares the width', () => {
    const six = PICTURES.welcome.map((p) => p.key)
    const spans = (n: number) => Object.values(pictureSpans('welcome', six.slice(0, n)))
    expect(spans(6)).toEqual(Array(6).fill('xl:col-span-2'))
    expect(spans(4)).toEqual(Array(4).fill('xl:col-span-3'))
    expect(spans(5)).toEqual(['xl:col-span-2', 'xl:col-span-2', 'xl:col-span-2', 'xl:col-span-3', 'sm:col-span-2 xl:col-span-3'])
    expect(spans(1)).toEqual(['sm:col-span-2 xl:col-span-6'])
  })
})
