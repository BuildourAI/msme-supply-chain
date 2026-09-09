'use client'
import Link from 'next/link'
import { StagePage } from '@/components/stage/StagePage'
import { stageById } from '@/lib/seed/stages'
import { Card, StatusPill } from '@/components/ui/bits'
import { Num } from '@/components/ui/Num'
import { useInventory } from '@/components/inventory/store'
import { INVENTORY_TABS } from '@/components/inventory/InventoryTabs'
import { money, type Tone } from '@/lib/domain/format'

/**
 * The front door. One number per system — each of them a number this factory
 * could not have produced before — and a link to the screen that produces it.
 */
export default function Page() {
  const {
    stockRows, staleValue, accuracy, countRows, offcutValue, offcutRows,
    cutRows, netLoss, scrapRows, unrealised, lossRows,
  } = useInventory()
  const stale = stockRows.filter((r) => r.stale).length
  const below = cutRows.filter((r) => r.belowPlan).length
  const over = scrapRows.filter((s) => s.over).length
  const movements = stockRows.reduce((a, r) => a + r.movements.length, 0)

  const systems = [
    {
      href: INVENTORY_TABS[0].href, code: 'INV-01', title: 'Stock ledger & cycle count',
      question: 'Is the number on this screen the number on the rack?',
      figure: staleValue, format: 'money' as const,
      caption: 'sitting on a balance nobody has physically confirmed',
      lines: [
        `${movements} movements behind ${stockRows.length} lots — no quantity is typed`,
        `${countRows.length} counts on file · ${accuracy.value.toFixed(1)}% of them inside class tolerance`,
      ],
      tone: (stale ? 'warn' : 'good') as Tone,
      status: stale ? `${stale} unconfirmed` : 'every balance confirmed',
    },
    {
      href: INVENTORY_TABS[1].href, code: 'INV-02', title: 'Cutting yield & offcuts',
      question: 'Are we buying material we already have on a rack?',
      figure: offcutValue, format: 'money' as const,
      caption: 'of remnants owned, paid for, and buyable again by accident',
      lines: [
        `${offcutRows.length} bands on the racks, each a lot in the same ledger`,
        below ? `${below} of ${cutRows.length} cuts came in below the nest plan` : `${cutRows.length} cuts, all at or above plan`,
      ],
      tone: 'accent' as Tone,
      status: below ? `${below} below the nest plan` : 'every cut at plan',
    },
    {
      href: INVENTORY_TABS[2].href, code: 'INV-03', title: 'Wastage & loss ledger',
      question: 'Where did the material go, and what did it cost?',
      figure: netLoss, format: 'money' as const,
      caption: 'net of what the scrap dealer pays back',
      lines: [
        `${lossRows.length} records across seven causes — six posted by events, one typed`,
        unrealised.value > 0
          ? `${money(unrealised.value)} of recoverable scrap still in the bin`
          : 'every recoverable loss realised',
      ],
      tone: (over ? 'critical' : 'warn') as Tone,
      status: over ? `${over} over target` : 'all within target',
    },
  ]

  return (
    <StagePage stage={stageById('inventory')}>
      <Card title="The three systems" live
        sub="Each answers one question the factory could not answer before — click through to the screen that answers it">
        <div className="grid gap-3 p-4 lg:grid-cols-3">
          {systems.map((s, i) => (
            <Link key={s.code} href={s.href} style={{ '--i': i } as React.CSSProperties}
              className="anim-fade-up lift shadow-sm block rounded-lg border border-line bg-surface-2 p-3.5 hover:border-accent/50">
              <div className="flex items-baseline gap-2">
                <span className="mono text-[10.5px] uppercase tracking-wider text-ink-3">{s.code}</span>
                <span className="ml-auto"><StatusPill tone={s.tone} label={s.status} /></span>
              </div>
              <h3 className="mt-1 text-[14.5px] leading-snug">{s.title}</h3>
              <p className="mt-0.5 text-[12px] italic leading-snug text-ink-3">“{s.question}”</p>
              <p className="mt-2.5"><Num d={s.figure} format={s.format} size="lg" tone={s.tone} /></p>
              <p className="text-[11.5px] text-ink-3">{s.caption}</p>
              <ul className="mt-2 space-y-0.5">
                {s.lines.map((l) => <li key={l} className="text-[11.5px] text-ink-2">{l}</li>)}
              </ul>
              <p className="mt-2 text-[11px] font-medium text-accent">Open {s.code} →</p>
            </Link>
          ))}
        </div>
        <p className="border-t border-line-soft px-4 py-3 text-[12px] leading-relaxed text-ink-3">
          One ledger, three readings. A cut issues material and hands back a remnant, so INV-02 posts to
          the same balance INV-01 shows. The kerf and the undersized drops from that same cut land on
          INV-03 as losses with a cause. A cycle count that comes up short posts an adjustment and a
          loss at once. And the totals still reconcile to §9.1 exactly — the opening balance of every
          lot is computed so that opening plus every document since equals the quantity the design
          document states, which is why the Sourcing Desk does not move.
        </p>
      </Card>
    </StagePage>
  )
}
