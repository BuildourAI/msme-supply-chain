'use client'
import { Icon } from '@/components/ui/icons'
import {
  BUCKET_LABEL, CHECK_KINDS, FAIL_BUCKETS, type CheckInput,
} from '@/lib/workspace/checks'
import type { CheckKind, SpecCheck, Usability } from '@/lib/domain/types'

/**
 * A material's checks, as rows somebody can edit in place.
 *
 * Shared by the set-up wizard, which walks every material, and the Checks
 * screen, which edits one — so a check reads and saves the same way wherever
 * it is written. The band only appears on a reading, because a certificate has
 * no band and a field for one invites somebody to invent it.
 */
export interface CheckDraft {
  /** the stored check this row edits; absent on a new row */
  id?: string
  label: string
  kind: CheckKind
  min: string
  max: string
  unit: string
  bucket: Usability
  reason: string
  mandatory: boolean
}

export const blankDraft = (): CheckDraft => ({
  label: '', kind: 'visual', min: '', max: '', unit: '', bucket: 'qc_hold', reason: '', mandatory: true,
})

export const draftOf = (c: SpecCheck): CheckDraft => ({
  id: c.id,
  label: c.label,
  kind: c.kind,
  min: c.min == null ? '' : String(c.min),
  max: c.max == null ? '' : String(c.max),
  unit: c.unit ?? '',
  bucket: c.failBucket,
  // the automatic reason is not shown back as if somebody had typed it
  reason: c.failReason === `${c.label} failed at the gate` ? '' : c.failReason,
  mandatory: c.mandatory,
})

const num = (v: string) => (v.trim() === '' ? undefined : Number(v))

export const inputOf = (itemId: string, d: CheckDraft): CheckInput => ({
  itemId,
  label: d.label,
  kind: d.kind,
  min: num(d.min),
  max: num(d.max),
  unit: d.unit,
  failBucket: d.bucket,
  failReason: d.reason,
  mandatory: d.mandatory,
})

/** A row nobody has written anything in is not a check, it is a spare line. */
export const isBlank = (d: CheckDraft) => d.label.trim() === ''

const input = 'w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-[13px] outline-none focus:border-accent'

export function CheckRows({ rows, onChange, idPrefix, max = 6 }: {
  rows: CheckDraft[]
  onChange: (rows: CheckDraft[]) => void
  /** so two editors on one screen do not share input ids */
  idPrefix: string
  max?: number
}) {
  const set = (n: number, patch: Partial<CheckDraft>) =>
    onChange(rows.map((r, k) => (k === n ? { ...r, ...patch } : r)))

  return (
    <div className="space-y-2.5">
      {rows.map((r, n) => (
        <div key={n} className="rounded-lg border border-line bg-surface-2 p-2.5">
          <div className="flex items-start gap-2">
            <label className="min-w-0 flex-1">
              <span className="sr-only">What is checked</span>
              <input id={`${idPrefix}-label-${n}`} value={r.label}
                onChange={(e) => set(n, { label: e.target.value })}
                placeholder={n === 0 ? 'Thickness' : 'Test certificate'}
                className={input} />
            </label>
            <button type="button" onClick={() => onChange(rows.filter((_, k) => k !== n))}
              title="Remove this check"
              className="press shrink-0 rounded-md p-1.5 text-ink-4 hover:bg-critical-soft hover:text-critical">
              <Icon name="trash" className="size-4" />
              <span className="sr-only">Remove this check</span>
            </button>
          </div>

          {/* how it is checked, as chips — four words are quicker read than a list */}
          <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="How it is checked">
            {CHECK_KINDS.map((k) => (
              <button key={k.value} type="button" title={k.hint}
                aria-pressed={r.kind === k.value}
                onClick={() => set(n, { kind: k.value })}
                className={`press rounded-full border px-2.5 py-0.5 text-[12px] transition-colors ${
                  r.kind === k.value
                    ? 'border-accent-ink bg-accent-ink text-on-accent'
                    : 'border-line bg-surface text-ink-2 hover:bg-surface-3'}`}>
                {k.label}
              </button>
            ))}
          </div>

          {r.kind === 'measure' && (
            <div className="mt-2 grid grid-cols-3 gap-2">
              <label className="min-w-0">
                <span className="block text-[11px] text-ink-3">Lowest</span>
                <input id={`${idPrefix}-min-${n}`} type="number" step="any" inputMode="decimal"
                  value={r.min} onChange={(e) => set(n, { min: e.target.value })}
                  placeholder="1.15" className={input} />
              </label>
              <label className="min-w-0">
                <span className="block text-[11px] text-ink-3">Highest</span>
                <input id={`${idPrefix}-max-${n}`} type="number" step="any" inputMode="decimal"
                  value={r.max} onChange={(e) => set(n, { max: e.target.value })}
                  placeholder="1.25" className={input} />
              </label>
              <label className="min-w-0">
                <span className="block text-[11px] text-ink-3">In</span>
                <input id={`${idPrefix}-unit-${n}`} value={r.unit}
                  onChange={(e) => set(n, { unit: e.target.value })}
                  placeholder="mm" className={input} />
              </label>
            </div>
          )}

          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <label className="min-w-0">
              <span className="block text-[11px] text-ink-3">If it fails, the material is</span>
              <select id={`${idPrefix}-bucket-${n}`} value={r.bucket}
                onChange={(e) => set(n, { bucket: e.target.value as Usability })}
                className={input}>
                {FAIL_BUCKETS.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
              </select>
            </label>
            <label className="min-w-0">
              <span className="block text-[11px] text-ink-3">Reason it carries</span>
              <input value={r.reason} onChange={(e) => set(n, { reason: e.target.value })}
                placeholder={r.label.trim() ? `${r.label.trim()} failed at the gate` : 'Out of tolerance'}
                className={input} />
            </label>
          </div>

          <label className="mt-2 flex items-center gap-1.5 text-[12px] text-ink-2">
            <input type="checkbox" checked={r.mandatory}
              onChange={(e) => set(n, { mandatory: e.target.checked })}
              className="size-3.5 accent-[var(--accent-ink)]" />
            Must be marked before the receipt can close
          </label>
          {r.bucket === 'usable' && (
            <p className="mt-1.5 text-[11.5px] leading-snug text-ink-3">
              {BUCKET_LABEL.usable}: a failure is recorded against the receipt, and the material
              still goes on the shelf.
            </p>
          )}
        </div>
      ))}

      {rows.length < max && (
        <button type="button" onClick={() => onChange([...rows, blankDraft()])}
          className="press inline-flex items-center gap-1.5 text-[12.5px] font-medium text-accent-ink hover:underline">
          <Icon name="plus" className="size-3.5" /> Add {rows.length === 0 ? 'a' : 'another'} check
        </button>
      )}
    </div>
  )
}
