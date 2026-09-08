import { Painkillers } from '@/components/stage/Painkillers'
import { stageById } from '@/lib/seed/stages'
export default function Page() { return <Painkillers stage={stageById('inbound')} /> }
