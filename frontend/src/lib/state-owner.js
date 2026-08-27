export function shouldResetOwnedState(ownerId, previousUserId, nextUserId) {
  if (!nextUserId) return false
  if (ownerId) return ownerId !== nextUserId
  return !!previousUserId && previousUserId !== nextUserId
}

export const shouldClearExpiredProfile = (currentUserId, ownerId) => !!(currentUserId || ownerId)
