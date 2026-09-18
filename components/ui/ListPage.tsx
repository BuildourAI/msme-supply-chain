'use client'
import { useMemo, useState } from 'react'
import { Icon, type IconName } from './icons'

/**
 * One page shape, and every operating screen is an instance of it.
 *
 * Taken from the portal this desk is modelled on: a title, a grey count under
 * it, one filled button top right, a search box, one dropdown, one table. Then
 * nothing. No explanatory paragraph, no KPI strip above the data, no captions.
 * Three rows on a tall screen leaves the rest as background rather than
 * stretching something to fill it.
 *
 * It is a component rather than a convention because a convention drifts. Five
 * screens built by hand end up with five slightly different headers; five
 * instances of this cannot.
 *
 * The one thing kept from the older screens is that a status colour always
 * arrives with its word — which is what the reference does anyway, so nothing
 * is being smuggled in.
 */
export interface FilterOption {
  value: string
  label: string
}

export function ListPage<T>({
  title, noun, rows, search, filter, action, tools, children, empty,
}: {
  title: string
  /** singular; the count line reads "3 suppliers" */
  noun: string
  rows: T[]
  /** the text of a row, for the search box. Omit the box by omitting this. */
  search?: (row: T) => string
  filter?: {
    label: string
    options: FilterOption[]
    of: (row: T) => string
  }
  action?: { label: string; onClick: () => void; icon?: IconName }
  /**
   * Quieter controls beside the main button — columns, import, export.
   *
   * In the header rather than in the search row, because that row is hidden
   * when there is nothing to search yet, and an empty list is the moment
   * Import is most worth reaching.
   */
  tools?: React.ReactNode
  /** given the rows that survive search and filter */
  children: (shown: T[]) => React.ReactNode
  /** what to say when there is nothing at all yet */
  empty?: { line: string; cta?: string }
}) {
  const [q, setQ] = useState('')
  const [pick, setPick] = useState('')

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows.filter((r) => {
      if (pick && filter && filter.of(r) !== pick) return false
      if (needle && search && !search(r).toLowerCase().includes(needle)) return false
      return true
    })
  }, [rows, q, pick, search, filter])

  const total = rows.length
  const narrowed = shown.length !== total

  return (
    <div className="mx-auto w-full max-w-[72rem]">
      <header className="mb-5 flex flex-wrap items-start gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-[26px] font-extrabold leading-none tracking-[-0.03em]">{title}</h1>
          <p className="mt-1.5 text-[13px] text-ink-3">
            {narrowed
              ? `${shown.length} of ${total} ${total === 1 ? noun : `${noun}s`}`
              : `${total} ${total === 1 ? noun : `${noun}s`}`}
          </p>
        </div>
        <div className="ml-auto flex shrink-0 flex-wrap items-center gap-2">
          {tools}
          {action && (
            <button type="button" onClick={action.onClick}
              className="press inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-accent-ink bg-accent-ink px-3.5 py-2 text-[13px] font-semibold text-on-accent transition-colors hover:bg-accent">
              <Icon name={action.icon ?? 'plus'} className="size-3.5" />
              {action.label}
            </button>
          )}
        </div>
      </header>

      {total > 0 && (search || filter) && (
        <div className="mb-4 flex flex-wrap gap-2.5">
          {search && (
            <label className="relative min-w-0 flex-1 sm:max-w-md">
              <Icon name="search"
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-4" />
              <input value={q} onChange={(e) => setQ(e.target.value)}
                placeholder={`Search ${title.toLowerCase()}…`}
                aria-label={`Search ${title.toLowerCase()}`}
                className="w-full rounded-lg border border-line bg-surface py-2 pl-9 pr-3 text-[13px] outline-none transition-colors focus:border-accent" />
            </label>
          )}
          {filter && filter.options.length > 1 && (
            <select value={pick} onChange={(e) => setPick(e.target.value)}
              aria-label={filter.label}
              className="shrink-0 rounded-lg border border-line bg-surface px-3 py-2 text-[13px] outline-none transition-colors focus:border-accent">
              <option value="">{filter.label}</option>
              {filter.options.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          )}
        </div>
      )}

      {total === 0 && empty ? (
        <div className="rounded-xl border border-line bg-surface px-6 py-12 text-center">
          <p className="text-[13.5px] text-ink-2">{empty.line}</p>
          {action && empty.cta && (
            <button type="button" onClick={action.onClick}
              className="press mt-4 inline-flex items-center gap-1.5 rounded-lg border border-accent-ink bg-accent-ink px-3.5 py-2 text-[13px] font-semibold text-on-accent hover:bg-accent">
              {empty.cta}
            </button>
          )}
        </div>
      ) : shown.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface px-6 py-10 text-center">
          <p className="text-[13.5px] text-ink-2">Nothing matches that.</p>
          <button type="button" onClick={() => { setQ(''); setPick('') }}
            className="press mt-2 text-[12.5px] text-accent-ink underline underline-offset-2">
            Clear the search
          </button>
        </div>
      ) : (
        children(shown)
      )}
    </div>
  )
}
