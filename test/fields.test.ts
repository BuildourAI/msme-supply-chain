/**
 * Columns the owner invented, and the ways they can go wrong.
 *
 * The cases that matter most here are the leaks. A custom value keyed by record
 * id that outlives its record is not merely waste: combined with an id that
 * gets reissued, it silently hands a new supplier the deleted one's GST number,
 * and that number prints on a document sent to somebody.
 */
import { describe, expect, it } from 'vitest'
import { emptyWorkspace, issueId } from '@/lib/workspace/defaults'
import {
  BUILTIN, addField, fieldsFor, filledCount, moveColumn, pruneCustom, removeField,
  renameColumn, resolveColumns, setHidden, setValue, valueOf, visibleColumns,
} from '@/lib/workspace/fields'
import { removeItem, removeVendor } from '@/lib/workspace/sourcing'
import { buildItem, buildVendor } from '@/lib/workspace/records'
import type { Workspace } from '@/lib/workspace/types'

const blank = (): Workspace => emptyWorkspace({
  id: 'WS-T', createdAt: '2026-09-18', ownerName: 'R. Mehta', contact: '',
  companyName: 'Patel Heaters', makes: '',
})

/** a workspace with one supplier and one material, both carrying a GST field */
function seeded() {
  let ws = blank()
  const [w1, vid] = issueId(ws, 'VN')
  ws = { ...w1, vendors: [buildVendor({ id: vid, name: 'Shah Metals', paymentTermsDays: 30 })] }
  const [w2, iid] = issueId(ws, 'IT')
  ws = {
    ...w2,
    items: [buildItem(w2, {
      id: iid, name: 'Copper strip', code: 'COPP', uom: 'kg', moq: 0, daily: 10, cushionDays: 5,
    })],
  }
  const added = addField(ws, { entity: 'supplier', label: 'GST number', kind: 'text' })
  return { ws: added.ws, fieldId: added.id, vid, iid }
}

describe('adding and changing a field', () => {
  it('gives it an id and puts it on that list only', () => {
    const { ws, fieldId } = seeded()
    expect(fieldId).toBe('CF-001')
    expect(fieldsFor(ws, 'supplier').map((f) => f.label)).toEqual(['GST number'])
    expect(fieldsFor(ws, 'material')).toEqual([])
  })

  it('cannot collide with a built-in column key', () => {
    const { ws } = seeded()
    const builtinKeys = new Set(Object.values(BUILTIN).flat().map((b) => b.key))
    for (const f of ws.fields) expect(builtinKeys.has(f.id)).toBe(false)
  })

  it('keeps what was typed when the field is renamed', () => {
    let { ws, fieldId, vid } = seeded()
    ws = setValue(ws, vid, fieldId, '27AABCS1429B1ZX')
    ws = renameColumn(ws, 'supplier', fieldId, 'GSTIN')
    expect(valueOf(ws, vid, fieldId)).toBe('27AABCS1429B1ZX')
    expect(resolveColumns(ws, 'supplier').find((c) => c.key === fieldId)?.label).toBe('GSTIN')
  })

  it('counts what a delete would take before it takes it', () => {
    let { ws, fieldId, vid } = seeded()
    ws = setValue(ws, vid, fieldId, '27AABCS1429B1ZX')
    expect(filledCount(ws, fieldId)).toBe(1)

    ws = removeField(ws, fieldId)
    expect(fieldsFor(ws, 'supplier')).toEqual([])
    expect(valueOf(ws, vid, fieldId)).toBe('')
    // and the column is gone from every view, not just the one it was on
    for (const v of Object.values(ws.views)) expect(v.order).not.toContain(fieldId)
  })

  it('treats an emptied cell as absent rather than as an empty string', () => {
    let { ws, fieldId, vid } = seeded()
    ws = setValue(ws, vid, fieldId, 'x')
    ws = setValue(ws, vid, fieldId, '')
    expect(ws.custom[vid]).toBeUndefined()
    expect(valueOf(ws, vid, fieldId)).toBe('')
  })
})

describe('arranging the columns', () => {
  it('starts in the order the build declares', () => {
    const ws = blank()
    expect(resolveColumns(ws, 'supplier').map((c) => c.key).slice(0, 3))
      .toEqual(['name', 'type', 'supplies'])
  })

  it('puts a new custom column at the end, not the front', () => {
    const { ws, fieldId } = seeded()
    const keys = resolveColumns(ws, 'supplier').map((c) => c.key)
    expect(keys[keys.length - 1]).toBe(fieldId)
  })

  it('moves a column and remembers it', () => {
    let ws = blank()
    ws = moveColumn(ws, 'supplier', 'type', -1)
    expect(resolveColumns(ws, 'supplier').map((c) => c.key).slice(0, 2)).toEqual(['type', 'name'])
  })

  it('will not move a column off either end', () => {
    const ws = blank()
    const before = resolveColumns(ws, 'supplier').map((c) => c.key)
    expect(resolveColumns(moveColumn(ws, 'supplier', 'name', -1), 'supplier')
      .map((c) => c.key)).toEqual(before)
  })

  it('hides a column but never the one that names the row', () => {
    let ws = blank()
    ws = setHidden(ws, 'supplier', 'type', true)
    expect(visibleColumns(ws, 'supplier').map((c) => c.key)).not.toContain('type')

    ws = setHidden(ws, 'supplier', 'name', true)
    // the identity column survives being hidden — a row with no name is not a row
    expect(visibleColumns(ws, 'supplier').map((c) => c.key)).toContain('name')
  })

  it('shows a column the build adds later at the end, not jammed to the front', () => {
    /*
     * Somebody arranges their table today; a release adds a column tomorrow.
     * Looking the key up in a stored order returns -1, and sorting on that puts
     * the new column before everything the person arranged.
     */
    let ws = blank()
    ws = moveColumn(ws, 'supplier', 'terms', -1)
    const stored = ws.views.supplier.order.filter((k) => k !== 'phone' && k !== 'email')
    ws = { ...ws, views: { ...ws.views, supplier: { ...ws.views.supplier, order: stored } } }

    const keys = resolveColumns(ws, 'supplier').map((c) => c.key)
    expect(keys.indexOf('phone')).toBeGreaterThan(keys.indexOf('name'))
    expect(keys[0]).toBe('name')
  })

  it('forgets a rename that puts the built-in name back', () => {
    let ws = blank()
    ws = renameColumn(ws, 'supplier', 'terms', 'Credit days')
    expect(ws.views.supplier.labels.terms).toBe('Credit days')
    ws = renameColumn(ws, 'supplier', 'terms', 'Payment')
    expect(ws.views.supplier.labels.terms).toBeUndefined()
  })

  it('keeps phone and email out of the way until one is filled in', () => {
    const ws = blank()
    expect(visibleColumns(ws, 'supplier').map((c) => c.key)).not.toContain('phone')

    const withPhone = { ...ws, vendorContact: { 'VN-001': { phone: '+919820011234' } } }
    expect(visibleColumns(withPhone, 'supplier').map((c) => c.key)).toContain('phone')
  })
})

describe('values do not outlive their record', () => {
  it('drops a supplier’s custom values, contact and send log with the supplier', () => {
    let { ws, fieldId, vid } = seeded()
    ws = setValue(ws, vid, fieldId, '27AABCS1429B1ZX')
    ws = {
      ...ws,
      vendorContact: { [vid]: { phone: '+919820011234' } },
      sendLog: [{ rfqId: 'RF-001', vendorId: vid, via: 'whatsapp', at: '2026-09-18' }],
    }

    ws = removeVendor(ws, vid)
    expect(ws.custom[vid]).toBeUndefined()
    expect(ws.vendorContact[vid]).toBeUndefined()
    expect(ws.sendLog).toHaveLength(0)
  })

  it('drops the values of a request that a material deletion took with it', () => {
    /*
     * The transitive case. Deleting a material also deletes its requests, so a
     * cleanup that only looked at the material id would leave every one of
     * those requests' custom values behind.
     */
    let { ws, iid } = seeded()
    const req = addField(ws, { entity: 'rfq', label: 'Drawing no', kind: 'text' })
    ws = req.ws
    const [w2, rid] = issueId(ws, 'RF')
    ws = {
      ...w2,
      rfqs: [{
        id: rid, no: 'RFQ-1', itemId: iid, qty: 100, neededBy: '2026-10-15',
        vendorIds: [], state: 'draft', raisedOn: '2026-09-18',
      }],
    }
    ws = setValue(ws, rid, req.id, 'DRG-4471')
    expect(valueOf(ws, rid, req.id)).toBe('DRG-4471')

    ws = removeItem(ws, iid)
    expect(ws.rfqs).toHaveLength(0)
    expect(ws.custom[rid]).toBeUndefined()
  })

  it('cleans up anything an earlier version already leaked', () => {
    const { ws, fieldId } = seeded()
    const leaked = { ...ws, custom: { ...ws.custom, 'VN-999': { [fieldId]: 'orphan' } } }
    expect(pruneCustom(leaked).custom['VN-999']).toBeUndefined()
  })

  it('a reissued id can never pick up a deleted record’s values', () => {
    // belt and braces over the id counter: even if pruning were missed, the
    // next supplier gets VN-002 rather than the deleted VN-001
    let { ws, fieldId, vid } = seeded()
    ws = setValue(ws, vid, fieldId, '27AABCS1429B1ZX')
    ws = removeVendor(ws, vid)
    const [, next] = issueId(ws, 'VN')
    expect(next).not.toBe(vid)
    expect(valueOf(ws, next, fieldId)).toBe('')
  })
})
