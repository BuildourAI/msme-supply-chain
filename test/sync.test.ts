/**
 * Which copy of a workspace wins when somebody signs in.
 *
 * This is the one rule in the whole build that can silently destroy work
 * somebody did, so it lives in a pure function and is pinned here. The cases
 * below are not hypothetical: every one of them is a normal week — setting the
 * company up before making an account, signing in on a second machine, working
 * on a train with the laptop and then opening the phone.
 */
import { describe, expect, it } from 'vitest'
import { chosen, resolve, type RemoteRow } from '@/lib/workspace/remote'
import { emptyWorkspace } from '@/lib/workspace/defaults'
import type { Stored } from '@/lib/workspace/storage'
import type { Workspace } from '@/lib/workspace/types'

const ws = (company: string): Workspace => emptyWorkspace({
  id: `WS-${company}`, createdAt: '2026-09-19', ownerName: 'R. Mehta',
  contact: '', companyName: company, makes: '',
})

const local = (company: string, savedAt?: string): Stored => ({
  workspace: ws(company),
  session: { actor: 'R. Mehta', role: 'owner' },
  mode: 'mine',
  savedAt,
})

const remote = (company: string, updatedAt: string): RemoteRow => ({
  workspace: ws(company),
  updatedAt,
})

describe('a brand new account', () => {
  it('has nothing to settle', () => {
    expect(resolve(null, null)).toEqual({ take: 'neither' })
    expect(chosen(resolve(null, null), null, null)).toBeNull()
  })
})

describe('the first sign-in from a device that already has work on it', () => {
  it('sends the local workspace up rather than wiping it', () => {
    /*
     * The migration case, and the one that would hurt most to get wrong.
     * Somebody has been using the app for a week on localStorage, then makes an
     * account. Their week must survive and become the database copy.
     */
    const l = local('Patel Heaters', '2026-09-19T10:00:00Z')
    const r = resolve(l, null)
    expect(r).toEqual({ take: 'local', push: true, note: null })
    expect(chosen(r, l, null)?.company.name).toBe('Patel Heaters')
  })
})

describe('signing in on a second device', () => {
  it('adopts the account copy when the device has nothing', () => {
    const rem = remote('Patel Heaters', '2026-09-19T10:00:00Z')
    const r = resolve(null, rem)
    expect(r).toEqual({ take: 'remote', push: false, note: null })
    expect(chosen(r, null, rem)?.company.name).toBe('Patel Heaters')
  })
})

describe('both copies exist and have drifted', () => {
  it('takes the newer one and says which was set aside', () => {
    const l = local('Old name', '2026-09-19T09:00:00Z')
    const rem = remote('New name', '2026-09-19T12:00:00Z')

    const r = resolve(l, rem)
    expect(r.take).toBe('remote')
    expect(chosen(r, l, rem)?.company.name).toBe('New name')
    // the person is told, rather than watching a name change by itself
    expect(r.take !== 'neither' && r.note).toMatch(/newer changes/i)
  })

  it('keeps the device copy when it is the newer one, and pushes it', () => {
    const l = local('Newer here', '2026-09-19T14:00:00Z')
    const rem = remote('Older there', '2026-09-19T11:00:00Z')

    const r = resolve(l, rem)
    expect(r.take).toBe('local')
    expect(r.take !== 'neither' && r.push).toBe(true)
    expect(chosen(r, l, rem)?.company.name).toBe('Newer here')
    expect(r.take !== 'neither' && r.note).toMatch(/sent up/i)
  })

  it('never returns a note without also having set a copy aside', () => {
    // a note is an apology for discarding something; one with nothing
    // discarded would be noise
    expect(resolve(local('a', '2026-09-19T10:00:00Z'), null)).toMatchObject({ note: null })
    expect(resolve(null, remote('a', '2026-09-19T10:00:00Z'))).toMatchObject({ note: null })
  })
})

describe('a device copy saved before syncing existed', () => {
  it('yields to the account copy, and explains why', () => {
    /*
     * Anything written by an older build carries no `savedAt`, so the two
     * cannot be compared. Guessing in the local copy's favour would overwrite
     * a database copy that is almost certainly newer; guessing the other way
     * and saying so is the safer half of an unavoidable choice.
     */
    const l = local('From before', undefined)
    const rem = remote('From the account', '2026-09-19T12:00:00Z')

    const r = resolve(l, rem)
    expect(r.take).toBe('remote')
    expect(chosen(r, l, rem)?.company.name).toBe('From the account')
    expect(r.take !== 'neither' && r.note).toMatch(/before syncing existed/i)
  })

  it('is still sent up when there is nothing in the account to lose', () => {
    const l = local('From before', undefined)
    expect(resolve(l, null)).toEqual({ take: 'local', push: true, note: null })
  })
})

describe('the losing copy is never destroyed', () => {
  it('only ever reports which to take, never deletes', () => {
    /*
     * `resolve` returns a decision; it has no access to storage and cannot
     * clear anything. The device copy stays where it is until an ordinary save
     * overwrites it, so a wrong call here is recoverable rather than final.
     */
    const l = local('Local', '2026-09-19T09:00:00Z')
    const rem = remote('Remote', '2026-09-19T12:00:00Z')
    const before = JSON.stringify(l)
    resolve(l, rem)
    expect(JSON.stringify(l)).toBe(before)
  })
})
