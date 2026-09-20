'use client'
import { adviseFor } from '@/lib/workspace/landed'
import { money } from '@/lib/domain/format'
import { useWorkspace } from '@/components/workspace/store'

/**
 * The recommendation, at the moment somebody is choosing.
 *
 * Landed cost has had its own screen since phase A, and a screen you have to
 * remember to open is a report. The decision is made here, in the form where a
 * supplier gets picked, and this is the last moment anything can change — so
 * the same ranking `/sourcing/compare` shows is stated inline, off the same
 * `rankByLanded`, which is what stops the two ever contradicting each other.
 *
 * Three rules it does not bend:
 *
 * Nothing is selected for you. A button appears and you press it or you do not.
 * §11 is that the system suggests and drafts and never places an order, and a
 * form that quietly swapped the supplier somebody chose would be doing exactly
 * that with better arithmetic.
 *
 * Agreement is worth saying. Being told the supplier you already picked is the
 * cheapest one costs a line and saves opening another screen to check.
 *
 * A ranking with nothing behind it says so. Before freight, GST, terms and
 * rejections are entered every supplier lands at their quoted rate, and calling
 * that a recommendation would be this build's one real falsehood.
 */
export function BestLanded({ itemId, vendorId, qty, onPick }: {
  itemId: string
  vendorId: string
  /** the quantity on the form, so the saving can be stated in money */
  qty?: number
  /** offered as a button; never called by this component on its own */
  onPick?: (vendorId: string) => void
}) {
  const { workspace } = useWorkspace()
  if (!workspace || !itemId) return null
  const ws = workspace

  const a = adviseFor(ws, itemId, vendorId)
  if (a.rows.length === 0) return null

  const item = ws.items.find((i) => i.id === itemId)
  const nameOf = (id: string) => ws.vendors.find((v) => v.id === id)?.name ?? 'that supplier'
  const per = item?.uom ? ` per ${item.uom}` : ''
  const best = a.best!

  /* one rate on the material, and it is the one selected: nothing to rank */
  if (a.rows.length === 1 && a.chosen) return null

  /*
   * The verb is the whole honesty of this box. Before freight, GST, terms and
   * rejections are entered every supplier lands at exactly what they quoted, so
   * the ranking is the quoted rate with a different name on it — and saying
   * "lands cheaper" there would be the one falsehood this build has no excuse
   * for. It says "quotes less", which is true, and says why underneath.
   */
  const cheaper = a.flat ? 'quotes less' : 'lands cheaper'
  const cheapest = a.flat ? 'quotes least' : 'lands cheapest'

  const caveat = a.flat
    ? <> Nothing is entered beyond rates yet ({a.missing.join(', ')}), so this ranks on the
        quoted rate rather than on what the material costs you.</>
    : a.missing.length > 0
      ? <> Still unset: {a.missing.join(', ')}.</>
      : null

  /* they supply you, but have no rate against the material on the form */
  if (!a.chosen) {
    return (
      <Note tone="plain" onPick={onPick} pick={best.vi.vendorId} pickLabel={nameOf(best.vi.vendorId)}>
        No rate on file from {nameOf(vendorId)} for {item?.name ?? 'this material'}.{' '}
        <strong className="text-ink">{nameOf(best.vi.vendorId)}</strong> {cheapest} on it,
        at {money(best.b.landed, 2)}{per}.
        {caveat}
      </Note>
    )
  }

  if (a.isBest) {
    return (
      <Note tone={a.flat ? 'plain' : 'good'}>
        <strong className="text-ink">{nameOf(vendorId)} {cheapest}</strong> on{' '}
        {item?.name ?? 'this material'}, at {money(a.chosen.b.landed, 2)}{per}
        {a.flips && <> — even though {nameOf(a.rows.find((r) => r.cheapestQuoted)!.vi.vendorId)}{' '}
          quotes less</>}.
        {caveat}
      </Note>
    )
  }

  const onOrder = qty && qty > 0 ? a.saving * qty : 0
  return (
    <Note tone={a.flat ? 'plain' : 'accent'} onPick={onPick}
      pick={best.vi.vendorId} pickLabel={nameOf(best.vi.vendorId)}>
      <strong className="text-ink">{nameOf(best.vi.vendorId)} {cheaper}</strong> on{' '}
      {item?.name ?? 'this material'} — {money(best.b.landed, 2)} against{' '}
      {money(a.chosen.b.landed, 2)}, so {money(a.saving, 2)} less{per}
      {onOrder > 0 && <> — {money(onOrder)} on this order</>}.
      {caveat}
    </Note>
  )
}

/* --------------------------------------------------------------- the quote -- */

/**
 * The same figures, for somebody writing down a price rather than choosing one.
 *
 * A quote is a record of what a supplier said, so recommending a different
 * supplier here would be answering a question nobody asked. What is useful is
 * where the number they just gave sits against the rates already on file — and
 * the caveat that a quoted rate is not a landed cost until the three things
 * that go on the supplier have been entered.
 */
export function QuoteStanding({ itemId, vendorId, price }: {
  itemId: string
  vendorId: string
  price: number
}) {
  const { workspace } = useWorkspace()
  if (!workspace || !itemId) return null
  const ws = workspace

  const a = adviseFor(ws, itemId, vendorId)
  const low = a.rows.find((r) => r.cheapestQuoted)
  if (!low) return null

  const item = ws.items.find((i) => i.id === itemId)
  const per = item?.uom ? ` per ${item.uom}` : ''
  const name = ws.vendors.find((v) => v.id === low.vi.vendorId)?.name ?? 'a supplier'
  const beats = Number.isFinite(price) && price > 0 && price < low.vi.rate

  return (
    <Note tone={beats ? 'good' : 'plain'}>
      The lowest rate you hold on {item?.name ?? 'this material'} is{' '}
      {money(low.vi.rate, 2)}{per} from {name}
      {low.b.landed !== low.vi.rate && <>, which lands at {money(low.b.landed, 2)}</>}.
      {beats && <> <strong className="text-ink">This one is {money(low.vi.rate - price, 2)}{' '}
        below it</strong> on the rate — what it lands at depends on freight, GST and their
        terms, which go on the supplier.</>}
    </Note>
  )
}

/* ------------------------------------------------------------------ the box -- */

const TONE = {
  plain: 'border-line bg-surface-2',
  good: 'border-good/40 bg-good-soft',
  accent: 'border-accent/40 bg-accent-tint/40',
}

function Note({ tone, children, onPick, pick, pickLabel }: {
  tone: keyof typeof TONE
  children: React.ReactNode
  onPick?: (vendorId: string) => void
  pick?: string
  pickLabel?: string
}) {
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-3 py-2.5 ${TONE[tone]}`}>
      <p className="min-w-[14rem] flex-1 text-[12.5px] leading-relaxed text-ink-2">{children}</p>
      {onPick && pick && (
        <button type="button" onClick={() => onPick(pick)}
          className="press shrink-0 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[12.5px] font-medium hover:bg-surface-2">
          Use {pickLabel}
        </button>
      )}
    </div>
  )
}
