'use client'
import { useState } from 'react'
import { Icon, type IconName } from '@/components/ui/icons'
import { useWorkspace } from '@/components/workspace/store'
import { ColumnsDialog } from './ColumnsDialog'
import { ImportDialog } from './ImportDialog'
import { UploadDialog } from '@/components/intake/UploadDialog'
import { Dialog } from '@/components/ui/Dialog'
import { downloadCsv, toCsv } from '@/lib/sheet/csv'
import { undoImport } from '@/lib/sheet/import'
import { shortDate } from '@/lib/domain/format'
import type { SheetEntity } from '@/lib/workspace/types'

/**
 * Columns, Import and Export, on every list that has them.
 *
 * Quieter than the Add button and to its left, because they are the things a
 * person does occasionally and Add is the thing they came for. All three sit in
 * the page header rather than the filter row: that row is hidden while the list
 * is empty, which is the exact moment Import is most worth reaching.
 */
export function DeskTools({ entity, noun, title, rows, upload }: {
  entity: SheetEntity
  /** singular, for the sentence a column delete has to say */
  noun: string
  /** the file name an export lands under */
  title: string
  /** what to write out — already searched, filtered and in column order */
  rows: () => string[][]
  /**
   * Offer "Upload document" too.
   *
   * A prop rather than a check on `entity` inside, because this component is
   * shared by three lists and only one of them has documents arriving at it.
   * A condition buried in here would be a thing the other two screens carry
   * without saying so.
   */
  upload?: boolean
}) {
  const { workspace, update } = useWorkspace()
  const [columns, setColumns] = useState(false)
  const [importing, setImporting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [undoing, setUndoing] = useState(false)

  if (!workspace) return null

  /*
   * Undo is offered only for an import into THIS list, and only while it is
   * still the most recent one. Anything else would be a button that claims to
   * put back something it cannot reach.
   */
  const last = workspace.lastImport
  const undoable = last && last.entity === entity ? last : null

  const exportCsv = () => {
    const today = new Date().toISOString().slice(0, 10)
    downloadCsv(`${title.toLowerCase().replace(/\s+/g, '-')}-${today}.csv`, toCsv(rows()))
  }

  return (
    <>
      {/*
        * First, and before Columns, because it is the one that brings data in
        * from outside rather than rearranging what is already here.
        */}
      {upload && <Tool icon="doc" label="Upload document" onClick={() => setUploading(true)} />}
      <Tool icon="columns" label="Columns" onClick={() => setColumns(true)} />
      <Tool icon="upload" label="Import" onClick={() => setImporting(true)} />
      {/*
        * Export is offered only once there is something to write out. An empty
        * file is not a useful answer to "where is my data", and the button
        * would be the only enabled thing on a screen with nothing on it.
        */}
      {rows().length > 1 && <Tool icon="download" label="Export" onClick={exportCsv} />}
      {undoable && <Tool icon="undo" label="Undo import" onClick={() => setUndoing(true)} />}

      <ColumnsDialog open={columns} onClose={() => setColumns(false)}
        entity={entity} noun={noun} />
      <ImportDialog open={importing} onClose={() => setImporting(false)}
        entity={entity} title={title} />
      {upload && <UploadDialog open={uploading} onClose={() => setUploading(false)} />}

      {undoing && undoable && (
        <Dialog open onClose={() => setUndoing(false)} title="Undo the last import?">
          <div className="space-y-3 px-4 py-4">
            <p className="text-[13px] leading-relaxed text-ink-2">
              This takes back the <strong className="text-ink">{undoable.added} added</strong>
              {undoable.changed > 0 && <> and puts the <strong className="text-ink">
                {undoable.changed} changed</strong> back as they were</>}
              {' '}from <strong className="text-ink">{undoable.source}</strong> on {shortDate(undoable.at)}.
            </p>
            <p className="text-[12.5px] leading-relaxed text-ink-3">
              Anything you have added or edited since is left alone. Only the rows that import
              touched are put back.
            </p>
          </div>
          <footer className="flex items-center gap-2 border-t border-line-soft px-4 py-3">
            <button type="button" onClick={() => setUndoing(false)}
              className="press rounded-lg px-2.5 py-2 text-[13px] text-ink-2 hover:text-ink">
              Leave it
            </button>
            <span className="ml-auto" />
            <button type="button"
              onClick={() => { update((w) => undoImport(w)); setUndoing(false) }}
              className="press rounded-lg border border-critical bg-critical px-3.5 py-2 text-[13px] font-semibold text-on-accent hover:opacity-90">
              Undo the import
            </button>
          </footer>
        </Dialog>
      )}
    </>
  )
}

function Tool({ icon, label, onClick }: { icon: IconName; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="press inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-2 text-[13px] font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink">
      <Icon name={icon} className="size-3.5" />
      <span className="hidden sm:inline">{label}</span>
      <span className="sr-only sm:hidden">{label}</span>
    </button>
  )
}
