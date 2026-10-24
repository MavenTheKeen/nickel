// When the app lock asks for authentication. Pure, so the rules are tested
// without a device.

/** Time in the background before the app locks again. Short trips (copying a code) stay unlocked. */
export const LOCK_GRACE_MS = 30_000;

export type AppPhase = 'active' | 'inactive' | 'background';

export interface LockState {
  enabled: boolean;
  locked: boolean;
  /** When the app last left the foreground, or null while it is in front. */
  backgroundedAt: number | null;
}

export function initialLockState(enabled: boolean): LockState {
  // A cold start with the lock on always starts locked.
  return { enabled, locked: enabled, backgroundedAt: null };
}

/** Next state after an AppState change. */
export function onPhaseChange(
  state: LockState,
  phase: AppPhase,
  now: number,
  graceMs = LOCK_GRACE_MS,
): LockState {
  if (!state.enabled) return { ...state, locked: false, backgroundedAt: null };
  if (phase === 'background') {
    return state.backgroundedAt === null ? { ...state, backgroundedAt: now } : state;
  }
  if (phase === 'active') {
    const away = state.backgroundedAt === null ? 0 : now - state.backgroundedAt;
    return { ...state, locked: state.locked || away >= graceMs, backgroundedAt: null };
  }
  // 'inactive' (app switcher, a system dialog such as the Face ID prompt): no change.
  return state;
}

export function onUnlocked(state: LockState): LockState {
  return { ...state, locked: false, backgroundedAt: null };
}

export function onEnabledChange(state: LockState, enabled: boolean): LockState {
  // Turning the lock on never locks immediately: the user just authenticated to turn it on.
  return { enabled, locked: false, backgroundedAt: null };
}

/**
 * Whether to cover the screen. Besides being locked, content is hidden while
 * the app is not in front, so balances do not show in the app switcher.
 */
export function shouldCover(state: LockState, phase: AppPhase): boolean {
  return state.enabled && (state.locked || phase !== 'active');
}
