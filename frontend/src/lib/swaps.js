// Smart swaps: ranked alternatives for an exercise, for when the machine is taken, the gym
// doesn't have it, or it simply hurts today.
//
// The catalogue knows each exercise's target muscle (tg), secondary muscles (sm), body part
// (bp) and equipment (eq). It does not know the movement, so that is read off the name — a
// "lever chest press" and a "dumbbell bench press" are the same push even though they share
// no equipment, and a "cable fly" hits the same target with a different movement. Ranking
// leans on target + movement first, so the top of the list is the swap you'd pick yourself.
import { defaultConfig, modeOf } from './history.js'

// Order matters: the first match wins, so the specific patterns sit above the generic ones
// ("leg curl" before "curl", "reverse fly" before "fly", "french press" before "press").
const PATTERNS = [
  ['reardelt', /rear delt|rear lateral|reverse fly|face pull/],
  ['frontraise', /front raise|front lateral raise/],
  ['latraise', /lateral raise|side raise|\by[- ]raise/],
  ['fly', /\bfly|\bflye|pec deck|crossover/],
  ['pulldown', /pulldown|pull-down|pull down/],
  ['pullup', /pull-up|pull up|pullup|chin-up|chin up|chinup|muscle up/],
  ['upright', /upright row/],
  ['row', /\brows?\b/],
  ['legcurl', /leg curl|hamstring curl|nordic/],
  ['curl', /curl/],
  ['legext', /leg extension/],
  ['triext', /triceps? (?:extension|press)|pushdown|push-down|push down|skull|kickback|french press|close[- ]grip/],
  ['ohpress', /shoulder press|military press|overhead press|push press|arnold press|landmine press/],
  ['dip', /\bdips?\b/],
  ['pushup', /push-up|push up|pushup/],
  ['press', /bench press|chest press|floor press|\bpress\b/],
  ['squat', /squat|leg press|lunge|step-up|step up|\bhack\b|pistol/],
  ['hinge', /deadlift|good morning|hip thrust|glute bridge|\bbridge|hyperextension|back extension|kettlebell swing|pull through|pull-through/],
  ['calf', /calf|calves/],
  ['shrug', /shrug/],
  ['abduct', /abduct/],
  ['adduct', /adduct/],
  ['crunch', /crunch|sit-up|sit up|leg raise|knee raise|v-up|jackknife|toes to bar/],
  ['twist', /twist|rotation|woodchop|wood chop|russian/],
  ['plank', /plank|hollow|dead bug|bird dog/],
]
const COMPOUND = new Set(['press', 'dip', 'pushup', 'ohpress', 'row', 'pulldown', 'pullup', 'squat', 'hinge'])
// Patterns that train the same thing a different way — a dip or a push-up is a fair swap
// for a bench press, just not as close as another press.
const FAMILY = { press: 'push', dip: 'push', pushup: 'push', pulldown: 'vpull', pullup: 'vpull', reardelt: 'rear', latraise: 'raise', frontraise: 'raise' }

/** The movement an exercise name describes, plus its bench angle where that matters. */
export function movementOf(ex) {
  const n = String((ex && ex.n) || '').toLowerCase()
  const hit = PATTERNS.find(([, re]) => re.test(n))
  const angle = /incline/.test(n) ? 'incline' : /decline/.test(n) ? 'decline' : 'flat'
  return { pattern: hit ? hit[0] : 'other', angle }
}

/** Compound = several joints move (presses, rows, squats…); isolation = one. */
export const isCompound = ex => COMPOUND.has(movementOf(ex).pattern)

// How much technique an exercise asks for, from the equipment. A machine guides the path;
// free weights don't; a ball or a bosu adds balance on top.
const LOW = new Set(['leverage machine', 'smith machine', 'sled machine', 'cable', 'assisted', 'band', 'resistance band'])
const HIGH = new Set(['olympic barbell', 'stability ball', 'bosu ball', 'wheel roller'])
export const skillOf = ex => (LOW.has(ex && ex.eq) ? 'low' : HIGH.has(ex && ex.eq) ? 'high' : 'medium')

// "lever shoulder press v. 2" and "barbell full squat (side pov)" are the same exercise as
// their plain-named twin for the purpose of a swap list — showing both wastes a slot.
const baseName = n => String(n || '').toLowerCase()
  .replace(/\s*\((?:back|side|front)?\s*pov\)/g, '').replace(/\s+v\.\s*\d+$/, '').trim()

// What a regular gym has on the floor. Among equally good matches, a dumbbell or a machine
// beats a stability ball or a band, which most people would not reach for mid-session.
const COMMON = { 'leverage machine': 6, 'smith machine': 6, cable: 6, dumbbell: 6, barbell: 6, 'ez barbell': 3, 'sled machine': 3, 'body weight': 3, weighted: 2, kettlebell: 1 }
const commonness = ex => COMMON[ex.eq] ?? -3

// Words that only say which equipment is used — the swap is about everything else.
const NOISE = new Set(['lever', 'leverage', 'machine', 'cable', 'dumbbell', 'dumbbells', 'barbell', 'smith', 'band', 'resistance', 'kettlebell', 'ez', 'bar', 'with', 'the', 'a', 'on', 'of', 'and', 'v', 'pov', 'back', 'side'])
const tokens = n => new Set(baseName(n).split(/[^a-z]+/).filter(w => w && !NOISE.has(w)))

/** Score how good `c` is as a stand-in for `base`. null = not a sensible swap at all. */
export function swapScore(base, c, usage = {}) {
  if (!base || !c || c.id === base.id) return null
  const cardio = base.bp === 'cardio'
  if (cardio !== (c.bp === 'cardio')) return null
  if (cardio) return 50 + (usage[c.id] ? 6 : 0)
  const mb = movementOf(base), mc = movementOf(c)
  const samePattern = mb.pattern !== 'other' && mb.pattern === mc.pattern
  const related = !samePattern && !!FAMILY[mb.pattern] && FAMILY[mb.pattern] === FAMILY[mc.pattern]
  const sameTarget = !!base.tg && base.tg === c.tg
  // Without a shared target or movement it's a different exercise, not a swap.
  if (!sameTarget && !samePattern) return null
  let s = 0
  if (sameTarget) s += 40
  else if ((base.sm || []).includes(c.tg) || (c.sm || []).includes(base.tg)) s += 10
  if (samePattern) s += 30 + (mb.angle === mc.angle ? 6 : 0)
  else if (related) s += 15
  const sb = new Set(base.sm || []), sc = c.sm || []
  const shared = sc.filter(m => sb.has(m)).length
  s += 12 * shared / Math.max(sb.size, sc.length, 1)
  if (base.bp && base.bp === c.bp) s += 4
  if (isCompound(base) === isCompound(c)) s += 5
  // Same words once the equipment is taken out: "lever seated row" → "cable seated row".
  const tb = tokens(base.n), tc = tokens(c.n)
  const common = [...tc].filter(w => tb.has(w)).length
  s += 10 * common / Math.max(new Set([...tb, ...tc]).size, 1)
  s += commonness(c)
  // Every "(with arm blaster)" or "(kneeling)" makes it a more niche variant.
  s -= 3 * (String(c.n || '').match(/\(/g) || []).length
  if (usage[c.id]) s += 6
  if (/\sv\.\s*\d+$/.test(c.n || '')) s -= 2
  return Math.round(s * 10) / 10
}

/**
 * The best stand-ins for `base` from `pool`, best first.
 * `exclude` — ids not to suggest (e.g. everything already in today's session).
 * `usage`   — { id: count } of exercises you already use; they get a small nudge up.
 */
export function smartSwaps(base, pool, { exclude = [], usage = {}, limit = 12 } = {}) {
  const skip = new Set(exclude)
  const seen = new Set([baseName(base && base.n)])
  return pool
    .filter(c => !skip.has(c.id))
    .map(c => ({ ex: c, score: swapScore(base, c, usage) }))
    .filter(x => x.score != null)
    .sort((a, b) => b.score - a.score || (a.ex.n < b.ex.n ? -1 : 1))
    .filter(x => { const k = baseName(x.ex.n); if (seen.has(k)) return false; seen.add(k); return true })
    .slice(0, limit)
}

/**
 * The plan for the exercise that replaces `old`: same amount of work (sets, reps or
 * seconds, warm-ups, progression rule), but nothing that described the old exercise —
 * its weight, its step, its bodyweight/per-side flags and its note all belong to it.
 */
export function swapConfig(old, newId) {
  const o = old || {}
  const prevMode = modeOf(o)
  const mode = modeOf({ id: newId }) === 'cardio' ? 'cardio' : (prevMode === 'time' ? 'time' : 'reps')
  const d = defaultConfig(newId, mode)
  if (mode === 'cardio') return { ...d, ...(prevMode === 'cardio' && o.sets ? { sets: o.sets } : {}) }
  const out = { ...d }
  if (o.sets > 0) out.sets = o.sets
  if (mode === 'reps' && prevMode === 'reps' && o.reps > 0) out.reps = o.reps
  if (mode === 'time' && o.sec > 0) out.sec = o.sec
  if (o.prog) out.prog = o.prog
  if (mode === 'reps' && o.repsMin > 0) out.repsMin = Math.min(o.repsMin, out.reps)
  if (mode === 'reps' && o.warm > 0) out.warm = o.warm
  return out
}
