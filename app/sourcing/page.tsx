import { StageGate } from '@/components/onboard/StageGate'
import { StagePage } from '@/components/stage/StagePage'
import { stageById } from '@/lib/seed/stages'

/**
 * The stage brief. It walks the sample company's sourcing end to end — the
 * modules, the figures each one turns, the spec clause behind them — so it is
 * an explanation of the worked example rather than a screen an owner operates.
 * Their own sourcing is the desk: suppliers, materials, requests, quotes, orders.
 */
export default function Page() {
  return (
    <StageGate sample="the Sourcing dashboard"
      shows="what the whole sourcing stage does, module by module">
      <StagePage stage={stageById('sourcing')} />
    </StageGate>
  )
}
