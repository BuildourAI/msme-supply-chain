/**
 * The five stages of §2, the §14 build sequence and the §12 exclusions, in one
 * registry. The nav and the stage pages both read from here, so a locked module
 * can never tell two different stories about itself.
 */

export type StageId = 'sourcing' | 'inbound' | 'inventory' | 'production' | 'dispatch'

export interface Problem {
  title: string
  detail: string
  /** the system that answers it, where one exists in this build */
  answeredBy?: string
}

export interface ModuleEntry {
  label: string
  href?: string
  /** live modules have an href; everything else explains itself */
  lock?: {
    phase: string
    needs: string
    /** §12 exclusions carry the stated reason rather than a phase */
    excludedReason?: string
  }
  note?: string
}

export interface Stage {
  id: StageId
  no: number
  label: string
  navLabel: string
  href: string
  summary: string
  problems: Problem[]
  modules: ModuleEntry[]
}

export const STAGES: Stage[] = [
  {
    id: 'sourcing', no: 1, label: 'Sourcing & procurement', navLabel: 'Sourcing', href: '/sourcing',
    summary: 'The only stage this build covers in full. Four systems — SRC-01 to SRC-04 — behaving as one desk.',
    problems: [
      { title: 'Reactive buying', detail: 'The trigger is a person noticing, not a number.', answeredBy: 'SRC-01 · Reorder trigger' },
      { title: 'Blocked stock in wrong-make material', detail: 'Money stuck in material nobody can use on the job it was bought for.', answeredBy: 'SRC-04 · Blocked-capital guardrail' },
      { title: 'Unstructured supplier intake', detail: 'Quotes arrive by email and WhatsApp and are never searchable again.', answeredBy: 'SRC-02 · Supplier intake & mapping' },
      { title: 'No price comparison at the buy', detail: 'The cheapest quoted rate is not the cheapest material.', answeredBy: 'SRC-03 · Landed-cost comparison' },
    ],
    modules: [
      { label: 'Sourcing Desk', href: '/sourcing/desk', note: 'SRC-01 · 02 · 03 · 04 on one screen' },
      { label: 'Supplier intake & mapping', href: '/sourcing/desk#intake', note: 'SRC-02' },
      { label: 'Landed-cost comparison', href: '/sourcing/desk#compare', note: 'SRC-03' },
      { label: 'Blocked capital', href: '/sourcing/desk#blocked', note: 'SRC-04' },
      { label: 'Purchase orders', lock: { phase: '§14 Phase 3', needs: 'Approval thresholds and the owner’s sign-off rules.' } },
      { label: 'Vendor master', lock: { phase: 'Track 0', needs: 'Vendor master, payment terms and lead times for the top 20 items.' } },
      { label: 'Vendor scorecard', lock: { phase: 'Excluded', needs: '', excludedReason: 'The score feeds ranking silently. Too much precision for a hands-on owner — it stays on the buyer’s detail view only (§12).' } },
      { label: 'Automatic PO placement', lock: { phase: 'Excluded', needs: '', excludedReason: 'Explicitly refused by every client in the source set (§12). The system drafts; a person places the order. There is no code path that can send anything.' } },
    ],
  },
  {
    id: 'inbound', no: 2, label: 'Inbound & vendor/jobwork', navLabel: 'Inbound', href: '/inbound',
    summary: 'Three systems — INB-01 to INB-03 — covering what happens at the gate and after it: whether the material is any good, whether the vendor is even making the right quantity, and where material went once it left again.',
    problems: [
      { title: 'Inbound QC and inspection gaps',
        detail: 'No consistent process for inspecting inward materials or documenting quality checks against specs.',
        answeredBy: 'INB-01 · Goods receipt & inbound QC' },
      { title: 'Vendors working off stale orders',
        detail: 'When order quantities change internally, the update doesn’t reach the vendor, causing mismatched production.',
        answeredBy: 'INB-02 · Order change sync' },
      { title: 'No tracking of material sent to jobworkers',
        detail: 'Once material leaves for jobwork, there is no visibility into balance material, status, or return timelines.',
        answeredBy: 'INB-03 · Jobwork register' },
      { title: 'Quoted lead times that have never matched reality',
        detail: 'The figure the vendor promises and the figure six receipts prove are different numbers.',
        answeredBy: 'INB-01 · Lead-time truth' },
    ],
    modules: [
      { label: 'Receiving & QC', href: '/inbound/receiving', note: 'INB-01 · inspection against spec, GRN, rejection buckets' },
      { label: 'Open orders', href: '/inbound/orders', note: 'INB-02 · PO versions, change notices, acknowledgements' },
      { label: 'Jobwork register', href: '/inbound/jobwork', note: 'INB-03 · challans, balance, returns, unaccounted' },
      { label: 'Inspection specs', href: '/inbound/receiving#specs', note: 'what “inspected” means, written down once' },
      { label: 'Vendor portal for acknowledgements', lock: { phase: 'Excluded', needs: '', excludedReason: 'A vendor who answers on WhatsApp will never open a portal. The buyer records the acknowledgement against a reply they can point to — a link can come later, once the vendors ask for one (§12).' } },
      { label: 'Vendor scorecard', lock: { phase: 'Excluded', needs: '', excludedReason: 'Deliberately not a screen (§12). On-time and rejection history feed ranking silently, and the rejection history now comes from closed GRNs rather than a stored constant.' } },
    ],
  },
  {
    id: 'inventory', no: 4, label: 'Inventory & warehousing', navLabel: 'Inventory', href: '/inventory',
    summary: 'The stock-truth read this build depends on. Every lot, what state it is in, and what that state costs.',
    problems: [
      { title: 'No live stock visibility', detail: 'The number in the system and the number on the rack have never agreed.', answeredBy: 'Stock truth' },
      { title: 'Offcuts untracked and re-bought', detail: 'A usable remnant already owned, bought again at full price.', answeredBy: 'Offcut check on approval' },
      { title: 'Wastage never measured', detail: 'Scrap has no target, so it has no trend.' },
      { title: 'No unified view across locations', detail: 'Two racks, three entities, one spreadsheet each.' },
    ],
    modules: [
      { label: 'Stock truth', href: '/inventory', note: 'live — every lot, valued' },
      { label: 'Blocked capital', href: '/sourcing/desk#blocked', note: '₹18.4 L by age and by cause' },
      { label: 'Offcut register', lock: { phase: '§14 Phase 6', needs: 'Offcuts recorded at the cutting step rather than swept up.' } },
      { label: 'Wastage & scrap vs target', lock: { phase: '§14 Phase 6', needs: 'A scrap target per item class, agreed with the client.' } },
      { label: 'Multi-location stock', lock: { phase: 'Excluded', needs: '', excludedReason: 'Only relevant with more than one factory. Some clients need it eventually; nobody needs it first (§12).' } },
    ],
  },
  {
    id: 'production', no: 3, label: 'Production & material flow', navLabel: 'Production Material Flow', href: '/production',
    summary: 'The owner’s floor view. Same data as the buyer’s desk, read as a manufacturing statement rather than an inventory number.',
    problems: [
      { title: 'No item master', detail: 'The factory and the customer use different names for the same thing.', answeredBy: 'Item master & aliases' },
      { title: 'Hand-offs are WhatsApp forwards', detail: 'No notification, no record, no owner.' },
      { title: 'Capacity is invisible', detail: 'So no date can be promised with any confidence.', answeredBy: 'Line Watch week view' },
      { title: 'A few late components hold the whole order', detail: 'One hinge stops forty enclosures.', answeredBy: 'Line Watch' },
    ],
    modules: [
      { label: 'Line Watch', href: '/production/line-watch', note: 'the owner’s floor view — live' },
      { label: 'Item master & aliases', href: '/production#aliases', note: 'live — the SRC-02 mapping table' },
      { label: 'Feeds map', href: '/production#feeds', note: 'live — if I run out of X I cannot make Y' },
      { label: 'Capacity & promise dates', lock: { phase: 'Track 0', needs: 'Machine and labour capacity per work centre.' } },
      { label: 'Full BOM explosion', lock: { phase: 'Excluded', needs: '', excludedReason: 'Surface the "feeds" link only for the material that is actually short (§12).' } },
      { label: 'Separate mobile app', lock: { phase: 'Excluded', needs: '', excludedReason: 'A web app installable to the home screen, one login per employee — that is what the source clients asked for (§12). No native app.' } },
    ],
  },
  {
    id: 'dispatch', no: 5, label: 'Dispatch & logistics', navLabel: 'Dispatch', href: '/dispatch',
    summary: 'Not built, and not faked. §2 scopes this build to Stage 1 plus the shop-floor read of Stages 3–4; this page states what Stage 5 would need.',
    problems: [
      { title: 'Dispatch documents typed by hand', detail: 'The same figures re-keyed into a challan, an invoice and an e-way bill.' },
      { title: 'Goods leave without being recorded', detail: 'Stock walks out of a gate that has no system behind it.' },
      { title: 'No shipment milestone tracking', detail: 'Despatched and delivered are the same event as far as the record is concerned.' },
      { title: 'No reverse logistics', detail: 'A return has nowhere to land.' },
    ],
    modules: [
      { label: 'Dispatch documents', lock: { phase: 'Out of scope', needs: 'A sales-order and despatch table. §2 scopes this build to Stage 1.' } },
      { label: 'Shipment milestones', lock: { phase: 'Out of scope', needs: 'Carrier milestones, which no client in the source set captures today.' } },
      { label: 'Reverse logistics', lock: { phase: 'Out of scope', needs: 'A returns route with an owner and a deadline.' } },
      { label: 'e-Way bill', lock: { phase: 'Out of scope', needs: 'Exchange with the accounting system the client already runs — Tally, Vyapar, Spectrum or Odoo — never a replacement for it (§12).' } },
    ],
  },
]

export const stageById = (id: StageId) => STAGES.find((s) => s.id === id)!

/** §14 — ship SRC-01 v2 first and it stalls. That is the sequencing mistake to avoid. */
export const BUILD_SEQUENCE = [
  { phase: 'Track 0', what: 'Item master, vendor master, 90 days of consumption, lead times for the top 20 items', note: '2–3 weeks of unglamorous work. Not optional.' },
  { phase: 'Phase 1', what: 'SRC-02 intake + item_alias mapping', note: 'Runs on an inbox alone; starts day one.' },
  { phase: 'Phase 2', what: 'SRC-01 v1 — hand-set min/max, top 20 items', note: 'The Sourcing Desk summary view.' },
  { phase: 'Phase 3', what: 'SRC-04 coverage guardrail on approval + blocked-capital view', note: '' },
  { phase: 'Phase 4', what: 'SRC-03 landed-cost comparison', note: 'Needs 3 months of SRC-02 quotes.' },
  { phase: 'Phase 5', what: 'SRC-01 v2 — computed reorder points', note: 'Needs 90 days of consumption history.' },
  { phase: 'Phase 6', what: 'Line Watch — the owner’s view over the same data', note: '' },
  { phase: 'Track 0b', what: 'INB-01 goods receipt & inbound QC', note: 'The event the other two write into. Needs an inspection spec per item — 2–4 checks, not a QMS.' },
  { phase: 'Phase 6b', what: 'INB-03 jobwork register', note: 'Reuses INB-01 for returns, so nothing bypasses the gate.' },
  { phase: 'Phase 6c', what: 'INB-02 order change sync', note: 'Largest schema change — PO versioning — and it touches the SRC-04 hand-off.' },
]

export const GUARDRAILS = [
  'The system suggests, holds and recommends. It never places an order, never contacts a supplier, never edits a customer record.',
  'Override, never block. The guardrail holds a line and demands a written reason; only a person releases it.',
  'Escalate, don’t guess. An unmatched supplier item or a conflict between sources routes to a human.',
  'Errors surface, never silently resolve. Every automated action is reversible and logged.',
  'A rate change never alters a past suggestion or an approved PO.',
  'Non-usable stock is always displayed and never counted as cover. Same for material with a jobworker.',
  'Cover is computed on the quantity the vendor has acknowledged, never on an internal revision the vendor has not seen.',
  'Nothing becomes usable stock without a closed goods receipt — a jobwork return included.',
]
