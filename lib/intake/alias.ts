/**
 * A supplier's own wording, resolved for good.
 *
 * The sample company's screen is blunt about which half of that page matters:
 * "The mapping table is the deliverable, not the parser. A better parser
 * reduces the queue; only the table makes the data usable by everything
 * downstream." This is the owner's table.
 *
 * Pure, and separate from the matcher on purpose. An alias is not a very good
 * guess — it is a person's decision, and it short-circuits the scoring entirely
 * rather than being fed into it as another signal.
 */
import type { Workspace } from '@/lib/workspace/types'
import type { VendorAlias } from './types'

/**
 * The same normalisation the sample company uses, deliberately character for
 * character, so the two can be read side by side and understood to agree.
 * Spacing and punctuation are how the same wording differs between two copies
 * of the same quotation; they are not how two materials differ.
 */
export const aliasKey = (raw: string) => raw.toLowerCase().replace(/[\s.\-_/]+/g, '')

/**
 * What this supplier means by this wording, if they have ever been asked.
 *
 * Scoped to the vendor, which is the whole idea. "SHEET 1.2" from a steel
 * stockist and "SHEET 1.2" from a gasket maker are not the same material, and a
 * table that resolved both would be worse than no table.
 */
export function resolveAlias(
  aliases: VendorAlias[],
  vendorId: string | undefined,
  raw: string,
): string | null {
  if (!vendorId) return null
  const key = aliasKey(raw)
  const hit = aliases.find((a) => a.vendorId === vendorId && aliasKey(a.raw) === key)
  return hit ? hit.itemId : null
}

/**
 * Teach one. Idempotent on (vendor, wording) — re-learning the same line after
 * the owner changed their mind replaces the mapping rather than stacking a
 * second one behind it that would never be reached.
 */
export function learnAlias(ws: Workspace, alias: VendorAlias): Workspace {
  const key = aliasKey(alias.raw)
  return {
    ...ws,
    aliases: [
      alias,
      ...ws.aliases.filter((a) => !(a.vendorId === alias.vendorId && aliasKey(a.raw) === key)),
    ],
  }
}

/**
 * Forget one.
 *
 * The sample company's table cannot do this, and copying that would have been
 * the wrong kind of faithful. "An accepted match is permanent" is a promise
 * that the system will not quietly forget — not that the owner cannot correct
 * themselves. A wrong alias is silent and permanent, which is exactly what that
 * screen warns about; refusing to remove one turns its own warning into a trap.
 *
 * Forgetting a wording never touches a rate already written from it. The rate
 * was agreed; only the shortcut is withdrawn.
 */
export function forgetAlias(ws: Workspace, vendorId: string, raw: string): Workspace {
  const key = aliasKey(raw)
  return {
    ...ws,
    aliases: ws.aliases.filter((a) => !(a.vendorId === vendorId && aliasKey(a.raw) === key)),
  }
}

export const aliasesFor = (ws: Workspace, vendorId: string): VendorAlias[] =>
  ws.aliases.filter((a) => a.vendorId === vendorId)
