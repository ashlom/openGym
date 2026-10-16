// Warm-up sets. They live in their own list on a workout entry (`entry.warm`), next to the
// working sets rather than inside them: progression, 1RM, PRs, volume, set counts and "last
// time" all read `entry.sets`, and none of them should ever mistake a 40 kg ramp-up set for
// the session's work. Keeping them apart means not one of those readers has to know.

export const MAX_WARM = 4

// A ramp toward the working weight: lighter and longer first, heavier and shorter last.
const PCT = { 1: [0.6], 2: [0.5, 0.75], 3: [0.4, 0.6, 0.8], 4: [0.4, 0.55, 0.7, 0.85] }
const REPS = { 1: [8], 2: [10, 5], 3: [10, 6, 3], 4: [10, 6, 4, 2] }

// The smallest plate jump people actually load: 2.5 kg, 5 lb.
const roundTo = (w, unit) => {
  const step = unit === 'lb' ? 5 : 2.5
  return Math.max(0, Math.round(w / step) * step)
}

/** `n` warm-up sets ramping up to `workW`. Without a working weight there is nothing to
 *  take a percentage of, so the weights start at 0 and the reps still guide the ramp. */
export function warmupSets(workW, n, unit = 'kg') {
  const k = Math.max(0, Math.min(MAX_WARM, Math.round(n) || 0))
  if (!k) return []
  return PCT[k].map((p, i) => ({ w: workW > 0 ? roundTo(workW * p, unit) : 0, r: REPS[k][i], done: false }))
}

/** One more warm-up set after the ones already there: halfway from the last one to the
 *  working weight, with fewer reps — the ramp keeps climbing instead of restarting. */
export function nextWarmup(warm, workW, unit = 'kg') {
  const list = warm || []
  const last = list[list.length - 1]
  if (!last) return warmupSets(workW, 1, unit)[0]
  const w = workW > 0 ? roundTo((last.w + workW) / 2, unit) : last.w
  return { w, r: Math.max(2, Math.ceil((last.r || 4) / 2)), done: false }
}

/** "W1", "W2"… — what a warm-up set is called on screen. */
export const warmLabel = i => 'W' + (i + 1)
