const timestamp = state => {
  const value = Number(state?._ts);
  return Number.isFinite(value) && value >= 0 ? value : 0;
};
const revision = state => Number.isSafeInteger(state?._rev) && state._rev >= 0 ? state._rev : 0;

/** Reject clients not based on the canonical revision; use timestamps for pre-revision state. */
export function incomingStateIsStale(currentState, incomingState) {
  if (!currentState || typeof currentState !== 'object') return false;
  const currentRev = revision(currentState);
  const incomingRev = revision(incomingState);
  if (currentRev > 0 && incomingRev > 0) return incomingRev !== currentRev;
  // Compatibility for a pre-revision web bundle during rollout: it may still save if its
  // state is genuinely newer, but cannot replace a newer canonical snapshot.
  const currentTs = timestamp(currentState);
  return currentTs > 0 && currentTs > timestamp(incomingState);
}

/** Stamp accepted state with a server-owned clock and monotonic revision. */
export function acceptedState(currentState, incomingState, now = Date.now()) {
  return { ...incomingState, _ts: now, _rev: revision(currentState) + 1 };
}
