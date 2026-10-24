// Analysis of the onboarding experiment from event logs exported on the
// debug screen. No imports, so scripts/analyze-ab.ts can run it with plain Node.

export interface ExportedEvent {
  name: string;
  props: Record<string, unknown>;
  ts: string;
}

export interface DeviceExport {
  installId: string;
  flags: { key: string; variant: string | null; overridden: boolean }[];
  events: ExportedEvent[];
}

export interface InstallOutcome {
  installId: string;
  variant: string;
  /** First transaction within 24 hours of the first app_open. */
  converted: boolean;
  hoursToFirstTransaction: number | null;
}

export interface VariantSummary {
  variant: string;
  installs: number;
  converted: number;
  rate: number;
  /** 95% Wilson score interval for the rate. */
  low: number;
  high: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function wilsonInterval(
  successes: number,
  n: number,
  z = 1.96,
): { low: number; high: number } {
  if (n === 0) return { low: 0, high: 0 };
  const p = successes / n;
  const denom = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return { low: Math.max(0, centre - margin), high: Math.min(1, centre + margin) };
}

/**
 * One outcome per install. Installs whose flag was overridden by hand are
 * left out, because they did not get a random assignment.
 */
export function outcomeFor(device: DeviceExport, flagKey: string): InstallOutcome | null {
  const flag = device.flags.find((f) => f.key === flagKey);
  if (!flag?.variant || flag.overridden) return null;
  const firstOpen = device.events
    .filter((e) => e.name === 'app_open')
    .map((e) => Date.parse(e.ts))
    .sort((a, b) => a - b)[0];
  if (firstOpen === undefined) return null;
  const firstTxn = device.events
    .filter((e) => e.name === 'transaction_added')
    .map((e) => Date.parse(e.ts))
    .filter((t) => t >= firstOpen)
    .sort((a, b) => a - b)[0];
  const hours = firstTxn === undefined ? null : (firstTxn - firstOpen) / 3_600_000;
  return {
    installId: device.installId,
    variant: flag.variant,
    converted: firstTxn !== undefined && firstTxn - firstOpen <= DAY_MS,
    hoursToFirstTransaction: hours,
  };
}

export function summarize(outcomes: readonly InstallOutcome[]): VariantSummary[] {
  const byVariant = new Map<string, InstallOutcome[]>();
  // Last export wins if a device was exported twice.
  const unique = new Map(outcomes.map((o) => [o.installId, o]));
  for (const o of unique.values()) {
    byVariant.set(o.variant, [...(byVariant.get(o.variant) ?? []), o]);
  }
  return [...byVariant.entries()]
    .map(([variant, list]) => {
      const converted = list.filter((o) => o.converted).length;
      return {
        variant,
        installs: list.length,
        converted,
        rate: converted / list.length,
        ...wilsonInterval(converted, list.length),
      };
    })
    .sort((a, b) => a.variant.localeCompare(b.variant));
}

export function report(summaries: readonly VariantSummary[]): string {
  const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
  const lines = [
    'Metric: share of installs that add a first transaction within 24 hours of first opening the app.',
    '',
    'variant  installs  converted  rate   95% interval',
    ...summaries.map(
      (s) =>
        `${s.variant.padEnd(8)} ${String(s.installs).padStart(8)} ${String(s.converted).padStart(10)}  ${pct(s.rate).padStart(4)}   ${pct(s.low)} to ${pct(s.high)}`,
    ),
    '',
  ];
  const total = summaries.reduce((n, s) => n + s.installs, 0);
  const overlapping =
    summaries.length === 2 &&
    summaries[0]!.low <= summaries[1]!.high &&
    summaries[1]!.low <= summaries[0]!.high;
  lines.push(
    `Sample size: ${total} installs.`,
    overlapping || total < 100
      ? 'The intervals overlap or the sample is small: this data cannot tell the variants apart.'
      : 'The intervals do not overlap.',
  );
  return lines.join('\n');
}
