// Rest after each completed set, including the transition to the next
// exercise. Supersets stay back-to-back and the final workout set ends rest.
export function restAfterSet({ lastInUnit, unitDone, lastUnit }) {
  if (unitDone) return lastUnit ? 'stop' : 'start'
  return lastInUnit ? 'start' : null
}
