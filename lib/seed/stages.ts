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
  /** what the pain costs today, in this dataset — never a general claim */
  costsToday?: string
  /** the mechanism that removes it. Not "improves visibility" — what it does. */
  how?: string
  /** where to go and watch it work */
  href?: string
  /** live in this build · queued · nothing here answers it */
  state?: 'live' | 'planned' | 'unsolved'
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
      { title: 'Reactive buying', detail: 'The trigger is a person noticing, not a number.',
        answeredBy: 'SRC-01 · Reorder trigger', state: 'live', href: '/sourcing/desk',
        costsToday: 'Four of nine materials on this run crossed their reorder point before anyone looked. One of them — MgO powder — is covered on quantity and still late: the order exists, it just lands nine days after the material runs out.',
        how: 'A daily run computes true position — on hand, minus what is not issuable, plus only what a vendor has acknowledged — against a reorder point built from six real receipts rather than a quoted lead time. The line raises itself and states why; a person decides.' },
      { title: 'Unstructured supplier intake', detail: 'Quotes arrive by email and WhatsApp and are never searchable again.',
        answeredBy: 'SRC-02 · Supplier intake & mapping', state: 'live', href: '/sourcing/intake',
        costsToday: 'Fourteen documents a month arrive as attachments and photos. Nothing is searchable afterwards, so the price history every other decision needs never accumulates.',
        how: 'One inbox and one WhatsApp number. Each document’s lines are matched against the item master; anything under 70% confidence goes to a person instead of being guessed at. A confirmed match writes a permanent alias, so the same supplier wording is never re-keyed twice.' },
      { title: 'No price comparison at the buy', detail: 'The cheapest quoted rate is not the cheapest material.',
        answeredBy: 'SRC-03 · Landed-cost comparison', state: 'live', href: '/sourcing/compare',
        costsToday: 'On this dataset the lowest quoted rate is the wrong answer on six of nine lines. Freight, a non-creditable GST slice, the cost of the payment term and the vendor’s own rejection history each move the real number.',
        how: 'Landed cost is built from five components and every one of them opens into its arithmetic. The rejection allowance comes from that vendor’s closed goods receipts, not from a stored score — so a vendor who sends bad material pays for it in the comparison.' },
      { title: 'Blocked stock in wrong-make material', detail: 'Money stuck in material nobody can use on the job it was bought for.',
        answeredBy: 'SRC-04 · Blocked-capital guardrail', state: 'live', href: '/sourcing/blocked',
        costsToday: '₹18.4 L across 15 lots, and ₹7.1 L of it has been sitting for more than 180 days. This is usable material bought for the wrong job — a different population from the ₹29,308 of stock that cannot be issued at all.',
        how: 'Every lot carries a cause, an owner, a route out and a deadline, and the same guardrail holds any new order that would push cover past its ceiling. MOQ forced is the top cause at ₹5.8 L, which makes the fix a vendor negotiation rather than a software change — that is the whole reason the cause column exists.' },
    ],
    modules: [
      { label: 'Sourcing Desk', href: '/sourcing/desk', note: 'SRC-01 reorder trigger, with the SRC-03 comparison and the SRC-04 guardrail on the line you pick' },
      { label: 'Supplier intake & mapping', href: '/sourcing/intake', note: 'SRC-02 · one inbox, one WhatsApp number, one alias table' },
      { label: 'Landed-cost comparison', href: '/sourcing/compare', note: 'SRC-03 · why the cheapest quote is not the cheapest material' },
      { label: 'Blocked capital', href: '/sourcing/blocked', note: 'SRC-04 · ₹18.4 L stuck, by cause and by age' },
      { label: 'Painkillers solved', href: '/sourcing/painkillers', note: 'the four pains, and the mechanism that removes each' },
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
        answeredBy: 'INB-01 · Goods receipt & inbound QC', state: 'live', href: '/inbound/receiving',
        costsToday: 'Material is accepted because it arrived, not because it passed. When something fails on the floor a fortnight later, nothing records what was checked at the gate or who checked it.',
        how: '27 spec checks across the item master — two to four per item, not a QMS. A receipt cannot close until every mandatory check is answered, and a failed check routes the quantity to a named bucket with a written reason. Nothing becomes usable stock without a closed receipt, a jobwork return included.' },
      { title: 'Vendors working off stale orders',
        detail: 'When order quantities change internally, the update doesn’t reach the vendor, causing mismatched production.',
        answeredBy: 'INB-02 · Order change sync', state: 'live', href: '/inbound/orders',
        costsToday: 'A quantity is revised in the office and the vendor keeps making the old one. The cover figure back at the desk is then computed against a number nobody outside the building has agreed to.',
        how: 'A purchase order carries versions. Each revision is notified and separately acknowledged, and cover is computed on the version the vendor has acknowledged — never on an internal revision they have not seen. An unacknowledged change is visible as exactly that.' },
      { title: 'No tracking of material sent to jobworkers',
        detail: 'Once material leaves for jobwork, there is no visibility into balance material, status, or return timelines.',
        answeredBy: 'INB-03 · Jobwork register', state: 'live', href: '/inbound/jobwork',
        costsToday: 'Material at a jobworker is neither on the shelf nor consumed. Counted as stock it inflates cover; ignored it disappears — and either way nobody knows what is still out there or how late it is.',
        how: 'A challan splits into five: returned, in QC, still at the vendor, forgiven within the agreed process loss, and genuinely missing. Only material past its grace period is judged, so nothing is called missing while it is legitimately still out. Returns come back through the same gate as a purchase.' },
      { title: 'Quoted lead times that have never matched reality',
        detail: 'The figure the vendor promises and the figure six receipts prove are different numbers.',
        answeredBy: 'INB-01 · Lead-time truth', state: 'live', href: '/inbound/receiving',
        costsToday: 'The vendors quote 8.4 days on average and take 9.6. Measured against their own quoted figure rather than the promised date, only 22.8% of receipts arrive inside it.',
        how: 'Lead time is the trailing mean of six actual receipts, and the reorder point is built on that number. The quoted figure is shown beside it so the drift is visible, but it never enters a calculation.' },
    ],
    modules: [
      { label: 'Receiving & QC', href: '/inbound/receiving', note: 'INB-01 · inspection against spec, GRN, rejection buckets' },
      { label: 'Open orders', href: '/inbound/orders', note: 'INB-02 · PO versions, change notices, acknowledgements' },
      { label: 'Jobwork register', href: '/inbound/jobwork', note: 'INB-03 · challans, balance, returns, unaccounted' },
      { label: 'Painkillers solved', href: '/inbound/painkillers', note: 'the four pains, and the mechanism that removes each' },
      { label: 'Vendor portal for acknowledgements', lock: { phase: 'Excluded', needs: '', excludedReason: 'A vendor who answers on WhatsApp will never open a portal. The buyer records the acknowledgement against a reply they can point to — a link can come later, once the vendors ask for one (§12).' } },
      { label: 'Vendor scorecard', lock: { phase: 'Excluded', needs: '', excludedReason: 'Deliberately not a screen (§12). On-time and rejection history feed ranking silently, and the rejection history now comes from closed GRNs rather than a stored constant.' } },
    ],
  },
  {
    id: 'inventory', no: 4, label: 'Inventory & warehousing', navLabel: 'Inventory', href: '/inventory',
    summary: 'Three systems — INV-01 to INV-03 — over one ledger. A quantity is a balance rather than a stored number, a remnant is stock rather than a list, and a loss has a cause rather than a shrug.',
    problems: [
      { title: 'No live or accurate stock visibility',
        detail: 'The number in the system and the number on the rack have never agreed.',
        answeredBy: 'INV-01 · Stock ledger & cycle count', state: 'live', href: '/inventory/ledger',
        costsToday: 'A stored quantity gets edited when it looks wrong, and the edit erases the evidence. One count in this dataset found 869 against a book of 882 — a 1.5% variance on a class-A item, over its 1% tolerance.',
        how: 'A quantity is the sum of its movements, and every movement names a document. There is no adjustment without a reason: a count variance is posted as its own movement rather than written over the balance, so the record says the book was wrong and by how much. Record accuracy is then a measured figure, not a belief.' },
      { title: 'No cutting-yield or offcut tracking',
        detail: 'Leftover raw material isn’t tracked as usable stock, leading to unnecessary repurchase.',
        answeredBy: 'INV-02 · Cutting yield & offcuts', state: 'live', href: '/inventory/offcuts',
        costsToday: 'A usable 62 m remnant sits on a rack that no system knows about, and the same material is bought again. Cutting kerf and below-size offcuts are ₹2,747 of loss on this run that nobody had counted.',
        how: 'A cut records input, parts, kerf and every remnant. A remnant above the usable minimum becomes a stock lot with its own balance; below it, it is scrap with a recovery value. The buyer’s approval dialog then nets any matching remnant off the order before it is placed — and says plainly when MOQ absorbs the saving instead of quoting a fake one.' },
      { title: 'No wastage or material-loss tracking',
        detail: 'Material spoilage or wastage during production isn’t measured or reported.',
        answeredBy: 'INV-03 · Wastage & loss ledger', state: 'live', href: '/inventory/wastage',
        costsToday: 'Loss is a shrug. Waste on this run is 1.6% of everything issued, and ₹3,186 of it is shrinkage — stock that is simply not there, with nothing to show for it.',
        how: 'Seven named causes, each posted net of what the scrap is worth back. Six of the seven are components of a movement already recorded, so the two ledgers can never double-count. Cause is the actionable column: kerf is a saw setting, spoilage is a storage problem, count shortage is neither.' },
    ],
    modules: [
      { label: 'Stock ledger', href: '/inventory/ledger', note: 'INV-01 · balances, movements, cycle counts' },
      { label: 'Cutting & offcuts', href: '/inventory/offcuts', note: 'INV-02 · cut records, yield, the remnant register' },
      { label: 'Wastage & loss', href: '/inventory/wastage', note: 'INV-03 · seven causes, net of recovery' },
      { label: 'Painkillers solved', href: '/inventory/painkillers', note: 'the three pains, and the mechanism that removes each' },
      { label: 'Barcode or RFID picking', lock: { phase: 'Excluded', needs: '', excludedReason: 'A ledger that reconciles is what makes stock accurate; scanning only makes an accurate ledger faster to update. Nobody in the source set needs it before they have the ledger (§12).' } },
      { label: 'Multi-location stock', lock: { phase: 'Excluded', needs: '', excludedReason: 'Only relevant with more than one factory. Some clients need it eventually; nobody needs it first (§12).' } },
    ],
  },
  {
    id: 'production', no: 3, label: 'Production & material flow', navLabel: 'Production Material Flow', href: '/production',
    summary: 'The owner’s floor view. Same data as the buyer’s desk, read as a manufacturing statement rather than an inventory number.',
    problems: [
      { title: 'A few late components hold the whole order', detail: 'One hinge stops forty enclosures.',
        answeredBy: 'Line Watch', state: 'live', href: '/production/line-watch',
        costsToday: 'The line runs 3.5 days before the concealed hinge stops it. Three of six jobs this week will not run as scheduled — two short of material, one waiting on a jobworker who is three days late.',
        how: 'The same data as the buyer’s desk, read as a manufacturing statement: days of cover against the lead time to replace, per material, with the jobs each one feeds. A material with less cover than lead time is already too late to order, and the screen says so in those words.' },
      { title: 'No item master', detail: 'The factory and the customer use different names for the same thing.',
        answeredBy: 'Item master & aliases', state: 'live', href: '/production#aliases',
        costsToday: '“C.R.C.A. SHT 1.2MM 1250W (PRIME)” and “CRCA sheet 1.2 mm × 1250” are one material with two names, and every quote that arrives adds another spelling.',
        how: 'The supplier-intake mapping table is the item master’s alias list. A confirmed match is permanent and visible on the floor, so the name the supplier uses and the name the factory uses resolve to the same stock without anyone re-keying either.' },
      { title: 'Capacity is invisible', detail: 'So no date can be promised with any confidence.',
        answeredBy: 'Line Watch week view', state: 'planned',
        costsToday: 'A promise date is a guess with a customer’s name on it. The week view shows what will run and what will not, but not how much the floor could take on if it were fed.',
        how: 'Partly answered. Line Watch shows the material side of the promise — which jobs stop and when. The capacity side needs machine and labour capacity per work centre, which is Track 0 data nobody in the source set holds yet.' },
      { title: 'Hand-offs are WhatsApp forwards', detail: 'No notification, no record, no owner.',
        state: 'unsolved',
        costsToday: 'A job moves between people on a forwarded photo. There is no record that the hand-off happened, no owner it is sitting with, and no way to tell a stalled job from a slow one.',
        how: 'Nothing in this build answers this. It needs one login per employee before it can mean anything — a hand-off with no named owner is just another message. That is the first item on the §14 stack, not a screen.' },
    ],
    modules: [
      { label: 'Line Watch', href: '/production/line-watch', note: 'the owner’s floor view — live' },
      { label: 'Item master & aliases', href: '/production#aliases', note: 'live — the SRC-02 mapping table' },
      { label: 'Feeds map', href: '/production#feeds', note: 'live — if I run out of X I cannot make Y' },
      { label: 'Painkillers solved', href: '/production/painkillers', note: 'the four pains — two removed, one part-answered, one not' },
      { label: 'Capacity & promise dates', lock: { phase: 'Track 0', needs: 'Machine and labour capacity per work centre.' } },
      { label: 'Full BOM explosion', lock: { phase: 'Excluded', needs: '', excludedReason: 'Surface the "feeds" link only for the material that is actually short (§12).' } },
      { label: 'Separate mobile app', lock: { phase: 'Excluded', needs: '', excludedReason: 'A web app installable to the home screen, one login per employee — that is what the source clients asked for (§12). No native app.' } },
    ],
  },
  {
    id: 'dispatch', no: 5, label: 'Dispatch & logistics', navLabel: 'Dispatch', href: '/dispatch',
    summary: 'Four systems — DSP-01 to DSP-04 — closing the gate the ledger stopped at. Goods now leave against a document, the paperwork is typed once, a delivery is something the record observes rather than assumes, and a return has an owner and a deadline.',
    problems: [
      { title: 'Dispatch documents typed by hand', detail: 'The same figures re-keyed into a challan, an invoice and an e-way bill.',
        answeredBy: 'DSP-02 · Document pack', state: 'live', href: '/dispatch/documents',
        costsToday: 'Three documents carry the same numbers and are typed three times. Every re-key is a chance to ship the right goods against the wrong paperwork.',
        how: 'One pack, prepared from the despatch note that already exists: the challan as it physically left, the taxable values and place of supply the invoice needs, and the fields the e-way bill portal asks for. It is a hand-off, not a ledger — no invoice number is allocated here, no tax is computed here and no receivable is held here. That boundary is §12, and crossing it would build a second books-of-account nobody reconciles.' },
      { title: 'Goods leave without being recorded', detail: 'Stock walks out of a gate that has no system behind it.',
        answeredBy: 'DSP-01 · Despatch notes', state: 'live', href: '/dispatch/despatch',
        costsToday: 'The inbound gate was instrumented and the outbound one was not, so the ledger was accurate right up to the moment material left the building.',
        how: 'The mirror of the goods receipt. A note names what left, against which order and on whose authority, and posts the movement that takes it off the bay. It will not let you send more than the order has open or more than the bay holds, and both limits are shown rather than enforced silently. This also gave finished goods an identity for the first time — the third leg of the stock picture the executive split used to assume.' },
      { title: 'No shipment milestone tracking', detail: 'Despatched and delivered are the same event as far as the record is concerned.',
        answeredBy: 'DSP-03 · Consignments', state: 'live', href: '/dispatch/consignments',
        costsToday: 'Customer OTIF could not be computed at all, because nothing observed a delivery. The figure on the executive dashboard was assumed, and said so.',
        how: 'A consignment carries the carrier, the date the customer was given and the date somebody watched the goods arrive — with a name against it, because a delivered date nobody confirmed is a guess with a timestamp. OTIF is then counted rather than assumed, on time and in full kept apart as the two different failures they are, and a consignment still in transit excluded rather than flattered into the numerator.' },
      { title: 'No reverse logistics', detail: 'A return has nowhere to land.',
        answeredBy: 'DSP-04 · Returns', state: 'live', href: '/dispatch/returns',
        costsToday: 'A returned product was handled on the phone. It never became stock again, never became a quality signal, and never reached the supplier who caused it.',
        how: 'Half of this was already built and nobody had noticed: goods coming back are goods coming in, and the INB-01 gate has taken those against a spec since Stage 2. The missing half is an authorisation that says a return is expected, with a named owner and a date it can be late against. The rate is counted on authorisations raised rather than on goods physically back, so a return nobody has chased still shows up.' },
    ],
    modules: [
      { label: 'Despatch notes', href: '/dispatch/despatch', note: 'DSP-01 · the order book, finished goods, and what left on whose authority' },
      { label: 'Document pack', href: '/dispatch/documents', note: 'DSP-02 · challan, invoice values and e-way bill fields, typed once' },
      { label: 'Consignments', href: '/dispatch/consignments', note: 'DSP-03 · carrier, promised date, delivered date — the OTIF that was assumed' },
      { label: 'Returns', href: '/dispatch/returns', note: 'DSP-04 · an authorisation with an owner and a deadline' },
      { label: 'Painkillers solved', href: '/dispatch/painkillers', note: 'the four pains, and the mechanism that removes each' },
      { label: 'Carrier rate negotiation', lock: { phase: 'Excluded', needs: '', excludedReason: 'Freight per unit and the drift per carrier are measured here, which is what a rate conversation needs. Modelling the contract itself is a spreadsheet the owner already keeps (§12).' } },
      { label: 'Customer portal for order status', lock: { phase: 'Excluded', needs: '', excludedReason: 'A customer who phones will keep phoning. The promised and delivered dates are now recorded, so the person answering the phone has the answer — a portal can come later, once customers ask for one (§12).' } },
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
  { phase: 'Track 0d', what: 'INV-01 stock ledger & cycle count', note: 'The ledger everything else posts into. Nothing above is accurate without it.' },
  { phase: 'Phase 6d', what: 'INV-03 wastage & loss ledger', note: 'Six of its seven causes already exist as events, so it is cheap once the ledger is there.' },
  { phase: 'Phase 6e', what: 'INV-02 cutting yield & offcut register', note: 'Needs a new capture point at the saw, and it touches the SRC-04 approve dialog.' },
  { phase: 'Track 0e', what: 'A finished-goods item master', note: 'The prerequisite nobody lists. Until the thing that ships has a code, a unit and a balance, a despatch note cannot name what left.' },
  { phase: 'Phase 7', what: 'DSP-01 despatch notes', note: 'The mirror of INB-01. Needs the finished-goods master above and sales orders with line items — most clients already hold those in Tally or Vyapar, so import rather than re-key.' },
  { phase: 'Phase 7b', what: 'DSP-02 document pack', note: 'Cheap once DSP-01 exists, because every figure is already on the note. Needs the customer master: ship-to, GSTIN, HSN codes.' },
  { phase: 'Phase 7c', what: 'DSP-03 consignments & milestones', note: 'The step that pays for the rest — it converts five assumed executive figures into measured ones. The hard part is organisational: somebody has to start recording a delivered date.' },
  { phase: 'Phase 7d', what: 'DSP-04 returns', note: 'Reuses the INB-01 gate for the goods themselves, so only the authorisation is new.' },
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
  'A stock quantity is the sum of its movements, and every movement names a document. There is no adjustment without a reason.',
  'A count variance is posted as its own movement, never written over the balance. The book was wrong, and the record says so.',
]
