import type { ActivityState } from '../../types'

export const CELEBRATE_MS = 4_000

export function started(a: ActivityState, now: number): ActivityState {
  return { ...a, isWorking: true, turnStartedAt: now, lastActiveAt: now }
}

/** The main turn ended: a celebration if it saved a file. */
export function completed(a: ActivityState, now: number): ActivityState {
  const didSave = a.lastSaveAt > 0 && a.lastSaveAt >= a.turnStartedAt
  return { ...a, isWorking: false, lastActiveAt: now, celebrateUntil: didSave ? now + CELEBRATE_MS : a.celebrateUntil }
}

export function typed(a: ActivityState, now: number): ActivityState {
  return { ...a, lastActiveAt: now }
}

export function saved(a: ActivityState, now: number): ActivityState {
  return { ...a, lastSaveAt: now, lastActiveAt: now }
}

export function celebrate(a: ActivityState, now: number): ActivityState {
  return { ...a, celebrateUntil: now + CELEBRATE_MS }
}
