'use client'

export function PageHeader({ eyebrow, title, meta, actions }: {
  eyebrow?: string; title: string; meta?: React.ReactNode; actions?: React.ReactNode
}) {
  return (
    <header className="mb-4 flex flex-wrap items-end gap-x-4 gap-y-2">
      <div className="flex min-w-0 items-stretch gap-3">
        {/* the reference's left accent rule */}
        <span aria-hidden className="w-[3px] shrink-0 rounded-full bg-accent" />
        <div className="min-w-0">
          {eyebrow && (
            <p className="mono text-[10.5px] uppercase tracking-wider text-ink-3">{eyebrow}</p>
          )}
          <h1 className="text-[26px] leading-tight">{title}</h1>
        </div>
      </div>
      {meta && <div className="flex flex-wrap items-center gap-2 pb-1">{meta}</div>}
      {actions && <div className="ml-auto flex flex-wrap items-center gap-2 pb-1">{actions}</div>}
    </header>
  )
}

export function TabStrip<T extends string>({ tabs, value, onChange }: {
  tabs: { id: T; label: string; sub?: string }[]; value: T; onChange: (v: T) => void
}) {
  return (
    <div role="tablist" aria-label="Views" className="scroll-x mb-4 flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => {
        const on = t.id === value
        return (
          <button key={t.id} role="tab" aria-selected={on} type="button" onClick={() => onChange(t.id)}
            className={`shrink-0 border-b-2 px-3 pb-2 pt-1 text-left transition-colors ${
              on ? 'border-accent' : 'border-transparent hover:border-line'}`}>
            <span className={`block text-[13px] font-medium ${on ? 'text-ink' : 'text-ink-2'}`}>{t.label}</span>
            {t.sub && <span className="mono block text-[10.5px] text-ink-3">{t.sub}</span>}
          </button>
        )
      })}
    </div>
  )
}
