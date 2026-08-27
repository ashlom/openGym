// Ready-made plans for first-time setup. The PPL factory remains compatible with the demo seed.
import { uid } from './format.js'

const PPL = [
  ['Push Day', 'barbell', [['0025', 4, 8], ['0047', 3, 10], ['0426', 3, 10], ['0334', 3, 12], ['0241', 3, 12], ['0251', 3, 10]]],
  ['Pull Day', 'pullup', [['2330', 4, 10], ['0027', 4, 8], ['1323', 3, 10], ['0031', 3, 10], ['0313', 3, 12]]],
  ['Leg Day', 'legs', [['0043', 4, 8], ['0085', 3, 10], ['0739', 3, 12], ['0585', 3, 12], ['0586', 3, 12], ['0605', 4, 15]]],
]

const FULL_BODY = [
  ['Full Body A', 'barbell', [['0043', 3, 8], ['0025', 3, 8], ['0027', 3, 10], ['0334', 2, 12], ['0605', 3, 15]]],
  ['Full Body B', 'figureStrength', [['0085', 3, 8], ['0426', 3, 8], ['2330', 3, 10], ['0585', 3, 12], ['0313', 2, 12]]],
]

const UPPER_LOWER = [
  ['Upper A', 'barbell', [['0025', 4, 8], ['0027', 4, 8], ['0426', 3, 10], ['2330', 3, 10], ['0241', 3, 12], ['0313', 3, 12]]],
  ['Lower A', 'legs', [['0043', 4, 8], ['0085', 3, 10], ['0585', 3, 12], ['0586', 3, 12], ['0605', 4, 15]]],
  ['Upper B', 'pullup', [['0047', 4, 8], ['1323', 4, 10], ['0426', 3, 10], ['2330', 3, 10], ['0251', 3, 10], ['0031', 3, 12]]],
  ['Lower B', 'legs', [['0739', 4, 10], ['0085', 3, 8], ['0585', 3, 12], ['0586', 3, 12], ['0605', 4, 15]]],
]

const DEFINITIONS = [
  {
    id: 'full-body-2', title: 'Full Body · 2 days', days: 2,
    description: 'A simple whole-body start with plenty of recovery.',
    routines: FULL_BODY, schedule: [[2, 0], [5, 1]],
  },
  {
    id: 'full-body-3', title: 'Full Body · 3 days', days: 3,
    description: 'Balanced beginner plan for Monday, Wednesday and Friday.',
    routines: FULL_BODY, schedule: [[1, 0], [3, 1], [5, 0]],
  },
  {
    id: 'upper-lower-4', title: 'Upper / Lower · 4 days', days: 4,
    description: 'More weekly volume split between upper and lower body.',
    routines: UPPER_LOWER, schedule: [[1, 0], [2, 1], [4, 2], [5, 3]],
  },
  {
    id: 'ppl-3', title: 'Push / Pull / Legs · 3 days', days: 3,
    description: 'One focused push, pull and leg session each week.',
    routines: PPL, schedule: [[1, 0], [3, 1], [5, 2]],
  },
]

export const STARTER_PLANS = DEFINITIONS.map(({ id, title, days, description }) => ({ id, title, days, description }))

const makeRoutine = ([name, emoji, exercises]) => ({
  id: uid(), name, emoji,
  ex: exercises.map(([id, sets, reps]) => ({ id, sets, reps, weight: 0 })),
})

export function starterPlan(id = 'ppl-3') {
  const definition = DEFINITIONS.find(plan => plan.id === id)
  if (!definition) throw new Error(`Unknown starter plan: ${id}`)
  const routines = definition.routines.map(makeRoutine)
  const week = Object.fromEntries(definition.schedule.map(([day, routineIndex]) => [day, routines[routineIndex].id]))
  return { id: definition.id, title: definition.title, routines, week }
}

export function installStarterPlan(state, plan) {
  state.routines = [...plan.routines]
  state.week = { ...plan.week }
}

// Fresh PPL routine objects for the demo data generator.
export const starterRoutines = () => starterPlan('ppl-3').routines
