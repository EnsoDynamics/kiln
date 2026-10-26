// Exploration script — not part of the main program.
// Regenerates the pinned credit schema and records only sanitized metadata facts.
// No thread/turn, purchase, reset, configuration or credential-store call is permitted.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CodexMetadataRpc } from '../../dist/agents/codex-metadata-rpc.js';
import { codexCredits } from '../../dist/agents/codex-metadata.js';
const executable = process.argv[2] ?? 'codex';
const output = process.argv[3];
if (!output) throw new Error('Usage: node scripts/exploration/codex-billing-contract.mjs <codex> <output.json>');
const version = execFileSync(executable, ['--version'], { encoding: 'utf8' }).trim();
if (version !== 'codex-cli 0.162.1') throw new Error('The billing contract requires codex-cli 0.162.1.');
const directory = mkdtempSync(join(tmpdir(), 'kiln-billing-schema-'));
try {
  execFileSync(executable, ['app-server', 'generate-json-schema', '--out', directory]);
  const schema = JSON.parse(readFileSync(join(directory, 'v2/GetAccountRateLimitsResponse.json'), 'utf8'));
  const rpc = new CodexMetadataRpc(executable, process.cwd(), process.env);
  try {
    await rpc.initialize();
    const before = await rpc.call('account/read', { refreshToken: false });
    const usage = await rpc.call('account/rateLimits/read');
    const after = await rpc.call('account/read', { refreshToken: false });
    const at = new Date().toISOString();
    const credits = codexCredits(before, usage, after, at);
    const buckets = usage.rateLimitsByLimitId != null ? Object.values(usage.rateLimitsByLimitId) : usage.rateLimits ? [usage.rateLimits] : [];
    const result = { version, platform: process.platform, observedAt: at,
      source: 'https://learn.chatgpt.com/docs/app-server#account-rate-limits',
      creditsScope: 'workspace (official account-rate-limit field notes)',
      schema: { CreditsSnapshot: schema.definitions.CreditsSnapshot, creditsProperty: schema.definitions.RateLimitSnapshot.properties.credits },
      live: { chatgptBeforeAndAfter: before.account?.type === 'chatgpt' && after.account?.type === 'chatgpt',
        stableUsageIdentity: typeof usage.accountId === 'string' && !!usage.accountId,
        routingCorroborated: [before, after].every(a => a.workspaceRouting?.chatgptAccountId === usage.accountId),
        accountMetadataConsistent: before.account?.email === after.account?.email && before.account?.planType === after.account?.planType,
        bucketCount: buckets.length, attributedCreditObservations: credits.length,
        creditShapes: buckets.map(b => ({ present: b.credits != null, balanceType: b.credits?.balance === null ? 'null' : typeof b.credits?.balance, hasCreditsType: typeof b.credits?.hasCredits, unlimitedType: typeof b.credits?.unlimited })) },
      unproved: ['Actual spendable balance and paid-use behavior', 'Exhausted-account conditions', 'Native Windows and Linux metadata parity'] };
    writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify(result));
  } finally { await rpc.close(); }
} finally { rmSync(directory, { recursive: true, force: true }); }
