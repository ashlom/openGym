import { describe, expect, it } from 'vitest'
import { shouldAcceptRemoteState } from './state-sync.js'

const populated = (ts, rev) => ({ _ts: ts, ...(rev == null ? {} : { _rev: rev }), routines: [{ id: 'r1' }], workouts: [], bodyweight: [] })
const empty = (ts, rev) => ({ _ts: ts, ...(rev == null ? {} : { _rev: rev }), routines: [], workouts: [], bodyweight: [] })

describe('shouldAcceptRemoteState', () => {
  it('never silently discards dirty local state', () => {
    expect(shouldAcceptRemoteState(populated(100, 1), populated(200, 2), true)).toBe(false)
    expect(shouldAcceptRemoteState(populated(100), populated(200), true)).toBe(false)
    expect(shouldAcceptRemoteState({ ...empty(300), theme: 'light' }, populated(100), true)).toBe(false)
  })

  it('accepts a newer server revision for clean local state despite clock skew', () => {
    expect(shouldAcceptRemoteState(populated(999999, 1), populated(200, 2), false)).toBe(true)
  })

  it('keeps state with a newer local revision', () => {
    expect(shouldAcceptRemoteState(populated(200, 2), populated(300, 1), false)).toBe(false)
  })

  it('uses timestamps for clean legacy states without revisions', () => {
    expect(shouldAcceptRemoteState(populated(100), populated(200), false)).toBe(true)
    expect(shouldAcceptRemoteState(populated(200), populated(100), false)).toBe(false)
    expect(shouldAcceptRemoteState(populated(100), populated(100), false)).toBe(true)
  })

  it('accepts server data when clean local profile data is empty', () => {
    expect(shouldAcceptRemoteState(empty(300), populated(100), false)).toBe(true)
  })

  it('never accepts a missing server state', () => {
    expect(shouldAcceptRemoteState(populated(100), null, false)).toBe(false)
  })
})
