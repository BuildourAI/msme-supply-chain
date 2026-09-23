/**
 * Everything on its way in, against the day each material runs out.
 *
 * The sample company calls this the inbound board, and it answers the one
 * question an open order raises that its status cannot: not "is it coming"
 * but "is it coming in time". Three dates per line, and a verdict from them:
 *
 *   arrives     the date the supplier CONFIRMED — the version they are making,
 *               never a change they have not seen. An order already past that
 *               date has not arrived, so it arrives today at the earliest.
 *   issuable    arrives + the days inbound inspection takes. Material at the
 *               gate is not stock (§11), so this is the day it can be used.
 *   line stops  the day the shelf runs dry at the rate it is used — the usable
 *               stock, plus whatever else of the same material is confirmed to
 *               land before this line does. Without that, the second of two
 *               orders reads late against a stockout the first one prevents.
 *
 * The verdict, in three words:
 *
 *   in time     issuable on or before the line stops
 *   tight       it lands before the line stops, but cannot be issued in time
 *   N days late it lands after the line has stopped
 *
 * and a material nobody consumes has no line to stop, which is said rather
 * than dressed up as "in time".
 *
 * Every date and the verdict are the domain's own arithmetic — `issuableFrom`,
 * `buyerCoverDays`, `stockoutDate` — so this board cannot disagree with the
 * desk about when a material runs out.
 */
import { buyerCoverDays, daysBetween, stockoutDate } from '@/lib/domain/calc'
import { issuableFrom } from '@/lib/domain/inbound'
import type { Derived, Item, Vendor } from '@/lib/domain/types'
import { usableOnHand } from './ledger'
import { ackedDate, ackedQty, syncOf } from './orders'
import { receivedAgainst } from './receipts'
import type { PurchaseOrder, Workspace } from './types'

export type Verdict = 'in_time' | 'tight' | 'late' | 'no_line'

export interface BoardLine {
  order: PurchaseOrder
  item?: Item
  vendor?: Vendor
  uom: string
  /** what is still to come, at the confirmed quantity */
  qty: number
  /** what we now want still to come, when a change is not yet confirmed */
  wantQty: number
  inSync: boolean
  shipped: boolean
  /** the date the supplier confirmed */
  promised: string
  /** promised has passed and it has not come */
  overdue: boolean
  arrives: string
  issuable: string
  /** null when nothing is consumed — there is no line to stop */
  stops: string | null
  verdict: Derived<Verdict>
  /** days after the line stops that it lands; 0 unless late */
  lateBy: number
}

const usableOf = usableOnHand

/** Every line handed over and not yet all here, soonest to land first. */
export function boardLines(ws: Workspace, today: string): BoardLine[] {
  const open = ws.orders
    .filter((o) => o.state === 'confirmed' || o.state === 'shipped')
    .map((o) => {
      const left = Math.max(0, ackedQty(o) - receivedAgainst(ws, o.id))
      const promised = ackedDate(o)
      return { o, left, promised, arrives: promised < today ? today : promised }
    })
    .filter((x) => x.left > 0)
    .sort((a, b) => a.arrives.localeCompare(b.arrives) || a.o.id.localeCompare(b.o.id))

  // what of each material is confirmed to land before the line being judged
  const before = new Map<string, number>()

  return open.map(({ o, left, promised, arrives }) => {
    const item = ws.items.find((i) => i.id === o.itemId)
    const uom = item?.uom ?? ''
    const daily = item?.avgDailyConsumption ?? 0
    const usable = usableOf(ws, o.itemId)
    const earlier = before.get(o.itemId) ?? 0
    before.set(o.itemId, earlier + left)

    const issuable = issuableFrom(arrives, ws.policy).value
    const qc = ws.policy.inboundQcDays
    const stops = daily > 0
      ? stockoutDate(today, buyerCoverDays(usable + earlier, daily, uom).value).value
      : null

    const value: Verdict = stops === null ? 'no_line'
      : issuable <= stops ? 'in_time'
        : arrives <= stops ? 'tight'
          : 'late'
    const lateBy = value === 'late' && stops ? daysBetween(stops, arrives) : 0

    const verdict: Derived<Verdict> = {
      value,
      label: 'Lands in time?',
      formula: 'issuable ≤ line stops → in time; arrives ≤ line stops < issuable → tight; '
        + 'arrives > line stops → late',
      inputs: [
        {
          name: 'arrives', value: arrives,
          source: promised < today
            ? `promised ${promised} and not here — today at the earliest`
            : `the date ${o.no} was confirmed for`,
        },
        { name: 'issuable', value: issuable, source: `arrives + ${qc} days of inbound QC` },
        stops === null
          ? { name: 'line stops', value: '—', source: 'nothing consumed, so nothing to run out' }
          : {
            name: 'line stops', value: stops,
            source: `${usable} usable${earlier > 0 ? ` + ${earlier} landing before it` : ''}`
              + ` at ${daily} ${uom}/day`,
          },
      ],
      note: 'At the quantity and date the supplier confirmed — a change they have not seen moves nothing here.',
    }

    const sync = syncOf(ws, o)
    const want = Math.max(0, o.qty - receivedAgainst(ws, o.id))
    return {
      order: o,
      item,
      vendor: ws.vendors.find((v) => v.id === o.vendorId),
      uom,
      qty: left,
      wantQty: want,
      inSync: sync === null || sync === 'acknowledged',
      shipped: o.state === 'shipped',
      promised,
      overdue: promised < today,
      arrives,
      issuable,
      stops,
      verdict,
      lateBy,
    }
  })
}

/** The words on the board. */
export function verdictText(l: BoardLine): string {
  switch (l.verdict.value) {
    case 'in_time': return 'in time'
    case 'tight': return 'tight'
    case 'late': return `${l.lateBy} day${l.lateBy === 1 ? '' : 's'} late`
    case 'no_line': return 'no line to stop'
  }
}
