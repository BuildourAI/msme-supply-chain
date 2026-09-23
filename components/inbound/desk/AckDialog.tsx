'use client'
import { useEffect, useRef, useState } from 'react'
import { Dialog } from '@/components/ui/Dialog'
import { Field, TextInput } from '@/components/ui/Field'
import { Icon } from '@/components/ui/icons'
import { useAuth } from '@/components/workspace/auth'
import { useWorkspace } from '@/components/workspace/store'
import { dropFile, getFile, putFile } from '@/lib/intake/blobs'
import { MAX_MIRROR_BYTES, mirrorDown, mirrorRemove, mirrorUp } from '@/lib/intake/mirror'
import { money, num, shortDate } from '@/lib/domain/format'
import { latestOf, recordAck, syncLine } from '@/lib/workspace/orders'

/**
 * Where a picture of a confirmation is kept in the account.
 *
 * Worked out from the ids rather than written onto the order, so a second
 * device that has the order but not the picture knows where to ask for it —
 * and the first segment is the user's own id, which is what the storage
 * policies compare against.
 */
export const ackPath = (userId: string, workspaceId: string, imageId: string) =>
  `${userId}/${workspaceId}/${imageId}`

/**
 * The supplier confirmed.
 *
 * By order number, because a supplier confirms a page, not a line. Against
 * something somebody can point to later: what they said and where, a picture
 * of it — the WhatsApp reply, the signed copy — or both. There is no supplier
 * login in this build and there will not be one: a supplier in this market
 * answers on WhatsApp and will never open a portal, so the confirmation is
 * recorded by the person who got it.
 *
 * The picture is kept on this device, and in the account when signed in. It
 * never goes on the workspace itself, which is pushed whole every few seconds.
 */
export function AckDialog({ no, onClose }: { no: string | null; onClose: () => void }) {
  const { workspace, update, today } = useWorkspace()
  const { account } = useAuth()
  const [ref, setRef] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const pick = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setRef(''); setFile(null); setTried(false); setBusy(false)
  }, [no])
  useEffect(() => {
    if (!file) { setPreview(null); return }
    const u = URL.createObjectURL(file)
    setPreview(u)
    return () => URL.revokeObjectURL(u)
  }, [file])

  if (!workspace || !no) return null
  const ws = workspace
  const lines = ws.orders
    .filter((o) => o.no === no && (o.state === 'confirmed' || o.state === 'shipped'))
    .map((o) => syncLine(ws, o, today))
    .filter((l): l is NonNullable<typeof l> => l !== null)
  if (lines.length === 0) return null
  const vendor = ws.vendors.find((v) => v.id === lines[0].order.vendorId)
  const moving = lines.filter((l) => l.state !== 'acknowledged')
  const exposure = moving.reduce((a, l) => a + l.exposure.value, 0)
  const ok = ref.trim().length >= 3 || file !== null

  const save = async () => {
    setTried(true)
    if (!ok || busy) return
    setBusy(true)
    let imageId: string | undefined
    if (file) {
      imageId = `ACK-${no}-${Date.now().toString(36)}`
      // kept before the order points at it, so the card never shows a gap
      const kept = await putFile(imageId, file, today)
      if (!kept && !account) imageId = undefined
      if (account && imageId && file.size <= MAX_MIRROR_BYTES) {
        void mirrorUp(ackPath(account.id, ws.id, imageId), file, file.type)
      }
    }
    const was = ws.orders.find((o) => o.no === no && o.ackImageId)?.ackImageId
    update((w) => recordAck(w, no, {
      ref: ref.trim() || `Picture of their confirmation, ${shortDate(today)}`, on: today, imageId,
    }))
    // the earlier picture proved an earlier confirmation, and nothing points at it now
    if (was && was !== imageId) {
      void dropFile(was)
      if (account) void mirrorRemove(ackPath(account.id, ws.id, was))
    }
    onClose()
  }

  return (
    <Dialog open onClose={onClose} title={`${vendor?.name ?? 'The supplier'} confirmed ${no}`}
      sub={moving.length > 0
        ? `Confirming ${moving.map((l) => `v${latestOf(l.order)?.version ?? 1}`).join(', ')} — what they will now make`
        : 'Every line is already in step — this keeps their confirmation on file'}>
      <div className="space-y-4 px-4 py-4">
        {moving.length > 0 && (
          <ul className="space-y-1 rounded-lg border border-line bg-surface-2 px-3 py-2">
            {moving.map((l) => (
              <li key={l.order.id} className="flex flex-wrap items-baseline gap-x-2 text-[12.5px]">
                <span className="min-w-0 flex-1 truncate font-medium">{l.item?.name ?? 'Unknown material'}</span>
                <span className="num text-ink-3 line-through">{num(l.making.value, 3)}</span>
                <span className="num font-semibold">{num(l.need.value, 3)} {l.uom}</span>
                <span className="mono text-[11px] text-ink-3">by {shortDate(l.sync.revisions[l.sync.revisions.length - 1].promisedDate)}</span>
              </li>
            ))}
          </ul>
        )}

        <Field label="What did they say, and where?" htmlFor="ack-ref"
          hint="A reference you can point to — the message, who sent it, when.">
          <TextInput id="ack-ref" value={ref} onChange={setRef} autoFocus
            placeholder="WhatsApp from Rakesh, 14:10 — “ok 150 confirmed”" />
        </Field>

        <Field label="A picture of it" hint="Optional — a screenshot of the reply, a photo of the signed copy.">
          <input ref={pick} id="ack-image" type="file" accept="image/*" className="sr-only"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          {file && preview ? (
            <div className="flex items-center gap-3 rounded-lg border border-line bg-surface px-2.5 py-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="The confirmation you picked"
                className="size-14 shrink-0 rounded-md border border-line object-cover" />
              <span className="min-w-0 flex-1 truncate text-[12.5px]">{file.name}</span>
              <button type="button" onClick={() => { setFile(null); if (pick.current) pick.current.value = '' }}
                className="press rounded-md p-1.5 text-ink-4 hover:bg-critical-soft hover:text-critical">
                <Icon name="trash" className="size-4" />
                <span className="sr-only">Remove the picture</span>
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => pick.current?.click()}
              className="press flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-line bg-surface px-3 py-3 text-[12.5px] text-ink-2 hover:bg-surface-2">
              <Icon name="camera" className="size-4" />
              Add a screenshot or photo
            </button>
          )}
        </Field>

        {moving.length > 0 && (
          <p className="rounded-lg border border-good/30 bg-good-soft px-3 py-2.5 text-[12.5px] leading-relaxed text-ink-2">
            From here cover counts what they have now agreed to make
            {exposure > 0 && <>, and the <strong className="text-ink">{money(exposure)}</strong> riding on the
            unconfirmed change goes to nothing</>}.
          </p>
        )}

        {tried && !ok && (
          <p className="text-[12.5px] text-critical">Say what they confirmed with, or add a picture of it.</p>
        )}
      </div>
      <footer className="flex items-center gap-2 border-t border-line-soft px-4 py-3">
        <button type="button" onClick={onClose}
          className="press rounded-lg px-2.5 py-2 text-[13px] text-ink-2 hover:text-ink">Cancel</button>
        <span className="ml-auto" />
        <button type="button" onClick={() => void save()} disabled={busy}
          className="press rounded-lg border border-accent-ink bg-accent-ink px-3.5 py-2 text-[13px] font-semibold text-on-accent hover:bg-accent disabled:opacity-50">
          Record their confirmation
        </button>
      </footer>
    </Dialog>
  )
}

/**
 * A kept picture of a confirmation, small, opening full size.
 *
 * Read from this device first. A device that has the order but not the
 * picture asks the account for it — and keeps it, so it asks once.
 */
export function AckImage({ id, onRemove }: { id: string; onRemove?: () => void }) {
  const { workspace, today } = useWorkspace()
  const { account } = useAuth()
  const [url, setUrl] = useState<string | null>(null)
  const [gone, setGone] = useState(false)
  const wsId = workspace?.id

  useEffect(() => {
    let alive = true
    let made: string | null = null
    void (async () => {
      let blob = await getFile(id)
      if (!blob && account && wsId) {
        blob = await mirrorDown(ackPath(account.id, wsId, id))
        if (blob) void putFile(id, new File([blob], id, { type: blob.type }), today)
      }
      if (!alive) return
      if (blob) { made = URL.createObjectURL(blob); setUrl(made); setGone(false) } else setGone(true)
    })()
    return () => { alive = false; if (made) URL.revokeObjectURL(made) }
  }, [id, account?.id, wsId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (gone) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-ink-3" data-ack-image={id}>
        <Icon name="camera" className="size-3.5" />
        picture kept on another device
      </span>
    )
  }
  return (
    <span className="relative inline-block shrink-0" data-ack-image={id}>
      <a href={url ?? undefined} target="_blank" rel="noopener"
        className="block size-12 overflow-hidden rounded-md border border-line bg-surface-2"
        title="Their confirmation — opens full size">
        {url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="The supplier’s confirmation" className="size-full object-cover" />
        )}
      </a>
      {onRemove && (
        <button type="button" onClick={onRemove} title="Remove the picture"
          className="press absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full border border-line bg-surface text-ink-3 hover:text-critical">
          <Icon name="close" className="size-3" />
          <span className="sr-only">Remove the picture</span>
        </button>
      )}
    </span>
  )
}
