import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

// Receipt photos are copied into the app's documents folder and referenced by
// file name only, because the folder's absolute path changes between app
// updates on iOS. The files sit in app-private storage under the operating
// system's file protection; they are not inside the encrypted database.

const dir = () => new Directory(Paths.document, 'receipts');

export type ReceiptSource = 'camera' | 'library';

export class PermissionDeniedError extends Error {
  override name = 'PermissionDeniedError';
}

/** Lets the user take or choose a photo and stores a copy. Returns the file name, or null if cancelled. */
export async function pickReceipt(source: ReceiptSource): Promise<string | null> {
  const permission =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new PermissionDeniedError(
      source === 'camera'
        ? 'Camera access is off for Nickel. Turn it on in system settings to photograph receipts.'
        : 'Photo access is off for Nickel. Turn it on in system settings to attach receipts.',
    );
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.5 };
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return null;
  const folder = dir();
  if (!folder.exists) folder.create({ intermediates: true });
  const name = `${Crypto.randomUUID()}.jpg`;
  new File(asset.uri).copy(new File(folder, name));
  return name;
}

export function receiptUri(name: string): string {
  return new File(dir(), name).uri;
}

export function receiptExists(name: string): boolean {
  return new File(dir(), name).exists;
}

/** File names in the folder that no transaction refers to. */
export function orphanedReceipts(files: readonly string[], referenced: ReadonlySet<string>) {
  return files.filter((f) => f.endsWith('.jpg') && !referenced.has(f));
}

/**
 * Deletes photos no transaction refers to: removed from a transaction,
 * attached to one that was deleted, or picked and then abandoned. Runs on app
 * start, after the undo window for a delete has passed.
 */
export function cleanupReceipts(referenced: ReadonlySet<string>): number {
  const folder = dir();
  if (!folder.exists) return 0;
  const names = folder.list().map((entry) => entry.name);
  const orphans = orphanedReceipts(names, referenced);
  for (const name of orphans) new File(folder, name).delete();
  return orphans.length;
}
