'use client'
import { HeadlineStrip } from '@/components/exec/Section'
import { useDesk } from '@/components/desk/store'
import { useInbound } from '@/components/inbound/store'
import { useInventory } from '@/components/inventory/store'
import { buildLineWatch } from '@/lib/domain/linewatch'
import { buildRows, deskKpis, type SeedBundle } from '@/lib/domain/derive'
import { DEFAULT_POLICY } from '@/lib/domain/policy'
import { blockedStock } from '@/lib/seed/blocked'
import * as S from '@/lib/seed/sourcing'
import * as X from '@/lib/domain/exec'
import type { StageId } from '@/lib/seed/stages'
import type { Derived } from '@/lib/domain/types'

/**
 * The stage's own headline figures, in the same strip the executive dashboard
 * uses — so a stage page opens as a display of that stage rather than as a
 * table of contents with a paragraph over it.
 *
 * Every figure comes from the module that owns it. Nothing is recomputed here,
 * and nothing illustrative appears: Dispatch has no measured throughput, so it
 * gets the one thing that IS measured about it — the customer orders Line Watch
 * can already see at risk — plus the honest counts of what is missing.
 */

const seed: SeedBundle = {
  today: S.TODAY_SOURCING, items: S.items, vendors: S.vendors, vendorItems: S.vendorItems,
  stockLots: S.stockLots, poLines: S.poLines, receipts: S.receipts,
}
const staticRows = buildRows(seed, DEFAULT_POLICY)
const lw = buildLineWatch()

const D = (value: number, label: string, formula: string,
           inputs: Derived['inputs'], unit?: string, note?: string): Derived =>
  ({ value, label, formula, inputs, unit, note })

export function StageStrip({ stage }: { stage: StageId }) {
  const { kpis, state } = useDesk()
  const { grns, challanRows } = useInbound()
  const inv = useInventory()

  if (stage === 'sourcing') {
    const blocked = blockedStock.reduce((a, b) => a + b.value, 0)
    const decided = Object.keys(state.decisions).length
    return <HeadlineStrip cells={[
      { label: 'Lines needing a decision', d: kpis.linesNeedingDecision, format: 'int', tone: 'critical',
        caption: '3 at risk · 1 late on timing' },
      { label: 'Cash to release', d: kpis.toRelease, format: 'lakh', tone: 'accent',
        caption: `${kpis.draftPoCount} draft POs · ${kpis.heldCount} held by the guardrail` },
      { label: 'Blocked capital', d: D(blocked, 'Blocked capital', 'Σ blocked_stock.value',
          blockedStock.map((b) => ({ name: b.itemCode, value: b.value, unit: '₹' })), '₹',
          'Usable material bought for the wrong job — a different population from non-usable stock.'),
        format: 'lakh', tone: 'warn', caption: `${blockedStock.length} lots · MOQ forced is the top cause` },
      { label: 'Stock you cannot use', d: kpis.nonUsableValue, format: 'money', tone: 'warn',
        caption: `on hand, not issuable${decided ? ` · ${decided} decided this session` : ' · counted as cover never'}` },
    ]} />
  }

  if (stage === 'inbound') {
    const otif = X.supplierOtif(grns)
    const defect = X.supplierDefectRate(grns)
    const lead = X.avgLeadTime(staticRows)
    const out = challanRows.filter((c) => c.challan.status === 'out')
    const atJobworkers = out.reduce((a, c) => a + c.valueOut.value, 0)
    return <HeadlineStrip cells={[
      { label: 'Supplier OTIF', d: otif.d, format: 'raw', tone: otif.meetsTarget ? 'good' : 'critical',
        caption: otif.caption },
      { label: 'Supplier defect rate', d: defect.d, format: 'raw', tone: defect.meetsTarget ? 'good' : 'critical',
        caption: 'mean of rejection rates across closed purchase receipts' },
      { label: 'Lead time, measured', d: lead.d, format: 'days', tone: lead.meetsTarget ? 'good' : 'warn',
        caption: lead.caption },
      { label: 'Out at jobworkers', d: D(atJobworkers, 'Material at jobworkers',
          'Σ (qty still out × last_purchase_rate) over open challans',
          out.map((c) => ({ name: c.challan.challanNo, value: Math.round(c.valueOut.value), unit: '₹',
                            source: `at ${c.challan.jobworkerName}` })), '₹',
          'Neither on the shelf nor consumed. Counted as cover it inflates stock; ignored it disappears.'),
        format: 'money', tone: 'warn', caption: `${out.length} open challans · their shed, our money` },
    ]} />
  }

  if (stage === 'inventory') {
    const dio = X.daysInventoryOutstanding(staticRows)
    return <HeadlineStrip cells={[
      { label: 'Record accuracy', d: inv.accuracy, format: 'raw', tone: inv.accuracy.value >= 98 ? 'good' : 'critical',
        caption: 'counted against book, over every cycle count' },
      { label: 'Days inventory outstanding', d: dio.d, format: 'days', tone: dio.meetsTarget ? 'good' : 'critical',
        caption: 'usable stock at cost ÷ what the floor draws a day' },
      { label: 'Remnants on the rack', d: inv.offcutValue, format: 'money', tone: 'good',
        caption: 'usable offcuts — stock, not a list' },
      { label: 'Loss, net of scrap value', d: inv.netLoss, format: 'money', tone: 'warn',
        caption: 'seven named causes · what is actually gone' },
    ]} />
  }

  if (stage === 'production') {
    const halting = lw.jobs.filter((j) => j.status.value === 'will_halt').length
    return <HeadlineStrip cells={[
      { label: 'The line runs for', d: lw.tiles.lineRunsFor, format: 'raw', tone: 'critical',
        caption: 'days, before the tightest material stops it' },
      { label: 'Jobs that will not run', d: lw.tiles.jobsStopping, format: 'int',
        tone: halting ? 'critical' : 'good',
        caption: `${halting} short of material · the rest waiting on a jobworker` },
      { label: 'Cash needed this week', d: lw.tiles.cashNeeded, format: 'lakh', tone: 'accent',
        caption: 'to keep every job on the week fed' },
      { label: 'Stock you cannot use', d: lw.tiles.unusableValue, format: 'money', tone: 'warn',
        caption: `${lw.tiles.unusableLotCount} lots · on hand, not issuable` },
    ]} />
  }

  // Dispatch measures nothing, so it says so with numbers rather than showing
  // invented ones. The at-risk orders are real — Line Watch derives them from
  // materials that are genuinely short.
  const atRisk = lw.salesOrders.reduce((a, s) => a + s.value, 0)
  return <HeadlineStrip cells={[
    { label: 'Modules live here', d: D(0, 'Modules live in Stage 5', 'count(modules with a screen)',
        [{ name: 'live', value: 0, source: '§2 scopes this build to Stage 1 plus the shop-floor read of Stages 3–4' }]),
      format: 'int', tone: 'neutral', caption: 'nothing built, and nothing faked' },
    { label: 'Pains stated, none answered', d: D(4, 'Stage 5 pains', 'count(problems where nothing answers them)',
        [{ name: 'documents by hand', value: 'unanswered' }, { name: 'goods leave unrecorded', value: 'unanswered' },
         { name: 'no milestones', value: 'unanswered' }, { name: 'no reverse logistics', value: 'unanswered' }]),
      format: 'int', tone: 'critical', caption: 'each one names what it would need first' },
    { label: 'Tables that do not exist', d: D(4, 'Missing tables', 'count(tables Stage 5 needs)',
        [{ name: 'dispatch_note', value: 'missing' }, { name: 'shipment + shipment_milestone', value: 'missing' },
         { name: 'return_authorisation', value: 'missing' }, { name: 'e_way_bill', value: 'missing' }]),
      format: 'int', tone: 'warn', caption: 'the honest shape of the gap' },
    { label: 'Revenue at risk — measured', d: D(atRisk, 'Revenue at risk',
        'Σ sales_order.value where a material behind the order is short',
        lw.salesOrders.map((s) => ({ name: `${s.soNo} · ${s.customer}`, value: s.value, unit: '₹',
                                     source: `promised ${s.promisedDate}` })), '₹',
        'The one thing about Stage 5 this build can actually see, and it sees it from the material side.'),
      format: 'lakh', tone: 'critical', caption: `${lw.salesOrders.length} customer orders behind short materials` },
  ]} />
}
