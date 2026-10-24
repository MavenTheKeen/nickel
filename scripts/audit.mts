// Usage: npm run audit
// Runs npm audit on production dependencies and fails on any high or critical
// advisory, except the ones listed below. Each exception names the package
// path it applies to, so the same advisory elsewhere still fails the build.
import { execSync } from 'node:child_process';

type Exception = { advisory: string; within: string; reason: string };

const exceptions: Exception[] = [
  {
    advisory: 'GHSA-86w9-cpqp-85rv',
    within: 'node-forge',
    reason:
      'Used only by @expo/cli and the expo-updates code-signing CLI on the build machine; not in the app bundle. No fixed release exists.',
  },
  {
    advisory: 'GHSA-mrhx-c7xc-m3w5',
    within: 'expo/node_modules/zod',
    reason:
      'zod 3 inside @expo/cli validates local config on the build machine. The app uses zod 4.6.7, which is fixed.',
  },
];

type Via = { url: string; severity: string; title: string };
type Vulnerability = { severity: string; via: (string | Via)[]; nodes: string[] };

let raw: string;
try {
  raw = execSync('npm audit --omit=dev --json', { encoding: 'utf8' });
} catch (e) {
  // npm audit exits non-zero when it finds anything; the report is still on stdout.
  raw = (e as { stdout: string }).stdout;
}
const report = JSON.parse(raw) as { vulnerabilities: Record<string, Vulnerability> };

const failures: string[] = [];
for (const [name, vuln] of Object.entries(report.vulnerabilities)) {
  for (const via of vuln.via) {
    if (typeof via === 'string') continue;
    if (via.severity !== 'high' && via.severity !== 'critical') continue;
    const id = via.url.split('/').pop() ?? '';
    const excused = exceptions.some(
      (x) => x.advisory === id && vuln.nodes.every((n) => n.includes(`node_modules/${x.within}`)),
    );
    if (!excused) failures.push(`${via.severity} ${name} ${id}: ${via.title}`);
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`No unexcused high or critical advisories (${exceptions.length} exceptions).`);
