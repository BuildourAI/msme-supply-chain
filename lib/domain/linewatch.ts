/**
 * Line Watch derivation — the owner's floor view (§8.5).
 * Same engine as the buyer's desk, different consumption rate (§4) and a
 * different, stated supplier-default policy (§13-2).
 */
import * as C from './calc'
import type { Derived, JobStatus, OwnerStatus } from './types'
import {
  jobs, jobwork, materials, salesOrders, TODAY_LINEWATCH, type LineMaterial,
} from '@/lib/seed/linewatch'

export interface DerivedMaterial {
  m: LineMaterial
  coverDays: Derived
  status: Derived<OwnerStatus>
  stockoutDate: Derived<string>
  nonUsable: Derived
  nonUsableValue: Derived
  reorderCost: Derived
  offcutValue: Derived
  atRiskOrders: typeof salesOrders
  overdueJobwork: boolean
}

export interface DerivedJob {
  job: (typeof jobs)[number]
  status: Derived<JobStatus> & { blocking: string[]; lateJw: string[] }
}

const STATUS_ORDER: Record<OwnerStatus, number> = { stop: 0, watch: 1, fine: 2 }

export function buildLineWatch() {
  const lateJobworkItemIds = new Set(
    jobwork.filter((j) => j.dueBack < TODAY_LINEWATCH && j.status !== 'closed').map((j) => j.itemId),
  )

  const derived: DerivedMaterial[] = materials.map((m) => {
    const nu = C.round(m.qcHold + m.damaged + m.expired, 3)
    // §8.5 uses the owner's rate — what the shop actually draws on a working day.
    const coverDays = C.productionCoverDays(m.usable, m.floorPerDay, m.uom)
    const status = C.ownerStatus(coverDays.value, m.leadTimeDays)
    return {
      m,
      coverDays,
      status,
      stockoutDate: C.stockoutDate(TODAY_LINEWATCH, coverDays.value),
      nonUsable: {
        value: nu, label: 'Stock you cannot use',
        formula: 'qc_hold + damaged + expired',
        inputs: [
          { name: 'qc_hold', value: m.qcHold, unit: m.uom },
          { name: 'damaged', value: m.damaged, unit: m.uom },
          { name: 'expired', value: m.expired, unit: m.uom },
        ],
        unit: m.uom,
        note: 'On hand but not issuable. Shown always, counted as cover never (§11).',
      },
      nonUsableValue: {
        value: C.money(nu * m.rate), label: 'Value of unusable stock',
        formula: '(qc_hold + damaged + expired) × last_purchase_rate',
        inputs: [
          { name: 'unusable qty', value: nu, unit: m.uom },
          { name: 'last_purchase_rate', value: m.rate, unit: `₹/${m.uom}`, source: 'valuation basis: last purchase price (§13-1)' },
        ],
        unit: '₹',
      },
      reorderCost: {
        value: C.money(m.reorderQty * m.rate + m.freight), label: 'Cost to reorder',
        formula: 'reorder_qty × rate + freight',
        inputs: [
          { name: 'reorder_qty', value: m.reorderQty, unit: m.uom },
          { name: 'rate', value: m.rate, unit: `₹/${m.uom}` },
          { name: 'freight', value: m.freight, unit: '₹' },
        ],
        unit: '₹',
      },
      offcutValue: {
        value: C.money(m.offcutQty * m.rate), label: 'Usable offcuts',
        formula: 'offcut_qty × last_purchase_rate',
        inputs: [
          { name: 'offcut_qty', value: m.offcutQty, unit: m.uom },
          { name: 'last_purchase_rate', value: m.rate, unit: `₹/${m.uom}` },
        ],
        unit: '₹',
        note: 'A usable remnant already owned — checked before buying fresh (§4).',
      },
      // §8.5 — customer orders only on at-risk materials. Healthy materials show none.
      atRiskOrders: status.value === 'fine' ? [] : salesOrders.filter((s) => s.atRiskFrom.includes(m.id)),
      overdueJobwork: lateJobworkItemIds.has(m.id),
    }
  })

  const byId = new Map(derived.map((d) => [d.m.id, d]))

  const derivedJobs: DerivedJob[] = jobs.map((job) => ({
    job,
    status: C.jobStatus(
      job.needs.map((id) => ({
        itemId: id, name: byId.get(id)!.m.name, coverDays: byId.get(id)!.coverDays.value,
      })),
      job.startOffset, job.durationDays, lateJobworkItemIds,
    ),
  }))

  // Sorted by which stops the line first (§8.5).
  const sorted = [...derived].sort((a, b) =>
    STATUS_ORDER[a.status.value] - STATUS_ORDER[b.status.value] || a.coverDays.value - b.coverDays.value)

  const needsAttention = sorted.filter((d) => d.status.value !== 'fine')
  const healthy = sorted.filter((d) => d.status.value === 'fine')

  const lineRunsFor: Derived = {
    value: Math.min(...derived.map((d) => d.coverDays.value)),
    label: 'The line runs for',
    formula: 'min(production_cover_days) across every material',
    inputs: derived.map((d) => ({ name: d.m.name, value: d.coverDays.value, unit: 'days' })),
    unit: 'days',
    note: 'The shortest material sets the pace — everything else is irrelevant until it is fixed.',
  }

  const stopping = derivedJobs.filter((j) => j.status.value !== 'will_run')
  const jobsStopping: Derived = {
    value: stopping.length,
    label: 'Jobs stopping this week',
    formula: 'count(jobs where outcome ≠ Will run)',
    inputs: stopping.map((j) => ({ name: j.job.jobNo, value: j.status.value === 'will_halt' ? 'Will halt' : 'At risk' })),
  }

  // Cash covers the materials that need attention — the ones with a card and an
  // action. Healthy materials collapse to a line and raise nothing.
  const cashNeeded: Derived = {
    value: C.money(needsAttention.reduce((a, d) => a + d.reorderCost.value, 0)),
    label: 'Cash needed for reorders',
    formula: 'Σ (reorder_qty × rate + freight) over materials needing attention',
    inputs: needsAttention.map((d) => ({ name: d.m.name, value: d.reorderCost.value, unit: '₹' })),
    unit: '₹',
  }

  const unusableLots = derived.filter((d) => d.nonUsable.value > 0)
  const unusableValue: Derived = {
    value: C.money(unusableLots.reduce((a, d) => a + d.nonUsableValue.value, 0)),
    label: 'Stock you cannot use',
    formula: 'Σ (qc_hold + damaged + expired) × last_purchase_rate',
    inputs: unusableLots.map((d) => ({ name: d.m.name, value: d.nonUsableValue.value, unit: '₹' })),
    unit: '₹',
  }

  return {
    today: TODAY_LINEWATCH,
    materials: derived, needsAttention, healthy,
    jobs: derivedJobs, jobwork, salesOrders,
    tiles: { lineRunsFor, jobsStopping, cashNeeded, unusableValue, unusableLotCount: unusableLots.length },
  }
}
