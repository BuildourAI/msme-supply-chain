'use client'
import { useMemo, useState } from 'react'
import { Wizard, type WizardStep } from '@/components/ui/Wizard'
import { Field, Select, Textarea, TextInput } from '@/components/ui/Field'
import { Icon } from '@/components/ui/icons'
import { StatePill } from '@/components/ui/DataTable'
import { useWorkspace } from '@/components/workspace/store'
import { BUILTIN, fieldsFor } from '@/lib/workspace/fields'
import { canReadXlsx } from '@/lib/sheet/unzip'
import { readFile, readPasted, splitHeader, type Sheet } from '@/lib/sheet/read'
import { choicesOf, guessKind, matchHeader, type Target } from '@/lib/sheet/match'
import {
  NEW_FIELD, applyImport, planImport, summarise, type DupPolicy, type Mapping,
} from '@/lib/sheet/import'
import type { FieldKind, SheetEntity } from '@/lib/workspace/types'

/**
 * Bringing a spreadsheet in, in three steps you can turn back from.
 *
 * Nothing is written until the last one, and the last one shows what will
 * happen to every row before it happens. That is the whole design: an import
 * that cannot be previewed is a thing people do once, get wrong, and never
 * trust again.
 *
 * The rows that cannot be brought in are listed with the reason rather than
 * quietly dropped. A count of "47 imported" out of fifty rows tells you nothing
 * about the three.
 */
const NOUN: Record<SheetEntity, string> = {
  supplier: 'suppliers', material: 'materials', rfq: 'requests',
  quote: 'quotes', order: 'orders',
  check: 'checks', receipt: 'receipts', challan: 'challans',
  rack: 'racks', lot: 'lots', count: 'counts', move: 'movements',
}

/** Columns an import can fill. Worked-out ones are not offered — they are sums. */
function targetsFor(ws: ReturnType<typeof useWorkspace>['workspace'], entity: SheetEntity): Target[] {
  const builtins = BUILTIN[entity]
    .filter((b) => !b.derived && b.kind)
    .map((b) => ({ key: b.key, label: b.label, aliases: b.aliases, kind: b.kind! }))
  const custom = ws ? fieldsFor(ws, entity).map((f) => ({ key: f.id, label: f.label, kind: f.kind })) : []
  return [...builtins, ...custom]
}

const MAX_ROWS = 2000

export function ImportDialog({ open, onClose, entity, title }: {
  open: boolean
  onClose: () => void
  entity: SheetEntity
  title: string
}) {
  const { workspace, update, today, persistent } = useWorkspace()
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [paste, setPaste] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [headerRow, setHeaderRow] = useState(0)
  const [mappings, setMappings] = useState<Mapping[]>([])
  const [policy, setPolicy] = useState<DupPolicy>('update')
  const [done, setDone] = useState<{ added: number; changed: number; saved: boolean } | null>(null)

  const targets = useMemo(() => targetsFor(workspace, entity), [workspace, entity])

  const reset = () => {
    setSheet(null); setPaste(''); setError(null); setHeaderRow(0)
    setMappings([]); setPolicy('update'); setDone(null)
  }
  const close = () => { reset(); onClose() }

  /**
   * Matching happens once, when a sheet arrives. Recomputing it as the person
   * edits would undo their corrections the moment they made one.
   */
  const load = (next: Sheet) => {
    const rows = next.rows.slice(0, MAX_ROWS + 1)
    const trimmed = { ...next, rows }
    setSheet(trimmed)
    setHeaderRow(0)
    setError(next.rows.length > MAX_ROWS + 1
      ? `Only the first ${MAX_ROWS} rows are read. Split the sheet if you need the rest.`
      : null)
    setMappings(autoMatch(rows[0] ?? [], rows.slice(1), targets))
  }

  const pick = async (file: File) => {
    try { load(await readFile(file)) } catch (e) { setError((e as Error).message); setSheet(null) }
  }

  const usePaste = () => {
    try { load(readPasted(paste)) } catch (e) { setError((e as Error).message) }
  }

  if (!open || !workspace) return null

  const split = sheet ? splitHeader(sheet.rows.slice(headerRow)) : { header: [], body: [] }
  const plans = sheet ? planImport(workspace, entity, split.body, mappings, policy) : []
  const report = summarise(plans)

  const run = () => {
    const result = applyImport(workspace, entity, plans, mappings, sheet?.source ?? 'Pasted', today)
    update(() => result.ws)
    /*
     * `persistent` is the store's record of whether the browser accepted the
     * last write. It has never been surfaced anywhere, which means a full
     * storage quota has always failed in silence — and an import of several
     * hundred rows is the first thing in this build big enough to trip it.
     * Checking it here is the difference between "it looked fine until I
     * reloaded" and being told.
     */
    setDone({ added: result.undo.added, changed: result.undo.changed, saved: persistent })
  }

  const steps: WizardStep[] = [
    {
      label: 'Sheet',
      title: `Where are your ${NOUN[entity]}?`,
      why: 'A file from Excel, or the cells copied straight out of Google Sheets.',
      invalid: sheet ? null : 'Pick a file or paste some cells.',
      body: (
        <Source
          sheet={sheet} paste={paste} error={error} headerRow={headerRow}
          onPaste={setPaste} onUsePaste={usePaste} onPick={pick}
          onHeaderRow={(n) => { setHeaderRow(n); if (sheet) setMappings(autoMatch(sheet.rows[n] ?? [], sheet.rows.slice(n + 1), targets)) }}
          onTab={(path) => { if (sheet?.switchTab) load(sheet.switchTab(path)) }}
          onClear={reset}
        />
      ),
    },
    {
      label: 'Columns',
      title: 'Which column is which?',
      why: 'Anything it did not recognise comes in as a column of its own. Change any of them.',
      invalid: mappings.some((m) => m.target !== null)
        ? null : 'Match at least one column.',
      body: (
        <Match
          header={split.header} body={split.body} mappings={mappings} targets={targets}
          onChange={setMappings}
        />
      ),
    },
    {
      label: 'Check',
      title: done ? 'Done' : 'What this will do',
      invalid: done || report.added + report.changed > 0
        ? null : 'Nothing here can be brought in yet.',
      body: done
        ? <Finished entity={entity} {...done} />
        : <Check plans={plans} report={report} policy={policy} onPolicy={setPolicy} entity={entity} />,
    },
  ]

  return (
    <Wizard
      open={open}
      onClose={close}
      title={`Import ${NOUN[entity]}`}
      sub={sheet ? sheet.source : undefined}
      steps={steps}
      onDone={done ? close : run}
      doneLabel={done ? 'Close' : `Import ${report.added + report.changed} row${
        report.added + report.changed === 1 ? '' : 's'}`}
    />
  )
}

/** Header names against known columns, with a guessed type for the rest. */
function autoMatch(header: string[], body: string[][], targets: Target[]): Mapping[] {
  const taken = new Set<string>()
  return header.map((h, column) => {
    const hit = matchHeader(h, targets, taken)
    if (hit) { taken.add(hit); return { column, target: hit } }

    const values = body.map((r) => r[column] ?? '')
    const kind = guessKind(values)
    const hasData = values.some((v) => v.trim() !== '')
    /*
     * An unmatched column comes in as a new one, already named and typed —
     * bringing a sheet in is meant to be how you get your columns, and a column
     * left out by default is data quietly dropped, which is the exact thing the
     * preview step exists to prevent. A column with nothing in it at all is the
     * one that stays off, because it is spreadsheet padding rather than data.
     */
    return {
      column,
      target: hasData ? NEW_FIELD : null,
      create: {
        label: h,
        kind,
        choices: kind === 'choice' ? choicesOf(values) : undefined,
      },
    }
  })
}

/* ------------------------------------------------------------------ step 1 -- */

function Source({
  sheet, paste, error, headerRow, onPaste, onUsePaste, onPick, onHeaderRow, onTab, onClear,
}: {
  sheet: Sheet | null
  paste: string
  error: string | null
  headerRow: number
  onPaste: (v: string) => void
  onUsePaste: () => void
  onPick: (f: File) => void
  onHeaderRow: (n: number) => void
  onTab: (path: string) => void
  onClear: () => void
}) {
  const [over, setOver] = useState(false)
  const xlsx = canReadXlsx()

  if (sheet) {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-good/40 bg-good-soft/40 px-3 py-2.5">
          <Icon name="check" className="size-4 shrink-0 text-good" />
          <span className="min-w-0 text-[13px]">
            <strong className="font-semibold">{sheet.source}</strong>
            <span className="text-ink-2"> · {sheet.rows.length} row{sheet.rows.length === 1 ? '' : 's'}</span>
          </span>
          <button type="button" onClick={onClear}
            className="press ml-auto shrink-0 rounded-md px-2 py-1 text-[12px] text-ink-2 underline underline-offset-2 hover:text-ink">
            Use a different one
          </button>
        </div>

        {sheet.tabs.length > 1 && (
          <Field label="Which sheet?" hint="This workbook has more than one tab.">
            <Select value={sheet.tab} onChange={onTab}
              options={sheet.tabs.map((t) => ({ value: t.path, label: t.name }))} />
          </Field>
        )}

        <Field label="Which row has the headings?"
          hint="Most sheets start with them. Some have a title line above.">
          <Select value={String(headerRow)} onChange={(v) => onHeaderRow(Number(v))}
            options={sheet.rows.slice(0, 5).map((r, i) => ({
              value: String(i),
              label: `Row ${i + 1} — ${r.filter(Boolean).slice(0, 4).join(', ').slice(0, 48) || 'empty'}`,
            }))} />
        </Field>

        {error && <Warn>{error}</Warn>}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <label
        onDragOver={(e) => { e.preventDefault(); setOver(true) }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault(); setOver(false)
          const f = e.dataTransfer.files[0]
          if (f) onPick(f)
        }}
        className={`flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed px-4 py-7 text-center transition-colors ${
          over ? 'border-accent bg-accent-tint/40' : 'border-line hover:border-ink-4 hover:bg-surface-2'}`}>
        <Icon name="upload" className="mb-2 size-6 text-ink-3" />
        <span className="text-[13.5px] font-medium">Drop a file here, or choose one</span>
        <span className="mt-1 text-[12px] text-ink-3">
          {xlsx ? '.xlsx or .csv' : '.csv — this browser is too old to open .xlsx'}
        </span>
        <input type="file" className="sr-only"
          accept={xlsx ? '.xlsx,.xlsm,.csv,.tsv,.txt' : '.csv,.tsv,.txt'}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f) }} />
      </label>

      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-line" />
        <span className="mono text-[10px] uppercase tracking-wider text-ink-4">or paste</span>
        <span className="h-px flex-1 bg-line" />
      </div>

      <Field label="Paste the cells"
        hint="In Google Sheets or Excel, select the block including its headings, copy, and paste here.">
        <Textarea value={paste} onChange={onPaste} rows={5} mono
          placeholder={'Supplier name\tType\tPayment terms\nShah Metals\tMill\t30'} />
      </Field>
      {paste.trim() !== '' && (
        <button type="button" onClick={onUsePaste}
          className="press rounded-lg border border-line bg-surface px-3 py-2 text-[13px] font-medium hover:bg-surface-2">
          Use what I pasted
        </button>
      )}

      {error && <Warn>{error}</Warn>}
    </div>
  )
}

/* ------------------------------------------------------------------ step 2 -- */

function Match({ header, body, mappings, targets, onChange }: {
  header: string[]
  body: string[][]
  mappings: Mapping[]
  targets: Target[]
  onChange: (next: Mapping[]) => void
}) {
  const set = (column: number, value: string) => {
    onChange(mappings.map((m) => {
      if (m.column !== column) {
        // a real target can only be used once; picking it here releases it
        // there. NEW_FIELD is exempt — two columns can each become a new field.
        return value !== '' && value !== NEW_FIELD && m.target === value
          ? { ...m, target: null } : m
      }
      if (value === '') return { ...m, target: null }
      return { ...m, target: value }
    }))
  }

  return (
    <ul className="space-y-2.5">
      {header.map((h, column) => {
        const m = mappings.find((x) => x.column === column)!
        const samples = body.slice(0, 3).map((r) => r[column] ?? '').filter(Boolean)
        const isNew = m.target === NEW_FIELD
        return (
          <li key={column} className="grid gap-2 rounded-lg border border-line px-3 py-2.5 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-semibold">{h}</span>
              <span className="mono block truncate text-[11px] text-ink-3">
                {samples.length ? samples.join(' · ') : 'nothing in this column'}
              </span>
            </span>
            <Icon name="arrow-right" className="hidden size-3.5 shrink-0 text-ink-4 sm:block" />
            <Select
              value={isNew ? NEW_FIELD : m.target ?? ''}
              onChange={(v) => set(column, v)}
              placeholder="Leave this column out"
              options={[
                ...targets.map((t) => ({ value: t.key, label: t.label })),
                ...(m.create ? [{ value: NEW_FIELD, label: `New column: ${m.create.label}` }] : []),
              ]}
            />
          </li>
        )
      })}
    </ul>
  )
}

/* ------------------------------------------------------------------ step 3 -- */

function Check({ plans, report, policy, onPolicy, entity }: {
  plans: ReturnType<typeof planImport>
  report: ReturnType<typeof summarise>
  policy: DupPolicy
  onPolicy: (p: DupPolicy) => void
  entity: SheetEntity
}) {
  const skipped = plans.filter((p) => p.status === 'skip')
  const clashes = plans.some((p) => p.status === 'update')
    || skipped.some((p) => p.reason?.includes('already here'))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Count n={report.added} label="new" tone="good" />
        <Count n={report.changed} label="updated" tone="info" />
        <Count n={report.skipped} label="left out" tone={report.skipped ? 'warn' : 'neutral'} />
      </div>

      {clashes && (
        <Field label={`When a ${entity === 'rfq' ? 'request' : entity} is already here`}>
          <Select value={policy} onChange={(v) => onPolicy(v as DupPolicy)}
            options={[
              { value: 'update', label: 'Update what is already there' },
              { value: 'skip', label: 'Leave the existing one alone' },
              { value: 'add', label: 'Add it again as a separate row' },
            ]} />
        </Field>
      )}

      <div className="scroll-x max-h-64 overflow-auto rounded-lg border border-line">
        <table className="w-full border-collapse text-[12.5px]">
          <tbody>
            {plans.map((p) => (
              <tr key={p.line} className="border-b border-line-soft last:border-0">
                <td className="mono w-10 px-2.5 py-1.5 text-right text-[11px] text-ink-4">{p.line}</td>
                <td className="px-2.5 py-1.5">
                  <span className={p.status === 'skip' ? 'text-ink-4' : 'font-medium'}>
                    {p.name || <span className="text-ink-4">—</span>}
                  </span>
                </td>
                <td className="px-2.5 py-1.5 text-right">
                  {p.status === 'new' && <StatePill label="New" tone="good" />}
                  {p.status === 'update' && <StatePill label="Updates" tone="info" />}
                  {p.status === 'skip' && (
                    <span className="text-[11.5px] text-ink-3">{p.reason}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Finished({ entity, added, changed, saved }: {
  entity: SheetEntity
  added: number
  changed: number
  saved: boolean
}) {
  return (
    <div className="space-y-3">
      <p className="text-[13.5px] leading-relaxed">
        <strong>{added} {NOUN[entity]} added</strong>
        {changed > 0 && <>, {changed} updated</>}.
      </p>
      {saved ? (
        <p className="text-[12.5px] leading-relaxed text-ink-2">
          If it was not what you wanted, <strong>Undo the import</strong> on the Columns menu puts it
          back exactly as it was — until the next import.
        </p>
      ) : (
        <Warn>
          Your browser would not keep this. It is on screen but will not survive a reload — export
          what you need, then clear some space and try again.
        </Warn>
      )}
    </div>
  )
}

function Count({ n, label, tone }: { n: number; label: string; tone: 'good' | 'info' | 'warn' | 'neutral' }) {
  return (
    <span className={`inline-flex items-baseline gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] ${
      tone === 'good' ? 'bg-good-soft text-good'
        : tone === 'info' ? 'bg-accent-tint text-accent-ink'
          : tone === 'warn' ? 'bg-warn-soft text-warn' : 'bg-surface-3 text-ink-3'}`}>
      <strong className="num text-[15px] font-bold leading-none">{n}</strong>
      {label}
    </span>
  )
}

const Warn = ({ children }: { children: React.ReactNode }) => (
  <p className="rounded-lg border border-warn/30 bg-warn-soft px-3 py-2.5 text-[12.5px] leading-relaxed text-ink-2">
    {children}
  </p>
)
