/** Indian number formatting. ₹4,55,100 — not ₹455,100. */

const inrN = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 })
// Money keeps its trailing zeros: a landed rate is ₹224.40, never ₹224.4.
const fixed = new Map<number, Intl.NumberFormat>()
const at = (dp: number) => {
  let f = fixed.get(dp)
  if (!f) {
    f = new Intl.NumberFormat('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp })
    fixed.set(dp, f)
  }
  return f
}

export const money = (n: number, dp = 0): string => `₹${at(dp).format(n)}`

/** ₹4.55 L · ₹18.4 L — how an MSME owner reads a number this size. */
export function lakh(n: number): string {
  if (Math.abs(n) >= 10_000_000) return `₹${(n / 10_000_000).toFixed(2)} Cr`
  if (Math.abs(n) >= 100_000) return `₹${(n / 100_000).toFixed(2)} L`
  return money(n)
}

/** Quantities drop trailing zeros — 340, not 340.00. Money does not. */
export const num = (n: number, dp = 2): string => {
  if (!Number.isFinite(n)) return '—'
  return inrN.format(Math.round(n * 10 ** dp) / 10 ** dp)
}

/** Quantities keep the precision the unit actually needs — MT wants decimals. */
export const qtyText = (n: number, uom: string): string => {
  const dp = uom === 'MT' ? 2 : Number.isInteger(n) ? 0 : 2
  return `${num(n, dp)} ${uom}`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** '2026-09-19' → '19 Sep' */
export function shortDate(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${Number(d)} ${MONTHS[Number(m) - 1]}`
}

export function longDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`
}

export const pct = (n: number, dp = 1) => `${n.toFixed(dp)}%`

export const STATUS_LABEL: Record<string, string> = {
  at_risk: 'At risk',
  at_risk_late: 'At risk — late',
  open_po_covers: 'Open PO covers',
  covered: 'Covered',
  stop: 'Line will stop',
  watch: 'Watch this',
  fine: 'Fine for now',
  will_run: 'Will run',
  will_halt: 'Will halt',
}

export type Tone = 'critical' | 'warn' | 'good' | 'accent' | 'neutral'

export const STATUS_TONE: Record<string, Tone> = {
  at_risk: 'critical', at_risk_late: 'warn', open_po_covers: 'accent', covered: 'good',
  stop: 'critical', watch: 'warn', fine: 'good',
  will_halt: 'critical', at_risk_job: 'warn', will_run: 'good',
}
