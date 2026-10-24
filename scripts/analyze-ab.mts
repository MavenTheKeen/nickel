// Usage: npm run analyze:ab -- exports/*.json
// Each file is one device's "Export events as JSON" from the debug screen.
import { readFileSync } from 'node:fs';

import { outcomeFor, report, summarize, type DeviceExport } from '../src/services/abAnalysis.ts';

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('Usage: node scripts/analyze-ab.mts <export.json> [...]');
  process.exit(1);
}

const outcomes = files
  .map((f) => JSON.parse(readFileSync(f, 'utf8')) as DeviceExport)
  .map((d) => outcomeFor(d, 'onboarding_v1'))
  .filter((o) => o !== null);

console.log(report(summarize(outcomes)));
