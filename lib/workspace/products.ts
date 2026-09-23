/**
 * What the company makes, and what goes into one.
 *
 * A product is the domain's finished good — code, name, unit, what one costs
 * to make — with its material list. The list is what lets the floor know what
 * a job needs without anybody typing it again for every job: a style of 500
 * pieces of a product that takes 1.6 m of denim each needs 800 m of denim.
 *
 * Finished stock of a product is the sum of its own journal, `fgMoves`, in the
 * domain's shape: output booked on jobs in, dispatch notes out, returns back.
 * Nothing stores a balance.
 */
import { fgBalance } from '@/lib/domain/dispatch'
import type { FgItem, Item, Uom } from '@/lib/domain/types'
import { issueId } from './defaults'
import type { Product, Workspace } from './types'

const r3 = (n: number) => Math.round(n * 1000) / 1000

export const productOf = (ws: Workspace, id?: string): Product | undefined =>
  id ? (ws.products ?? []).find((p) => p.id === id) : undefined

export interface ProductInput {
  code?: string
  name: string
  uom: Uom
  standardCost?: number
  hsn?: string
  bom: { itemId: string; qtyPerUnit: number }[]
  note?: string
}

export function productProblem(ws: Workspace, p: ProductInput, exceptId?: string): string | null {
  const name = p.name.trim()
  if (name.length < 2) return 'Give the product a name.'
  const others = (ws.products ?? []).filter((x) => x.id !== exceptId)
  if (others.some((x) => x.name.trim().toLowerCase() === name.toLowerCase())) return `${name} is already a product.`
  const code = (p.code ?? '').trim()
  if (code && others.some((x) => x.code.trim().toLowerCase() === code.toLowerCase())) return `Code ${code} is already used.`
  if (p.standardCost !== undefined && (!Number.isFinite(p.standardCost) || p.standardCost < 0)) {
    return 'What one costs to make is an amount in rupees, or blank.'
  }
  const seen = new Set<string>()
  for (const l of p.bom) {
    if (!ws.items.some((i) => i.id === l.itemId)) return 'A material on the list is not one of your materials.'
    if (seen.has(l.itemId)) return 'A material is on the list twice.'
    seen.add(l.itemId)
    if (!Number.isFinite(l.qtyPerUnit) || l.qtyPerUnit < 0) return 'How much goes into one is a quantity, or nought for not yet known.'
  }
  return null
}

const clean = (p: ProductInput) => ({
  code: (p.code ?? '').trim(),
  name: p.name.trim(),
  uom: p.uom,
  standardCost: p.standardCost,
  hsn: p.hsn?.trim() || undefined,
  bom: p.bom.map((l) => ({ itemId: l.itemId, qtyPerUnit: r3(l.qtyPerUnit) })),
  note: p.note?.trim() || undefined,
})

export function addProduct(ws: Workspace, p: ProductInput): [Workspace, string] {
  if (productProblem(ws, p)) return [ws, '']
  const [w, id] = issueId(ws, 'PR')
  return [{ ...w, products: [...(w.products ?? []), { id, ...clean(p) }] }, id]
}

export function updateProduct(ws: Workspace, id: string, p: ProductInput): Workspace {
  if (!productOf(ws, id) || productProblem(ws, p, id)) return ws
  return { ...ws, products: (ws.products ?? []).map((x) => (x.id === id ? { id, ...clean(p) } : x)) }
}

/** A product can go only while nothing names it: no job makes it, no order asks for it, no stock of it moved. */
export function removeProductProblem(ws: Workspace, id: string): string | null {
  const jobs = (ws.jobs ?? []).filter((j) => j.productId === id).length
  const orders = (ws.customerOrders ?? []).filter((o) => o.lines.some((l) => l.productId === id)).length
  const moved = (ws.fgMoves ?? []).some((m) => m.fgId === id)
  if (!jobs && !orders && !moved) return null
  const parts = [
    jobs ? `${jobs} job${jobs === 1 ? '' : 's'} make${jobs === 1 ? 's' : ''} it` : '',
    orders ? `${orders} order${orders === 1 ? '' : 's'} ask${orders === 1 ? 's' : ''} for it` : '',
    moved ? 'finished stock of it has moved' : '',
  ].filter(Boolean).join(', ')
  return `It is in use — ${parts}.`
}

export const removeProduct = (ws: Workspace, id: string): Workspace =>
  (removeProductProblem(ws, id) ? ws : { ...ws, products: (ws.products ?? []).filter((p) => p.id !== id) })

/**
 * Products the owner has already named without meaning to: every distinct
 * "goes into" a material carries, that is not a product yet, with the
 * materials that feed it. Their quantities per unit are not known — the
 * owner says them.
 */
export function suggestedProducts(ws: Workspace): { name: string; itemIds: string[] }[] {
  const have = new Set((ws.products ?? []).map((p) => p.name.trim().toLowerCase()))
  const byName = new Map<string, { name: string; itemIds: string[] }>()
  for (const it of ws.items) {
    for (const raw of it.feeds ?? []) {
      const name = raw.trim()
      const key = name.toLowerCase()
      if (!name || have.has(key)) continue
      const s = byName.get(key) ?? { name, itemIds: [] }
      if (!s.itemIds.includes(it.id)) s.itemIds.push(it.id)
      byName.set(key, s)
    }
  }
  return [...byName.values()]
}

/** What `qty` of a product needs: its material list times the quantity. A line not yet quantified needs nothing yet. */
export function needsFor(ws: Workspace, productId: string, qty: number): { itemId: string; qty: number }[] {
  const p = productOf(ws, productId)
  if (!p || !(qty > 0)) return []
  return p.bom.filter((l) => l.qtyPerUnit > 0).map((l) => ({ itemId: l.itemId, qty: r3(l.qtyPerUnit * qty) }))
}

/** The product as the domain's finished good, for the domain's own arithmetic. */
export const asFg = (p: Product): FgItem => ({
  id: p.id, code: p.code, name: p.name, uom: p.uom,
  standardCost: p.standardCost ?? 0, builtBy: [], hsn: p.hsn ?? '',
})

/** Finished stock of a product: the sum of its journal. */
export function fgOnHand(ws: Workspace, productId: string): number {
  const p = productOf(ws, productId)
  if (!p) return 0
  return r3(fgBalance(ws.fgMoves ?? [], asFg(p)).value)
}

export interface ProductRow {
  product: Product
  lines: { item?: Item; qtyPerUnit: number }[]
  /** material-list lines with no quantity yet */
  unquantified: number
  /** jobs that make it, and how many of them are open */
  jobs: number
  openJobs: number
  madeThisMonth: number
  stock: number
  /** finished stock at what one costs to make */
  value: number
}

export function productRows(ws: Workspace, today: string): ProductRow[] {
  const month = today.slice(0, 7)
  return [...(ws.products ?? [])]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((product) => {
      const jobs = (ws.jobs ?? []).filter((j) => j.productId === product.id)
      const stock = fgOnHand(ws, product.id)
      return {
        product,
        lines: product.bom.map((l) => ({ item: ws.items.find((i) => i.id === l.itemId), qtyPerUnit: l.qtyPerUnit })),
        unquantified: product.bom.filter((l) => !(l.qtyPerUnit > 0)).length,
        jobs: jobs.length,
        openJobs: jobs.filter((j) => !j.closedOn).length,
        madeThisMonth: r3((ws.fgMoves ?? []).filter((m) => m.fgId === product.id && m.kind === 'production'
          && m.on.slice(0, 7) === month).reduce((a, m) => a + m.qty, 0)),
        stock,
        value: Math.round(stock * (product.standardCost ?? 0) * 100) / 100,
      }
    })
}

/** Products with nothing on their material list, or a line with no quantity — the floor cannot plan them. */
export const productsWanting = (ws: Workspace): Product[] =>
  (ws.products ?? []).filter((p) => p.bom.length === 0 || p.bom.some((l) => !(l.qtyPerUnit > 0)))
