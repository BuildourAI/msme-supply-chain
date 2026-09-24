/**
 * One word, one thing.
 *
 * An order is a purchase order or a sales order, never the work on the floor;
 * that is a style or a job card, and when it is made for a sales order it
 * names the line. What goes to a customer is a delivery challan, numbered as
 * the paper is. Saved workspaces read the new way without anything lost.
 */
import { describe, expect, it } from 'vitest'
import { raiseNote, type NoteInput } from '@/lib/workspace/dispatch-notes'
import {
  DEFAULT_PREFIX, JOB_WORD, addJob, closeJob, jobWord, nextJobNo, readJobNumbering, setJobNumbering,
} from '@/lib/workspace/jobs'
import { planJob } from '@/lib/workspace/plan'
import { addProduct } from '@/lib/workspace/products'
import {
  addOrder, cancelOrder, linesMadeOn, linkableLines, madeForProblem, madeForText, salesLineLabel, setMadeFor,
} from '@/lib/workspace/sales'
import { parseStored } from '@/lib/workspace/storage'
import { dispatchNav, inventoryNav } from '@/lib/workspace/reveal'
import { DISPATCH_STEPS } from '@/lib/workspace/checklist'
import type { Workspace } from '@/lib/workspace/types'
import { TODAY, bay, booked, line } from './dispatch-fixture'

const stored = (ws: Workspace) =>
  parseStored(JSON.stringify({ workspace: ws, session: { actor: 'R. Mehta', role: 'owner' } }))!.workspace

describe('the work on the floor is a style or a job card', () => {
  it('offers the two words, and a job card is JC', () => {
    expect(Object.keys(JOB_WORD).sort()).toEqual(['job', 'style'])
    expect(JOB_WORD.job).toEqual({ one: 'job card', many: 'job cards' })
    expect(DEFAULT_PREFIX.job).toBe('JC')
    const ws = setJobNumbering(bay(), { word: 'job', prefix: '' })
    expect(nextJobNo(ws)).toBe('JC-1')
    expect(jobWord(ws).one).toBe('job card')
  })

  it('reads a saved "customer\'s order" as a job card, keeping its numbers', () => {
    expect(readJobNumbering({ word: 'order', prefix: 'ORD' })).toEqual({ word: 'job', prefix: 'ORD' })
    expect(readJobNumbering({ word: 'style', prefix: 'ST' })).toEqual({ word: 'style', prefix: 'ST' })
    expect(readJobNumbering({ word: 'job', prefix: 'JOB' })).toEqual({ word: 'job', prefix: 'JOB' })
    expect(readJobNumbering(undefined)).toBeUndefined()
    let old = { ...bay(), jobNumbering: { word: 'order', prefix: 'ORD' } } as unknown as Workspace
    ;[old] = addJob(old, { no: 'ORD-1', openedOn: '2026-09-15' })
    const back = stored(old)
    expect(back.jobNumbering).toEqual({ word: 'job', prefix: 'ORD' })
    expect(jobWord(back).one).toBe('job card')
    expect(nextJobNo(back)).toBe('ORD-2')
  })
})

describe('a style made for a sales order names its line', () => {
  /** SO-1 to Bharat (100), SO-2 to Deccan (200); ST-1 planned for the jeans, ST-2 opened and not planned */
  const two = () => {
    let ws = booked(0)
    ;[ws] = addJob(ws, { no: 'ST-2', openedOn: TODAY })
    return ws
  }

  it('offers the open lines nothing else is made on, in words a person can pick from', () => {
    const lines = linkableLines(two(), 'JB-002')
    expect(lines.map(salesLineLabel)).toEqual([
      'SO-1 · Bharat Panels · Slim-fit jeans × 100',
      'SO-2 · Deccan Retail · Slim-fit jeans × 200',
    ])
  })

  it('makes it for a line, and moves it to another', () => {
    let ws = setMadeFor(two(), 'JB-002', undefined, 'SO-001/1')
    expect(linesMadeOn(ws, 'JB-002').map((r) => r.order.no)).toEqual(['SO-1'])
    expect(madeForText(ws, ws.jobs.find((j) => j.id === 'JB-002')!)).toBe('SO-1 · Bharat Panels')
    // the line is taken now — nothing else is offered it
    expect(linkableLines(ws, 'JB-001').map((r) => r.line.id)).toEqual(['SO-002/1'])
    expect(madeForProblem(ws, 'JB-001', 'SO-001/1')).toMatch(/nothing else is being made for/)
    ws = setMadeFor(ws, 'JB-002', 'SO-001/1', 'SO-002/1')
    expect(linesMadeOn(ws, 'JB-002').map((r) => r.order.no)).toEqual(['SO-2'])
    expect(ws.customerOrders[0].lines[0].jobId).toBeUndefined()
    // and back to stock
    ws = setMadeFor(ws, 'JB-002', 'SO-002/1', '')
    expect(linesMadeOn(ws, 'JB-002')).toEqual([])
  })

  it('offers only what a planned style makes, and nothing on a cancelled order', () => {
    let ws = two()
    ;[ws] = addOrder(ws, { customerId: 'CU-001', takenOn: TODAY, promisedDate: '2026-10-10', lines: [line(50, 900)] })
    ws = cancelOrder(ws, ws.customerOrders[2].id)
    expect(linkableLines(ws, 'JB-002').map((r) => r.order.no)).toEqual(['SO-1', 'SO-2'])
    // planned for shorts, it is offered no jeans
    ;[ws] = addProduct(ws, { name: 'Cargo shorts', uom: 'nos', bom: [] })
    ws = planJob(ws, 'JB-002', { productId: 'PR-002', qty: 10, plannedStart: TODAY, plannedFinish: '2026-10-01' })
    expect(ws.jobs.find((j) => j.id === 'JB-002')!.productId).toBe('PR-002')
    expect(linkableLines(ws, 'JB-002')).toEqual([])
  })

  it('shows what was typed on one opened before, and nothing for stock', () => {
    let ws = two()
    ;[ws] = addJob(ws, { no: 'ST-3', customer: 'Walk-in buyer', openedOn: TODAY })
    expect(madeForText(ws, ws.jobs.find((j) => j.no === 'ST-3')!)).toBe('Walk-in buyer')
    expect(madeForText(ws, ws.jobs.find((j) => j.no === 'ST-2')!)).toBe('')
    ws = closeJob(ws, 'JB-002', TODAY)
    expect(linkableLines(ws).length).toBe(2)
  })
})

describe('what goes to a customer is a delivery challan', () => {
  const note = (over: Partial<NoteInput> = {}): NoteInput => ({
    orderId: 'SO-001', on: TODAY, lines: [{ productId: 'PR-001', qty: 20 }],
    weightKg: 20, authorisedBy: 'R. Mehta', actor: 'K. Rao', ...over,
  })

  it('is numbered DC, as the paper is', () => {
    const [ws, id] = raiseNote(booked(120), note(), TODAY)
    const n = ws.dispatchNotes.find((x) => x.id === id)!
    expect(n.no).toBe('DC-1')
    expect(ws.fgMoves.filter((m) => m.kind === 'despatch').map((m) => m.sourceRef)).toEqual(['DC-1'])
  })

  it('renumbers a saved dispatch note once, with the ledger lines that name it', () => {
    let [ws] = raiseNote(booked(120), note(), TODAY)
    ;[ws] = raiseNote(ws, note({ lines: [{ productId: 'PR-001', qty: 10 }] }), TODAY)
    // as it was saved before the rename
    const old: Workspace = {
      ...ws,
      dispatchNotes: ws.dispatchNotes.map((n) => ({ ...n, no: n.no.replace('DC-', 'DN-') })),
      fgMoves: ws.fgMoves.map((m) => (m.kind === 'despatch' ? { ...m, sourceRef: m.sourceRef.replace('DC-', 'DN-') } : m)),
    }
    const back = stored(old)
    expect(back.dispatchNotes.map((n) => [n.id, n.no])).toEqual([['DN-001', 'DC-1'], ['DN-002', 'DC-2']])
    expect(back.fgMoves.filter((m) => m.kind === 'despatch').map((m) => m.sourceRef)).toEqual(['DC-1', 'DC-2'])
    // the next one carries on from there
    const [next, id] = raiseNote(back, note({ lines: [{ productId: 'PR-001', qty: 5 }] }), TODAY)
    expect(next.dispatchNotes.find((n) => n.id === id)!.no).toBe('DC-3')
    // and reading it twice changes nothing
    expect(stored(back).dispatchNotes.map((n) => n.no)).toEqual(['DC-1', 'DC-2'])
  })
})

describe('the rails say where things are', () => {
  it('calls the bay\'s lists sales orders and delivery challans', () => {
    const labels = dispatchNav(bay(), TODAY).map((r) => r.label)
    expect(labels).toContain('Sales orders')
    expect(labels).toContain('Delivery challans')
    expect(labels).not.toContain('Order book')
    const first = DISPATCH_STEPS.find((s) => s.id === 'firstOrder' || /first sales order/.test(s.title))!
    expect([first.title, first.cta]).toEqual(['Your first sales order', 'New sales order'])
  })

  it('names the store\'s two ways out by where the material went', () => {
    const labels = inventoryNav(bay(), TODAY).map((r) => r.label)
    expect(labels.slice(2, 4)).toEqual(['Issued to floor', 'Sent for jobwork'])
  })
})
