import { StagePage } from '@/components/stage/StagePage'
import { stageById } from '@/lib/seed/stages'
import { StageGate } from '@/components/onboard/StageGate'
function PageBody() { return <StagePage stage={stageById('production')} /> }

export default function Page() {
  return <StageGate sample="the Production dashboard" shows="what the whole production stage does, system by system"><PageBody /></StageGate>
}
