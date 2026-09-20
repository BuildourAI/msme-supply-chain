'use client'
import { useMemo, useState } from 'react'
import { ListPage } from '@/components/ui/ListPage'
import { DataTable, StatePill, type Column } from '@/components/ui/DataTable'
import { useWorkspace } from '@/components/workspace/store'
import { breakdownOf, unsetComponents, type Breakdown } from '@/lib/workspace/landed'
import { money, num } from '@/lib/domain/format'
import type { Item, Vendor, VendorItem } from '@/lib/domain/types'

/**
 * What a supplier actually costs, as against what they quoted.
 *
 * The sample company's SRC-03 makes the argument on a worked example; this
 * makes it on the owner's own suppliers, through the same five-component sum
 * their engine already applies to every rate in this workspace. Not one figure
 * here comes from anywhere but what the owner entered.
 *
 * The shape is the portal's usual one, with the single dropdown doing the real
 * work: it picks the material, and the table ranks that material's suppliers by
 * what they land at rather than what they said.
 *
 * The honesty problem this screen has, and the reason for most of the code
 * below: on the first afternoon nothing has been entered beyond rates, every
 * supplier therefore lands at exactly what they quoted, and a table showing
 * that looks like a comparison that came out even. It is not — it is a
 * comparison with nothing to work on. So when a component is unset the screen
 * says which, and says it before the table rather than under it.
 */
interface Row {
  vendor: Vendor
  vi: VendorItem
  b: Breakdown
  cheapestLanded: boolean
  cheapestQuoted: boolean
}

export function LandedCost() {
  const { workspace } = useWorkspace()
  const [pick, setPick] = useState('')

  const priced = useMemo(
    () => (workspace?.items ?? []).filter(
      (it) => (workspace?.vendorItems ?? []).some((vi) => vi.itemId === it.id),
    ),
    [workspace],
  )

  if (!workspace) return null
  const ws = workspace

  /* the first material with something to compare, so the screen opens on the
     question rather than on a single supplier nobody needs ranking */
  const twoOf = (it: Item) => ws.vendorItems.filter((vi) => vi.itemId === it.id).length > 1
  const item = priced.find((it) => it.id === pick)
    ?? priced.find(twoOf)
    ?? priced[0]

  const rows: Row[] = item
    ? ws.vendorItems
      .filter((vi) => vi.itemId === item.id)
      .map((vi) => ({
        vendor: ws.vendors.find((v) => v.id === vi.vendorId)!,
        vi,
        b: breakdownOf(vi),
        cheapestLanded: false,
        cheapestQuoted: false,
      }))
      .filter((r) => r.vendor)
      .sort((a, b) => a.b.landed - b.b.landed)
    : []

  if (rows.length > 0) {
    rows[0].cheapestLanded = true
    rows.reduce((a, b) => (b.vi.rate < a.vi.rate ? b : a)).cheapestQuoted = true
  }

  const flips = rows.length > 1 && !rows[0].cheapestQuoted
  const cheap = rows.find((r) => r.cheapestQuoted)
  const gap = flips && cheap ? cheap.b.landed - rows[0].b.landed : 0
  const missing = item ? unsetComponents(ws, item.id) : []
  const flat = rows.length > 1 && rows.every((r) => r.b.landed === r.vi.rate)

  const termsOf = (r: Row) => ws.vendors.find((v) => v.id === r.vi.vendorId)?.paymentTermsDays ?? 0

  const columns: Column<Row>[] = [
    {
      key: 'vendor', head: 'Supplier',
      cell: (r) => (
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="font-semibold text-ink">{r.vendor.name}</span>
          {r.vi.isPreferred && <StatePill label="Usual" tone="info" />}
        </span>
      ),
    },
    { key: 'rate', head: 'Quoted', align: 'right', cell: (r) => money(r.b.rate, 2) },
    { key: 'freight', head: 'Freight', align: 'right', cell: (r) => <Add n={r.b.freight} /> },
    { key: 'gst', head: 'GST', align: 'right', cell: (r) => <Add n={r.b.gst} /> },
    {
      key: 'terms', head: 'Credit', align: 'right',
      cell: (r) => (
        <span title={`${termsOf(r)} days to pay`}>
          <Add n={r.b.terms} />
        </span>
      ),
    },
    { key: 'rej', head: 'Rejects', align: 'right', cell: (r) => <Add n={r.b.rejection} /> },
    {
      key: 'landed', head: 'Lands at', align: 'right',
      cell: (r) => (
        <span className={r.cheapestLanded ? 'font-semibold text-ink' : 'text-ink-2'}>
          {money(r.b.landed, 2)}
        </span>
      ),
    },
    {
      key: 'verdict', head: 'Verdict',
      cell: (r) => (
        <span className="flex flex-wrap items-center gap-1.5">
          {r.cheapestLanded && <StatePill label="Cheapest landed" tone="good" />}
          {r.cheapestQuoted && !r.cheapestLanded && <StatePill label="Cheapest quoted" tone="warn" />}
          {r.cheapestQuoted && r.cheapestLanded && rows.length > 1
            && <StatePill label="Cheapest quoted" tone="good" />}
        </span>
      ),
    },
  ]

  return (
    <ListPage
      title="Landed cost" noun="supplier" rows={rows}
      search={(r) => r.vendor.name}
      filter={priced.length > 1
        ? {
          label: item?.name ?? 'Pick a material',
          options: priced.map((it) => ({ value: it.id, label: it.name })),
          of: () => item?.id ?? '',
        }
        : undefined}
      empty={{
        line: 'Nothing to compare yet. A landed cost needs a supplier with a rate against one of '
          + 'your materials — and a comparison needs two of them on the same material.',
      }}>
      {(shown) => (
        <>
          {item && <Verdict
            item={item} rows={rows} flips={flips} gap={gap} flat={flat} missing={missing}
            cheapName={cheap?.vendor.name ?? ''} bestName={rows[0]?.vendor.name ?? ''} />}
          <DataTable columns={columns} rows={shown} keyOf={(r) => r.vi.vendorId} />
        </>
      )}
    </ListPage>
  )
}

/* -------------------------------------------------------------- the verdict -- */

function Verdict({ item, rows, flips, gap, flat, missing, cheapName, bestName }: {
  item: Item
  rows: Row[]
  flips: boolean
  gap: number
  flat: boolean
  missing: string[]
  cheapName: string
  bestName: string
}) {
  if (rows.length === 0) return null

  if (rows.length === 1) {
    return (
      <Line tone="plain">
        One supplier on {item.name}, so there is nothing to rank. What they land at is
        still worth knowing — it is {money(rows[0].b.landed, 2)} a {item.uom} against the{' '}
        {money(rows[0].b.rate, 2)} they quoted.
      </Line>
    )
  }

  /*
   * The state every owner is in before they have entered anything. Two
   * suppliers landing at exactly what they quoted is not a tie — it is a sum
   * with four of its five terms missing, and saying "the cheapest quote wins"
   * here would be the one falsehood this screen exists to avoid.
   */
  if (flat) {
    return (
      <Line tone="warn">
        <strong className="text-ink">Both land at exactly what they quoted</strong>, because
        nothing has been added beyond the rate. Until then this is a list of quotes rather than a
        comparison. Missing: {missing.join(', ')} — the first three go on the supplier, under
        “Landed-cost detail”; the last is in Your rules.
      </Line>
    )
  }

  if (flips) {
    const order = Math.max(item.moq, 0)
    return (
      <Line tone="accent">
        <strong className="text-ink">The cheapest quote is not the cheapest material here.</strong>{' '}
        {cheapName} quotes less and lands {money(gap, 2)} a {item.uom} dearer than {bestName}
        {order > 0 ? <> — {money(gap * order)} on an order of {num(order, 0)} {item.uom}</> : null}.
        {missing.length > 0 && (
          <span className="text-ink-3"> Still unset: {missing.join(', ')}.</span>
        )}
      </Line>
    )
  }

  return (
    <Line tone="plain">
      <strong className="text-ink">The lowest quote is also the lowest landed cost here.</strong>{' '}
      {bestName} wins on both.
      {missing.length > 0 && (
        <span className="text-ink-3"> Not every cost is in yet — unset: {missing.join(', ')}.</span>
      )}
    </Line>
  )
}

const TONE = {
  plain: 'border-line bg-surface-2',
  warn: 'border-warn/40 bg-warn-soft',
  accent: 'border-accent/40 bg-accent-tint/40',
}

const Line = ({ tone, children }: { tone: keyof typeof TONE; children: React.ReactNode }) => (
  <p className={`border-b px-3 py-2.5 text-[12.5px] leading-relaxed text-ink-2 ${TONE[tone]}`}>
    {children}
  </p>
)

/** A component with nothing in it says so, rather than printing a confident ₹0. */
const Add = ({ n }: { n: number }) => (n > 0
  ? <span className="text-ink-2">+{money(n, 2)}</span>
  : <span className="text-ink-4">—</span>)
