'use client'
import { Icon } from '@/components/ui/icons'
import { Tag, type Column } from '@/components/ui/DataTable'
import { visibleColumns, type ResolvedColumn } from '@/lib/workspace/fields'
import { shortDate } from '@/lib/domain/format'
import type { FieldDef, SheetEntity, Workspace } from '@/lib/workspace/types'

/**
 * The bridge between a column the owner arranged and a column the table draws.
 *
 * A screen still says how its own built-in cells look — a status pill, a late
 * date in red, a count that reads "no rates yet" — because that knowledge lives
 * with the screen and always did. What this adds is the ORDER, the heading and
 * the visibility from the owner's view, plus a cell for every column the build
 * has never heard of.
 *
 * `idOf` is a parameter rather than something inferred because the three row
 * types reach their record differently — `r.vendor.id`, `r.item.id`,
 * `r.rfq.id` — and inventing a shared shape to avoid three one-line functions
 * would be the wrong trade.
 */
export interface ColumnKit<T> {
  columns: Column<T>[]
  /** custom values as one string, so the search box finds them too */
  searchText: (row: T) => string
  /** the same columns as plain text, for the CSV export */
  toRows: (rows: T[]) => string[][]
}

/**
 * How a screen describes one of its own columns.
 *
 * `text` exists because a cell is JSX and a CSV is not. A status pill draws as
 * a coloured chip and exports as the word inside it; without a separate text
 * form the export would have to stringify React elements, which gives
 * "[object Object]" in a file somebody opens in Excel.
 */
export type DrawnColumn<T> = Omit<Column<T>, 'key' | 'head'> & {
  text?: (row: T) => string
}

export function buildColumns<T>(
  ws: Workspace,
  entity: SheetEntity,
  idOf: (row: T) => string,
  /** how this screen draws each built-in column it owns */
  drawn: Record<string, DrawnColumn<T>>,
): ColumnKit<T> {
  const resolved = visibleColumns(ws, entity)

  const shown = resolved.filter((c) => c.field || drawn[c.key])

  const columns = shown.map<Column<T>>((c) => (c.field
    ? customColumn(ws, c, c.field, idOf)
    // a built-in the screen does not draw is dropped above, not rendered
    // empty — an empty column is worse than a missing one
    : { key: c.key, head: c.label, ...drawn[c.key] }))

  const fields = resolved.map((c) => c.field).filter(Boolean) as FieldDef[]
  const searchText = (row: T) => {
    const values = ws.custom?.[idOf(row)] ?? {}
    return fields.map((f) => values[f.id] ?? '').filter(Boolean).join(' ')
  }

  const toRows = (rows: T[]): string[][] => [
    shown.map((c) => c.label),
    ...rows.map((row) => shown.map((c) => (c.field
      ? ws.custom?.[idOf(row)]?.[c.field.id] ?? ''
      : drawn[c.key].text?.(row) ?? ''))),
  ]

  return { columns, searchText, toRows }
}

/**
 * A cell for a column the build did not ship.
 *
 * Alignment follows the kind rather than the screen, so a number the owner
 * invented lines up its digits the same way a built-in one does. An empty cell
 * is a dash, never blank: a blank cell and a cell holding a space look
 * identical, and one of them means "nobody has filled this in".
 */
function customColumn<T>(
  ws: Workspace,
  col: ResolvedColumn,
  field: FieldDef,
  idOf: (row: T) => string,
): Column<T> {
  return {
    key: col.key,
    head: col.label,
    align: field.kind === 'number' ? 'right' : 'left',
    cell: (row) => {
      const v = ws.custom?.[idOf(row)]?.[field.id] ?? ''
      if (v === '') return <span className="text-ink-4">—</span>

      if (field.kind === 'yesno') {
        return v === 'Yes'
          ? <span className="inline-flex items-center gap-1 text-[12.5px] text-good">
              <Icon name="check" className="size-3.5" /> Yes
            </span>
          : <span className="text-[12.5px] text-ink-3">No</span>
      }
      if (field.kind === 'choice') return <Tag>{v}</Tag>
      if (field.kind === 'date') {
        // an unparseable date is shown as typed rather than as "Invalid Date"
        const iso = /^\d{4}-\d{2}-\d{2}$/.test(v)
        return <span className="text-ink-2">{iso ? shortDate(v) : v}</span>
      }
      if (field.kind === 'number') {
        return <span>{v}{field.unit ? <span className="text-ink-3"> {field.unit}</span> : null}</span>
      }
      return <span className="text-ink-2">{v}</span>
    },
  }
}
