/**
 * What a brand-new workspace starts with.
 *
 * Starter categories are a first guess the owner immediately overrides — every
 * select that reads them offers "Add new…". They exist so the first supplier
 * can be added without inventing a vocabulary first, not because these four
 * words are the right four words for any particular factory.
 */
import { DEFAULT_POLICY } from '@/lib/domain/policy'
import type { Uom } from '@/lib/domain/types'
import type { Categories, PersonRole, Workspace } from './types'

export const STARTER_CATEGORIES: Categories = {
  supplierType: ['Raw material', 'Consumable', 'Jobworker', 'Service'],
  materialGroup: ['Raw material', 'Bought-out part', 'Consumable'],
  units: ['kg', 'MT', 'm', 'm2', 'nos'] as Uom[],
}

export const UOM_LABEL: Record<Uom, string> = {
  kg: 'kilograms',
  MT: 'tonnes',
  m: 'metres',
  m2: 'square metres',
  nos: 'pieces',
}

/**
 * The reorder rules a new company gets before step 5 asks about them.
 *
 * These are the build's documented defaults, not silent invention: §13-3 flags
 * `cycleDays = 15` as a guess and §13-4 flags the flat 2.0-month ceiling, and
 * step 5 is where the owner replaces both with figures they agree to. Until
 * they do, the desk behaves exactly as the sample company does.
 */
export const STARTER_POLICY = DEFAULT_POLICY

export const ID_PREFIX = { item: 'IT', vendor: 'VN', lot: 'LOT' } as const

/**
 * The highest number any surviving record carries. Seeds the counter below.
 *
 * On its own this is NOT safe to issue from, which is what it used to do:
 * deleting the highest-numbered record lowers the maximum and hands its id
 * straight back out. That was harmless only for as long as every side-table was
 * pruned on delete. It stopped being harmless the moment custom field values,
 * supplier contact details and the send log started keying off a record id — a
 * recycled id silently gives a new supplier the deleted one's GST number, and
 * that GST number prints on a document.
 */
export function highestIssued(prefix: string, existing: { id: string }[]): number {
  const re = new RegExp(`^${prefix}-(\\d+)$`)
  return existing.reduce((max, e) => {
    const m = re.exec(e.id)
    return m ? Math.max(max, Number(m[1])) : max
  }, 0)
}

/**
 * Stable, readable, and never handed out twice — no dependency on a clock.
 *
 * The count lives on the workspace rather than being derived from what is
 * there, so it only ever goes up. Issuing returns a new workspace alongside the
 * id, which forces the caller to do it inside its `update` closure: computing
 * an id outside one and writing it in a moment later is how two records added
 * in quick succession end up sharing an id.
 */
export function issueId(ws: Workspace, prefix: string): [Workspace, string] {
  const n = (ws.nextIds?.[prefix] ?? 0) + 1
  return [
    { ...ws, nextIds: { ...(ws.nextIds ?? {}), [prefix]: n } },
    `${prefix}-${String(n).padStart(3, '0')}`,
  ]
}

/** Every prefix the workspace issues, so a stored counter can be seeded. */
export const ID_PREFIXES = ['VN', 'IT', 'RF', 'QT', 'PO', 'CF', 'SD', 'GR', 'RC', 'CK', 'JW'] as const

/**
 * A code suggested from the material's name: first letters of the first two
 * words, then a number. The owner can overwrite it — most factories already
 * have their own coding, and the ones that do not need something rather than
 * a blank field they will leave blank.
 */
export function suggestCode(name: string, existing: { code: string }[]): string {
  const stem = name.trim().split(/\s+/).slice(0, 2)
    .map((w) => w.replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase())
    .filter(Boolean).join('-') || 'ITEM'
  const used = new Set(existing.map((e) => e.code.toUpperCase()))
  if (!used.has(stem)) return stem
  for (let n = 2; ; n += 1) {
    const c = `${stem}-${n}`
    if (!used.has(c)) return c
  }
}

export function emptyWorkspace(input: {
  id: string
  createdAt: string
  ownerName: string
  contact: string
  companyName: string
  makes: string
  role?: PersonRole
}): Workspace {
  return {
    id: input.id,
    createdAt: input.createdAt,
    owner: { name: input.ownerName.trim(), contact: input.contact.trim() },
    company: { name: input.companyName.trim(), makes: input.makes.trim() },
    people: [{ name: input.ownerName.trim(), role: input.role ?? 'owner' }],
    rateLog: [],
    categories: {
      supplierType: [...STARTER_CATEGORIES.supplierType],
      materialGroup: [...STARTER_CATEGORIES.materialGroup],
      units: [...STARTER_CATEGORIES.units],
    },
    items: [],
    vendors: [],
    vendorItems: [],
    stockLots: [],
    rfqs: [],
    quotes: [],
    orders: [],
    receipts: [],
    specChecks: [],
    challans: [],
    policy: { ...STARTER_POLICY },
    vendorType: {},
    itemGroup: {},
    fields: [],
    custom: {},
    views: {
      supplier: BLANK_VIEW, material: BLANK_VIEW, rfq: BLANK_VIEW,
      quote: BLANK_VIEW, order: BLANK_VIEW,
      check: BLANK_VIEW, receipt: BLANK_VIEW, challan: BLANK_VIEW,
    },
    vendorContact: {},
    sendLog: [],
    docs: [],
    aliases: [],
    nextIds: {},
    drafts: {},
  }
}

const BLANK_VIEW = { order: [], hidden: [], labels: {} }
