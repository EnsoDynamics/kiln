// Verified 0.162.1 metadata shapes; failure/delay controls exercise the real process transport.
// This peer rejects every conversation/turn call. It does not prove inference entitlement.
import { createInterface } from 'node:readline';
import { readFileSync, appendFileSync } from 'node:fs';
const path = process.env.KILN_CODEX_METADATA;
const read = () => path ? JSON.parse(readFileSync(path, 'utf8')) : {};
if (process.argv.includes('--version')) { console.log(`codex-cli ${read().version ?? '0.162.1'}`); process.exit(0); }
const model = (name, efforts) => ({ model: name, displayName: name.toUpperCase(), description: 'Recorded contract fixture', hidden: false, supportedReasoningEfforts: efforts.map(reasoningEffort => ({ reasoningEffort, description: `${reasoningEffort} reasoning` })), defaultReasoningEffort: 'low' });
let accountReads = 0;
createInterface({ input: process.stdin }).on('line', async line => {
  const message = JSON.parse(line);
  if (path) appendFileSync(`${path}.calls`, JSON.stringify(message) + '\n');
  if (message.id === undefined) return;
  const fixture = read();
  if (message.method === 'model/list' && fixture.modelDelayMs) await new Promise(resolve => setTimeout(resolve, fixture.modelDelayMs));
  if (fixture.delayMs) await new Promise(resolve => setTimeout(resolve, fixture.delayMs));
  let result;
  switch (message.method) {
    case 'initialize': if (fixture.initializeError) break; result = { userAgent: 'codex-cli/0.162.1', codexHome: '/fixture' }; break;
    case 'model/list':
      if (fixture.modelsError) break;
      result = message.params.cursor ? { data: [model('gpt-6-luna', ['low', 'high', 'max'])], nextCursor: null } : { data: [model('gpt-6-sol', ['low', 'high']), model('gpt-6.1-sol', ['low', 'high', 'ultra']), { ...model('hidden-sol', ['high']), hidden: true }], nextCursor: 'second' }; break;
    case 'account/read':
      if (fixture.accountError || fixture.afterAccountError && accountReads > 0) break;
      result = fixture.accounts ? fixture.accounts[Math.min(accountReads, fixture.accounts.length - 1)] : { account: fixture.signedOut ? null : { type: fixture.apiKey ? 'apiKey' : 'chatgpt', email: fixture.email ?? 'fixture@example.test', planType: 'pro' }, workspaceRouting: { chatgptAccountId: fixture.routingAccountId ?? fixture.accountId ?? 'fixture-account' } }; accountReads++; break;
    case 'account/rateLimits/read':
      if (fixture.usageError) break;
      result = fixture.usage ?? { accountId: fixture.accountId ?? 'fixture-account', ordinaryUsageAllowed: true, rateLimits: { primary: { usedPercent: 0 } }, rateLimitsByLimitId: fixture.emptyUsage ? {} : { codex: { limitId: 'codex', primary: { usedPercent: fixture.percent ?? 82, windowDurationMins: 10080, resetsAt: 1793000000 }, secondary: { windowDurationMins: 60 } }, other: { limitName: 'Another allowance', primary: { usedPercent: 4 } } } }; break;
    case 'config/read': if (fixture.configError) break; result = { config: { model_provider: fixture.provider ?? null, hooks: fixture.hooks ?? null } }; break;
    case 'configRequirements/read': result = { requirements: fixture.requirements ?? null }; break;
    case 'skills/list': result = { data: message.params.cwds.map(cwd => ({ cwd, errors: [], skills: ['implement-from-requirements', 'deliverable-review', 'test-hardening', 'refactor-pass', 'implementation-lifecycle', 'engineering-principles', 'pre-commit-validation', 'continuation-prompt', 'phase-split', ...(fixture.additionalSkills ?? [])].map(name => ({ name: `enso-method:${name}`, path: fixture.skillPath, enabled: name !== fixture.disabledSkill })).concat(fixture.skillEntries ?? []) })) }; break;
    default: throw new Error(`Forbidden metadata method: ${message.method}`);
  }
  console.log(JSON.stringify({ id: message.id, ...(result === undefined ? { error: { code: -32000, message: 'Fixture metadata failure' } } : { result }) }));
});
