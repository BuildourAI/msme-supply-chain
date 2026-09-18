'use client'
import { useEffect, useState } from 'react'
import { Wizard, type WizardStep } from '@/components/ui/Wizard'
import { Field, NumberInput } from '@/components/ui/Field'
import { useWorkspace } from '@/components/workspace/store'
import { money, num as fmt } from '@/lib/domain/format'
import type { StockLot } from '@/lib/domain/types'

/**
 * Counting what is on the shelf, one material per screen.
 *
 * This is the step that turns the system on. Until there is a quantity against
 * a material, nothing can be short, nothing can be covered and every screen is
 * an empty frame.
 *
 * Each material gets its own step, which is the point: a single form listing
 * fourteen materials with a box beside each is the wall of inputs this whole
 * change exists to avoid, and a person counting stock is walking the racks
 * anyway. A material can be skipped — an owner who has not got to the back of
 * the store yet should be able to record what they have seen and come back.
 *
 * The second box is the one nobody thinks to ask for and everybody needs: how
 * much of that pile cannot actually be used. §11 is firm that non-usable stock
 * is always displayed and never counted as cover, and it can only obey that if
 * somebody says how much it is.
 */
export function StockWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { workspace, update, today } = useWorkspace()
  const [good, setGood] = useState<Record<string, string>>({})
  const [held, setHeld] = useState<Record<string, string>>({})
  const [why, setWhy] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open || !workspace) return
    const g: Record<string, string> = {}
    const h: Record<string, string> = {}
    const w: Record<string, string> = {}
    for (const it of workspace.items) {
      const lots = workspace.stockLots.filter((l) => l.itemId === it.id)
      const usable = lots.filter((l) => l.usability === 'usable').reduce((a, l) => a + l.qty, 0)
      const bad = lots.filter((l) => l.usability !== 'usable')
      g[it.id] = lots.length ? String(usable) : ''
      h[it.id] = bad.length ? String(bad.reduce((a, l) => a + l.qty, 0)) : ''
      w[it.id] = bad[0]?.usabilityReason ?? ''
    }
    setGood(g); setHeld(h); setWhy(w)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open || !workspace) return null
  const ws = workspace

  const parse = (v: string) => (v.trim() === '' ? NaN : Number(v))

  if (ws.items.length === 0) {
    return (
      <Wizard open={open} onClose={onClose} title="Count your stock"
        steps={[{
          label: 'Nothing yet', title: 'There are no materials to count',
          invalid: null,
          body: (
            <p className="rounded-md border border-warn/30 bg-warn-soft px-3 py-2.5 text-[12.5px] leading-relaxed text-ink-2">
              Add a material first, then come back and say how much of it is on the shelf.
            </p>
          ),
        }]}
        onDone={onClose} doneLabel="Close" />
    )
  }

  const steps: WizardStep[] = ws.items.map((it) => {
    const g = parse(good[it.id] ?? '')
    const h = parse(held[it.id] ?? '')
    const blank = (good[it.id] ?? '').trim() === ''
    const badGood = !blank && (!Number.isFinite(g) || g < 0)
    const badHeld = (held[it.id] ?? '').trim() !== '' && (!Number.isFinite(h) || h < 0)
    return {
      label: it.code,
      title: `How much ${it.name} is on the shelf?`,
      why: 'Count what is physically there right now. A rough figure you correct later beats an empty system.',
      invalid: badGood
        ? 'That is not a quantity. Put in a number, or leave it blank to skip this material.'
        : badHeld ? 'That is not a quantity.' : null,
      body: (
        <div className="space-y-3.5">
          <Field label="Usable stock, ready to issue" htmlFor={`sk-${it.id}`}>
            <NumberInput id={`sk-${it.id}`} value={good[it.id] ?? ''} autoFocus
              onChange={(v) => setGood((s) => ({ ...s, [it.id]: v }))}
              unit={it.uom} placeholder="leave blank to skip" invalid={badGood} />
          </Field>

          <Field label="Any of it you cannot use?"
            hint="Damaged, waiting on a test, past its date. It is shown on every screen and never counted as cover.">
            <NumberInput value={held[it.id] ?? ''}
              onChange={(v) => setHeld((s) => ({ ...s, [it.id]: v }))}
              unit={it.uom} placeholder="0" invalid={badHeld} />
          </Field>

          {Number.isFinite(h) && h > 0 && (
            <Field label="What is wrong with it?" hint="One line. It shows beside the quantity.">
              <input value={why[it.id] ?? ''}
                onChange={(e) => setWhy((s) => ({ ...s, [it.id]: e.target.value }))}
                placeholder="Waiting on a test certificate"
                className="w-full rounded-md border border-line bg-surface px-2.5 py-2 text-[13px] outline-none focus:border-accent" />
            </Field>
          )}

          {Number.isFinite(g) && g > 0 && it.avgDailyConsumption > 0 && (
            <p className="rounded-md border border-line bg-surface-2 px-2.5 py-2 text-[12px] leading-relaxed text-ink-2">
              At {fmt(it.avgDailyConsumption, 3)} {it.uom} a day, that is{' '}
              <strong className="text-ink">{Math.floor(g / it.avgDailyConsumption)} days</strong> of cover
              {it.lastPurchaseRate > 0 && <> · worth {money(g * it.lastPurchaseRate)} at what you last paid</>}.
            </p>
          )}
        </div>
      ),
    }
  })

  const save = () => {
    const lots: StockLot[] = []
    let n = ws.stockLots.length
    for (const it of ws.items) {
      const g = parse(good[it.id] ?? '')
      const h = parse(held[it.id] ?? '')
      if (Number.isFinite(g) && g >= 0 && (good[it.id] ?? '').trim() !== '') {
        n += 1
        lots.push({
          id: `LOT-${String(n).padStart(3, '0')}`, itemId: it.id,
          batchNo: `OPENING-${today}`, qty: g, usability: 'usable',
        })
      }
      if (Number.isFinite(h) && h > 0) {
        n += 1
        lots.push({
          id: `LOT-${String(n).padStart(3, '0')}`, itemId: it.id,
          batchNo: `OPENING-HOLD-${today}`, qty: h, usability: 'qc_hold',
          usabilityReason: (why[it.id] ?? '').trim() || 'Held back at the opening count',
        })
      }
    }
    // A recount replaces the opening position rather than adding to it, so
    // running this step twice does not double the stock.
    update((w) => ({
      ...w,
      stockLots: [...w.stockLots.filter((l) => !l.batchNo.startsWith('OPENING')), ...lots],
    }))
    onClose()
  }

  return (
    <Wizard open={open} onClose={onClose}
      title="Count your stock"
      sub={`${ws.items.length} material${ws.items.length === 1 ? '' : 's'} to walk through`}
      steps={steps} onDone={save} doneLabel="Save the count" />
  )
}
