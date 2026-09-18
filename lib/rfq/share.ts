/**
 * Handing a request to somebody, without the system ever sending it.
 *
 * Every one of these opens something the person then presses send in. That is
 * §11 — the system drafts and recommends, it never contacts a supplier — and it
 * is also simply what a browser can do: there is no way to attach a file to a
 * `mailto:` or to post a WhatsApp message from a page, and pretending otherwise
 * would mean a backend, a mail provider and a verified WhatsApp sender.
 *
 * What the app does contribute is the part that is tedious: the PDF, the
 * message with the numbers already in it, and the record that you sent it.
 */
import type { RfqDoc } from './document'

/* ----------------------------------------------------------------- phone -- */

/**
 * A number as `wa.me` needs it: digits, with a country code, and nothing else.
 *
 * People store numbers as `98765 43210`, `+91 98765 43210` and `098765 43210`
 * interchangeably. A bare ten-digit Indian mobile is assumed to be Indian and
 * given 91; a leading zero is a trunk prefix and goes. Anything that does not
 * resolve to a plausible international number comes back null, and the caller
 * asks for one rather than opening a chat with the wrong person.
 */
export function waNumber(raw: string | undefined): string | null {
  if (!raw) return null
  let digits = raw.replace(/\D/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  // a domestic trunk zero in front of a 10-digit mobile
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1)
  if (digits.length === 10) digits = `91${digits}`
  return digits.length >= 11 && digits.length <= 15 ? digits : null
}

/* --------------------------------------------------------------- message -- */

/**
 * The request in words.
 *
 * Written to stand on its own, because on a phone the realistic outcome is that
 * this text gets sent and the PDF does not — and a supplier can quote from four
 * lines naming the material, the quantity and the date. The attachment is the
 * formal version, not the only version.
 */
export function messageFor(doc: RfqDoc): string {
  const lines = [
    `${doc.company.name} — request for quotation ${doc.no}`,
    '',
    `Material: ${doc.item}`,
    `Quantity: ${doc.qty}`,
    `Needed by: ${doc.neededBy}`,
  ]
  if (doc.spec) lines.push(`Spec: ${doc.spec}`)
  for (const e of doc.extras) lines.push(`${e.label}: ${e.value}`)
  const quoteBy = doc.terms.find((t) => t.label === 'Please quote by')
  if (quoteBy) lines.push('', `Please send your price and earliest delivery by ${quoteBy.value}.`)
  lines.push('', doc.contact)
  return lines.join('\n')
}

export const subjectFor = (doc: RfqDoc): string =>
  `Request for quotation ${doc.no} — ${doc.item}`

/* ------------------------------------------------------------------ links -- */

export function whatsappUrl(doc: RfqDoc, phone: string | undefined): string | null {
  const number = waNumber(phone)
  if (!number) return null
  return `https://wa.me/${number}?text=${encodeURIComponent(messageFor(doc))}`
}

/**
 * A `mailto:` link.
 *
 * The body is capped, because several mail clients truncate a long one without
 * saying so and a request cut off mid-quantity is worse than one that points at
 * the attachment. The PDF carries the full version either way.
 */
export function mailtoUrl(doc: RfqDoc, email: string | undefined): string {
  const body = messageFor(doc).slice(0, 1500)
  const query = [
    `subject=${encodeURIComponent(subjectFor(doc))}`,
    `body=${encodeURIComponent(body)}`,
  ].join('&')
  return `mailto:${encodeURIComponent(email ?? '')}?${query}`
}

/* ------------------------------------------------------------------ share -- */

/**
 * Whether this browser can hand a FILE to another app.
 *
 * Gated on `canShare` with the actual file rather than on `'share' in
 * navigator`: several desktop browsers have `share` and reject files, so the
 * looser test offers a button that fails when pressed.
 */
export function canShareFile(file: File): boolean {
  if (typeof navigator === 'undefined') return false
  const n = navigator as Navigator & { canShare?: (d: unknown) => boolean }
  return typeof n.share === 'function' && typeof n.canShare === 'function'
    && n.canShare({ files: [file] })
}

export type ShareResult = 'shared' | 'cancelled' | 'failed'

/**
 * Open the OS share sheet with the PDF in it.
 *
 * The file has to be built BEFORE the click that calls this — `share()` needs
 * the user gesture to still be live, and awaiting a 340 KB dynamic import in
 * the handler is long enough to lose it.
 *
 * A cancel is not a failure. It comes back as its own result so the caller does
 * not record that a request was sent when the person backed out of sending it.
 */
export async function shareFile(file: File, doc: RfqDoc): Promise<ShareResult> {
  try {
    await navigator.share({ files: [file], title: subjectFor(doc), text: messageFor(doc) })
    return 'shared'
  } catch (e) {
    return (e as DOMException)?.name === 'AbortError' ? 'cancelled' : 'failed'
  }
}
