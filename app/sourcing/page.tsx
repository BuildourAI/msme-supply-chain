import { StagePage } from '@/components/stage/StagePage'
import { stageById } from '@/lib/seed/stages'
export default function Page() { return <StagePage stage={stageById('sourcing')} /> }
