import { describe, expect, it } from 'vitest'
import { restAfterSet } from './workout-rest.js'

// Recover between sets and when moving to the next exercise, but not in the
// middle of a superset or after the very last set of the whole workout.
describe('restAfterSet', () => {
  it('starts rest between ordinary sets', () => {
    expect(restAfterSet({ lastInUnit: true, unitDone: false, lastUnit: false })).toBe('start')
  })
  it('starts rest after the last set of an exercise when another exercise remains', () => {
    expect(restAfterSet({ lastInUnit: true, unitDone: true, lastUnit: false })).toBe('start')
  })
  it('still rests between sets of the final exercise', () => {
    expect(restAfterSet({ lastInUnit: true, unitDone: false, lastUnit: true })).toBe('start')
  })
  it('stops rest after the last set of the entire workout', () => {
    expect(restAfterSet({ lastInUnit: true, unitDone: true, lastUnit: true })).toBe('stop')
  })
  it('does not interrupt back-to-back exercises inside a superset', () => {
    expect(restAfterSet({ lastInUnit: false, unitDone: false, lastUnit: false })).toBe(null)
    expect(restAfterSet({ lastInUnit: false, unitDone: false, lastUnit: true })).toBe(null)
  })
  it('starts rest when a complete superset is finished out of order', () => {
    expect(restAfterSet({ lastInUnit: false, unitDone: true, lastUnit: false })).toBe('start')
  })
  it('stops after a final complete superset even when finished out of order', () => {
    expect(restAfterSet({ lastInUnit: false, unitDone: true, lastUnit: true })).toBe('stop')
  })
})
