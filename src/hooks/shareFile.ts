import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

/** Writes text to a cache file and opens the system share sheet for it. */
export async function shareTextFile(
  filename: string,
  content: string,
  mimeType: string,
): Promise<void> {
  const file = new File(Paths.cache, filename);
  file.create({ overwrite: true });
  await file.write(content);
  if (!(await Sharing.isAvailableAsync()))
    throw new Error('Sharing is not available on this device');
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: filename });
}
