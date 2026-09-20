'use client'
import { useRef, useState } from 'react'
import { Icon } from './icons'

/**
 * The form controls the set-up steps are built from.
 *
 * Twelve dialogs in this build each repeat the same raw input and the same
 * class string, which was survivable while every form was one pane a developer
 * filled in during a demo. The set-up steps are the first screens a stranger
 * fills in unaided, so they get real controls: a label that is a question, one
 * line underneath saying why it is being asked, and an error that appears only
 * after the field has been visited.
 *
 * The existing dialogs are deliberately left alone. Rewriting them is a
 * separate change with its own risk, and none of them is what a new owner meets
 * first.
 */
const BASE = 'w-full rounded-md border bg-surface px-2.5 py-2 text-[13px] outline-none transition-colors'
const OK = 'border-line focus:border-accent'
const BAD = 'border-critical focus:border-critical'

export function Field({ label, hint, error, children, htmlFor, className }: {
  /** the question, in the owner's words — "What do you call it?", not "Name *" */
  label: string
  /** one line on why it is worth answering; skipped when the label says it all */
  hint?: string
  error?: string | null
  children: React.ReactNode
  htmlFor?: string
  /** how it sits in a row — a grid handles most cases, an order line does not */
  className?: string
}) {
  return (
    <div className={`min-w-0 ${className ?? ''}`}>
      <label htmlFor={htmlFor} className="block text-[13px] font-medium text-ink">{label}</label>
      {hint && <p className="mt-0.5 text-[11.5px] leading-snug text-ink-3">{hint}</p>}
      <div className="mt-1.5">{children}</div>
      {error && (
        <p role="alert" className="mt-1 flex items-start gap-1 text-[11.5px] leading-snug text-critical">
          <Icon name="alert" className="mt-px size-3 shrink-0" />
          {error}
        </p>
      )}
    </div>
  )
}

export function TextInput({ value, onChange, placeholder, id, invalid, autoFocus, onEnter, label }: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  id?: string
  invalid?: boolean
  autoFocus?: boolean
  onEnter?: () => void
  /** for an input with no visible <Field> label beside it */
  label?: string
}) {
  return (
    <input
      id={id} value={value} placeholder={placeholder} aria-label={label}
      data-autofocus={autoFocus ? '' : undefined}
      aria-invalid={invalid || undefined}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter' && onEnter) { e.preventDefault(); onEnter() } }}
      className={`${BASE} ${invalid ? BAD : OK}`}
    />
  )
}

/**
 * A number with its unit beside it rather than in the label, because "How much
 * do you use in a day? 40" is only an answer once you can see it means kilograms.
 */
export function NumberInput({ value, onChange, unit, placeholder, id, invalid, step = 'any', min = 0, autoFocus }: {
  value: string
  onChange: (v: string) => void
  unit?: string
  placeholder?: string
  id?: string
  invalid?: boolean
  step?: string
  min?: number
  autoFocus?: boolean
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        id={id} type="number" inputMode="decimal" step={step} min={min}
        value={value} placeholder={placeholder}
        data-autofocus={autoFocus ? '' : undefined}
        aria-invalid={invalid || undefined}
        onChange={(e) => onChange(e.target.value)}
        className={`num ${BASE} ${invalid ? BAD : OK}`}
      />
      {unit && <span className="mono shrink-0 text-[12px] text-ink-3">{unit}</span>}
    </div>
  )
}

/**
 * A choice, with the owner's own words allowed.
 *
 * "Anyone coming to the system should be able to customise it their way" — so
 * every list of categories offers a way to add to it. A select whose options a
 * developer guessed is a select somebody has to work around.
 */
export function Select({ value, onChange, options, id, invalid, addLabel, onAdd, placeholder }: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  id?: string
  invalid?: boolean
  /** when set, the list carries an "Add new…" row that reveals a text box */
  addLabel?: string
  onAdd?: (v: string) => void
  placeholder?: string
}) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const box = useRef<HTMLInputElement>(null)

  const commit = () => {
    const v = draft.trim()
    if (!v || !onAdd) return
    onAdd(v)
    onChange(v)
    setDraft('')
    setAdding(false)
  }

  if (adding) {
    return (
      <div className="flex items-center gap-2">
        <input
          ref={box} autoFocus value={draft} placeholder={addLabel}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit() }
            if (e.key === 'Escape') { setAdding(false); setDraft('') }
          }}
          className={`${BASE} ${OK}`}
        />
        <button type="button" onClick={commit} disabled={!draft.trim()}
          className="press shrink-0 rounded-md border border-accent-ink bg-accent-ink px-2 py-1.5 text-[12px] font-medium text-on-accent disabled:opacity-40">
          Add
        </button>
        <button type="button" onClick={() => { setAdding(false); setDraft('') }}
          className="press shrink-0 rounded-md px-1.5 py-1.5 text-[12px] text-ink-3 hover:text-ink">
          Cancel
        </button>
      </div>
    )
  }

  return (
    <select
      id={id} value={value} aria-invalid={invalid || undefined}
      onChange={(e) => {
        if (e.target.value === '__add__') { setAdding(true); return }
        onChange(e.target.value)
      }}
      className={`${BASE} ${invalid ? BAD : OK}`}>
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      {onAdd && <option value="__add__">{addLabel ?? 'Add new…'}</option>}
    </select>
  )
}

/** A short list picked from by tapping, for choices worth seeing all at once. */
export function Chips({ value, onChange, options }: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string; hint?: string }[]
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
          aria-pressed={value === o.value} title={o.hint}
          className={`press rounded-full border px-2.5 py-1 text-[12px] transition-colors ${
            value === o.value
              ? 'border-accent-ink bg-accent-ink text-on-accent'
              : 'border-line text-ink-2 hover:bg-surface-2'}`}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

/**
 * Several lines of text.
 *
 * Added because pasting a block of spreadsheet cells needs somewhere to paste
 * it, and `TextInput` is an `<input>` — a multi-line paste into one collapses
 * to a single line. Every other textarea in the build is hand-rolled with its
 * own class string, which is the drift this file exists to stop.
 */
export function Textarea({
  value, onChange, id, rows = 4, placeholder, invalid, autoFocus, mono,
}: {
  value: string
  onChange: (v: string) => void
  id?: string
  rows?: number
  placeholder?: string
  invalid?: boolean
  autoFocus?: boolean
  /** for pasted data, where columns lining up is the whole point */
  mono?: boolean
}) {
  return (
    <textarea
      id={id}
      value={value}
      rows={rows}
      placeholder={placeholder}
      data-autofocus={autoFocus ? '' : undefined}
      onChange={(e) => onChange(e.target.value)}
      className={`${BASE} ${invalid ? BAD : OK} resize-y leading-relaxed ${mono ? 'mono text-[12px]' : ''}`}
    />
  )
}
