import type { FlagDefinition } from './definitions';

/** 32-bit FNV-1a over UTF-16 code units. Small, fast and stable across platforms. */
export function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Bucket 0-99 for this install and flag. Hashing the key in means flags are independent. */
export function bucketFor(installId: string, flagKey: string): number {
  return fnv1a(`${flagKey}:${installId}`) % 100;
}

/**
 * Deterministic variant: the same install id always gets the same variant
 * for a flag, with no server and no stored randomness.
 */
export function assignVariant<V extends string>(installId: string, flag: FlagDefinition<V>): V {
  const total = flag.weights.reduce((a, b) => a + b, 0);
  if (flag.variants.length !== flag.weights.length || total !== 100) {
    throw new Error(`Flag ${flag.key}: weights must match variants and add up to 100`);
  }
  const bucket = bucketFor(installId, flag.key);
  let upper = 0;
  for (let i = 0; i < flag.variants.length; i++) {
    upper += flag.weights[i] ?? 0;
    if (bucket < upper) return flag.variants[i] as V;
  }
  return flag.defaultVariant;
}
