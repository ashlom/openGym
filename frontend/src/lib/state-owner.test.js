import { describe, expect, it } from 'vitest'
import { shouldClearExpiredProfile, shouldResetOwnedState } from './state-owner.js'

describe('profile-owned local state', () => {
  it('keeps state for the same profile', () => {
    expect(shouldResetOwnedState('rafa', 'rafa', 'rafa')).toBe(false)
  })

  it('clears state when switching profile owners', () => {
    expect(shouldResetOwnedState('rafa', 'rafa', 'fer')).toBe(true)
  })

  it('protects legacy state by comparing the stored user', () => {
    expect(shouldResetOwnedState(null, 'rafa', 'nico')).toBe(true)
  })

  it('allows ownerless guest data to migrate on first sign-in', () => {
    expect(shouldResetOwnedState(null, null, 'rodri')).toBe(false)
  })

  it('clears data after an owned profile session expires', () => {
    expect(shouldClearExpiredProfile('rafa', 'rafa')).toBe(true)
    expect(shouldClearExpiredProfile(null, 'rafa')).toBe(true)
  })

  it('keeps ownerless guest data when the server has no session', () => {
    expect(shouldClearExpiredProfile(null, null)).toBe(false)
  })
})
