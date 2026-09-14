const hasProfileData = state => !!(
  (state?.workouts || []).length || (state?.routines || []).length || (state?.bodyweight || []).length
)
const timestamp = state => {
  const value = Number(state?._ts)
  return Number.isFinite(value) && value >= 0 ? value : 0
}
const revision = state => Number.isSafeInteger(state?._rev) && state._rev >= 0 ? state._rev : 0

/** Decide sync direction. Revisions win over untrusted device clocks; timestamps support legacy state. */
export function shouldAcceptRemoteState(localState, remoteState, localDirty = false) {
  if (!remoteState || typeof remoteState !== 'object') return false
  const remoteRev = revision(remoteState)
  const localRev = revision(localState)
  // Dirty means there are unsynced local edits. Let the server compare-and-swap reject or
  // accept them; a 409 path keeps a recovery copy before explicitly taking server state.
  if (localDirty) return false
  if (remoteRev !== localRev) return remoteRev > localRev
  if (!hasProfileData(localState)) return true
  return timestamp(remoteState) >= timestamp(localState)
}
