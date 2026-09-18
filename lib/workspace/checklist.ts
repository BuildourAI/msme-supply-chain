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

export type StepId = 'company' | 'materials' | 'suppliers' | 'stock' | 'rules'

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
    why: 'When to buy, how much at a time, and what needs your sign-off. Yours to set, not ours to assume.',
    cta: 'Set your rules',
    done: (ws) => ws.drafts['rules.agreed'] === true,
    summary: (ws) => `buy at ${ws.policy.cycleDays.B} days' cover · sign-off above ${
      (ws.policy.ownerApprovalThreshold / 100000).toFixed(1)} L`,
  },
]

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

export const stepById = (id: StepId): Step => SOURCING_STEPS.find((s) => s.id === id)!
