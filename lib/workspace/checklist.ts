/**
 * Setting up sourcing, as five steps that go green.
 *
 * The shape is deliberately data rather than markup: a step knows its own
 * title, why it is worth doing, where it happens, and how to tell from the
 * workspace whether it is done. Adding the same treatment to Inventory or
 * Dispatch later is another list in this file, not another screen.
 *
 * Step 1 is complete the moment the workspace exists. That first tick is free
 * on purpose — somebody who has just typed their company name has in fact done
 * the first step, and a checklist that opens at zero of five reads like a bill.
 */
import { quotedItems, unquotedItems } from './bundle'
import { coveredItems } from './checks'
import { jobworkers } from './jobwork'
import { jobWord, openJobs } from './jobs'
import { companyState } from './gst'
import { dispatchRulesOf } from './customers'
import { floorOf, isPlanned, unplannedJobs } from './plan'
import { productsWanting } from './products'
import { unplacedLots } from './racks'
import type { StageId } from './reveal'
import type { Workspace } from './types'

export interface Step {
  id: StepId
  /** what the owner is being asked to do, in their words */
  title: string
  /** one line: what it buys them. Never "required field". */
  why: string
  /** what the button says when this is the next step */
  cta: string
  done: (ws: Workspace) => boolean
  /** what to show beside a completed step — "4 materials", not a tick alone */
  summary: (ws: Workspace) => string
}

export type StepId =
  | 'company' | 'materials' | 'suppliers' | 'stock' | 'rules'
  /* inbound's own three */
  | 'checks' | 'jobworkers' | 'gateRules'
  /* the store's own three */
  | 'racks' | 'jobs' | 'storeRules'
  /* the floor's */
  | 'products' | 'plan' | 'floorRules'
  /* the shipping bay's */
  | 'customers' | 'carriers' | 'firstOrder' | 'dispatchRules'

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

export const SOURCING_STEPS: Step[] = [
  {
    id: 'company',
    title: 'You and your company',
    why: 'Every action gets recorded against a name, so the trail says who did what.',
    cta: 'Add your team',
    done: (ws) => ws.company.name.trim().length > 0,
    summary: (ws) => ws.people.length > 1
      ? `${ws.company.name} · ${plural(ws.people.length, 'person', 'people')}`
      : ws.company.name,
  },
  {
    id: 'materials',
    title: 'Your materials',
    why: 'The things you buy. Nothing can be ordered, counted or costed until they have names.',
    cta: 'Add a material',
    done: (ws) => ws.items.length > 0,
    summary: (ws) => {
      const missing = unquotedItems(ws).length
      const base = plural(ws.items.length, 'material')
      return missing > 0 ? `${base} · ${missing} with no supplier yet` : base
    },
  },
  {
    id: 'suppliers',
    title: 'Your suppliers',
    why: 'Who sells you each material, at what rate, and how long they take. This is what makes a buying suggestion possible.',
    cta: 'Add a supplier',
    done: (ws) => ws.vendors.length > 0 && quotedItems(ws).length > 0,
    summary: (ws) => `${plural(ws.vendors.length, 'supplier')} · ${plural(ws.vendorItems.length, 'rate')}`,
  },
  {
    id: 'stock',
    title: 'Stock in hand',
    why: 'What is on the shelf today. Without it the system cannot tell you what is running out.',
    cta: 'Count your stock',
    done: (ws) => ws.stockLots.length > 0,
    summary: (ws) => {
      const counted = new Set(ws.stockLots.map((l) => l.itemId)).size
      return `${counted} of ${plural(ws.items.length, 'material')} counted`
    },
  },
  {
    id: 'rules',
    title: 'Your rules',
    why: 'When to buy, how much at a time, what needs your sign-off, and how long a change to an order may go unconfirmed. Yours to set, not ours to assume.',
    cta: 'Set your rules',
    done: (ws) => ws.drafts['rules.agreed'] === true,
    summary: (ws) => `buy at ${ws.policy.cycleDays.B} days' cover · sign-off above ${
      (ws.policy.ownerApprovalThreshold / 100000).toFixed(1)} L`,
  },
]

/**
 * Setting up the gate, as four steps.
 *
 * The first two are sourcing's own step objects, not copies: a receipt is of a
 * material and from a supplier, so a company that has set up sourcing opens
 * this list at two of four, and one that starts here is asked for its masters
 * first. The other two are the gate's own: what to check, and its rules.
 */
const byId = (id: StepId) => SOURCING_STEPS.find((s) => s.id === id)!

export const INBOUND_STEPS: Step[] = [
  byId('materials'),
  byId('suppliers'),
  {
    id: 'checks',
    title: 'What to check when it arrives',
    why: 'Two or three checks per material — a reading, a certificate, a look. A receipt cannot close until each is answered, so nothing reaches the shelf unchecked.',
    cta: 'Write your checks',
    done: (ws) => (ws.specChecks ?? []).length > 0,
    summary: (ws) => `${plural((ws.specChecks ?? []).length, 'check')} on ${
      coveredItems(ws).length} of ${plural(ws.items.length, 'material')}`,
  },
  {
    id: 'gateRules',
    title: 'The gate rules',
    why: 'How long material may wait uninspected, and when a rejection is a pattern rather than a bad batch.',
    cta: 'Set the gate rules',
    done: (ws) => ws.drafts['inbound.rules.agreed'] === true,
    summary: (ws) => `inspect within ${plural(ws.policy.inboundQcDays, 'day')} · escalate at ${
      ws.policy.qcOverdueDays}`,
  },
]

/**
 * The store's: material out at a jobworker is the store's own stock in
 * somebody else's shed. Only what comes back passes the gate.
 */
const JOBWORKERS_STEP: Step = {
  id: 'jobworkers',
  title: 'Who you send material out to',
  why: 'Galvanisers, platers, machine shops. Material with them is still yours, and never counted as stock you can use.',
  cta: 'Add a jobworker',
  /*
   * "We don't send anything out" is a real answer and ticks the step. A step
   * that could only go green by inventing a jobworker would teach people to
   * invent one. The answer is kept under the key it was first stored with,
   * when this step was the gate's.
   */
  done: (ws) => jobworkers(ws).length > 0 || ws.drafts['inbound.noJobwork'] === true,
  summary: (ws) => {
    const n = jobworkers(ws).length
    return n > 0 ? plural(n, 'jobworker') : 'no material sent out'
  },
}

/** Shared by the store and the floor: a style is what material leaves against, and what the floor makes. */
const JOBS_STEP: Step = {
  id: 'jobs',
  title: 'How material leaves the store',
  why: 'Nothing leaves without a job, style or order number on the slip — so every metre is somebody’s, and what each one used is a sum, not a guess.',
  cta: 'Set up job numbers',
  done: (ws) => ws.jobNumbering !== undefined,
  summary: (ws) => {
    const w = jobWord(ws)
    const open = openJobs(ws).length
    return `${w.many} numbered ${ws.jobNumbering?.prefix ?? ''}-…${open ? ` · ${open} open` : ''}`
  },
}

/** Shared by the floor and the shipping bay: what you make is what you ship. */
export const PRODUCTS_STEP: Step = {
  id: 'products',
  title: 'Your products',
  why: 'What you make, and what goes into one. A style then only needs a product and a quantity for the floor to know what it needs.',
  cta: 'Add your products',
  done: (ws) => (ws.products ?? []).length > 0,
  summary: (ws) => {
    const n = (ws.products ?? []).length
    const want = productsWanting(ws).length
    return want > 0 ? `${plural(n, 'product')} · ${want} without quantities` : plural(n, 'product')
  },
}

/**
 * Setting up the store.
 *
 * Materials and the stock count are sourcing's own step objects again — a
 * company that has counted its stock for sourcing has counted it for the
 * store — and the count now asks which rack each material sits on. The other
 * four are the store's: where things sit, what material leaves against, who
 * it goes out to for jobwork, and the rules a count and a loss are judged by.
 */
export const INVENTORY_STEPS: Step[] = [
  byId('materials'),
  {
    id: 'racks',
    title: 'Where things sit',
    why: 'Name the racks — A-1, the fabric wall, the trims cupboard. A count is walked rack by rack, and a lot on no rack is a lot nobody will find.',
    cta: 'Name your racks',
    /*
     * "Everything is in one place" is a real answer, the way "we do not send
     * anything out" is for jobwork. A step that could only go green by
     * inventing a rack would teach people to invent one.
     */
    done: (ws) => (ws.racks ?? []).length > 0 || ws.drafts['inventory.oneRack'] === true,
    summary: (ws) => {
      const n = (ws.racks ?? []).length
      if (n === 0) return 'one store, no racks'
      const off = unplacedLots(ws).length
      return off > 0 ? `${plural(n, 'rack')} · ${plural(off, 'lot')} on no rack` : plural(n, 'rack')
    },
  },
  byId('stock'),
  JOBS_STEP,
  JOBWORKERS_STEP,
  {
    id: 'storeRules',
    title: 'Your store rules',
    why: 'How often each class is counted, what size of difference is a real one, what scrap you will accept, how much slack a jobworker gets — and whether you cut material at all.',
    cta: 'Set the store rules',
    done: (ws) => ws.drafts['inventory.rules.agreed'] === true,
    summary: (ws) => `count A every ${plural(ws.policy.countCadenceDays.A, 'day')} · scrap target ${
      ws.policy.scrapTargetPct.A}%${ws.cutting ? ' · cutting on' : ''}`,
  },
]

/**
 * Setting up the floor.
 *
 * Materials and job numbers are other stages' own step objects: the floor
 * makes styles out of the materials sourcing buys, numbered the way the store
 * issues against them. Its own three are what it makes, the first plan, and
 * the rules a day's output is judged by.
 */
export const PRODUCTION_STEPS: Step[] = [
  byId('materials'),
  PRODUCTS_STEP,
  JOBS_STEP,
  {
    id: 'plan',
    title: 'This week’s plan',
    why: 'Give a style its product, how many, when it starts and finishes. Line watch then says whether the store can feed it, before the floor finds out.',
    cta: 'Plan a style',
    done: (ws) => (ws.jobs ?? []).some((j) => isPlanned(j)),
    summary: (ws) => {
      const planned = (ws.jobs ?? []).filter((j) => !j.closedOn && isPlanned(j)).length
      const not = unplannedJobs(ws).length
      return `${planned} planned${not ? ` · ${not} open without a plan` : ''}`
    },
  },
  {
    id: 'floorRules',
    title: 'Floor rules',
    why: 'Which days are working days, how far behind the daily target counts as behind, and your reasons for rejecting a piece.',
    cta: 'Set the floor rules',
    done: (ws) => ws.drafts['production.rules.agreed'] === true,
    summary: (ws) => {
      const f = floorOf(ws)
      return `${plural(f.workingDays.length, 'working day')} a week · behind past ${f.behindPct}%`
    },
  },
]

/**
 * Setting up the shipping bay.
 *
 * Products are the floor's own step object — what you make is what you ship.
 * The rest are the bay's: who it goes to, who carries it, the first order,
 * and the rules a dispatch is checked against.
 */
export const DISPATCH_STEPS: Step[] = [
  PRODUCTS_STEP,
  {
    id: 'customers',
    title: 'Your customers',
    why: 'Who you sell to, with a GSTIN where they have one — the delivery challan and the e-way bill both want it, and their state is read off it.',
    cta: 'Add your customers',
    done: (ws) => (ws.customers ?? []).length > 0,
    summary: (ws) => plural((ws.customers ?? []).length, 'customer'),
  },
  {
    id: 'carriers',
    title: 'Who carries it',
    why: 'The transporters you use, and your own vehicle if you have one. Every consignment names one, so a carrier who is always late shows up as a number.',
    cta: 'Add your carriers',
    done: (ws) => (ws.carriers ?? []).length > 0,
    summary: (ws) => plural((ws.carriers ?? []).length, 'carrier'),
  },
  {
    id: 'firstOrder',
    title: 'Your first sales order',
    why: 'A customer, a promised date, the products and the rate — and the style making it, so a promise at risk shows before the customer rings.',
    cta: 'New sales order',
    done: (ws) => (ws.customerOrders ?? []).length > 0,
    summary: (ws) => {
      const open = (ws.customerOrders ?? []).filter((o) => o.state === 'open').length
      return `${plural((ws.customerOrders ?? []).length, 'order')}${open ? ` · ${open} open` : ''}`
    },
  },
  {
    id: 'dispatchRules',
    title: 'Dispatch rules',
    why: 'Your own state, for place of supply; when a consignment needs an e-way bill; the on-time target; how long a new order is promised for.',
    cta: 'Set the dispatch rules',
    done: (ws) => ws.drafts['dispatch.rules.agreed'] === true,
    summary: (ws) => {
      const r = dispatchRulesOf(ws)
      return `${companyState(ws) ?? 'state not set'} · e-way bill from ₹${r.ewayThreshold.toLocaleString('en-IN')} · on time ${r.otifTargetPct}%`
    },
  },
]

/** The set-up list for a stage. A stage with none of its own gets sourcing's. */
export const stepsFor = (stage: StageId | null | undefined): Step[] =>
  stage === 'inbound' ? INBOUND_STEPS
    : stage === 'inventory' ? INVENTORY_STEPS
      : stage === 'production' ? PRODUCTION_STEPS
        : stage === 'dispatch' ? DISPATCH_STEPS
          : SOURCING_STEPS

export interface Progress {
  steps: { step: Step; done: boolean }[]
  doneCount: number
  total: number
  /** the first step not yet done — what the one primary button points at */
  next: Step | null
  complete: boolean
}

export function progressOf(ws: Workspace, steps: Step[] = SOURCING_STEPS): Progress {
  const marked = steps.map((step) => ({ step, done: step.done(ws) }))
  const doneCount = marked.filter((m) => m.done).length
  return {
    steps: marked,
    doneCount,
    total: steps.length,
    next: marked.find((m) => !m.done)?.step ?? null,
    complete: doneCount === steps.length,
  }
}

export const stepById = (id: StepId): Step =>
  [...SOURCING_STEPS, ...INBOUND_STEPS, ...INVENTORY_STEPS, ...PRODUCTION_STEPS, ...DISPATCH_STEPS].find((s) => s.id === id)!
