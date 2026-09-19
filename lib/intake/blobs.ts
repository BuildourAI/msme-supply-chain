/**
 * The uploaded file itself, kept on this device.
 *
 * It does not go on the workspace, and that is the whole reason this file
 * exists. The workspace is one JSON string in localStorage and one JSONB column
 * in Postgres, pushed whole a couple of seconds after every change; a single
 * photographed quotation base64'd into it would be bigger than everything else
 * the owner has ever typed.
 *
 * So the bytes live in IndexedDB, keyed by document id, and the workspace keeps
 * only what was read out of them. Which is the right split anyway: the extracted
 * lines are what every screen needs, and the original is evidence — worth
 * keeping, rarely opened.
 *
 * Every call is wrapped and every failure is survivable, exactly as
 * `lib/workspace/storage.ts` treats localStorage. IndexedDB refuses in a private
 * window, in an iframe with third-party storage blocked, and when a quota is
 * full, and a supplier screen must not be the thing that breaks over it.
 */
const DB = 'msme.docs'
const STORE = 'files'
const VERSION = 1

interface Held {
  blob: Blob
  name: string
  type: string
  at: string
}

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') { resolve(null); return }
      const req = indexedDB.open(DB, VERSION)
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE)
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
      // a blocked upgrade never settles either way; treating it as absent beats
      // a screen that waits for ever
      req.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

/** Whether this browser will keep a file at all. Checked before offering to. */
export async function canKeepFiles(): Promise<boolean> {
  const db = await open()
  db?.close()
  return db !== null
}

/**
 * One transaction, awaited to the end of it.
 *
 * Resolving on the request rather than the transaction is the mistake worth
 * naming here, because it does not look like one. A `put` reports success the
 * moment the value is accepted — before the transaction commits — so closing
 * the database on that signal aborts the write, silently, and the file is
 * simply not there the next time anybody looks for it. Which is exactly what
 * happened: every uploaded document opened to "the original is on the device
 * it came from", on the device it came from.
 */
async function run<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest,
): Promise<T | null> {
  const db = await open()
  if (!db) return null
  try {
    return await new Promise<T | null>((resolve) => {
      const tx = db.transaction(STORE, mode)
      const req = fn(tx.objectStore(STORE))
      let got: T | null = null
      req.onsuccess = () => { got = req.result as T }
      req.onerror = () => { got = null }
      tx.oncomplete = () => resolve(got)
      tx.onerror = () => resolve(null)
      tx.onabort = () => resolve(null)
    })
  } catch {
    return null
  } finally {
    db.close()
  }
}

/**
 * Keep a file against a document.
 *
 * The `Blob` goes in as it is. IndexedDB stores one natively, where base64
 * would cost a third more space and a serialise on the way in and out.
 */
export async function putFile(docId: string, file: File, at: string): Promise<boolean> {
  const held: Held = { blob: file, name: file.name, type: file.type, at }
  return (await run<IDBValidKey>('readwrite', (s) => s.put(held, docId))) !== null
}

export async function getFile(docId: string): Promise<Blob | null> {
  const held = await run<Held | undefined>('readonly', (s) => s.get(docId))
  return held?.blob ?? null
}

export async function dropFile(docId: string): Promise<void> {
  await run('readwrite', (s) => s.delete(docId))
}

/** Which documents this device actually holds the original of. */
export async function heldIds(): Promise<string[]> {
  const keys = await run<IDBValidKey[]>('readonly', (s) => s.getAllKeys())
  return (keys ?? []).map(String)
}

/**
 * Forget files whose document is gone.
 *
 * Deleting a document on one device removes the record everywhere, because the
 * record is in the workspace — but the bytes are not, so without this they
 * would sit in the first device's storage for good.
 */
export async function prune(keep: string[]): Promise<number> {
  const have = await heldIds()
  const wanted = new Set(keep)
  const stale = have.filter((id) => !wanted.has(id))
  for (const id of stale) await dropFile(id)
  return stale.length
}
