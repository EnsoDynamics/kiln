// Fails on any high or critical npm audit finding. Run by `npm run verify`.
import { spawnSync } from 'node:child_process';

const result = spawnSync('npm', ['audit', '--json'], { encoding: 'utf8', shell: process.platform === 'win32' });
if (result.error) throw result.error;
if (result.status !== 0 && result.status !== 1) {
  throw new Error(`npm audit failed (${result.status}): ${result.stderr || result.stdout}`);
}
const report = JSON.parse(result.stdout);
if (report.error || report.auditReportVersion !== 2 || !report.vulnerabilities) {
  throw new Error(`Unexpected npm audit report: ${result.stdout}`);
}
const blocking = Object.values(report.vulnerabilities).filter((finding) => ['high', 'critical'].includes(finding.severity));
for (const finding of blocking) console.error(`${finding.severity}: ${finding.name}`, finding.via);
console.log(`Dependency audit: ${blocking.length} blocking high/critical findings.`);
process.exitCode = blocking.length > 0 ? 1 : 0;
