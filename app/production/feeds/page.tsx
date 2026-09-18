'use client'
import { PageHeader } from '@/components/shell/PageHeader'
import { Card, Pill } from '@/components/ui/bits'
import { Icon, type IconName } from '@/components/ui/icons'
import { Note } from '@/components/ui/Note'
import { TONE_RAIL, TONE_TEXT } from '@/components/desk/LineCards'
import { buildRows, type DerivedRow, type SeedBundle } from '@/lib/domain/derive'
import { DEFAULT_POLICY } from '@/lib/domain/policy'
import * as S from '@/lib/seed/sourcing'
import { STATUS_LABEL, STATUS_TONE } from '@/lib/domain/format'
import { StageGate } from '@/components/onboard/StageGate'

/**
 * The feeds map on its own page.
 *
 * "If I run out of X I cannot make Y" is one relation, and it was drawn as a
 * stack of bordered boxes with a pill and a paragraph under the production
 * stage brief. Here it is a tile per finished good: the goods with a short
 * material first, each feeder on one line as a glyph, its code, a lane for
 * how long it lasts against how long it takes to replace, and the word for
 * its state. Six goods are two rows. The sentence that used to sit under the
 * boxes is in the fold, where a sentence belongs.
 *
 * Same rows as the Sourcing Desk, same policy — nothing here is a second
 * calculation. A full BOM explosion is still deliberately not built (§12).
 */
const seed: SeedBundle = {
  today: S.TODAY_SOURCING, items: S.items, vendors: S.vendors, vendorItems: S.vendorItems,
  stockLots: S.stockLots, poLines: S.poLines, receipts: S.receipts,
}
const rows = buildRows(seed, DEFAULT_POLICY)

const STATUS_ICON: Record<string, IconName> = {
  at_risk: 'alert', at_risk_late: 'clock', open_po_covers: 'truck', covered: 'check',
}
const isShort = (r: DerivedRow) => r.status.value === 'at_risk' || r.status.value === 'at_risk_late'

/** Days of cover against the lead time it has to beat, in 64px. */
function Lane({ r }: { r: DerivedRow }) {
  const cover = r.coverDays.value
  const lead = r.leadTime.value
  const short = cover < lead
  const scale = Math.max(cover, lead) * 1.25 || 1
  return (
    <span className="relative inline-block h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-surface-3 align-middle"
      title={`${cover} days of cover against a ${lead}-day lead${short ? ' — runs out before it can be replaced' : ''}`}>
      <span className={`anim-reveal absolute inset-y-0 left-0 rounded-full ${short ? 'bg-critical' : 'bg-good'}`}
        style={{ width: `${Math.min(100, (cover / scale) * 100)}%` }} />
      <span aria-hidden className="absolute inset-y-0 w-[2px] bg-ink"
        style={{ left: `${Math.min(97, (lead / scale) * 100)}%` }} />
    </span>
  )
}

function PageBody() {
  const goods = [...new Set(S.items.flatMap((i) => i.feeds))]
    .map((g) => {
      const feeders = rows.filter((r) => r.item.feeds.includes(g))
      return { g, feeders, short: feeders.filter(isShort).length }
    })
    // the goods that will stop first, first
    .sort((a, b) => b.short - a.short || a.g.localeCompare(b.g))
  const shortGoods = goods.filter((x) => x.short > 0).length
  const n = goods.length
  const cols = n <= 1 ? '' : n === 2 || n === 4 ? 'md:grid-cols-2' : 'md:grid-cols-2 xl:grid-cols-3'

  return (
    <>
      <PageHeader eyebrow="Stage 3 · Production & material flow" title="Feeds map"
        meta={<>
          <Pill tone="accent">§7</Pill>
          <Pill tone={shortGoods ? 'critical' : 'good'}>
            {shortGoods ? `${shortGoods} of ${n} goods short of a material` : `every good covered`}
          </Pill>
        </>} />

      <Note label="What this screen does" className="mb-3">
        If I run out of X I cannot make Y. One tile per finished good, the ones with a short material
        first; each line is a material it needs, with how long that material lasts against how long it
        takes to replace. Surfaced only where something is short — a full BOM explosion across every
        SKU is deliberately not built.
      </Note>

      <Card index={0} title="What each good needs, and what is running out">
        <ul className={`grid auto-rows-min items-start gap-2.5 p-3 ${cols}`}>
          {goods.map(({ g, feeders, short }, i) => {
            const tone = short ? 'critical' : 'good'
            return (
              <li key={g} style={{ '--i': Math.min(i, 8) } as React.CSSProperties}
                className={`anim-fade-up relative overflow-hidden rounded-md border pl-2.5 ${
                  short ? 'border-critical/35 bg-critical-soft/25' : 'border-line bg-surface'}`}>
                <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${TONE_RAIL[tone]}`} />
                <div className="px-2.5 pb-2 pt-2">
                  <div className="flex items-center gap-1.5">
                    <Icon name={short ? 'alert' : 'check'} className={`size-3.5 shrink-0 ${TONE_TEXT[tone]}`} />
                    <h3 className="min-w-0 flex-1 truncate text-[13px] font-medium" title={g}>{g}</h3>
                    <span className={`shrink-0 text-[11px] ${short ? 'font-medium text-critical' : 'text-ink-3'}`}>
                      {short ? `${short} of ${feeders.length} short` : 'covered'}
                    </span>
                  </div>
                  <ul className="mt-1.5 space-y-1">
                    {feeders.map((r) => {
                      const t = STATUS_TONE[r.status.value] ?? 'neutral'
                      return (
                        <li key={r.item.id} className="flex items-center gap-1.5 text-[11.5px]"
                          title={`${r.item.name} — ${STATUS_LABEL[r.status.value]}`}>
                          <Icon name={STATUS_ICON[r.status.value] ?? 'activity'}
                            className={`size-3 shrink-0 ${TONE_TEXT[t] ?? 'text-ink-3'}`} />
                          <span className="mono w-[7.5rem] shrink-0 truncate text-ink-2">{r.item.code}</span>
                          <Lane r={r} />
                          <span className={`truncate ${isShort(r) ? 'text-ink-2' : 'text-ink-3'}`}>
                            {STATUS_LABEL[r.status.value]}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              </li>
            )
          })}
        </ul>

        {/* the words the lanes carry, printed once */}
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 pb-2 text-[10.5px] text-ink-3">
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="inline-block h-1.5 w-5 rounded-full bg-good" />days of cover
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="inline-block h-2.5 w-[2px] bg-ink" />lead time to replace
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="inline-block h-1.5 w-5 rounded-full bg-critical" />runs out before it can be replaced
          </li>
        </ul>

        <Note foot label="Why the map stops at the material that is short">
          One late component holds a whole order. Two materials feed the immersion heater and one of
          them is at risk — that is the §2 problem, drawn. A full BOM explosion across every SKU is
          deliberately not built; the link is surfaced only where something is short, and it reads
          from the same rows the Sourcing Desk runs on.
        </Note>
      </Card>
    </>
  )
}

export default function Page() {
  return <StageGate later="Production material flow"><PageBody /></StageGate>
}
