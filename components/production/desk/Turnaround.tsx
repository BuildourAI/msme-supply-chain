'use client'
import { ListPage } from '@/components/ui/ListPage'
import { DataTable, StatePill } from '@/components/ui/DataTable'
import { useWorkspace } from '@/components/workspace/store'
import { shortDate } from '@/lib/domain/format'
import { jobWordCap } from '@/lib/workspace/jobs'
import { meanTurnaround, turnaroundRows, type Turnaround as Row } from '@/lib/workspace/turnaround'

const days = (n: number | null) => (n === null ? <span className="text-ink-4">—</span> : <>{n} <span className="text-ink-3">d</span></>)

/**
 * From raw material to finished product, per job: how long the material sat
 * on the shelf before the job took any, and how long the job then took on
 * the floor. The means at the top are over jobs closed in the last 90 days,
 * whose figures will not move again.
 */
export function Turnaround() {
  const { workspace, today } = useWorkspace()
  if (!workspace) return null
  const ws = workspace
  const word = jobWordCap(ws)
  const rows = turnaroundRows(ws)
  const sum = meanTurnaround(ws, today)

  return (
    <ListPage
      title="Turnaround" noun={word.one.toLowerCase()} rows={rows}
      search={(r) => `${r.job.no} ${r.job.name ?? ''} ${r.product?.name ?? ''}`}
      filter={{
        label: 'Open and closed',
        options: [{ value: 'open', label: 'Open' }, { value: 'closed', label: 'Closed' }],
        of: (r) => (r.job.closedOn ? 'closed' : 'open'),
      }}
      empty={{
        line: `Nothing to measure yet. Turnaround starts the day material is issued to a ${word.one.toLowerCase()} and ends with its last output booked — both are records the store and the floor already keep.`,
      }}>
      {(shown) => (
        <div className="space-y-3">
          <ul className="grid gap-2 sm:grid-cols-3" aria-label="Means over jobs closed in the last 90 days">
            {[
              { label: 'On the shelf', v: sum.wait, sub: 'from on the book to first issue' },
              { label: 'On the floor', v: sum.floor, sub: 'from first issue to last output' },
              { label: 'Raw material to finished', v: sum.total, sub: 'the two added' },
            ].map((x) => (
              <li key={x.label} className="rounded-xl border border-line bg-surface px-4 py-3">
                <span className="block text-[12px] text-ink-3">{x.label}</span>
                <span className="num block text-[22px] font-bold text-ink">{x.v === null ? '—' : `${x.v} days`}</span>
                <span className="block text-[11.5px] text-ink-3">{x.sub}</span>
              </li>
            ))}
          </ul>
          <p className="text-[12px] text-ink-3">
            {sum.jobs > 0
              ? `Means over ${sum.jobs} ${sum.jobs === 1 ? word.one.toLowerCase() : word.many.toLowerCase()} closed in the last 90 days${sum.jobs > 1 && sum.slowest ? `; the slowest was ${sum.slowest.job.no}` : ''}.`
              : `The means wait for a ${word.one.toLowerCase()} to close — until then its figures can still move.`}
          </p>
          <DataTable rows={shown} keyOf={(r: Row) => r.job.id}
            columns={[
              {
                key: 'no', head: word.one,
                cell: (r) => (
                  <span className="min-w-0">
                    <span className="mono block font-semibold text-ink">{r.job.no}</span>
                    <span className="block text-[11.5px] text-ink-3">{r.product?.name ?? r.job.name ?? ''}</span>
                  </span>
                ),
              },
              { key: 'in', head: 'On the book', cell: (r) => (r.receivedOn ? shortDate(r.receivedOn) : '—') },
              { key: 'issue', head: 'First issue', cell: (r) => (r.firstIssue ? shortDate(r.firstIssue) : '—') },
              { key: 'out', head: 'Last output', cell: (r) => (r.lastOutput ? shortDate(r.lastOutput) : '—') },
              { key: 'wait', head: 'Shelf', align: 'right', cell: (r) => days(r.wait) },
              { key: 'floor', head: 'Floor', align: 'right', cell: (r) => days(r.floor) },
              { key: 'total', head: 'Raw to finished', align: 'right', cell: (r) => <strong className="text-ink">{days(r.total)}</strong> },
              {
                key: 'state', head: 'State',
                cell: (r) => (r.job.closedOn ? <StatePill label={`Closed ${shortDate(r.job.closedOn)}`} tone="neutral" /> : <StatePill label="Open" tone="info" />),
              },
            ]} />
        </div>
      )}
    </ListPage>
  )
}
