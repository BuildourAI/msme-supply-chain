'use client'
import type { DerivedRow } from '@/lib/domain/derive'
import { Num } from '@/components/ui/Num'
import { StatusPill } from '@/components/ui/bits'
import { money, qtyText, shortDate, STATUS_LABEL, STATUS_TONE } from '@/lib/domain/format'
import { VendorSelect } from './VendorSelect'
import { OrderValue, RowActions } from './RowActions'
import { useDesk, type SortCol } from './store'

function Th({ children, col, right, sticky }: {
  children: React.ReactNode; col?: SortCol; right?: boolean; sticky?: boolean
}) {
  const { state, toggleSort } = useDesk()
  const active = col && state.sort.col === col
  return (
    <th scope="col"
      className={`whitespace-nowrap border-b border-line px-2.5 py-2 text-[11px] font-medium uppercase tracking-wide text-ink-3 ${
        right ? 'text-right' : 'text-left'} ${sticky ? 'sticky left-0 z-20 bg-surface-2' : ''}`}>
      {col ? (
        <button type="button" onClick={() => toggleSort(col)}
          className="inline-flex items-center gap-1 hover:text-ink">
          {children}
          <span aria-hidden className={active ? 'text-accent' : 'opacity-25'}>
            {active && state.sort.dir === 'desc' ? '↓' : '↑'}
          </span>
        </button>
      ) : children}
    </th>
  )
}

const rowCls = (sel: boolean) =>
  `anim-fade-in cursor-pointer border-b border-line-soft transition-colors ${
    sel ? 'bg-accent-soft/45' : 'hover:bg-surface-2'}`

/* --------------------------------------------------------------- summary -- */

export function SummaryTable() {
  const { visible, state, select } = useDesk()
  return (
    <div className="scroll-x overflow-x-auto">
      <table className="w-full min-w-[64rem] border-collapse">
        <thead className="bg-surface-2">
          <tr>
            <Th col="code">Material</Th>
            <Th col="position" right>Position</Th>
            <Th right>Usable</Th>
            <Th right>Reorder point</Th>
            <Th col="cover" right>Cover left</Th>
            <Th col="reorder" right>Reorder qty</Th>
            <Th>Supplier</Th>
            <Th right>Landed rate</Th>
            <Th col="value" right>Order value</Th>
            <Th col="status">Status</Th>
            <Th>Action</Th>
          </tr>
        </thead>
        <tbody>
          {visible.map((r) => {
            const sel = r.item.id === state.selectedId
            // §8.1 — position red below the reorder point, cover red once shorter
            // than the vendor's lead time.
            const posLow = r.truePosition.value < r.reorderPoint.value
            const coverShort = r.coverDays.value < r.leadTime.value
            return (
              <tr key={r.item.id} className={rowCls(sel)} onClick={() => select(r.item.id)}>
                <td className="px-2.5 py-2">
                  <span className="mono block text-[11.5px] text-ink-2">{r.item.code}</span>
                  <span className="block max-w-[15rem] truncate text-[12.5px]">{r.item.name}</span>
                </td>
                <td className="px-2.5 py-2 text-right">
                  <Num d={r.truePosition} tone={posLow ? 'critical' : undefined} />
                </td>
                <td className="px-2.5 py-2 text-right">
                  <Num d={r.usable} />
                  {r.nonUsable.value > 0 && (
                    // §8.1 — non-usable is named under the usable figure, not given a column.
                    <span className="block text-[10.5px] leading-tight text-ink-3">
                      / <Num d={r.nonUsable} size="sm" className="text-ink-3" /> non-usable
                    </span>
                  )}
                </td>
                <td className="px-2.5 py-2 text-right"><Num d={r.reorderPoint} /></td>
                <td className="px-2.5 py-2 text-right">
                  <Num d={r.coverDays} format="days" tone={coverShort ? 'critical' : undefined} suffix="d" />
                  <span className="mono block text-[10px] text-ink-3">lead {r.leadTime.value}d</span>
                </td>
                <td className="px-2.5 py-2 text-right">
                  {r.reorderQty.value > 0
                    ? <Num d={r.reorderQty} />
                    : <span className="text-ink-3">—</span>}
                </td>
                <td className="px-2.5 py-2" onClick={(e) => e.stopPropagation()}>
                  <VendorSelect row={r} />
                </td>
                <td className="num px-2.5 py-2 text-right">
                  <Num d={r.chosen.landedPerUnit} format="money" dp={2} />
                </td>
                <td className="px-2.5 py-2 text-right"><OrderValue row={r} /></td>
                <td className="px-2.5 py-2">
                  <StatusPill label={STATUS_LABEL[r.status.value]} tone={STATUS_TONE[r.status.value]}
                              explain={r.status.note} />
                  {r.held.value && (
                    <span className="mt-1 block text-[10.5px] leading-tight text-warn">
                      held · {r.coverageAfterMonths.value} mo cover
                    </span>
                  )}
                </td>
                <td className="px-2.5 py-2" onClick={(e) => e.stopPropagation()}>
                  <RowActions row={r} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/* ----------------------------------------------------------- full detail -- */

const BANDS: { label: string; span: number }[] = [
  { label: 'Material', span: 4 },
  { label: 'Stock position', span: 5 },
  { label: 'Reorder logic', span: 3 },
  { label: 'Cost', span: 4 },
  { label: 'Outcome', span: 3 },
]

export function DetailTable() {
  const { visible, state, select } = useDesk()
  return (
    <div className="scroll-x overflow-x-auto">
      <table className="w-full min-w-[95rem] border-collapse">
        <thead>
          <tr className="bg-surface-3">
            <th scope="col" className="sticky left-0 z-20 border-b border-r border-line bg-surface-3 px-2.5 py-1.5 text-left text-[10.5px] font-semibold uppercase tracking-wider text-ink-2">
              {BANDS[0].label}
            </th>
            <th scope="col" colSpan={BANDS[0].span - 1}
                className="border-b border-r border-line bg-surface-3 px-2.5 py-1.5 text-left text-[10.5px] font-semibold uppercase tracking-wider text-ink-2" />
            {BANDS.slice(1).map((b) => (
              <th key={b.label} scope="col" colSpan={b.span}
                className="border-b border-r border-line px-2.5 py-1.5 text-left text-[10.5px] font-semibold uppercase tracking-wider text-ink-2 last:border-r-0">
                {b.label}
              </th>
            ))}
          </tr>
          <tr className="bg-surface-2">
            <Th col="code" sticky>ID</Th>
            <Th>Material</Th>
            <Th>Feeds</Th>
            <Th>Supplier</Th>
            <Th right>Usable</Th>
            <Th right>Non-usable</Th>
            <Th right>In transit</Th>
            <Th right>Open PO</Th>
            <Th col="position" right>True position</Th>
            <Th right>Reorder point</Th>
            <Th right>MOQ</Th>
            <Th col="reorder" right>Reorder qty</Th>
            <Th right>PO cost</Th>
            <Th right>Shipment</Th>
            <Th right>Other</Th>
            <Th col="value" right>Landed total</Th>
            <Th>Est. arrival</Th>
            <Th col="status">Status</Th>
            <Th>Action</Th>
          </tr>
        </thead>
        <tbody>
          {visible.map((r) => {
            const sel = r.item.id === state.selectedId
            const posLow = r.truePosition.value < r.reorderPoint.value
            // §8.1 — est. arrival shows the stockout date beside it, red when later.
            const late = r.estimatedArrival.value > r.stockoutDate.value
            return (
              <tr key={r.item.id} className={rowCls(sel)} onClick={() => select(r.item.id)}>
                <td className={`mono sticky left-0 z-10 border-r border-line-soft px-2.5 py-2 text-[11.5px] ${sel ? 'bg-[color-mix(in_srgb,var(--accent-soft)_45%,var(--surface))]' : 'bg-surface'}`}>
                  {r.item.code}
                </td>
                <td className="max-w-[16rem] truncate px-2.5 py-2 text-[12.5px]" title={r.item.name}>{r.item.name}</td>
                <td className="px-2.5 py-2">
                  {r.item.feeds.map((f) => (
                    <span key={f} className="mr-1 inline-block rounded border border-line bg-surface-2 px-1.5 py-px text-[10.5px] text-ink-2">{f}</span>
                  ))}
                </td>
                <td className="border-r border-line-soft px-2.5 py-2" onClick={(e) => e.stopPropagation()}>
                  <VendorSelect row={r} detail />
                </td>
                <td className="px-2.5 py-2 text-right"><Num d={r.usable} /></td>
                <td className="px-2.5 py-2 text-right">
                  {r.nonUsable.value > 0
                    ? <><Num d={r.nonUsable} tone="warn" />
                        <span className="block max-w-[9rem] truncate text-[10px] leading-tight text-ink-3"
                              title={r.nonUsableReasons.join(' · ')}>{r.nonUsableReasons[0]}</span></>
                    : <span className="text-ink-3">—</span>}
                </td>
                <td className="px-2.5 py-2 text-right">
                  {r.inTransit.value > 0 ? <Num d={r.inTransit} /> : <span className="text-ink-3">—</span>}
                </td>
                <td className="px-2.5 py-2 text-right">
                  {r.openPoQty.value > 0 ? <Num d={r.openPoQty} /> : <span className="text-ink-3">—</span>}
                </td>
                <td className="border-r border-line-soft px-2.5 py-2 text-right">
                  <Num d={r.truePosition} tone={posLow ? 'critical' : undefined} />
                </td>
                <td className="px-2.5 py-2 text-right"><Num d={r.reorderPoint} /></td>
                <td className="num px-2.5 py-2 text-right text-[12.5px] text-ink-2">{qtyText(r.item.moq, '')}</td>
                <td className="border-r border-line-soft px-2.5 py-2 text-right">
                  {r.reorderQty.value > 0 ? <Num d={r.reorderQty} /> : <span className="text-ink-3">—</span>}
                </td>
                <td className="px-2.5 py-2 text-right">
                  {r.reorderQty.value > 0 ? <Num d={r.poCost} format="money" /> : <span className="text-ink-3">—</span>}
                </td>
                <td className="px-2.5 py-2 text-right">
                  {r.reorderQty.value > 0 ? <Num d={r.shipmentCost} format="money" /> : <span className="text-ink-3">—</span>}
                </td>
                <td className="px-2.5 py-2 text-right">
                  {r.reorderQty.value > 0 ? <Num d={r.otherCosts} format="money" /> : <span className="text-ink-3">—</span>}
                </td>
                <td className="border-r border-line-soft px-2.5 py-2 text-right">
                  {r.reorderQty.value > 0
                    ? <Num d={r.landedTotal} format="money" className="font-semibold" />
                    : <span className="text-ink-3">—</span>}
                </td>
                <td className="px-2.5 py-2">
                  <span className={`mono text-[11.5px] ${late ? 'text-critical' : ''}`}>
                    {shortDate(r.estimatedArrival.value)}
                  </span>
                  <span className="mono block text-[10px] text-ink-3">
                    stock out {shortDate(r.stockoutDate.value)}
                  </span>
                </td>
                <td className="px-2.5 py-2">
                  <StatusPill label={STATUS_LABEL[r.status.value]} tone={STATUS_TONE[r.status.value]}
                              explain={r.status.note} />
                  {r.held.value && (
                    <span className="mt-1 block text-[10.5px] leading-tight text-warn">
                      held · {r.coverageAfterMonths.value} mo cover
                    </span>
                  )}
                </td>
                <td className="px-2.5 py-2" onClick={(e) => e.stopPropagation()}>
                  <RowActions row={r} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
