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
 * Stable, readable and unique within one workspace — no dependency on a clock.
 *
 * It counts up from the highest number already issued, never from how many
 * survive. A deleted material's id is not handed out again: stock lots and
 * supplier rates point at items by id, and an id that comes back around would
 * silently attach that history to a different material.
 */
export function nextId(prefix: string, existing: { id: string }[]): string {
  const re = new RegExp(`^${prefix}-(\\d+)$`)
  const highest = existing.reduce((max, e) => {
    const m = re.exec(e.id)
    return m ? Math.max(max, Number(m[1])) : max
  }, 0)
  return `${prefix}-${String(highest + 1).padStart(3, '0')}`
}

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
    policy: { ...STARTER_POLICY },
    vendorType: {},
    itemGroup: {},
    drafts: {},
  }
}
