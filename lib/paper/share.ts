/**
 * Handing a document to somebody, without the system ever sending it.
 *
 * Every one of these opens something the person then presses send in. That is
 * §11 — the system drafts and recommends, it never contacts a supplier — and it
 * is also simply what a browser can do: there is no way to attach a file to a
 * `mailto:` or to post a WhatsApp message from a page, and pretending otherwise
 * would mean a backend, a mail provider and a verified WhatsApp sender.
 *
 * What the app does contribute is the part that is tedious: the PDF, the
 * message with the numbers already in it, and the record that you sent it.
 *
 * Generic over what is being handed over. A request for prices and a purchase
 * order need the same four buttons and the same phone-number cleaning, and
 * differ only in the words — so the words are the argument.
 */

/**
 * A document, as far as sending it is concerned.
 *
 * Deliberately not `RfqDoc | PoDoc`. Sending does not care what the document
 * says; it cares who it is for, what the subject line is, and what goes in the
 * message body when the PDF does not make it — which on a phone is most of the
 * time.
 */
export interface Sendable {
  /** the supplier it is addressed to, if any */
  vendor: { name: string } | null
  subject: string
  /**
   * The document in words.
   *
   * Written to stand on its own, because on a phone the realistic outcome is
   * that this text gets sent and the PDF does not — and a supplier can act on
   * four lines naming the material, the quantity and the date. The attachment
   * is the formal version, not the only version.
   */
  message: string
}

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

/* ------------------------------------------------------------------ links -- */

export function whatsappUrl(send: Sendable, phone: string | undefined): string | null {
  const number = waNumber(phone)
  if (!number) return null
  return `https://wa.me/${number}?text=${encodeURIComponent(send.message)}`
}

/**
 * A `mailto:` link.
 *
 * The body is capped, because several mail clients truncate a long one without
 * saying so and a document cut off mid-quantity is worse than one that points
 * at the attachment. The PDF carries the full version either way.
 */
export function mailtoUrl(send: Sendable, email: string | undefined): string {
  const body = send.message.slice(0, 1500)
  const query = [
    `subject=${encodeURIComponent(send.subject)}`,
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
 * not record that a document was sent when the person backed out of sending it.
 */
export async function shareFile(file: File, send: Sendable): Promise<ShareResult> {
  try {
    await navigator.share({ files: [file], title: send.subject, text: send.message })
    return 'shared'
  } catch (e) {
    return (e as DOMException)?.name === 'AbortError' ? 'cancelled' : 'failed'
  }
}
