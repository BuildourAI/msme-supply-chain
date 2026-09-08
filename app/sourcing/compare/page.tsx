'use client'
import { PageHeader } from '@/components/shell/PageHeader'
import { Card, Pill, StatusPill } from '@/components/ui/bits'
import { LandedCostCompare } from '@/components/desk/Panels'
import { RankedBars } from '@/components/charts/exec-charts'
import { useDesk } from '@/components/desk/store'
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
 * Everything here is computed from the same rows the desk runs on. There is no
 * second calculation of landed cost anywhere in this build.
 */

/** the gap between buying on quoted rate and buying on landed cost, per line */
function verdict(r: DerivedRow) {
  const best = r.quotes[0]
  const cheap = r.quotes.find((q) => q.isLowestRate)!
  const perUnit = cheap.landedPerUnit.value - best.landedPerUnit.value
  // On a line with nothing to order the per-unit gap is still real; the rupee
  // cost is not, so it is shown as zero rather than invented from a quantity.
  const onThisOrder = perUnit * Math.max(r.reorderQty.value, 0)
  return { best, cheap, perUnit, onThisOrder, flips: r.flipsVendor }
}

export default function Page() {
  const { rows, selected, select } = useDesk()
  const verdicts = rows.map((r) => ({ r, ...verdict(r) }))
  const flipping = verdicts.filter((v) => v.flips)
  const exposure = flipping.reduce((a, v) => a + v.onThisOrder, 0)

  const gapRows = [...flipping]
    .map((v) => ({
      label: `${v.r.item.code} · ${v.cheap.vendor.name}`,
      value: Math.round((v.perUnit / v.best.landedPerUnit.value) * 1000) / 10,
      sub: `+${money(v.perUnit, 2)} per ${v.r.item.uom} · lands ${money(v.cheap.landedPerUnit.value, 2)} against ${v.best.vendor.name} at ${money(v.best.landedPerUnit.value, 2)}`,
    }))
    .sort((a, b) => b.value - a.value)

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

      <p className="mb-3 max-w-4xl text-[13px] leading-relaxed text-ink-2">
        <strong className="text-ink">The cheapest quoted rate is the wrong answer on{' '}
        {flipping.length} of these {rows.length} lines.</strong> Landed cost is the rate plus freight,
        plus the GST you cannot claim back, plus what the payment term costs you, plus an allowance for
        the material this vendor historically sends back — five components, each one openable. Buying
        the whole run on quoted rate alone would cost {money(exposure)} more than buying it on landed
        cost, and none of that difference is visible on a quotation.
      </p>

      <div className="mb-3 grid items-start gap-3 xl:grid-cols-[1.15fr_1fr]">
        <Card index={0} title="Every line, on both bases"
          sub="Click a row to compare its vendors component by component">
          <div className="scroll-x overflow-auto">
            <table className="w-full min-w-[40rem] border-collapse text-[12px]">
              <thead>
                <tr className="text-ink-3">
                  {['Material', 'Cheapest quote', 'Cheapest landed', 'Gap / unit', 'On this order', ''].map((h) => (
                    <th key={h} className="whitespace-nowrap border-b border-line px-3 py-1.5 text-left font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {verdicts.map((v) => {
                  const on = v.r.item.id === selected.item.id
                  return (
                    <tr key={v.r.item.id}
                        onClick={() => select(v.r.item.id)}
                        className={`cursor-pointer border-b border-line-soft transition-colors ${
                          on ? 'bg-accent-soft' : 'hover:bg-surface-2'}`}>
                      <td className="px-3 py-1.5">
                        <span className="mono block text-[10.5px] text-ink-3">{v.r.item.code}</span>
                        <span className="block max-w-[13rem] truncate">{v.r.item.name}</span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5">
                        <span className="block truncate text-ink-2">{v.cheap.vendor.name}</span>
                        <span className="num block text-[11px] text-ink-3">{money(v.cheap.vendorItem.rate, 2)}/{v.r.item.uom}</span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5">
                        <span className="block truncate font-medium">{v.best.vendor.name}</span>
                        <span className="num block text-[11px] text-ink-3">{money(v.best.landedPerUnit.value, 2)}/{v.r.item.uom}</span>
                      </td>
                      <td className="num whitespace-nowrap px-3 py-1.5">
                        {v.perUnit > 0
                          ? <span className="text-warn">+{money(v.perUnit, 2)}</span>
                          : <span className="text-ink-3">—</span>}
                      </td>
                      <td className="num whitespace-nowrap px-3 py-1.5 font-medium">
                        {v.onThisOrder > 0 ? money(v.onThisOrder) : <span className="text-ink-3">nothing to order</span>}
                      </td>
                      <td className="px-3 py-1.5">
                        <StatusPill label={v.flips ? 'Flips' : 'Confirms'} tone={v.flips ? 'warn' : 'good'}
                          explain={v.flips
                            ? 'Landed cost overturns the cheapest quote on this line.'
                            : 'Same vendor wins on both bases — the obvious choice is also the right one.'} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="border-t border-line-soft px-3 py-2 text-[11.5px] leading-relaxed text-ink-3">
            “On this order” is the gap multiplied by the quantity this run actually raises. A line with
            nothing to order still has a real per-unit gap — it just has no rupee cost today, and
            inventing one from a hypothetical quantity would be a made-up number.
          </p>
        </Card>

        <Card index={1} title="Where the gap comes from"
          sub={`the ${flipping.length} lines where landed cost overturns the quote, worst first`}>
          <div className="p-3.5">
            <RankedBars rows={gapRows} format="pct"
              title="how much dearer the cheapest quote actually lands" />
            <p className="mt-1.5 text-[11px] leading-relaxed text-ink-3">
              Shown as a share, not rupees per unit: these lines are priced in metres, tonnes,
              kilograms and pieces, and ranking ₹2,130 a tonne against ₹8.30 a metre on one bar scale
              would be arithmetic on nothing. The rupee gap is on each row, where it does mean something.
            </p>
            <div className="mt-3 space-y-2 border-t border-line-soft pt-3">
              {[
                ['Rate', 'What the quotation says. The only number most factories compare.'],
                ['Freight', 'Per unit, to this factory. A distant vendor’s cheaper rate is often not cheaper.'],
                ['Non-creditable GST', 'The slice you cannot claim back. It is a real cost and it never appears on the quote.'],
                ['Payment-term cost', 'Thirty days of your money at your cost of capital. Advance payment is dearer than it looks.'],
                ['Rejection allowance', 'Built from this vendor’s own closed goods receipts — not a score somebody typed. A vendor who sends bad material pays for it here.'],
              ].map(([k, v]) => (
                <p key={k} className="text-[11.5px] leading-relaxed text-ink-2">
                  <span className="font-medium text-ink">{k}</span> — {v}
                </p>
              ))}
            </div>
          </div>
        </Card>
      </div>

      <LandedCostCompare />

      <Card index={4} className="mt-3" title="What this does not do"
        sub="§11 · the boundary is the same one the rest of the desk runs on">
        <div className="grid gap-x-5 gap-y-2 p-3.5 md:grid-cols-2">
          {[
            ['It never places the order.', 'The comparison recommends and the buyer chooses. Picking the dearer vendor is allowed — it asks for a reason and records it against the line.'],
            ['It never re-prices a decision.', 'A rate change tomorrow does not alter a suggestion made today. The snapshot rule is what makes an approved draft trustworthy.'],
            ['It never hides the loser.', 'Every vendor with a quote for the item is shown, in full, with the components that put them where they are.'],
            ['It never scores a vendor on screen.', 'Rejection history feeds the allowance silently. A scorecard is precision nobody in the source set asked for.'],
          ].map(([k, v]) => (
            <p key={k} className="text-[12px] leading-relaxed text-ink-2">
              <span className="font-medium text-ink">{k}</span> {v}
            </p>
          ))}
        </div>
      </Card>
    </>
  )
}
