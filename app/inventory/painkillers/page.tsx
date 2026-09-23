import { Painkillers } from '@/components/stage/Painkillers'
import { stageById } from '@/lib/seed/stages'
import { StageGate } from '@/components/onboard/StageGate'
function PageBody() { return <Painkillers stage={stageById('inventory')} /> }

export default function Page() {
  return <StageGate sample="the Inventory dashboard" shows="the three inventory pains and what removes each"><PageBody /></StageGate>
}
