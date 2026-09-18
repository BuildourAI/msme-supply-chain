import { Painkillers } from '@/components/stage/Painkillers'
import { stageById } from '@/lib/seed/stages'
import { StageGate } from '@/components/onboard/StageGate'
function PageBody() { return <Painkillers stage={stageById('production')} /> }

export default function Page() {
  return <StageGate later="Production material flow"><PageBody /></StageGate>
}
