'use client'
import { Icon, type IconName } from './icons'

/**
 * The table from the reference portal, and nothing more.
 *
 * One row per record, a light header, generous row height, and a pencil and a
 * bin at the end of every row. No expanding detail row, no inline editing, no
 * sort arrows — the screens this serves hold a handful of records each, and
 * every control added to a row is one more thing between a person and the thing
 * they came to change.
 *
 * Columns declare their own alignment and width so a screen stays a list of
 * columns rather than a wall of class strings.
 */
export interface Column<T> {
  key: string
  head: string
  /** right for money and counts, so the digits line up */
  align?: 'left' | 'right'
  /** tailwind width class, when a column should not size to its content */
  width?: string
  cell: (row: T) => React.ReactNode
}

export function DataTable<T>({
  columns, rows, keyOf, onEdit, onDelete, editLabel, deleteLabel, extra,
}: {
  columns: Column<T>[]
  rows: T[]
  keyOf: (row: T) => string
  onEdit?: (row: T) => void
  onDelete?: (row: T) => void
  /** "Edit R-150K" beats "Edit" repeated down the column for a screen reader */
  editLabel?: (row: T) => string
  deleteLabel?: (row: T) => string
  /**
   * One more thing a row can do, before the pencil and the bin. Deliberately
   * one and not a list: a row with five icons at the end of it is a menu, and
   * the whole point of this table is that it is not one.
   */
  extra?: { icon: IconName; label: (row: T) => string; onClick: (row: T) => void }
}) {
  const acts = Boolean(onEdit || onDelete || extra)
  return (
    <div className="scroll-x relative overflow-x-auto rounded-xl border border-line bg-surface">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-line text-left">
            {columns.map((c) => (
              <th key={c.key}
                className={`whitespace-nowrap px-4 py-3 text-[12.5px] font-medium text-ink-3 ${
                  c.align === 'right' ? 'text-right' : 'text-left'} ${c.width ?? ''}`}>
                {c.head}
              </th>
            ))}
            {acts && <th className="w-20 px-4 py-3"><span className="sr-only">Actions</span></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={keyOf(row)}
              className="border-b border-line-soft transition-colors last:border-0 hover:bg-surface-2">
              {columns.map((c) => (
                <td key={c.key}
                  className={`px-4 py-3 align-middle ${c.align === 'right' ? 'num text-right' : ''}`}>
                  {c.cell(row)}
                </td>
              ))}
              {acts && (
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <span className="inline-flex items-center gap-1">
                    {extra && (
                      <button type="button" onClick={() => extra.onClick(row)}
                        title={extra.label(row)}
                        className="press rounded-md p-1.5 text-ink-3 transition-colors hover:bg-surface-3 hover:text-ink">
                        <Icon name={extra.icon} className="size-4" />
                        <span className="sr-only">{extra.label(row)}</span>
                      </button>
                    )}
                    {onEdit && (
                      <button type="button" onClick={() => onEdit(row)}
                        title={editLabel?.(row) ?? 'Edit'}
                        className="press rounded-md p-1.5 text-ink-3 transition-colors hover:bg-surface-3 hover:text-ink">
                        <Icon name="pencil" className="size-4" />
                        <span className="sr-only">{editLabel?.(row) ?? 'Edit'}</span>
                      </button>
                    )}
                    {onDelete && (
                      <button type="button" onClick={() => onDelete(row)}
                        title={deleteLabel?.(row) ?? 'Delete'}
                        className="press rounded-md p-1.5 text-ink-4 transition-colors hover:bg-critical-soft hover:text-critical">
                        <Icon name="trash" className="size-4" />
                        <span className="sr-only">{deleteLabel?.(row) ?? 'Delete'}</span>
                      </button>
                    )}
                  </span>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * A state, as a coloured pill with the word inside it.
 *
 * The colour is the fast read down a column; the word is what makes it mean
 * anything to somebody who is colour-blind, printing it, or seeing the screen
 * for the first time. The reference does exactly this, which is convenient,
 * because this build has never allowed a colour to carry a meaning alone.
 */
export type PillTone = 'good' | 'warn' | 'info' | 'critical' | 'neutral'

const TONE: Record<PillTone, string> = {
  good: 'bg-good-soft text-good',
  warn: 'bg-warn-soft text-warn',
  info: 'bg-accent-tint text-accent-ink',
  critical: 'bg-critical-soft text-critical',
  neutral: 'bg-surface-3 text-ink-2',
}

export function StatePill({ label, tone = 'neutral', title }: {
  label: string
  tone?: PillTone
  title?: string
}) {
  return (
    <span title={title}
      className={`inline-flex items-center whitespace-nowrap rounded-md px-2 py-1 text-[12px] font-medium ${TONE[tone]}`}>
      {label}
    </span>
  )
}

/** An outlined tag — a category, a certification, a supplier on a request. */
export function Tag({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <span title={title}
      className="inline-flex items-center whitespace-nowrap rounded-md border border-line px-2 py-0.5 text-[12px] text-ink-2">
      {children}
    </span>
  )
}

/** Several tags, with the tail folded away rather than wrapping to four lines. */
export function Tags({ items, max = 2 }: { items: string[]; max?: number }) {
  if (items.length === 0) return <span className="text-ink-4">—</span>
  const head = items.slice(0, max)
  const rest = items.length - head.length
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {head.map((t) => <Tag key={t}>{t}</Tag>)}
      {rest > 0 && <Tag title={items.slice(max).join(', ')}>+{rest}</Tag>}
    </span>
  )
}
