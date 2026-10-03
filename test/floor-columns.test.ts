/**
 * The floor's lists, arranged like every other list.
 *
 * Job cards gets the whole kit: its own columns in order, columns the owner
 * adds, export. Turnaround and Line watch are readings of the job cards, so
 * they arrange and hide, show the job cards' own columns, and add none.
 */
import { describe, expect, it } from 'vitest'
import { emptyWorkspace } from '@/lib/workspace/defaults'
import {
  FIELDS_FROM, addField, removeField, resolveColumns, setHidden, setValues, visibleColumns,
} from '@/lib/workspace/fields'
import { addJob, removeJob } from '@/lib/workspace/jobs'
import { importable } from '@/lib/sheet/import'
import { parseStored } from '@/lib/workspace/storage'
import type { Workspace } from '@/lib/workspace/types'

const fresh = (): Workspace => emptyWorkspace({
  id: 'WS-1', createdAt: '2026-01-01', ownerName: 'K. Rao', contact: '', companyName: 'Indigo Threads', makes: 'Jeans',
})

/** a company with one job card and a "Line" column on the job cards */
const withLine = () => {
  const [ws, jobId] = addJob(fresh(), { no: 'ST-1', name: 'Slim-fit jeans', openedOn: '2026-09-20' })
  const { ws: w, id } = addField(ws, { entity: 'job', label: 'Line', kind: 'text' })
  return { ws: setValues(w, jobId, { [id]: 'Line 2' }), jobId, fieldId: id }
}

const keys = (ws: Workspace, entity: Parameters<typeof resolveColumns>[1]) => resolveColumns(ws, entity).map((c) => c.key)

describe('the job cards list', () => {
  it('has the columns the table draws, the card number first and always shown', () => {
    const ws = fresh()
    expect(keys(ws, 'job')).toEqual(['no', 'for', 'qty', 'dates', 'made', 'first', 'att', 'vs', 'state'])
    const hidden = setHidden(ws, 'job', 'no', true)
    expect(visibleColumns(hidden, 'job').map((c) => c.key)).toContain('no')
  })

  it('takes a column of the owner’s own, and holds its value against the card', () => {
    const { ws, jobId, fieldId } = withLine()
    expect(keys(ws, 'job')).toContain(fieldId)
    expect(ws.custom[jobId]?.[fieldId]).toBe('Line 2')
  })

  it('lets the value go with the card when the card is deleted', () => {
    const { ws, jobId } = withLine()
    expect(removeJob(ws, jobId).custom[jobId]).toBeUndefined()
  })

  it('is never imported — a card is opened on the floor', () => {
    expect(importable('job')).toBe(false)
  })
})

describe('turnaround and line watch borrow the job cards’ own columns', () => {
  it('read the job cards', () => {
    expect(FIELDS_FROM).toEqual({ turnaround: 'job', watch: 'job' })
  })

  it('show a column added on Job cards, and nothing added elsewhere', () => {
    const { ws, fieldId } = withLine()
    const { ws: w2, id: other } = addField(ws, { entity: 'product', label: 'HSN', kind: 'text' })
    for (const e of ['turnaround', 'watch'] as const) {
      expect(keys(w2, e)).toContain(fieldId)
      expect(keys(w2, e)).not.toContain(other)
    }
    expect(keys(ws, 'turnaround').slice(0, 8)).toEqual(['no', 'in', 'issue', 'out', 'wait', 'floor', 'total', 'state'])
    expect(keys(ws, 'watch').slice(0, 5)).toEqual(['no', 'qty', 'when', 'status', 'why'])
  })

  it('hide it on their own, without hiding it on Job cards', () => {
    const { ws, fieldId } = withLine()
    const hidden = setHidden(ws, 'turnaround', fieldId, true)
    expect(visibleColumns(hidden, 'turnaround').map((c) => c.key)).not.toContain(fieldId)
    expect(visibleColumns(hidden, 'job').map((c) => c.key)).toContain(fieldId)
    expect(visibleColumns(hidden, 'watch').map((c) => c.key)).toContain(fieldId)
  })

  it('lose it when it is deleted on Job cards, arrangement and all', () => {
    const { ws, fieldId } = withLine()
    const arranged = setHidden(ws, 'watch', fieldId, true)
    const gone = removeField(arranged, fieldId)
    for (const e of ['job', 'turnaround', 'watch'] as const) expect(keys(gone, e)).not.toContain(fieldId)
    expect(gone.views.watch.hidden).not.toContain(fieldId)
  })

  it('are never imported', () => {
    expect(importable('turnaround')).toBe(false)
    expect(importable('watch')).toBe(false)
  })

  it('keep their arrangement through a reload', () => {
    const { ws } = withLine()
    const arranged = setHidden(setHidden(ws, 'turnaround', 'issue', true), 'watch', 'why', true)
    const back = parseStored(JSON.stringify({ workspace: arranged, session: { actor: 'K. Rao', role: 'owner' } }))!.workspace
    expect(back.views.turnaround.hidden).toContain('issue')
    expect(back.views.watch.hidden).toContain('why')
  })
})
