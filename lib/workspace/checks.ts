/**
 * What to check when a material arrives.
 *
 * Two to four checks per material with a tolerance — a vernier, a weighing
 * scale and a certificate, which is what incoming inspection at a small
 * factory actually is. Not a quality system: a list somebody at the gate can
 * work down with a clipboard.
 *
 * Every check is the domain's own `SpecCheck`, so the sample company's
 * inspection arithmetic — whether an inspection is complete, which checks
 * failed, whether a reading is inside its band — runs on the owner's checks
 * unchanged. That is the whole reason this file only stores them.
 *
 * A material with no checks is never blocked at the gate. Its receipts close
 * unchecked and say so, which is the honest thing to do with material nobody
 * has described a test for — refusing it would only teach people to write a
 * check that always passes.
 */
import type { CheckKind, SpecCheck, Usability } from '@/lib/domain/types'
import { issueId } from './defaults'
import type { Workspace } from './types'

/** The four ways a thing can be checked, said the way a storeman would. */
export const CHECK_KINDS: { value: CheckKind; label: string; hint: string }[] = [
  { value: 'measure', label: 'A reading', hint: 'thickness, diameter, weight — with the band it must fall inside' },
  { value: 'document', label: 'A document', hint: 'a test certificate, a mill certificate, a batch record' },
  { value: 'visual', label: 'A look', hint: 'rust, dents, the right grade marking, packing intact' },
  { value: 'count', label: 'A count', hint: 'the pieces, bundles or coils the paperwork says' },
]

/**
 * Where material that fails lands. Each is a `Usability` the rest of the build
 * already knows how to show and never counts as cover — except the last, which
 * is how a check that matters for the record but not for use is written.
 */
export const FAIL_BUCKETS: { value: Usability; label: string }[] = [
  { value: 'qc_hold', label: 'Held for a decision' },
  { value: 'damaged', label: 'Cannot be used' },
  { value: 'expired', label: 'Past its date' },
  { value: 'usable', label: 'Still usable — note it only' },
]

export const KIND_LABEL: Record<CheckKind, string> = Object.fromEntries(
  CHECK_KINDS.map((k) => [k.value, k.label]),
) as Record<CheckKind, string>

export const BUCKET_LABEL: Record<Usability, string> = Object.fromEntries(
  FAIL_BUCKETS.map((b) => [b.value, b.label]),
) as Record<Usability, string>

/**
 * A kind of check from whatever somebody wrote in a sheet.
 *
 * Null rather than a guess when the word means nothing here: a check read as a
 * look when it was meant as a reading would pass every out-of-band part.
 */
export function readCheckKind(word: string): CheckKind | null {
  const w = word.trim().toLowerCase()
  if (!w) return null
  if (/^(measure|measurement|reading|dimension|gauge|gauged|weigh|weight|size)/.test(w)) return 'measure'
  if (/^(document|doc|certificate|cert|tc|mtc|test cert|paper)/.test(w)) return 'document'
  if (/^(visual|look|appearance|see|surface|finish)/.test(w)) return 'visual'
  if (/^(count|pieces|nos|quantity|qty)/.test(w)) return 'count'
  return CHECK_KINDS.find((k) => k.label.toLowerCase() === w)?.value ?? null
}

/** Where a failure lands, from a sheet's wording. */
export function readBucket(word: string): Usability | null {
  const w = word.trim().toLowerCase()
  if (!w) return null
  if (/^(hold|held|qc|on hold|waiting|quarantine)/.test(w)) return 'qc_hold'
  if (/^(damage|reject|scrap|cannot|unusable|return)/.test(w)) return 'damaged'
  if (/^(expire|past|out of date|shelf)/.test(w)) return 'expired'
  if (/^(usable|accept|ok|note|use)/.test(w)) return 'usable'
  return FAIL_BUCKETS.find((b) => b.label.toLowerCase() === w)?.value ?? null
}

/* ---------------------------------------------------------------- reading -- */

export const checksFor = (ws: Workspace, itemId: string): SpecCheck[] =>
  (ws.specChecks ?? []).filter((c) => c.itemId === itemId)

/** Materials nobody has written a check for — the Checks row's badge. */
export const uncheckedItems = (ws: Workspace) =>
  ws.items.filter((i) => checksFor(ws, i.id).length === 0)

export const coveredItems = (ws: Workspace) =>
  ws.items.filter((i) => checksFor(ws, i.id).length > 0)

/* ---------------------------------------------------------------- writing -- */

export type CheckInput = Omit<SpecCheck, 'id'>

/**
 * Why a check cannot be saved as it stands, or null.
 *
 * One place, so the form, the wizard and a sheet import all refuse the same
 * things for the same reasons.
 */
export function checkProblem(ws: Workspace, c: CheckInput, id?: string): string | null {
  if (!ws.items.some((i) => i.id === c.itemId)) return 'Pick the material it is for.'
  if (c.label.trim().length < 2) return 'Say what is checked.'
  const twin = checksFor(ws, c.itemId).find((x) =>
    x.id !== id && x.label.trim().toLowerCase() === c.label.trim().toLowerCase())
  if (twin) return 'That material already has a check by that name.'
  if (c.kind === 'measure') {
    const lo = c.min
    const hi = c.max
    if ((lo != null && !Number.isFinite(lo)) || (hi != null && !Number.isFinite(hi))) {
      return 'The band has to be numbers.'
    }
    if (lo == null && hi == null) {
      return 'A reading needs the band it must fall inside — a lowest, a highest, or both.'
    }
    if (lo != null && hi != null && lo > hi) return 'The lowest is above the highest.'
  }
  return null
}

/** Tidied: a band only on a reading, a reason always, whitespace trimmed. */
function clean(c: CheckInput): CheckInput {
  const measure = c.kind === 'measure'
  const label = c.label.trim()
  return {
    itemId: c.itemId,
    label,
    kind: c.kind,
    min: measure ? c.min : undefined,
    max: measure ? c.max : undefined,
    unit: measure ? (c.unit?.trim() || undefined) : undefined,
    failBucket: c.failBucket,
    // a reason is what the rejected lot carries on every screen, so there
    // always is one — the owner's, or the check's own name as the next best
    failReason: c.failReason.trim() || `${label} failed at the gate`,
    mandatory: c.mandatory,
  }
}

/** Issued inside the caller's `update`, like every other id in the workspace. */
export function addCheck(ws: Workspace, input: CheckInput): [Workspace, string] {
  const [w, id] = issueId(ws, 'CK')
  return [{ ...w, specChecks: [...(w.specChecks ?? []), { id, ...clean(input) }] }, id]
}

export function updateCheck(ws: Workspace, id: string, input: CheckInput): Workspace {
  return {
    ...ws,
    specChecks: (ws.specChecks ?? []).map((c) => (c.id === id ? { id, ...clean(input) } : c)),
  }
}

/**
 * A check taken off the list. Receipts already inspected against it keep their
 * result — what was checked on the day is a fact about that day, not about
 * today's list.
 */
export function removeCheck(ws: Workspace, id: string): Workspace {
  return { ...ws, specChecks: (ws.specChecks ?? []).filter((c) => c.id !== id) }
}

/**
 * One material's list, written as a whole: rows carrying an id are edited,
 * rows without one are added, and a stored check no longer in the list is
 * taken off it. The wizard and the Checks screen both save this way, so
 * "remove" means the same thing in both.
 */
export function setChecks(
  ws: Workspace, itemId: string, list: { id?: string; input: CheckInput }[],
): Workspace {
  const keep = new Set(list.map((r) => r.id).filter(Boolean) as string[])
  let w = ws
  for (const c of checksFor(w, itemId)) if (!keep.has(c.id)) w = removeCheck(w, c.id)
  for (const r of list) {
    w = r.id ? updateCheck(w, r.id, r.input) : addCheck(w, r.input)[0]
  }
  return w
}
