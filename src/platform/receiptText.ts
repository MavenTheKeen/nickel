import { optionalModule } from './runtime';

// On-device text recognition: Apple Vision on iOS, Google ML Kit on Android,
// through expo-text-extractor. The photo never leaves the phone. Expo Go does
// not include the native module, so the feature is hidden there.

interface TextExtractor {
  isSupported: boolean;
  extractTextFromImage: (uri: string) => Promise<string[]>;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const extractor = optionalModule<TextExtractor>(() => require('expo-text-extractor'));

export function canReadReceipts(): boolean {
  return extractor?.isSupported === true;
}

/** The lines of text in the image, top to bottom, or null where recognition is unavailable. */
export async function readReceiptText(uri: string): Promise<string[] | null> {
  if (!canReadReceipts() || !extractor) return null;
  return extractor.extractTextFromImage(uri);
}
