'use client'
import { Button, Card, Pill } from '@/components/ui/bits'
import { Dialog } from '@/components/ui/Dialog'
import { Num } from '@/components/ui/Num'
import { money, num, shortDate } from '@/lib/domain/format'
import { fgById, useDispatch } from './store'

/**
 * DSP-02 · the document pack.
 *
 * The pain is three documents carrying the same figures, typed three times.
 * The fix is emphatically NOT a fourth books-of-account: this prepares the pack
 * from the despatch note that already exists and hands it to whatever the
 * client runs — Tally, Vyapar, Spectrum, Odoo. §12 is explicit about it, and
 * the screen says so where a person can read it rather than burying it in a
 * commit message.
 *
 * What this build will never do: allocate an invoice number, compute a tax, or
 * hold a receivable. Those belong to the accounts package, and a system that
 * quietly starts doing them has become a second set of books that nobody
 * reconciles.
 */
function DocumentPack() {
  const { documentsNote, showDocuments } = useDispatch()
  if (!documentsNote) return null
  const { note, order, consignment } = documentsNote
  const lines = note.lines.map((l) => {
    const fg = fgById(l.fgId)!
    const ol = order.lines.find((x) => x.fgId === l.fgId)
    const rate = ol?.rate ?? 0
    return { fg, qty: l.qty, rate, value: l.qty * rate }
  })
  const total = lines.reduce((a, l) => a + l.value, 0)
  const interState = order.customer.state !== 'Maharashtra'

  return (
    <Dialog open wide onClose={() => showDocuments(null)} title={`Document pack · ${note.dnNo}`}
      sub={`${order.soNo} · ${order.customer.name} · despatched ${shortDate(note.despatchedOn)}`}>
      <div className="space-y-3 px-4 py-4">
        <div className="rounded-md border border-accent/30 bg-accent-soft px-3 py-2">
          <p className="text-[12px] leading-relaxed text-accent">
            <strong>Prepared here, raised there.</strong> Every figure below comes off the despatch note,
            so it is typed once instead of three times. The pack goes to the accounting system the
            factory already runs. This build never allocates an invoice number, never computes a tax and
            never holds a receivable — writing a second books-of-account is how these projects die.
          </p>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <section className="rounded-md border border-line">
            <header className="border-b border-line-soft bg-surface-2 px-3 py-2">
              <h3 className="text-[13px]">Delivery challan</h3>
              <p className="mono text-[10px] uppercase tracking-wider text-ink-2">what physically left</p>
            </header>
            <dl className="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1 px-3 py-2.5 text-[12px]">
              <dt className="text-ink-2">Challan against</dt><dd className="mono">{note.dnNo}</dd>
              <dt className="text-ink-2">Order</dt><dd className="mono">{order.soNo}</dd>
              <dt className="text-ink-2">Consignee</dt><dd>{order.customer.name}</dd>
              <dt className="text-ink-2">Ship to</dt><dd className="leading-snug">{order.customer.shipTo}</dd>
              <dt className="text-ink-2">Despatched</dt><dd>{shortDate(note.despatchedOn)}</dd>
              <dt className="text-ink-2">Authorised by</dt><dd>{note.authorisedBy}</dd>
              <dt className="text-ink-2">Gross weight</dt><dd className="num">{num(note.weightKg, 0)} kg</dd>
            </dl>
          </section>

          <section className="rounded-md border border-line">
            <header className="border-b border-line-soft bg-surface-2 px-3 py-2">
              <h3 className="text-[13px]">Tax invoice — values for the accounts package</h3>
              <p className="mono text-[10px] uppercase tracking-wider text-ink-2">not raised here</p>
            </header>
            <dl className="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1 px-3 py-2.5 text-[12px]">
              <dt className="text-ink-2">Buyer GSTIN</dt><dd className="mono">{order.customer.gstin}</dd>
              <dt className="text-ink-2">Place of supply</dt><dd>{order.customer.state}</dd>
              <dt className="text-ink-2">Tax treatment</dt>
              <dd>{interState ? 'Inter-state — IGST' : 'Intra-state — CGST + SGST'}
                <span className="mono block text-[10px] text-ink-2">the rate and the split are the package&rsquo;s call, not ours</span></dd>
              <dt className="text-ink-2">Taxable value</dt><dd className="num">{money(total)}</dd>
              <dt className="text-ink-2">Invoice number</dt>
              <dd className="text-ink-2">allocated by the accounts package&rsquo;s own series</dd>
            </dl>
          </section>
        </div>

        <section className="rounded-md border border-line">
          <header className="border-b border-line-soft bg-surface-2 px-3 py-2">
            <h3 className="text-[13px]">Lines — one source, three documents</h3>
          </header>
          <div className="scroll-x overflow-x-auto">
            <table className="w-full min-w-[36rem] border-collapse text-[12px]">
              <thead>
                <tr className="text-[10.5px] uppercase tracking-wide text-ink-3">
                  {['Product', 'HSN', 'Qty', 'Rate', 'Value'].map((h, i) => (
                    <th key={h} className={`border-b border-line px-3 py-1.5 font-medium ${i >= 2 ? 'text-right' : 'text-left'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.fg.id} className="border-b border-line-soft">
                    <td className="px-3 py-1.5">
                      <span className="mono block text-[10.5px] text-ink-3">{l.fg.code}</span>{l.fg.name}
                    </td>
                    <td className="mono px-3 py-1.5 text-ink-2">{l.fg.hsn}</td>
                    <td className="num px-3 py-1.5 text-right">{num(l.qty, 0)} {l.fg.uom}</td>
                    <td className="num px-3 py-1.5 text-right">{money(l.rate)}</td>
                    <td className="num px-3 py-1.5 text-right">{money(l.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-md border border-line">
          <header className="border-b border-line-soft bg-surface-2 px-3 py-2">
            <h3 className="text-[13px]">e-Way bill — the fields the portal asks for</h3>
            <p className="mono text-[10px] uppercase tracking-wider text-ink-2">generated on the portal, never here</p>
          </header>
          <dl className="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1 px-3 py-2.5 text-[12px] sm:grid-cols-[9rem_1fr_9rem_1fr]">
            <dt className="text-ink-2">Document</dt><dd className="mono">{note.dnNo}</dd>
            <dt className="text-ink-2">Value</dt><dd className="num">{money(total)}</dd>
            <dt className="text-ink-2">Distance</dt><dd className="num">{order.customer.distanceKm} km</dd>
            <dt className="text-ink-2">Transporter</dt><dd>{consignment?.carrier.name ?? 'not yet assigned'}</dd>
            <dt className="text-ink-2">LR number</dt><dd className="mono">{consignment?.consignment.lrNo ?? '—'}</dd>
            <dt className="text-ink-2">Threshold</dt>
            <dd>{total >= 50000
              ? <Pill tone="warn">over ₹50,000 — a bill is required</Pill>
              : <Pill tone="neutral">under ₹50,000</Pill>}</dd>
          </dl>
        </section>
      </div>
      <footer className="flex items-center gap-2 border-t border-line-soft px-4 py-3">
        <p className="text-[11.5px] leading-snug text-ink-3">
          Nothing on this screen was typed twice. That is the entire claim it makes.
        </p>
        <Button onClick={() => showDocuments(null)}>Close</Button>
      </footer>
    </Dialog>
  )
}

export function DocumentRegister() {
  const { notes, showDocuments, orders } = useDispatch()
  const shown = [...notes].sort((a, b) => b.despatchedOn.localeCompare(a.despatchedOn))
  return (
    <Card index={0} title="Document packs" live
      sub="Challan, invoice values and e-way bill fields, prepared from one despatch note"
      actions={<span className="text-[12px] text-ink-3">{notes.length} packs</span>}>
      <div className="scroll-x overflow-x-auto">
        <table className="w-full min-w-[52rem] border-collapse text-[12.5px]">
          <thead className="bg-surface-2">
            <tr className="text-[11px] uppercase tracking-wide text-ink-3">
              {['Note', 'Date', 'Customer', 'Place of supply', 'Taxable value', 'e-Way bill', ''].map((h, i) => (
                <th key={h || i} className={`whitespace-nowrap border-b border-line px-3 py-2 font-medium ${
                  i === 4 ? 'text-right' : 'text-left'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((n) => {
              const order = orders.find((o) => o.soNo === n.soNo)
              const value = n.lines.reduce((a, l) => {
                const ol = order?.lines.find((x) => x.fgId === l.fgId)
                return a + l.qty * (ol?.rate ?? 0)
              }, 0)
              const inter = order && order.customer.state !== 'Maharashtra'
              return (
                <tr key={n.dnNo} className="border-b border-line-soft">
                  <td className="mono whitespace-nowrap px-3 py-2 text-[11.5px]">{n.dnNo}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-ink-3">{shortDate(n.despatchedOn)}</td>
                  <td className="px-3 py-2">{order?.customer.name}</td>
                  <td className="px-3 py-2 text-ink-2">
                    {order?.customer.state}
                    <span className="mono block text-[10px] text-ink-2">{inter ? 'IGST' : 'CGST + SGST'}</span>
                  </td>
                  <td className="num px-3 py-2 text-right">{money(value)}</td>
                  <td className="px-3 py-2">
                    {value >= 50000
                      ? <Pill tone="warn">required</Pill>
                      : <Pill tone="neutral">not required</Pill>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    <Button size="sm" onClick={() => showDocuments(n.dnNo)}>Open pack</Button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="border-t border-line-soft px-4 py-3 text-[11.5px] leading-relaxed text-ink-3">
        <strong className="text-ink">This is a hand-off, not a ledger.</strong> The pack carries the
        figures the accounting package needs and stops there: no invoice number is allocated here, no
        tax is computed here, and no receivable is held here. §12 puts that boundary in writing, and it
        is the difference between saving three re-keys and quietly building a second set of books.
      </p>
      <DocumentPack />
    </Card>
  )
}
