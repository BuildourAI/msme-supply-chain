'use client'
import Link from 'next/link'
import { StagePage } from '@/components/stage/StagePage'
import { stageById } from '@/lib/seed/stages'
import { Card, StatusPill } from '@/components/ui/bits'
import { Num } from '@/components/ui/Num'
import { useInbound } from '@/components/inbound/store'
import { INBOUND_TABS } from '@/components/inbound/InboundTabs'
import { money, type Tone } from '@/lib/domain/format'

/**
 * The stage page is the front door to the three systems. It shows the one number
 * each of them exists to produce — a number nobody at this factory could have
 * answered before — and opens onto the screen that produces it.
 */
export default function Page() {
  const { queue, qcHeld, closedRows, exposure, outOfSync, challanRows, jobworkTotal, unaccountedTotal } = useInbound()
  const overdueQc = queue.filter((r) => r.state === 'overdue').length
  const notTold = outOfSync.filter((r) => r.state === 'not_told').length
  const overdueJw = challanRows.filter((r) => r.overdue).length

  const systems = [
    {
      href: INBOUND_TABS[0].href, code: 'INB-01', title: 'Goods receipt & inbound QC',
      question: 'Was this material actually checked, and against what?',
      figure: qcHeld, format: 'money' as const, caption: 'held at the gate, received but not issuable',
      lines: [
        `${queue.length} awaiting inspection${overdueQc ? `, ${overdueQc} past the QC window` : ''}`,
        `${closedRows.length} closed receipts — the trailing rejection rate is an average of these`,
      ],
      tone: (overdueQc ? 'critical' : 'accent') as Tone,
      status: overdueQc ? `${overdueQc} past the QC window` : 'inside the window',
    },
    {
      href: INBOUND_TABS[1].href, code: 'INB-02', title: 'Order change sync',
      question: 'Is the vendor making the quantity we actually need?',
      figure: exposure, format: 'money' as const, caption: 'riding on changes the vendor has not confirmed',
      lines: [
        `${notTold} line${notTold === 1 ? '' : 's'} changed with the vendor never told`,
        `${outOfSync.length - notTold} sent and awaiting an acknowledgement`,
      ],
      tone: (notTold ? 'critical' : exposure.value > 0 ? 'warn' : 'good') as Tone,
      status: notTold ? `${notTold} changed, vendor not told` : 'every line in sync',
    },
    {
      href: INBOUND_TABS[2].href, code: 'INB-03', title: 'Jobwork register',
      question: 'Where is the material that left, and when is it coming back?',
      figure: jobworkTotal, format: 'money' as const, caption: 'standing in sheds we do not control',
      lines: [
        `${challanRows.filter((r) => r.challan.status === 'out').length} open challans${overdueJw ? `, ${overdueJw} overdue` : ''}`,
        unaccountedTotal.value > 0
          ? `${money(unaccountedTotal.value)} unaccounted — neither back nor explained by the process`
          : 'nothing unaccounted',
      ],
      tone: (overdueJw ? 'critical' : 'warn') as Tone,
      status: overdueJw ? `${overdueJw} overdue` : 'nothing overdue',
    },
  ]

  return (
    <StagePage stage={stageById('inbound')}>
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
                {s.lines.map((l) => (
                  <li key={l} className="text-[11.5px] text-ink-2">{l}</li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] font-medium text-accent">Open {s.code} →</p>
            </Link>
          ))}
        </div>
        <p className="border-t border-line-soft px-4 py-3 text-[12px] leading-relaxed text-ink-3">
          The three are one loop, not three screens. A jobwork return comes back through INB-01’s gate
          like any purchase, so outsourced work gets the same inspection. A receipt that matches a
          version the vendor was never moved off is INB-02’s evidence, surfaced as a stale order rather
          than a random short supply. And every closed receipt moves the trailing rejection rate that
          the Sourcing Desk prices its quotes with — a loop that was open until now.
        </p>
      </Card>
    </StagePage>
  )
}
