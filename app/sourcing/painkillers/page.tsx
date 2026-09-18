import { StageGate } from '@/components/onboard/StageGate'
import { Painkillers } from '@/components/stage/Painkillers'
import { stageById } from '@/lib/seed/stages'

export default function Page() {
  return (
    <StageGate sample="the Sourcing dashboard"
      shows="the problems sourcing is meant to solve, and what each one is worth">
      <Painkillers stage={stageById('sourcing')} />
    </StageGate>
  )
}
