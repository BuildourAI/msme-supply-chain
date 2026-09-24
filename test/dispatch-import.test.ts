/**
 * Customers and carriers brought in from a sheet.
 *
 * The sheet the owner already keeps — a party list out of the accounts
 * package, a transporter list — lands as customers and carriers, with each
 * row refused for the same reasons the form would refuse it. A name is used
 * once: a repeat is left out, an existing one is updated or left alone, and
 * the whole import can be taken back.
 */
import { describe, expect, it } from 'vitest'
import {
  NEW_FIELD, applyImport, importable, namedOnce, planImport, undoImport, type DupPolicy, type Mapping,
} from '@/lib/sheet/import'
import { matchHeader } from '@/lib/sheet/match'
import { readCarrierMode, readState } from '@/lib/workspace/customers'
import { BUILTIN, valueOf } from '@/lib/workspace/fields'
import type { SheetEntity, Workspace } from '@/lib/workspace/types'
import { TODAY, bay, shop } from './dispatch-fixture'

const bring = (ws: Workspace, entity: SheetEntity, body: string[][], map: Mapping[], policy: DupPolicy = 'update') => {
  const plans = planImport(ws, entity, body, map, policy)
  return { plans, ...applyImport(ws, entity, plans, map, `${entity}s.xlsx`, TODAY) }
}

/** Party | GST No | State | Ship to | Credit days | Mobile | KM */
const PARTIES: Mapping[] = [
  { column: 0, target: 'name' }, { column: 1, target: 'gstin' }, { column: 2, target: 'state' },
  { column: 3, target: 'shipTo' }, { column: 4, target: 'terms' }, { column: 5, target: 'phone' },
  { column: 6, target: 'distance' },
]
const PARTY_ROWS = [
  ['Bharat Panels', '27AABCB1234K1Z2', '', 'Chakan MIDC, Pune', '30', '98220 11234', '150'],
  ['Deccan Retail', '', 'Karnataka', 'Peenya, Bengaluru', '45', '', '840'],
  ['Konkan Traders', '', '27', 'Ratnagiri', '', '', ''],
  ['Bad GST Co', '27ABC', '', '', '', '', ''],
  ['Nowhere Ltd', '', 'Atlantis', '', '', '', ''],
  ['bharat panels', '', '', 'A second address', '', '', ''],
]

/** Transporter | Load type | Rate per kg km | Mobile */
const TRANSPORTERS: Mapping[] = [
  { column: 0, target: 'name' }, { column: 1, target: 'mode' }, { column: 2, target: 'rate' }, { column: 3, target: 'phone' },
]

const targets = (entity: 'customer' | 'carrier') => BUILTIN[entity].filter((b) => !b.derived && b.kind)
  .map((b) => ({ key: b.key, label: b.label, aliases: b.aliases, kind: b.kind! }))

describe('reading a sheet’s words', () => {
  it('matches the headings a party list and a transporter list use', () => {
    const c = (h: string) => matchHeader(h, targets('customer'), new Set())
    expect(['Party Name', 'GST No', 'Place of supply', 'Delivery address', 'Credit days', 'Mobile', 'KM', 'Email ID'].map(c))
      .toEqual(['name', 'gstin', 'state', 'shipTo', 'terms', 'phone', 'distance', 'email'])
    const t = (h: string) => matchHeader(h, targets('carrier'), new Set())
    expect(['Transporter', 'Load type', 'Rate per kg km', 'WhatsApp'].map(t)).toEqual(['name', 'mode', 'rate', 'phone'])
    // worked-out columns are never offered to a sheet
    expect(targets('customer').some((x) => x.key === 'open')).toBe(false)
    expect(targets('carrier').some((x) => x.key === 'shipped' || x.key === 'late')).toBe(false)
  })

  it('reads a state by its name, an old name or its GST code', () => {
    expect(['maharashtra', 'Tamil Nadu', 'Orissa', 'New Delhi', '27', '7', 'J&K'].map(readState))
      .toEqual(['Maharashtra', 'Tamil Nadu', 'Odisha', 'Delhi', 'Maharashtra', 'Delhi', 'Jammu and Kashmir'])
    expect(readState('Atlantis')).toBeUndefined()
  })

  it('reads how a carrier moves goods, and does not guess', () => {
    expect(['FTL', 'Part load', 'PTL', 'own', 'Our own vehicle', 'Courier', 'express', 'other'].map(readCarrierMode))
      .toEqual(['full', 'part', 'part', 'own', 'own', 'courier', 'courier', 'other'])
    expect(readCarrierMode('rocket')).toBeUndefined()
  })
})

describe('bringing customers in', () => {
  it('adds the good rows and says why each other one was left out', () => {
    const { plans, ws } = bring(shop(), 'customer', PARTY_ROWS, PARTIES)
    expect(plans.map((p) => [p.status, p.reason ?? ''])).toEqual([
      ['new', ''], ['new', ''], ['new', ''],
      ['skip', 'That GSTIN is not in the right shape — fifteen characters, starting with the state code.'],
      ['skip', '“Atlantis” is not an Indian state or union territory'],
      ['skip', 'bharat panels is on this sheet twice — the first row is used'],
    ])
    expect(ws.customers.map((c) => c.name)).toEqual(['Bharat Panels', 'Deccan Retail', 'Konkan Traders'])
    expect(ws.customers[0]).toMatchObject({ gstin: '27AABCB1234K1Z2', state: undefined, shipTo: 'Chakan MIDC, Pune', paymentTerms: 30, phone: '98220 11234', distanceKm: 150 })
    expect(ws.customers[1]).toMatchObject({ state: 'Karnataka', paymentTerms: 45, distanceKm: 840 })
    expect(ws.customers[2]).toMatchObject({ state: 'Maharashtra', paymentTerms: undefined })
  })

  it('updates an existing customer from the cells that are filled, or leaves it alone', () => {
    const base = bay() // Bharat Panels and Deccan Retail already on the list
    const sheet = [['BHARAT PANELS', '', '', 'Gate 3, Chakan', '60', '', ''], ['Western Steel', '', 'Gujarat', '', '', '', '']]
    const kept = bring(base, 'customer', sheet, PARTIES, 'skip')
    expect(kept.plans.map((p) => [p.status, p.reason ?? ''])).toEqual([['skip', 'Bharat Panels is already here'], ['new', '']])
    expect(kept.ws.customers[0]).toEqual(base.customers[0])

    const changed = bring(base, 'customer', sheet, PARTIES, 'update')
    expect(changed.plans.map((p) => p.status)).toEqual(['update', 'new'])
    expect(changed.ws.customers[0]).toMatchObject({
      name: 'Bharat Panels', gstin: '27AABCB1234K1Z2', shipTo: 'Gate 3, Chakan', paymentTerms: 60, distanceKm: 150, phone: '98220 11234',
    })
  })

  it('takes a column it does not know as a custom column', () => {
    const map: Mapping[] = [{ column: 0, target: 'name' }, { column: 1, target: NEW_FIELD, create: { label: 'Sales person', kind: 'text' } }]
    const { ws } = bring(shop(), 'customer', [['Bharat Panels', 'Anita']], map)
    const field = ws.fields.find((f) => f.entity === 'customer' && f.label === 'Sales person')!
    expect(valueOf(ws, ws.customers[0].id, field.id)).toBe('Anita')
  })

  it('is undone whole: added ones go, changed ones come back', () => {
    const base = bay()
    const { ws } = bring(base, 'customer', [['Bharat Panels', '', '', 'Gate 3', '', '', ''], ['Western Steel', '', '', '', '', '', '']], PARTIES)
    expect(ws.customers).toHaveLength(3)
    const back = undoImport(ws)
    expect(back.customers).toEqual(base.customers)
    expect(back.lastImport).toBeUndefined()
  })
})

describe('bringing carriers in', () => {
  it('reads the load type, defaults a blank one to part load, and leaves out a word it cannot read', () => {
    const { plans, ws } = bring(shop(), 'carrier', [
      ['VRL Logistics', 'PTL', '0.05', '98450 22110'],
      ['Gati', 'FTL', '', ''],
      ['Company tempo', 'own', '', ''],
      ['Blue Dart', '', '', ''],
      ['Rocket Co', 'rocket', '', ''],
      ['Safe Express', 'Part load', 'a lot', ''],
    ], TRANSPORTERS)
    expect(plans.map((p) => p.status)).toEqual(['new', 'new', 'new', 'new', 'skip', 'skip'])
    expect(plans[4].reason).toBe('“rocket” is not own vehicle, part load, full truck, courier or other')
    expect(plans[5].reason).toMatch(/is not a number/)
    expect(ws.carriers.map((c) => [c.name, c.mode, c.ratePerKgKm ?? null, c.phone ?? null])).toEqual([
      ['VRL Logistics', 'part', 0.05, '98450 22110'],
      ['Gati', 'full', null, null],
      ['Company tempo', 'own', null, null],
      ['Blue Dart', 'part', null, null],
    ])
  })

  it('updates an existing carrier, keeping its mode when the sheet has none', () => {
    const base = bay() // VRL Logistics part load at 0.05; Our own vehicle
    const { plans, ws } = bring(base, 'carrier', [['vrl logistics', '', '0.06', '']], TRANSPORTERS)
    expect(plans[0].status).toBe('update')
    expect(ws.carriers[0]).toMatchObject({ name: 'VRL Logistics', mode: 'part', ratePerKgKm: 0.06 })
    expect(undoImport(ws).carriers).toEqual(base.carriers)
  })
})

describe('which lists a sheet can fill', () => {
  it('opens customers and carriers, and keeps records of things that happened closed', () => {
    expect(importable('customer')).toBe(true)
    expect(importable('carrier')).toBe(true)
    for (const e of ['salesOrder', 'dispatchNote', 'consignment', 'rma', 'product', 'output', 'halt'] as SheetEntity[]) {
      expect(importable(e)).toBe(false)
    }
    // a name used once is updated or left alone, never added twice
    expect([namedOnce('customer'), namedOnce('carrier'), namedOnce('supplier')]).toEqual([true, true, false])
  })
})
