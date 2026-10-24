import { keyPragma, toHex } from '@/db/encryption';
import { isQuickActionHref } from '@/platform/quickActions';
import {
  initialLockState,
  LOCK_GRACE_MS,
  onEnabledChange,
  onPhaseChange,
  onUnlocked,
  shouldCover,
} from '@/security/lockPolicy';

jest.mock('expo-secure-store', () => ({}));
jest.mock('expo-crypto', () => ({}));
jest.mock('expo-quick-actions', () => ({}));

describe('app lock policy', () => {
  it('starts locked on a cold start only when enabled', () => {
    expect(initialLockState(true).locked).toBe(true);
    expect(initialLockState(false).locked).toBe(false);
  });

  it('stays unlocked after a short trip to the background', () => {
    let s = onUnlocked(initialLockState(true));
    s = onPhaseChange(s, 'background', 1000);
    s = onPhaseChange(s, 'active', 1000 + LOCK_GRACE_MS - 1);
    expect(s.locked).toBe(false);
  });

  it('locks after the grace period', () => {
    let s = onUnlocked(initialLockState(true));
    s = onPhaseChange(s, 'background', 1000);
    s = onPhaseChange(s, 'active', 1000 + LOCK_GRACE_MS);
    expect(s.locked).toBe(true);
  });

  it('measures from the first background event, not later ones', () => {
    let s = onUnlocked(initialLockState(true));
    s = onPhaseChange(s, 'background', 0);
    s = onPhaseChange(s, 'background', LOCK_GRACE_MS - 10);
    s = onPhaseChange(s, 'active', LOCK_GRACE_MS + 5);
    expect(s.locked).toBe(true);
  });

  it('ignores inactive (system prompts, app switcher) for locking', () => {
    let s = onUnlocked(initialLockState(true));
    s = onPhaseChange(s, 'inactive', 0);
    s = onPhaseChange(s, 'active', LOCK_GRACE_MS * 10);
    expect(s.locked).toBe(false);
  });

  it('covers the screen while not in front, to hide balances', () => {
    const s = onUnlocked(initialLockState(true));
    expect(shouldCover(s, 'inactive')).toBe(true);
    expect(shouldCover(s, 'active')).toBe(false);
    expect(shouldCover(initialLockState(false), 'inactive')).toBe(false);
  });

  it('does nothing when disabled, and turning it on does not lock at once', () => {
    let s = initialLockState(false);
    s = onPhaseChange(s, 'background', 0);
    s = onPhaseChange(s, 'active', LOCK_GRACE_MS * 2);
    expect(s.locked).toBe(false);
    expect(onEnabledChange(s, true)).toEqual({
      enabled: true,
      locked: false,
      backgroundedAt: null,
    });
  });
});

describe('database key', () => {
  it('hex-encodes random bytes', () => {
    expect(toHex(new Uint8Array([0, 15, 255]))).toBe('000fff');
  });

  it('builds a raw-key PRAGMA and rejects anything that is not 64 hex characters', () => {
    const key = 'a'.repeat(64);
    expect(keyPragma(key)).toBe(`PRAGMA key = "x'${key}'"`);
    expect(() => keyPragma('a'.repeat(63))).toThrow();
    expect(() => keyPragma(`${'a'.repeat(63)}'`)).toThrow();
    expect(() => keyPragma('A'.repeat(64))).toThrow();
  });
});

describe('quick actions and deep links', () => {
  it('only opens known screens', () => {
    expect(isQuickActionHref('/transaction')).toBe(true);
    expect(isQuickActionHref('/debug')).toBe(false);
    expect(isQuickActionHref('https://example.com')).toBe(false);
    expect(isQuickActionHref(undefined)).toBe(false);
  });
});
