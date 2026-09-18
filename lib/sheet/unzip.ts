/**
 * Enough of the ZIP format to open an .xlsx, and not one byte more.
 *
 * An .xlsx is a zip of XML. Reading one needs a zip reader, and the obvious
 * move is to install SheetJS — except the `xlsx` package on npm carries an
 * unfixed high-severity advisory, and the path it affects is exactly this one:
 * parsing a file somebody hands you. The fixed builds live on the vendor's own
 * CDN rather than npm, which is not a dependency worth taking on.
 *
 * So: the browser already has an inflater. `DecompressionStream('deflate-raw')`
 * is what a zip entry needs, and the rest is reading a well-documented header
 * layout. That is about a hundred lines against half a megabyte of dependency,
 * and it keeps this build's runtime dependencies at what the UI actually needs.
 *
 * What it does NOT do, deliberately: zip64 (a spreadsheet of supplier names is
 * not four gigabytes), encryption, and compression methods other than store and
 * deflate. Excel, LibreOffice and Google Sheets all write store+deflate. A file
 * that uses anything else gets a clear error rather than a wrong answer.
 */

/** Little-endian reads — every multi-byte field in a zip is little-endian. */
const u32 = (v: DataView, o: number) => v.getUint32(o, true)
const u16 = (v: DataView, o: number) => v.getUint16(o, true)

const SIG_EOCD = 0x06054b50
const SIG_CENTRAL = 0x02014b50

/** Compression method 8. Method 0 is stored, and needs no inflating. */
const DEFLATED = 8

/**
 * Whether this browser can inflate at all.
 *
 * `DecompressionStream` landed before `deflate-raw` did, so the constructor
 * existing is not enough — it has to be constructed with the format to know.
 * Checked before a file is picked rather than after, so somebody on an older
 * phone is told to save their sheet as CSV instead of watching an upload fail.
 */
export function canReadXlsx(): boolean {
  try {
    if (typeof DecompressionStream === 'undefined') return false
    void new DecompressionStream('deflate-raw')
    return true
  } catch {
    return false
  }
}

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  // `deflate-raw` rather than `deflate`: a zip entry has no zlib wrapper.
  const stream = new Blob([bytes as BlobPart]).stream()
    .pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/**
 * The 2003 binary format, which is not a zip at all.
 *
 * Worth detecting by its magic rather than its extension, because a file saved
 * as .xls and renamed .xlsx is common and "that does not look like an .xlsx"
 * does not tell anybody what to do about it.
 */
export function looksLikeOldXls(buf: ArrayBuffer): boolean {
  const b = new Uint8Array(buf, 0, Math.min(8, buf.byteLength))
  return b.length >= 8 && b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0
}

/**
 * The end-of-central-directory record, found by scanning backwards.
 *
 * It has to be a scan rather than a fixed offset because the record ends with a
 * variable-length comment. The search is bounded to the largest a comment can
 * be (64 KiB) so a file that is not a zip fails quickly instead of walking the
 * whole buffer.
 */
function findEocd(b: Uint8Array, v: DataView): number {
  const floor = Math.max(0, b.length - 22 - 0xffff)
  for (let i = b.length - 22; i >= floor; i--) {
    if (u32(v, i) !== SIG_EOCD) continue
    /*
     * The signature alone is not enough. Scanning backwards finds the LAST
     * occurrence, and those four bytes can appear inside the archive comment
     * that follows the real record. A candidate is only believed if the
     * directory it points at is inside the file and its comment length is
     * exactly the bytes remaining — which a stray match will not satisfy.
     */
    const size = u32(v, i + 12)
    const offset = u32(v, i + 16)
    const commentLen = u16(v, i + 20)
    if (offset + size <= b.length && i + 22 + commentLen === b.length) return i
  }
  return -1
}

/**
 * Every entry in the archive, by name, already decompressed.
 *
 * An .xlsx holds a handful of small parts, so reading them all is cheaper than
 * the bookkeeping to read some of them lazily.
 */
export async function unzip(buf: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const b = new Uint8Array(buf)
  if (b.length < 22) throw new Error('That file is too small to be a spreadsheet.')
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength)

  if (looksLikeOldXls(buf)) {
    throw new Error('That is the older .xls format. Open it in Excel and use Save As → .xlsx.')
  }
  const eocd = findEocd(b, v)
  if (eocd < 0) throw new Error('That does not look like an .xlsx file.')

  const count = u16(v, eocd + 10)
  let p = u32(v, eocd + 16)
  const out = new Map<string, Uint8Array>()

  for (let i = 0; i < count; i++) {
    if (p + 46 > b.length || u32(v, p) !== SIG_CENTRAL) {
      throw new Error('That .xlsx file is damaged and cannot be read.')
    }
    const method = u16(v, p + 10)
    const compressed = u32(v, p + 20)
    const nameLen = u16(v, p + 28)
    const extraLen = u16(v, p + 30)
    const commentLen = u16(v, p + 32)
    const localHeader = u32(v, p + 42)
    const name = new TextDecoder().decode(b.subarray(p + 46, p + 46 + nameLen))

    /*
     * The data offset is recomputed from the LOCAL header's own name and extra
     * lengths, never from the central one. The two disagree in practice —
     * writers put different extra fields in each — and trusting the central
     * copy reads the entry a few bytes off, which inflates to garbage rather
     * than to an error.
     */
    const lNameLen = u16(v, localHeader + 26)
    const lExtraLen = u16(v, localHeader + 28)
    const start = localHeader + 30 + lNameLen + lExtraLen
    const raw = b.subarray(start, start + compressed)

    if (method !== 0 && method !== DEFLATED) {
      throw new Error('That .xlsx file uses a compression this cannot read. Save it again from Excel.')
    }
    out.set(name, method === 0 ? raw : await inflateRaw(raw))
    p += 46 + nameLen + extraLen + commentLen
  }
  return out
}
