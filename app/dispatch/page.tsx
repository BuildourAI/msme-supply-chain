import { StagePage } from '@/components/stage/StagePage'
import { stageById } from '@/lib/seed/stages'
import { Card } from '@/components/ui/bits'
import { GUARDRAILS } from '@/lib/seed/stages'

export default function Page() {
  return (
    <StagePage stage={stageById('dispatch')}>
      <Card title="What Stage 5 would need first"
        sub="Nothing here is mocked — inventing dispatch data would break the rule the rest of this build runs on">
        <div className="grid gap-4 p-4 md:grid-cols-2">
          <div>
            <p className="mono text-[10px] uppercase tracking-wider text-ink-3">Tables that do not exist yet</p>
            <ul className="mt-1.5 space-y-1 text-[12.5px] text-ink-2">
              <li>· <span className="mono">dispatch_note</span> — what left, on whose authority</li>
              <li>· <span className="mono">shipment</span> + <span className="mono">shipment_milestone</span> — despatched ≠ delivered</li>
              <li>· <span className="mono">return_authorisation</span> — a return needs somewhere to land</li>
              <li>· <span className="mono">e_way_bill</span> — exchanged with the accounting system, never replacing it</li>
            </ul>

            {/* four table names is a gap, not a plan. This is the plan. */}
            <p className="mono mt-4 text-[10px] uppercase tracking-wider text-ink-3">The smallest honest first step</p>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-2">
              <span className="mono text-ink">dispatch_note</span> alone, and nothing else. It is the
              mirror of the goods receipt that already works on the inbound side — what left, on whose
              authority, against which order — and it closes the one place where this build’s ledger
              stops being accurate: the moment material walks out of the gate.
            </p>
            <p className="mt-2 text-[12.5px] leading-relaxed text-ink-2">
              Everything else on this stage waits on it. Milestones need a consignment to hang off,
              a return needs a despatch to come back against, and an e-way bill is a document about a
              movement that is not recorded yet. Building them in the other order is how a dispatch
              module ends up as three screens nobody fills in.
            </p>
            <p className="mt-2 text-[11.5px] leading-relaxed text-ink-3">
              Until that exists, customer OTIF, cycle time and the carrier comparison on the executive
              dashboard stay marked illustrative — which is the honest label, not a placeholder.
            </p>
          </div>
          <div>
            <p className="mono text-[10px] uppercase tracking-wider text-ink-3">The guardrails, which bite hardest here</p>
            <ul className="mt-1.5 space-y-1 text-[12.5px] leading-relaxed text-ink-2">
              {GUARDRAILS.map((g) => <li key={g}>· {g}</li>)}
            </ul>
          </div>
        </div>
        <p className="border-t border-line-soft px-4 py-3 text-[12px] leading-relaxed text-ink-3">
          The scope of this build is Stage 1 in full, plus the shop-floor read of Stages 3–4 that
          Stage 1 depends on. Naming that boundary is more useful than a screen with invented numbers on it.
        </p>
      </Card>
    </StagePage>
  )
}
