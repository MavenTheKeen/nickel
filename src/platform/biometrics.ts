import * as LocalAuthentication from 'expo-local-authentication';

export type AuthAvailability = 'biometric' | 'passcode' | 'none';

/**
 * What the device can use to unlock the app. The device passcode is always
 * accepted as a fallback, so a phone with a passcode but no enrolled
 * fingerprint or face can still use the lock.
 */
export async function authAvailability(): Promise<AuthAvailability> {
  try {
    const [hardware, enrolled, level] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.getEnrolledLevelAsync(),
    ]);
    if (hardware && enrolled) return 'biometric';
    return level === LocalAuthentication.SecurityLevel.NONE ? 'none' : 'passcode';
  } catch {
    return 'none';
  }
}

export async function authenticate(
  reason: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: reason,
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,
    });
    return result.success ? { ok: true } : { ok: false, error: result.error };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
