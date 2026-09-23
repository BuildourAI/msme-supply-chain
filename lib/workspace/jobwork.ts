/**
 * Material sent out to be worked on, and what came of it.
 *
 * A jobworker is a supplier of type Jobworker — the owner's own vocabulary,
 * already offered on day one — rather than a list of their own, because the
 * galvaniser you send tubes to is also somebody you pay, phone and deal with.
 * What they are NOT is somebody with a rate against a material: their charge
 * is for a process, and letting it into the landed-cost ranking would let a
 * galvaniser win a comparison for the steel.
 */
import type { Vendor } from '@/lib/domain/types'
import type { Workspace } from './types'

/** The owner's word for it, which `STARTER_CATEGORIES` has offered from the start. */
export const JOBWORKER = 'Jobworker'

export const isJobworker = (ws: Workspace, vendorId: string): boolean =>
  ws.vendorType[vendorId] === JOBWORKER

export const jobworkers = (ws: Workspace): Vendor[] =>
  ws.vendors.filter((v) => isJobworker(ws, v.id))

/** Challans still out, for the Jobwork row's badge. */
export const challansOut = (ws: Workspace) =>
  (ws.challans ?? []).filter((c) => c.status === 'out')
