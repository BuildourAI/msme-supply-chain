/**
 * What a supplier's document is, once the system has read it.
 *
 * The sample company has all of this as fixtures in `lib/seed/intake.ts` — a
 * `SupplierDocument`, a `SupplierDocLine`, a review queue. These are the owner's
 * equivalents, and they are separate types on purpose rather than a widening of
 * the sample's. The sample's are a worked example with no file behind them;
 * these describe something an owner actually uploaded, and they have to carry
 * what the sample never needed: a mime type, a size, how the text was got out,
 * and whether the bytes made it to the account copy.
 */
import type { Uom } from '@/lib/domain/types'

/** How it reached the owner. The sample's channel glyph, as an input. */
export type DocChannel = 'email' | 'whatsapp' | 'hand'

/**
 * How the words were got out — and the owner is owed this plainly.
 *
 * "Read from the text in the PDF" and "read off a photograph" are not the same
 * claim about the figures below them, and a screen that showed both the same
 * way would be overstating one of them.
 */
export type DocRead = 'pdf-text' | 'photo' | 'sheet' | 'typed'

export type DocStatus = 'draft' | 'approved'

/**
 * Why a line reads the way it does.
 *
 * The same four words the sample uses, for the same reasons: `alias` is this
 * supplier's wording already learned, `matched` cleared the floor on its own,
 * `review` needs a person, `unmapped` is a line this factory does not buy and
 * is kept as price history rather than forced under a nearby material.
 */
export type DocVia = 'alias' | 'matched' | 'review' | 'unmapped'

export interface DocLine {
  /** document-scoped, like the sample's — `SD-001/3` */
  id: string
  /** the supplier's own wording, exactly as it arrived. Never edited. */
  raw: string
  qty?: number
  /** as written on the document, before `parseUom` has an opinion */
  uom?: string
  rate?: number
  /** what the matcher suggested, which the owner may overrule */
  itemId?: string
  /** 0–1. Exactly 1 means a confirmed alias, and nothing else is ever 1. */
  confidence: number
  via: DocVia
  /** what the owner decided, once they have. Absent means still in the queue. */
  decision?: 'accepted' | 'rejected'
  /**
   * The material on this line was chosen by a person, not suggested.
   *
   * The distinction earns its field when the supplier is changed and every line
   * is matched again: a suggestion should be recomputed against the new
   * supplier, and a choice somebody made by hand should not be quietly undone.
   * Without it the two are indistinguishable, and keeping both meant a wording
   * learned from one supplier survived being reassigned to another.
   */
  picked?: boolean
  /** add this wording to the item master on approval — off unless ticked */
  creates?: boolean
  /** the name to create it under, when it is */
  newName?: string
  newUom?: Uom
}

export interface SupplierDoc {
  /** SD-001 */
  id: string
  /** set once a supplier is chosen or created */
  vendorId?: string
  /** as read off the document, or as typed — before there is a vendor */
  vendorName: string
  fileName: string
  mime: string
  bytes: number
  channel: DocChannel
  read: DocRead
  /** the date on the document */
  receivedAt: string
  /** the day it was uploaded, which is not the same thing */
  addedAt: string
  docNo?: string
  terms?: string
  validUntil?: string
  lines: DocLine[]
  status: DocStatus
  /**
   * The `ImportUndo` this approval wrote. It is how the Documents screen can
   * say "this can still be put back" truthfully rather than hopefully: only the
   * row whose id still matches `ws.lastImport` can be.
   */
  appliedUndoId?: string
  /**
   * Where the bytes are, in the account's storage. A path, never a signed URL —
   * a URL expires, and one written into a document that is pushed, cached and
   * synced is a capability left lying around.
   */
  remotePath?: string
}

/**
 * A supplier's own wording, resolved to one of the owner's materials, for good.
 *
 * This is the deliverable. The sample company's screen says it plainly — the
 * mapping table is the point, not the parser; a better parser shortens the
 * queue, only the table makes the data usable by everything downstream.
 *
 * Keyed by `vendorId` and not by name, which is the one place this departs from
 * the sample. The sample's vendors are seed strings with no ids; the owner's
 * have real ones, and a name key would silently drop every learned wording the
 * first time somebody corrected a supplier's spelling.
 */
export interface VendorAlias {
  vendorId: string
  /** their exact wording, as it appeared. Matching normalises; storage does not. */
  raw: string
  itemId: string
  confirmedBy: string
  confirmedAt: string
}

/** Enough for a long price list. Past it the owner is told what was dropped. */
export const MAX_DOC_LINES = 300
