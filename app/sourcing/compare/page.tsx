'use client'
import { PageHeader } from '@/components/shell/PageHeader'
import { Card, Pill } from '@/components/ui/bits'
import { Icon } from '@/components/ui/icons'
import { LandedCostCompare } from '@/components/desk/Panels'
import { useDesk } from '@/components/desk/store'
import { Note } from '@/components/ui/Note'
import { money } from '@/lib/domain/format'
import type { DerivedRow } from '@/lib/domain/derive'

/**
 * SRC-03 on its own page.
 *
 * The panel on the desk compares one line at a time, which is the buyer's
 * question. This page asks the owner's question instead — how often is the
 * cheapest quote the wrong answer, and what does believing it cost? — and then
 * lets you drill into any line to see the five components.
 *
 * It is a master–detail screen, and it is laid out as one. The list of lines is
 * on the left and the comparison for the selected line is on the right, stuck
 * to the top of the viewport: clicking a material changes the card you are
 * already looking at. The earlier layout put the comparison in a full-width
 * card below both columns, 680px under the row you clicked, so the one
 * interaction this screen exists for could not be seen happening.
 *
 * The prose went the same way it went everywhere else: the five components, the
 * mixed-unit caveat and the §11 boundary are all still here, folded into ⓘ
 * disclosures at the foot. Everything here is computed from the same rows the
 * desk runs on. There is no second calculation of landed cost anywhere in this
 * build.
 */

/** the gap between buying on quoted rate and buying on landed cost, per line */
function verdict(r: DerivedRow) {
  const best = r.quotes[0]
  const cheap = r.quotes.find((q) => q.isLowestRate)!
  const perUnit = cheap.landedPerUnit.value - best.landedPerUnit.value
  // On a line with nothing to order the per-unit gap is still real; the rupee
  // cost is not, so it is shown as zero rather than invented from a quantity.
  const onThisOrder = perUnit * Math.max(r.reorderQty.value, 0)
  // the same share the ranked bars used to chart, kept per row: rupees per
  // tonne and rupees per metre cannot share a scale, a percentage can
  const share = Math.round((perUnit / best.landedPerUnit.value) * 1000) / 10
  return { best, cheap, perUnit, onThisOrder, share, flips: r.flipsVendor }
}

export default function Page() {
  const { rows, selected, select } = useDesk()
  const verdicts = rows.map((r) => ({ r, ...verdict(r) }))
  const flipping = verdicts.filter((v) => v.flips)
  const exposure = flipping.reduce((a, v) => a + v.onThisOrder, 0)
  const worst = Math.max(...verdicts.map((v) => v.share), 1)

  return (
    <>
      <PageHeader eyebrow="Stage 1 · Sourcing & procurement" title="Landed-cost comparison"
        meta={<>
          <Pill tone="accent">SRC-03</Pill>
          <Pill tone={flipping.length ? 'warn' : 'good'}>
            {flipping.length} of {rows.length} lines flip vendor
          </Pill>
          <Pill mono>{money(exposure)} on this run</Pill>
        </>} />

      <Note label="What this screen does" className="mb-3">
        <strong className="text-ink">The cheapest quoted rate is the wrong answer on{' '}
        {flipping.length} of these {rows.length} lines.</strong> Landed cost is the rate plus freight,
        plus the GST you cannot claim back, plus what the payment term costs you, plus an allowance for
        the material this vendor historically sends back — five components, each one openable. Buying
        the whole run on quoted rate alone would cost {money(exposure)} more than buying it on landed
        cost, and none of that difference is visible on a quotation.
      </Note>

      <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <Card index={0} title="Every line, on both bases"
          sub="Click a material to compare its vendors component by component"
          actions={<span className="mono text-[10.5px] text-ink-3"
            title="Each row: the cheapest quoted rate, then the cheapest once freight, non-creditable GST, payment terms and rejection history are added. The bar is the gap as a share of landed cost — a share, because these lines are priced in metres, tonnes, kilograms and pieces.">
            Quote → Landed · gap · share dearer
          </span>}>
          <ul className="divide-y divide-line-soft">
            {verdicts.map((v) => {
              const on = v.r.item.id === selected.item.id
              return (
                <li key={v.r.item.id}>
                  <button type="button" onClick={() => select(v.r.item.id)} aria-pressed={on}
                    className={`press flex w-full items-start gap-2.5 border-l-2 px-3 py-2 text-left transition-colors ${
                      on ? 'border-accent bg-accent-soft' : 'border-transparent hover:bg-surface-2'}`}>
                    <span className={`mt-0.5 shrink-0 ${v.flips ? 'text-warn' : 'text-good'}`}
                      title={v.flips
                        ? 'Landed cost overturns the cheapest quote on this line.'
                        : 'Same vendor wins on both bases — the obvious choice is also the right one.'}>
                      <Icon name={v.flips ? 'alert' : 'check'} className="size-3.5" />
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className="mono shrink-0 text-[10.5px] text-ink-3">{v.r.item.code}</span>
                        <span className="min-w-0 truncate text-[12.5px]" title={v.r.item.name}>{v.r.item.name}</span>
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-ink-3"
                        title={`${v.cheap.vendor.name} quotes ${money(v.cheap.vendorItem.rate, 2)}; ${v.best.vendor.name} lands at ${money(v.best.landedPerUnit.value, 2)} — ${v.flips ? 'flips' : 'confirms'} the vendor`}>
                        {v.cheap.vendor.name} <span className="num">{money(v.cheap.vendorItem.rate, 2)}</span>
                        <span aria-hidden className="mx-1">→</span>
                        {v.flips ? v.best.vendor.name : 'same vendor'}{' '}
                        <span className="num">{money(v.best.landedPerUnit.value, 2)}</span>/{v.r.item.uom}
                        {' · '}{v.flips ? 'flips' : 'confirms'}
                        {' · '}{v.onThisOrder > 0
                          ? <span className="num">{money(v.onThisOrder)} on order</span>
                          : 'nothing to order'}
                      </span>
                    </span>

                    <span className="shrink-0 text-right">
                      <span className="num block text-[12px] font-medium">
                        {v.perUnit > 0
                          ? <span className="text-warn">+{money(v.perUnit, 2)}</span>
                          : <span className="text-ink-3">—</span>}
                      </span>
                      <span className="mt-0.5 flex items-center justify-end gap-1.5">
                        <span aria-hidden className="h-1.5 w-10 overflow-hidden rounded-full bg-surface-3">
                          <span className="anim-reveal block h-full rounded-full bg-accent"
                                style={{ width: `${(v.share / worst) * 100}%` }} />
                        </span>
                        <span className="num w-8 text-[10.5px] text-ink-3">{v.share}%</span>
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>

          <Note foot label="What “on this order” counts, and what the bar measures">
            <p>
              “On this order” is the gap multiplied by the quantity this run actually raises. A line
              with nothing to order still has a real per-unit gap — it just has no rupee cost today, and
              inventing one from a hypothetical quantity would be a made-up number.
            </p>
            <p className="mt-2">
              The bar is how much dearer the cheapest quote actually lands, as a share. These lines are
              priced in metres, tonnes, kilograms and pieces, and ranking ₹2,130 a tonne against ₹8.30 a
              metre on one bar scale would be arithmetic on nothing. The rupee gap is beside it, where
              it does mean something.
            </p>
          </Note>
        </Card>

        {/* the answer to the click, kept beside the click — and the two folds
            that explain it, in the column they explain rather than at the foot
            of a page the reader never reaches */}
        <div className="space-y-2.5 xl:sticky xl:top-[60px]">
          <LandedCostCompare numbers="folded" />
          <div className="flex flex-wrap gap-x-6 gap-y-1 px-1">
        <Note label="The five components of landed cost">
          <div className="space-y-2">
            {[
              ['Rate', 'What the quotation says. The only number most factories compare.'],
              ['Freight', 'Per unit, to this factory. A distant vendor’s cheaper rate is often not cheaper.'],
              ['Non-creditable GST', 'The slice you cannot claim back. It is a real cost and it never appears on the quote.'],
              ['Payment-term cost', 'Thirty days of your money at your cost of capital. Advance payment is dearer than it looks.'],
              ['Rejection allowance', 'Built from this vendor’s own closed goods receipts — not a score somebody typed. A vendor who sends bad material pays for it here.'],
            ].map(([k, v]) => (
              <p key={k}>
                <span className="font-medium text-ink">{k}</span> — {v}
              </p>
            ))}
          </div>
        </Note>

        <Note label="What this does not do">
          <div className="space-y-2">
            {[
              ['It never places the order.', 'The comparison recommends and the buyer chooses. Picking the dearer vendor is allowed — it asks for a reason and records it against the line.'],
              ['It never re-prices a decision.', 'A rate change tomorrow does not alter a suggestion made today. The snapshot rule is what makes an approved draft trustworthy.'],
              ['It never hides the loser.', 'Every vendor with a quote for the item is shown, in full, with the components that put them where they are.'],
              ['It never scores a vendor on screen.', 'Rejection history feeds the allowance silently. A scorecard is precision nobody in the source set asked for.'],
            ].map(([k, v]) => (
              <p key={k}>
                <span className="font-medium text-ink">{k}</span> {v}
              </p>
            ))}
          </div>
        </Note>
          </div>
        </div>
      </div>
    </>
  )
}
