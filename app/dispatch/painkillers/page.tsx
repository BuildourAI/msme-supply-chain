import { Painkillers } from '@/components/stage/Painkillers'
import { stageById } from '@/lib/seed/stages'
import { StageGate } from '@/components/onboard/StageGate'
function PageBody() { return <Painkillers stage={stageById('dispatch')} /> }

export default function Page() {
  return <StageGate sample="the Dispatch dashboard" shows="the dispatch pains and what removes each"><PageBody /></StageGate>
}
