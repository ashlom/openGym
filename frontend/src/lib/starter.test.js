import { describe, expect, it } from 'vitest'
import { EXDB } from './exercises-data.js'
import { STARTER_PLANS, installStarterPlan, starterPlan, starterRoutines } from './starter.js'

const exerciseIds = new Set(EXDB.map(ex => ex.id))

describe('starter plans', () => {
  it('offers several distinct plans for two to four training days', () => {
    expect(STARTER_PLANS.length).toBeGreaterThanOrEqual(4)
    expect(new Set(STARTER_PLANS.map(plan => plan.id)).size).toBe(STARTER_PLANS.length)
    expect(STARTER_PLANS.map(plan => plan.days)).toEqual(expect.arrayContaining([2, 3, 4]))
  })

  it('builds valid schedules with exercises from the catalogue', () => {
    for (const preset of STARTER_PLANS) {
      const built = starterPlan(preset.id)
      const routineIds = new Set(built.routines.map(routine => routine.id))
      expect(built.routines.length).toBeGreaterThan(0)
      expect(Object.keys(built.week)).toHaveLength(preset.days)
      for (const routineId of Object.values(built.week)) expect(routineIds.has(routineId)).toBe(true)
      for (const routine of built.routines) {
        expect(routine.ex.length).toBeGreaterThan(0)
        for (const exercise of routine.ex) expect(exerciseIds.has(exercise.id)).toBe(true)
      }
    }
  })

  it('returns fresh routine ids on every load', () => {
    const first = starterPlan('full-body-3')
    const second = starterPlan('full-body-3')
    expect(first.routines.map(r => r.id)).not.toEqual(second.routines.map(r => r.id))
  })

  it('replaces old weekly assignments when a different preset is installed', () => {
    const state = { routines: [{ id: 'old-routine' }], week: { 1: 'old-a', 2: 'old-b', 4: 'old-c', 5: 'old-d' } }
    const plan = starterPlan('full-body-2')
    installStarterPlan(state, plan)
    expect(state.routines).toEqual(plan.routines)
    expect(state.routines.some(routine => routine.id === 'old-routine')).toBe(false)
    expect(state.week).toEqual(plan.week)
    expect(Object.keys(state.week)).toEqual(['2', '5'])
  })

  it('keeps the demo-compatible PPL routine factory', () => {
    expect(starterRoutines()).toHaveLength(3)
  })
})
