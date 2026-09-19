/**
 * The uploaded document, kept in the account as well as on the device.
 *
 * Local first, the same way the workspace itself is. The bytes are already in
 * this browser's own storage before anything is sent, so the screen never waits
 * on a network round trip and an owner with no account loses nothing. What the
 * mirror buys is the second device: a quote photographed on a phone, opened on
 * the laptop in the office.
 *
 * Two rules worth stating.
 *
 * The bucket is private and every policy on it compares the first segment of
 * the path to `auth.uid()`, which is why the path starts with that id rather
 * than with the workspace. An owner can read exactly their own documents and
 * nothing else, with no session at all reading nothing.
 *
 * And what gets written onto the workspace is a PATH, never a signed URL. A URL
 * expires, so it would be wrong within the hour; worse, the workspace is pushed
 * to Postgres, cached and synced, and a capability written into it is a
 * capability left lying around.
 */
import { supabase } from '@/lib/workspace/supabase'
import type { SupplierDoc } from './types'

const BUCKET = 'supplier-docs'

/** The bucket refuses anything larger, so there is no point starting. */
export const MAX_MIRROR_BYTES = 10 * 1024 * 1024

/** Nothing exotic in a key — a supplier's filename is not to be trusted with one. */
const safe = (name: string) => name.replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 80) || 'document'

export const pathFor = (userId: string, workspaceId: string, doc: SupplierDoc): string =>
  `${userId}/${workspaceId}/${doc.id}-${safe(doc.fileName)}`

/**
 * Send one up. Never awaited by a screen — the file is already safe on the
 * device, so a failure here costs freshness rather than the document.
 */
export async function mirrorUp(path: string, file: Blob, mime: string): Promise<boolean> {
  const db = supabase()
  if (!db || file.size > MAX_MIRROR_BYTES) return false
  const { error } = await db.storage.from(BUCKET).upload(path, file, {
    contentType: mime || 'application/octet-stream',
    upsert: true,
  })
  return !error
}

/** Fetch one back, on a device that has the record but not the bytes. */
export async function mirrorDown(path: string): Promise<Blob | null> {
  const db = supabase()
  if (!db) return null
  const { data, error } = await db.storage.from(BUCKET).download(path)
  return error ? null : data
}

export async function mirrorRemove(path: string): Promise<void> {
  const db = supabase()
  if (!db) return
  await db.storage.from(BUCKET).remove([path])
}
