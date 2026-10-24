/**
 * Percentile by the nearest-rank method: the smallest value with at least
 * p% of the data at or below it. Returns null for an empty list.
 */
export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  if (p < 0 || p > 100) throw new Error(`Percentile out of range: ${p}`);
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[rank - 1] ?? null;
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[mid] ?? null)
    : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

export interface TimingSummary {
  name: string;
  count: number;
  medianMs: number;
  p95Ms: number;
}

export function summarizeTimings(
  samples: readonly { name: string; ms: number }[],
): TimingSummary[] {
  const groups = new Map<string, number[]>();
  for (const s of samples) {
    const list = groups.get(s.name) ?? [];
    list.push(s.ms);
    groups.set(s.name, list);
  }
  return [...groups.entries()]
    .map(([name, ms]) => ({
      name,
      count: ms.length,
      medianMs: median(ms) ?? 0,
      p95Ms: percentile(ms, 95) ?? 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
