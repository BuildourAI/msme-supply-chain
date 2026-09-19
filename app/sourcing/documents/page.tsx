'use client'
import { useEffect, useState } from 'react'
import { ListPage } from '@/components/ui/ListPage'
import { DataTable, StatePill, type Column } from '@/components/ui/DataTable'
import { DeskOnly } from '@/components/sourcing/DeskOnly'
import { ConfirmDelete } from '@/components/sourcing/ConfirmDelete'
import { Icon } from '@/components/ui/icons'
import { UploadDialog } from '@/components/intake/UploadDialog'
import { DocViewer } from '@/components/intake/DocViewer'
import { AliasPanel } from '@/components/intake/AliasPanel'
import { useWorkspace } from '@/components/workspace/store'
import { dropFile, prune } from '@/lib/intake/blobs'
import { stillUndoable } from '@/lib/intake/apply'
import { waitingOn } from '@/lib/intake/draft'
import { shortDate } from '@/lib/domain/format'
import type { SupplierDoc } from '@/lib/intake/types'

/**
 * What suppliers have sent, and what became of each.
 *
 * The owner's SRC-02. The sample company's version of this screen is a
 * dashboard — a queue, an alias table, a donut and a channel breakdown — which
 * is right for a worked example and wrong here. This portal's shape is one
 * table per screen, so the review queue lives inside the upload wizard where
 * the decisions are actually made, the learned wordings live one click away,
 * and what is left is the list: what came in, from whom, and whether it has
 * been filed.
 */
export default function Page() {
  return <DeskOnly><Documents /></DeskOnly>
}

const STATUS: Record<SupplierDoc['status'], { label: string; tone: 'good' | 'warn' }> = {
  draft: { label: 'Waiting on you', tone: 'warn' },
  approved: { label: 'Filed', tone: 'good' },
}

const CHANNEL: Record<SupplierDoc['channel'], string> = {
  email: 'Email', whatsapp: 'WhatsApp', hand: 'By hand',
}

function Documents() {
  const { workspace, update } = useWorkspace()
  const [uploading, setUploading] = useState(false)
  const [resuming, setResuming] = useState<SupplierDoc | null>(null)
  const [viewing, setViewing] = useState<SupplierDoc | null>(null)
  const [aliases, setAliases] = useState(false)
  const [deleting, setDeleting] = useState<SupplierDoc | null>(null)

  /*
   * Files whose document is gone. Deleting one on a second device removes the
   * record everywhere, because the record is in the workspace — but the bytes
   * are not, so without this they sit in the first device's storage for good.
   */
  const ids = workspace?.docs.map((d) => d.id).join(',') ?? ''
  useEffect(() => { void prune(ids ? ids.split(',') : []) }, [ids])

  if (!workspace) return null
  const ws = workspace
  const rows = [...ws.docs].sort((a, b) => b.addedAt.localeCompare(a.addedAt) || b.id.localeCompare(a.id))

  const mapped = (d: SupplierDoc) => d.lines.filter((l) => l.itemId).length

  const columns: Column<SupplierDoc>[] = [
    {
      key: 'vendor', head: 'Supplier',
      cell: (d) => <span className="font-semibold text-ink">{d.vendorName}</span>,
    },
    {
      key: 'file', head: 'Document',
      cell: (d) => (
        <span className="block max-w-[14rem]">
          <span className="mono block truncate text-[12px]">{d.fileName}</span>
          <span className="block text-[10.5px] text-ink-3">{READ[d.read]}</span>
        </span>
      ),
    },
    { key: 'in', head: 'In', cell: (d) => <span className="text-ink-2">{CHANNEL[d.channel]}</span> },
    { key: 'lines', head: 'Lines', align: 'right', cell: (d) => String(d.lines.length) },
    {
      key: 'mapped', head: 'Mapped', align: 'right',
      /* a price list is mostly things this factory does not buy, and the column
         says so rather than letting the line count imply otherwise */
      cell: (d) => (mapped(d) === 0
        ? <span className="text-ink-4">none</span>
        : <span><span className="num">{mapped(d)}</span>
          <span className="text-ink-3"> of {d.lines.length}</span></span>),
    },
    {
      key: 'received', head: 'Received', align: 'right',
      cell: (d) => <span className="mono text-[11.5px] text-ink-3">{shortDate(d.receivedAt)}</span>,
    },
    {
      key: 'status', head: 'Status',
      cell: (d) => (
        <span className="flex flex-wrap items-center gap-1.5">
          <StatePill label={STATUS[d.status].label} tone={STATUS[d.status].tone} />
          {d.status === 'approved' && stillUndoable(ws, d) && (
            <span className="text-[10.5px] text-ink-3">can still be put back</span>
          )}
        </span>
      ),
    },
  ]

  const waiting = ws.docs.reduce((n, d) => n + (d.status === 'draft' ? waitingOn(d.lines) : 0), 0)

  return (
    <>
      <ListPage
        title="Documents" noun="document" rows={rows}
        search={(d) => `${d.vendorName} ${d.fileName} ${d.lines.map((l) => l.raw).join(' ')}`}
        filter={{
          label: 'All documents',
          options: [
            { value: 'draft', label: 'Waiting on you' },
            { value: 'approved', label: 'Filed' },
          ],
          of: (d) => d.status,
        }}
        action={{ label: 'Upload document', onClick: () => setUploading(true), icon: 'upload' }}
        tools={
          <button type="button" onClick={() => setAliases(true)}
            className="press inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-2 text-[13px] font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink">
            <Icon name="doc" className="size-3.5" />
            <span className="hidden sm:inline">Learned wordings</span>
            <span className="sr-only sm:hidden">Learned wordings</span>
            {ws.aliases.length > 0 && (
              <span className="mono text-[10.5px] text-ink-3">{ws.aliases.length}</span>
            )}
          </button>
        }
        empty={{
          line: 'Nothing has come in yet. Upload a quote or a price list — a PDF, a photo of a '
            + 'printed one, or a spreadsheet — and it will be read and matched to your materials.',
          cta: 'Upload your first document',
        }}>
        {(shown) => (
          <>
            {waiting > 0 && (
              <p className="border-b border-line-soft bg-warn-soft/40 px-3 py-2 text-[12px] text-ink-2">
                <strong className="text-ink">{waiting} line{waiting === 1 ? '' : 's'}</strong>
                {' '}still need a person. Open the document to decide them.
              </p>
            )}
            <DataTable
              columns={columns} rows={shown} keyOf={(d) => d.id}
              extra={{ icon: 'eye', label: (d) => `Open ${d.fileName}`, onClick: setViewing }}
              /* only a draft can be picked back up; a filed one is undone, not edited */
              onEdit={(d) => (d.status === 'draft' ? setResuming(d) : setViewing(d))}
              editLabel={(d) => (d.status === 'draft'
                ? `Carry on with ${d.fileName}`
                : `Look at ${d.fileName}`)}
              onDelete={(d) => setDeleting(d)}
              deleteLabel={(d) => `Delete ${d.fileName}`}
            />
          </>
        )}
      </ListPage>

      <UploadDialog open={uploading || resuming !== null} resume={resuming}
        onClose={() => { setUploading(false); setResuming(null) }} />
      <AliasPanel open={aliases} onClose={() => setAliases(false)} />
      <DocViewer doc={viewing} items={ws.items} onClose={() => setViewing(null)} />

      <ConfirmDelete
        open={deleting !== null}
        what={deleting?.fileName ?? ''}
        impact={deleting
          ? {
            losses: [
              `the ${deleting.lines.length} line${deleting.lines.length === 1 ? '' : 's'} read off it`,
              'the original file on this device',
            ],
            clean: false,
            /* the thing people are actually afraid of, answered before they ask */
            keeps: deleting.status === 'approved'
              ? 'The supplier, their rates and the wordings you mapped all stay. '
                + 'Only the document goes.'
              : undefined,
          }
          : { losses: [], clean: true }}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (!deleting) return
          void dropFile(deleting.id)
          update((w) => ({ ...w, docs: w.docs.filter((d) => d.id !== deleting.id) }))
        }}
      />
    </>
  )
}

const READ: Record<SupplierDoc['read'], string> = {
  'pdf-text': 'read from its text',
  photo: 'read off a photo',
  sheet: 'from a spreadsheet',
  typed: 'typed in',
}
