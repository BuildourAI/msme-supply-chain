/**
 * The one place a supplier, a material or a rate is built.
 *
 * It exists because there are now two ways into this data — the add dialogs and
 * a spreadsheet import — and the rules have to be the same down both. They are
 * not cosmetic rules. `Item` has eleven required fields of which a person is
 * asked two; safety stock is a product of the other two rather than a number
 * anybody types; `lastPurchaseRate` is the valuation basis under §13-1, so a
 * material that never gets one values the whole shelf at zero; and `Uom` is a
 * closed set of five, so a sheet that says "Kgs" has to be translated or
 * refused rather than written through.
 *
 * An importer that reimplemented any of that would drift from the dialog within
 * a release. So the dialogs call these too.
 */
import type { Item, Uom, Vendor, VendorItem } from '@/lib/domain/types'
import { gstCost, rejectionCost } from './landed'
import type { Workspace } from './types'

/* ------------------------------------------------------------------ units -- */

/**
 * What people write, against the five units this build reasons in.
 *
 * Deliberately not a fuzzy match. A unit that cannot be resolved stops the row
 * with a message naming what is accepted, because guessing between `MT` and
 * `m` on a material bought by the tonne is a thousand-fold error in every
 * figure downstream.
 */
const UOM_ALIAS: Record<string, Uom> = {
  m: 'm', mtr: 'm', mtrs: 'm', meter: 'm', meters: 'm', metre: 'm', metres: 'm', rmt: 'm',
  kg: 'kg', kgs: 'kg', kilo: 'kg', kilos: 'kg', kilogram: 'kg', kilograms: 'kg', kgm: 'kg',
  mt: 'MT', ton: 'MT', tons: 'MT', tonne: 'MT', tonnes: 'MT', te: 'MT',
  nos: 'nos', no: 'nos', nr: 'nos', pcs: 'nos', pc: 'nos', piece: 'nos', pieces: 'nos',
  ea: 'nos', each: 'nos', unit: 'nos', units: 'nos', qty: 'nos',
  m2: 'm2', sqm: 'm2', sqmt: 'm2', sqmtr: 'm2',
}

export const UOM_VALUES: Uom[] = ['m', 'kg', 'MT', 'nos', 'm2']

export function parseUom(raw: string): Uom | null {
  const key = raw.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
  return UOM_ALIAS[key] ?? null
}

/* ---------------------------------------------------------------- numbers -- */

/**
 * A figure as somebody wrote it in a spreadsheet.
 *
 * Indian grouping (`1,20,000`), a currency symbol, a stray unit and non-breaking
 * spaces all turn up in real sheets. What is NOT accepted is a range or a note
 * — `1200-1400` and `1200 approx` are ambiguous, and a wrong rate is worse than
 * a row that stops and says so.
 */
export function parseNumber(raw: string): number | null {
  const t = raw.trim().replace(/[ \s]/g, '')
  if (t === '') return null
  const stripped = t.replace(/^[₹$€]/, '').replace(/,/g, '')
  if (!/^-?\d*\.?\d+$/.test(stripped)) return null
  const n = Number(stripped)
  return Number.isFinite(n) ? n : null
}

/* -------------------------------------------------------------- duplicates -- */

const fold = (s: string) => s.trim().toLowerCase()

export const findVendorByName = (ws: Workspace, name: string, exceptId?: string) =>
  ws.vendors.find((v) => v.id !== exceptId && fold(v.name) === fold(name))

export const findItemByName = (ws: Workspace, name: string, exceptId?: string) =>
  ws.items.find((i) => i.id !== exceptId && fold(i.name) === fold(name))

export const findItemByCode = (ws: Workspace, code: string, exceptId?: string) =>
  ws.items.find((i) => i.id !== exceptId && i.code.toUpperCase() === code.trim().toUpperCase())

/* ----------------------------------------------------------------- builders -- */

export interface VendorInput {
  id: string
  name: string
  paymentTermsDays: number
}

export function buildVendor(input: VendorInput): Vendor {
  return {
    id: input.id,
    name: input.name.trim(),
    paymentTermsDays: input.paymentTermsDays,
  }
}

export interface ItemInput {
  id: string
  name: string
  code: string
  uom: Uom
  moq: number
  /** what the floor gets through in a day */
  daily: number
  /** days of cushion — safety stock is the product of the two */
  cushionDays: number
  lastPurchaseRate?: number
}

/**
 * A material, with the nine fields nobody is asked about filled the same way
 * the dialog fills them.
 *
 * `previous` carries an edit: everything measured about the material —
 * its class, what it feeds — survives, and only what was asked is replaced.
 */
export function buildItem(ws: Workspace, input: ItemInput, previous?: Item): Item {
  return {
    ...(previous ?? {
      itemClass: 'B' as const,
      coverageCeilingMonths: ws.policy.coverageCeiling.B,
      lastPurchaseRate: 0,
      feeds: [],
    }),
    id: input.id,
    code: input.code.trim().toUpperCase(),
    name: input.name.trim(),
    uom: input.uom,
    moq: input.moq,
    avgDailyConsumption: input.daily,
    floorConsumptionPerDay: input.daily,
    safetyStock: Math.round(input.daily * input.cushionDays * 1000) / 1000,
    lastPurchaseRate: input.lastPurchaseRate ?? previous?.lastPurchaseRate ?? 0,
  }
}

export interface RateInput {
  vendorId: string
  itemId: string
  rate: number
  leadDays: number
  preferred?: boolean
  /**
   * The three things a quoted rate does not mention, as the owner says them.
   *
   * Freight in rupees because that is how it is charged; the other two as
   * percentages because that is how they are known — "he's on composition, I
   * can't claim anything" and "one bundle in fifty is bent", not "₹602 a tonne"
   * and "₹1,204 a tonne". They are converted once, here, into the rupee figures
   * §5's formula wants. The fourth, what their payment terms cost, cannot be
   * settled per rate — see `repriceTerms` in `landed.ts`.
   */
  freight?: number
  unclaimableGstPct?: number
  rejectPct?: number
  /**
   * The day their price stops being their price.
   *
   * §5 has always declared it on `VendorItem` and nothing wrote it, so every
   * rate in an owner's workspace claimed to be good for ever. A quotation is
   * the one document that says otherwise, and accepting one is where the date
   * comes from.
   */
  validUntil?: string
}

/**
 * What a supplier charges for a material.
 *
 * Everything the build has *measured* about this pairing — the trailing lead
 * time from real receipts, the rejection rate, freight — is kept. Only the
 * quoted figures are replaced, because those are the two things anybody is
 * ever asked for. A pairing with no measured history takes the quoted lead
 * time as its trailing one, which `calc.ts` then labels "quoted, not measured"
 * rather than passing off as observed.
 */
export function buildRate(input: RateInput, previous?: VendorItem): VendorItem {
  const blank = {
    freightPerUnit: 0, nonCreditableGst: 0, paymentTermCost: 0, rejectionAllowance: 0,
    trailingRejectionRate: 0, onTimePct: 0, score: 0, quoteValidUntil: '',
  }
  const before = previous ?? blank

  /*
   * An omitted figure keeps what was there rather than clearing it, so a form
   * that does not ask about freight cannot silently delete the freight somebody
   * entered on the same pairing last month. Passing 0 is how you say none.
   */
  const rejectPct = input.rejectPct ?? before.trailingRejectionRate
  return {
    ...before,
    vendorId: input.vendorId,
    itemId: input.itemId,
    rate: input.rate,
    freightPerUnit: input.freight ?? before.freightPerUnit,
    nonCreditableGst: input.unclaimableGstPct === undefined
      ? before.nonCreditableGst
      : gstCost(input.rate, input.unclaimableGstPct),
    trailingRejectionRate: rejectPct,
    rejectionAllowance: rejectionCost(input.rate, rejectPct),
    quotedLeadTimeDays: input.leadDays,
    trailingLeadTimeDays: previous?.trailingLeadTimeDays ?? input.leadDays,
    quoteValidUntil: input.validUntil ?? before.quoteValidUntil,
    isPreferred: input.preferred || undefined,
  } as VendorItem
}

/**
 * The two percentages back out of the rupee figures, for a form reopening a
 * rate somebody already entered. Nothing stores them twice.
 */
export const unclaimableGstPctOf = (vi: VendorItem): number =>
  (vi.rate > 0 ? Math.round((vi.nonCreditableGst / vi.rate) * 1000) / 10 : 0)

/**
 * The valuation basis, back-filled.
 *
 * §13-1 values stock at last purchase price. A material whose rate is still
 * zero has never been bought, so the first rate quoted for it is the best
 * figure available — and leaving it at zero would value that material, and
 * every screen that sums stock, at nothing.
 */
export function backfillRates(items: Item[], rates: VendorItem[]): Item[] {
  return items.map((it) => {
    if (it.lastPurchaseRate > 0) return it
    const q = rates.find((r) => r.itemId === it.id && r.rate > 0)
    return q ? { ...it, lastPurchaseRate: q.rate } : it
  })
}
