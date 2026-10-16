import { describe, expect, it } from 'vitest'
import { warmupSets, nextWarmup, warmLabel, MAX_WARM } from './warmup.js'

describe('warmupSets', () => {
  it('ramps up toward the working weight in plate-sized steps', () => {
    expect(warmupSets(100, 2)).toEqual([
      { w: 50, r: 10, done: false },
      { w: 75, r: 5, done: false }
    ])
    expect(warmupSets(62.5, 3).map(s => s.w)).toEqual([25, 37.5, 50])
  })
  it('rounds to 5 lb in pounds', () => {
    expect(warmupSets(135, 2, 'lb').map(s => s.w)).toEqual([70, 100])
  })
  it('keeps the rep ramp when there is no working weight yet', () => {
    expect(warmupSets(0, 2)).toEqual([{ w: 0, r: 10, done: false }, { w: 0, r: 5, done: false }])
  })
  it('clamps the count', () => {
    expect(warmupSets(100, 0)).toEqual([])
    expect(warmupSets(100, 9)).toHaveLength(MAX_WARM)
  })
})

describe('nextWarmup', () => {
  it('starts a ramp when there is none', () => {
    expect(nextWarmup([], 100)).toEqual({ w: 60, r: 8, done: false })
  })
  it('climbs halfway to the working weight with fewer reps', () => {
    expect(nextWarmup([{ w: 50, r: 10 }], 100)).toEqual({ w: 75, r: 5, done: false })
    expect(nextWarmup([{ w: 50, r: 3 }], 100).r).toBe(2)
  })
})

it('labels warm-ups W1, W2…', () => {
  expect(warmLabel(0)).toBe('W1')
  expect(warmLabel(2)).toBe('W3')
})
