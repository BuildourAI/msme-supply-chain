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
