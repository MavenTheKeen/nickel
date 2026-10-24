import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

// The database is encrypted with SQLCipher using a random 256-bit key. The
// key lives in the iOS Keychain / Android Keystore, never in the database
// or in app files.
//
// AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: readable by background tasks once the
// phone has been unlocked after a restart, and never copied to another
// device through a backup. A restored backup therefore cannot open the
// database; moving to a new phone goes through Settings > Back up data.

const KEY_NAME = 'nickel.db.key.v1';
const KEY_BYTES = 32;

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * The PRAGMA that unlocks the database. A raw hex key skips SQLCipher's
 * passphrase derivation, which is unnecessary for a random key and slow on
 * every open. The key is validated, since PRAGMA cannot take parameters.
 */
export function keyPragma(hexKey: string): string {
  if (!/^[0-9a-f]{64}$/.test(hexKey))
    throw new Error('Database key must be 64 lowercase hex characters');
  return `PRAGMA key = "x'${hexKey}'"`;
}

export async function getOrCreateDbKey(): Promise<string> {
  const options = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };
  const existing = await SecureStore.getItemAsync(KEY_NAME, options);
  if (existing) return existing;
  const key = toHex(await Crypto.getRandomBytesAsync(KEY_BYTES));
  await SecureStore.setItemAsync(KEY_NAME, key, options);
  return key;
}
