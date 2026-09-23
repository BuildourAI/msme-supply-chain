import { Painkillers } from '@/components/stage/Painkillers'
import { stageById } from '@/lib/seed/stages'
import { StageGate } from '@/components/onboard/StageGate'
function PageBody() { return <Painkillers stage={stageById('inbound')} /> }

export default function Page() {
  return <StageGate sample="the Inbound dashboard" shows="the four inbound pains and what removes each"><PageBody /></StageGate>
}
