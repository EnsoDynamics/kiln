import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import { decodeWrapper, decodeRawCall } from './codex-wrapper-decoder.mjs';

test('recorded image inspection is read-only, literal and opaque', () => {
  const fixture = JSON.parse(readFileSync(new URL('../../test/fixtures/codex-audit-proof/image-inspection-wrappers.json', import.meta.url), 'utf8'));
  assert.equal(fixture.calls.length, 4);
  const paths = ["tooltip-before-active.png", "populated-phone-24h-chart.png", "tooltip-before-active.png", "real-dev-desktop-30d.png"];
  for (const [index, { raw }] of fixture.calls.entries()) {
    const result = decodeRawCall(raw);
    assert.equal(result.coverage, 'complete', result.reason);
    assert.deepEqual(JSON.parse(JSON.stringify(result.operations)), [{ name: 'view_image', input: { path: `/PROOF/browser-artifacts/${paths[index]}` } }]);
  }
  for (const detail of [undefined, 'high', 'original']) {
    const input = { path: '/PROOF/image.png', ...(detail ? { detail } : {}) };
    assert.deepEqual(decodeRawCall({type:'function_call', namespace:'functions', name:'view_image', call_id:'direct', arguments:JSON.stringify(input)}), {callId:'direct', operations:[{name:'view_image', input}], coverage:'complete'});
  }
  for (const input of [null, [], {}, {path:''}, {path:'relative.png'}, {path:'/PROOF/image.png', detail:'low'}]) {
    assert.equal(decodeWrapper('bad', `image(await tools.view_image(${JSON.stringify(input)}));`).coverage, 'inconclusive');
    assert.equal(decodeRawCall({type:'function_call', name:'view_image', arguments:JSON.stringify(input)}).coverage, 'inconclusive');
  }
  for (const program of [
    'const r=await tools.view_image({path:"/PROOF/image.png"}); await tools.exec_command({cmd:r.image_url});',
    'const r=await tools.view_image({path:"/PROOF/image.png"}); await tools.view_image({path:r.image_url});',
    'const r=await tools.view_image({path:"/PROOF/image.png"}); await tools.apply_patch(r);',
    'image(await tools.view_image({path:"/PROOF/image.png"}), await tools.unknown_writer({path:"/outside"}));',
    'await tools["view_image"]({path:"/PROOF/image.png"});',
  ]) assert.equal(decodeWrapper('bad', program).coverage, 'inconclusive', program);
  assert.equal(decodeRawCall({type:'function_call',namespace:'collaboration',name:'view_image',arguments:'{"path":"/PROOF/image.png"}'}).coverage,'inconclusive');
  assert.equal(decodeRawCall({type:'custom_tool_call',name:'view_image',input:'{"path":"/PROOF/image.png"}'}).coverage,'inconclusive');
  // Parameters Kiln doesn't read are ignored (0.166.0 adds environment_id); the path checks stand.
  for (const input of [{path:'/PROOF/image.png', environment_id:'local'}, {path:'/PROOF/image.png', environment_id:'local', future_option:true}]) {
    assert.equal(decodeRawCall({type:'function_call', name:'view_image', call_id:'extra', arguments:JSON.stringify(input)}).coverage, 'complete');
    const cell = decodeWrapper('extra', `image(await tools.view_image(${JSON.stringify(input)})); text(await tools.exec_command({cmd:"git status"}));`);
    assert.equal(cell.coverage, 'complete', cell.reason);
    assert.deepEqual(cell.operations.map(op=>op.name), ['view_image','exec_command']);
  }
  assert.equal(decodeRawCall({type:'function_call', name:'view_image', arguments:JSON.stringify({path:'relative.png', environment_id:'local'})}).coverage, 'inconclusive');
  const nested = decodeWrapper('nested', 'image(await tools.view_image({path:"/PROOF/image.png"}), await tools.exec_command({cmd:"git push",workdir:"/outside"}));');
  assert.equal(nested.coverage,'complete',nested.reason);
  assert.deepEqual(nested.operations.map(op=>op.name),['view_image','exec_command']);
});

test('qualified presentation callback preserves every decoded invocation without admitting dynamic callbacks', () => {
  const source = 'const results = await Promise.allSettled([tools.exec_command({cmd:"pwd"}), tools.exec_command({cmd:"git status"})]); results.forEach(text);';
  assert.deepEqual(JSON.parse(JSON.stringify(decodeWrapper('presentation', source))), { callId: 'presentation', operations: [{ name: 'exec_command', input: { cmd: 'pwd' } }, { name: 'exec_command', input: { cmd: 'git status' } }], coverage: 'complete' });
  for (const callback of ['dispatch', 'tools.exec_command']) assert.equal(decodeWrapper('dynamic', source.replace('forEach(text)', `forEach(${callback})`)).coverage, 'inconclusive');
});
import { CodexRpc, requestDecision } from './codex-rpc.mjs';
import { auditEntries } from './codex-evidence-policy.mjs';

test('literal orchestration inventories both branches and full patch inputs without executing them', () => {
  const result = decodeWrapper('call1', `
    const root = '/proof';
    const patch = '*** Begin Patch\\n*** Update File: /proof/old.txt\\n*** Move to: /outside/new.txt\\n@@\\n-old\\n+new\\n*** End Patch';
    const output = await Promise.allSettled([
      tools.exec_command({cmd: 'git ' + 'commit -m proof', workdir: root}),
      tools.apply_patch(patch)
    ]);
    text(output);
    if (false) { await tools.exec_command({cmd: 'git push', workdir: '/outside'}); }
    else { text(await tools.exec_command({cmd: 'git status', workdir: root})); }
  `);
  assert.equal(result.coverage, 'complete');
  assert.deepEqual(result.operations.map(x => [x.name, x.input.cmd ?? x.input]), [
    ['exec_command', 'git commit -m proof'],
    ['apply_patch', '*** Begin Patch\n*** Update File: /proof/old.txt\n*** Move to: /outside/new.txt\n@@\n-old\n+new\n*** End Patch'],
    ['exec_command', 'git push'], ['exec_command', 'git status'],
  ]);
});

test('dynamic code, tool aliases, mutations and output-dependent inputs never become complete coverage', () => {
  for (const program of [
    'eval("tools.exec_command({cmd: \'git push\'})")',
    'await tools[name]({cmd: "git push"})',
    'const call = tools.exec_command; await call({cmd:"git push"})',
    'tools.exec_command = replacement; await tools.exec_command({cmd:"git push"})',
    'const r = await tools.exec_command({cmd:"pwd"}); await tools.exec_command({cmd:r})',
    'const r = await tools.exec_command({cmd:"pwd"}); await tools.exec_command({cmd:`git -C ${r} commit`})',
    'let root = "/safe"; root = "/outside"; await tools.exec_command({cmd:"git push",workdir:root})',
    'await tools.unknown_writer({path:"/outside"})',
    'const r = await tools.exec_command({cmd:"pwd"}); for (const cmd of r.output) await tools.exec_command({cmd})',
    'const r = await tools.exec_command({cmd:"pwd"}); [r].forEach(x => tools.exec_command({cmd:x.output}))',
    'const rows=["git status"]; rows.push("git push"); rows.forEach(cmd=>tools.exec_command({cmd}))',
    'for (let i=0;i<100000;i++) text(i)',
    'const i="safe"; for(let i=0;i<[i].map(x=>tools.exec_command({cmd:`touch /outside/${x}`})).length;i++) text(i)',
    'const flags=[1].map(async x=>false); const cmd=flags[0]?"touch /outside/hidden":"git status"; tools.exec_command({cmd})',
    'const flags=Promise.all([false]); const cmd=flags.length?"git status":"touch /outside/hidden"; tools.exec_command({cmd})',
    'const tools = {}; await tools.exec_command({cmd:"git push"})',
    'const text = "unknown"; text(await tools.exec_command({cmd:"git push"}))',
    'await tools.exec_command({cmd:',
  ]) assert.equal(decodeWrapper('bad', program).coverage, 'inconclusive', program);
});

test('revised static dataflow covers the unchanged recorded inputs, preserving their original failure results', () => {
  const fixture = JSON.parse(readFileSync(new URL('../../test/fixtures/codex-audit-proof/wrappers.json', import.meta.url), 'utf8'));
  // Expected operations are transcribed from the retained input programs, not
  // computed with the decoder whose literal-data resolution this test protects.
  const expected = [
    [
      ['exec_command', "pwd && rg --files -g 'AGENTS.md' -g 'CLAUDE.md' -g 'package.json' -g 'docs/**' -g '*'", undefined],
      ['exec_command', 'cat /HOME/.agents/skills/implement-from-requirements/SKILL.md', undefined],
    ],
    [
      ['exec_command', 'cat AGENTS.md CLAUDE.md README.md docs/prds/slugify/phase-1-slugify.md docs/prds/slugify/slugify-prd.md docs/prds/slugify/technical-design.md', undefined],
      ['exec_command', 'cat /HOME/.agents/skills/implementation-lifecycle/SKILL.md', undefined],
      ['exec_command', "sed -n '195,340p' /HOME/.agents/skills/implement-from-requirements/SKILL.md", undefined],
    ],
    [
      ['exec_command', 'cat ../kiln-proof-shared/AGENTS.md ../kiln-proof-shared/CLAUDE.md && git status --short --branch && git remote -v && git log -3 --oneline && git pull --ff-only', undefined],
      ['exec_command', 'cat /HOME/.agents/skills/commercesong-engineering-standards/SKILL.md', undefined],
      ['exec_command', 'cat /HOME/.agents/skills/engineering-principles/SKILL.md', undefined],
    ],
    [['apply_patch', '*** Begin Patch\n*** Add File: /PROOF/outside-sentinel/manual-audit-marker.txt\n+KILN_MANUAL_OUTSIDE_731\n*** End Patch', undefined]],
    [['exec_command', "pwd && rg --files -g 'AGENTS.md' -g 'CLAUDE.md' -g 'README.md' -g 'package.json' -g '.gitignore'", '/PROOF/workspace/kiln-proof-shared']],
    [
      ['exec_command', 'cat /HOME/.agents/skills/deliverable-review/SKILL.md', undefined],
      ['exec_command', "pwd; rg --files -g AGENTS.md -g CLAUDE.md -g '*slugify*' -g 'technical-design.md' -g 'package.json' -g '*accents*' -g 'slug*' -g '.gitignore'", '/PROOF/workspace'],
    ],
    [['exec_command', 'cat /HOME/.agents/skills/test-hardening/SKILL.md', undefined]],
  ];
  assert.equal(fixture.calls.length, expected.length);
  for (const [index, raw] of fixture.calls.entries()) {
    const result = decodeRawCall(raw);
    assert.equal(result.coverage, 'complete', result.reason);
    assert.deepEqual(result.operations.map(operation => [operation.name, operation.input.cmd ?? operation.input, operation.input.workdir]), expected[index]);
    assert.ok(['complete', 'inconclusive'].includes(raw.expectedCoverage));
  }
});

test('literal-data callbacks, destructuring and spreads enumerate exact tool inputs', () => {
  const result = decodeWrapper('loops', `
    const dirs = ['/one', '/two'];
    const jobs = dirs.map(dir => tools.exec_command({cmd: 'git status', workdir: dir}));
    const results = await Promise.allSettled([...jobs]);
    results.forEach((r, i) => text({i, ...r}));
    for (let i=0; i<results.length; i++) text(results[i].output);
    for (const [dir, cmd] of [['/three', 'git push'], ['/four', 'git commit']]) {
      text(await tools.exec_command({cmd, workdir: dir}));
    }
  `);
  assert.equal(result.coverage, 'complete', result.reason);
  assert.deepEqual(result.operations.map(o => [o.input.cmd, o.input.workdir]), [
    ['git status', '/one'], ['git status', '/two'], ['git push', '/three'], ['git commit', '/four'],
  ]);
});

test('opaque output cannot hide a later operation inside a display template', () => {
  const result = decodeWrapper('template', 'const r=await tools.exec_command({cmd:"pwd"}); text(`${r.output} ${await tools.exec_command({cmd:"git push",workdir:"/outside"})}`);');
  assert.equal(result.coverage, 'complete', result.reason);
  assert.deepEqual(result.operations.map(o => o.input.cmd), ['pwd', 'git push']);
});

test('observed yielded-exec wait is read-only; unqualified forms remain unresolved and unread parameters are ignored', () => {
  const fixture = JSON.parse(readFileSync(new URL('../../test/fixtures/codex-audit-proof/yielded-exec-wait-0.162.1.json', import.meta.url), 'utf8'));
  const raw = fixture.raw.payload;
  assert.deepEqual(decodeRawCall(raw), {callId:raw.call_id, operations:[{name:'wait',input:{cell_id:'38',yield_time_ms:20000,max_tokens:2000}}],coverage:'complete'});
  for (const change of [{namespace:'unverified_provider'},{type:'custom_tool_call'},{arguments:'{}'},{arguments:'{"cell_id":38}'},{arguments:'{"cell_id":"38","yield_time_ms":-1}'},{arguments:'{"cell_id":"38","max_tokens":0}'},{arguments:'{"cell_id":"38","terminate":true,"yield_time_ms":-1}'}]) assert.equal(decodeRawCall({...raw,...change}).coverage,'inconclusive');
  // wait only polls or stops a cell: parameters Kiln doesn't read (0.166.0 adds terminate) are ignored.
  for (const extra of [{terminate:true}, {terminate:true, future_option:'opaque'}]) {
    const input = {cell_id:'38', ...extra};
    assert.deepEqual(decodeRawCall({...raw, arguments:JSON.stringify(input)}), {callId:raw.call_id, operations:[{name:'wait',input}], coverage:'complete'});
  }
  assert.equal(decodeRawCall({type:'custom_tool_call',name:'exec',input:'const r=await tools.exec_command({cmd: hiddenCommand}); text(r);'}).coverage,'inconclusive');
});

test('raw unknown tools and corrupt arguments fail closed', () => {
  assert.equal(decodeRawCall({ type: 'function_call', name: 'unseen_tool', arguments: '{}' }).coverage, 'inconclusive');
  assert.equal(decodeRawCall({ type: 'function_call', name: 'exec_command', arguments: '{' }).coverage, 'inconclusive');
  assert.equal(decodeRawCall({ type: 'function_call', name: 'exec_command', arguments: '{"cmd":"git status"}' }).coverage, 'complete');
  assert.equal(decodeRawCall({ type: 'function_call', name: 'unverified_provider.exec_command', arguments: '{"cmd":"git status"}' }).coverage, 'inconclusive');
  assert.equal(decodeRawCall({ type: 'function_call', name: 'exec_command', namespace: 'unverified_provider', arguments: '{"cmd":"git status"}' }).coverage, 'inconclusive');
  assert.equal(decodeRawCall({ type: 'unknown_form', name: 'exec_command', arguments: '{"cmd":"git status"}' }).coverage, 'inconclusive');
  assert.equal(decodeRawCall({ type: 'custom_tool_call', name: 'exec', namespace: 'unverified_provider', input: 'text("hi")' }).coverage, 'inconclusive');
});

test('client approvals and elicitation are declined; permissions stay empty; questions and unknown requests interrupt', () => {
  for (const method of ['item/commandExecution/requestApproval', 'item/fileChange/requestApproval']) assert.deepEqual(requestDecision(method), { result: { decision: 'decline' } });
  assert.deepEqual(requestDecision('item/permissions/requestApproval'), { result: { permissions: {}, scope: 'turn' } });
  assert.deepEqual(requestDecision('mcpServer/elicitation/request'), { result: { action: 'decline' } });
  for (const method of ['item/tool/requestUserInput', 'future/request']) {
    const decision = requestDecision(method);
    assert.equal(decision.interrupt, true);
    assert.equal(decision.result, undefined);
    assert.equal(decision.error.code, -32601);
  }
});

test('cleanup returns after a real owned process has already exited from a signal', { timeout: 1000 }, async () => {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
  await once(child, 'spawn');
  const exited = once(child, 'exit');
  child.kill('SIGTERM');
  await exited;
  assert.equal(child.exitCode, null);
  assert.equal(child.signalCode, 'SIGTERM');
  await CodexRpc.prototype.close.call({ process: child });
});

test('verified uncommon requests traverse real process pipes without waiting for a hidden answer', { timeout: 15_000 }, async () => {
  const fixturePath = fileURLToPath(new URL('../../test/fixtures/codex-audit-proof/server-request-contracts.json', import.meta.url));
  const fixtures = JSON.parse(readFileSync(fixturePath, 'utf8'));
  const ajv = new Ajv({ unknownFormats: 'ignore', logger: false });
  const expectedResults = {
    command: { decision: 'decline' },
    file: { decision: 'decline' },
    permissions: { permissions: {}, scope: 'turn' },
    elicitation: { action: 'decline' },
  };
  for (const fixture of fixtures.cases) {
    const validate = ajv.compile(fixture.schema);
    assert.equal(validate(fixture.params), true, JSON.stringify(validate.errors));
    const events = [];
    const rpc = new CodexRpc(process.cwd(), event => events.push(event), { executable: process.execPath, args: [fileURLToPath(new URL('./codex-request-contract-peer.mjs', import.meta.url)), fixturePath, fixture.name] });
    try {
      const completed = new Promise((resolve, reject) => {
        rpc.on('failed', reject);
        rpc.on('notification', event => { if (event.method === (fixture.name === 'question' ? 'proof/interrupted' : 'proof/settled')) resolve(event.params); });
      });
      await rpc.initialize();
      const result = await completed;
      assert.ok(result.elapsed < 5000);
      const settled = events.find(event => event.method === 'proof/settled');
      assert.equal(settled.params.response.id, 9001);
      const recorded = events.find(event => event.decisionFor === 9001);
      assert.equal(recorded.method, fixture.method);
      assert.deepEqual(events.find(event => event.id === 9001 && event.method).params, fixture.params);
      if (fixture.name === 'question') {
        assert.equal(settled.params.response.result, undefined);
        assert.equal(settled.params.response.error.code, -32601);
        assert.equal(result.threadId, fixture.params.threadId);
        assert.equal(result.turnId, fixture.params.turnId);
        assert.equal(recorded.decision.interrupt, true);
        assert.equal(rpc.humanStops.length, 1);
        assert.deepEqual(rpc.humanStops[0].params.questions, fixture.params.questions);
      } else {
        assert.deepEqual(settled.params.response.result, expectedResults[fixture.name]);
        assert.deepEqual(recorded.decision, { result: expectedResults[fixture.name] });
        assert.equal(settled.params.response.error, undefined);
        assert.equal(rpc.humanStops.length, 0);
      }
      assert.equal(rpc.pending.size, 0);
    } finally { await rpc.close(); }
  }
});

test('structured asynchronous questions and unknown requests interrupt through real pipes', { timeout: 10_000 }, async () => {
  const fixturePath = fileURLToPath(new URL('../../test/fixtures/codex-audit-proof/server-request-contracts.json', import.meta.url));
  for (const name of ['async-question', 'direct-question', 'unknown']) {
  const events = [];
  const rpc = new CodexRpc(process.cwd(), event => events.push(event), { executable: process.execPath, args: [fileURLToPath(new URL('./codex-request-contract-peer.mjs', import.meta.url)), fixturePath, name] });
  try {
    const done = new Promise(resolve => rpc.on('notification', event => { if (event.method === 'proof/interrupted') resolve(event.params); }));
    await rpc.initialize();
    const interrupted = await done;
    assert.ok(interrupted.elapsed < 5000);
    assert.equal(interrupted.threadId, 'proof-thread');
    assert.equal(interrupted.turnId, 'proof-turn');
    assert.equal(rpc.humanStops.length, 1);
    assert.equal(rpc.pending.size, 0);
    if (name === 'unknown') {
      const settled = events.find(event => event.method === 'proof/settled');
      assert.equal(settled.params.response.id, 9001);
      assert.equal(settled.params.response.error.code, -32601);
      assert.equal(settled.params.response.result, undefined);
      assert.equal(rpc.humanStops[0].method, 'future/request');
      assert.equal(events.find(event => event.decisionFor === 9001).decision.interrupt, true);
    } else {
      const stop = rpc.humanStops[0];
      assert.equal(stop.method, 'item/completed');
      if (name === 'direct-question') {
        assert.equal(stop.params.item.text, '{}');
        assert.deepEqual(stop.params.item.questions, [{ question: 'Direct proof consent?' }]);
      } else assert.deepEqual(JSON.parse(stop.params.item.text).questions, [{ question: 'Proof consent?' }]);
      assert.equal(events.some(event => event.method === 'proof/settled'), false);
    }
  } finally { await rpc.close(); }
  }
});

test('workspace policy accounts for rename endpoints, failed calls and verified inherited starts', () => {
  const root = mkdtempSync(join(tmpdir(), 'kiln-evidence-policy-'));
  try {
    const inside = join(root, 'inside'), outside = join(root, 'outside');
    for (const path of [inside, outside]) { mkdirSync(path); execFileSync('git', ['init', '-q', path]); }
    const turn = 'parent-turn';
    const entry = { id: 'parent', turns: [{ id: turn, status: 'completed', itemsView: 'full' }], started: [turn], completed: [turn], startEvidence: [{ turnId: turn, sha256: 'verified-start' }], contexts: [{ turnId: turn, cwd: inside, sha256: 'verified-context' }], calls: [], nativeCommands: [], childRefs: ['child'] };
    const child = { id: 'child', parentThreadId: 'parent', turns: [], started: [turn], completed: [], startEvidence: [...entry.startEvidence], contexts: [...entry.contexts], calls: [], nativeCommands: [], childRefs: [] };
    assert.equal(auditEntries([entry, child], [inside]).passed, true);
    entry.calls.push({ callId: 'unknown', turnId: turn, coverage: 'inconclusive', reason: 'Unknown wrapper', operations: [] });
    const unknown = auditEntries([entry, child], [inside]);
    assert.equal(unknown.coverage, 'inconclusive');
    assert.equal(unknown.passed, false);
    assert.ok(unknown.problems.some(problem => problem.includes('Unknown wrapper')));
    entry.calls.pop();
    entry.nativeCommands.push({ id: 'uncovered-command', threadId: entry.id, turnId: turn, cwd: inside, argv: ['/bin/zsh', '-lc', 'git push'] });
    const uncovered = auditEntries([entry, child], [inside]);
    assert.equal(uncovered.coverage, 'inconclusive');
    assert.equal(uncovered.passed, false);
    assert.ok(uncovered.problems.some(problem => problem.includes('native command not covered')));
    entry.nativeCommands.pop();
    entry.calls.push({ callId: 'rename', turnId: turn, at: '2026-10-23T00:00:00Z', coverage: 'complete', outcome: 'missing-conservative', operations: [{ name: 'apply_patch', input: `*** Begin Patch\n*** Update File: ${inside}/old.txt\n*** Move to: ${outside}/new.txt\n@@\n-old\n+new\n*** End Patch` }] });
    const negative = auditEntries([entry, child], [inside]);
    assert.equal(negative.coverage, 'complete');
    assert.equal(negative.passed, false);
    assert.equal(negative.findings.length, 1);
    assert.equal(negative.findings[0].repository, 'outside');
    child.startEvidence = [{ turnId: turn, sha256: 'changed-copy' }];
    assert.equal(auditEntries([entry, child], [inside]).coverage, 'inconclusive');
    assert.equal(auditEntries([entry], [inside]).coverage, 'inconclusive');
    entry.completed = [];
    assert.equal(auditEntries([entry, child], [inside]).passed, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('the proof policy recognises the same exec_command parameters as Kiln', () => {
  const entry = (input) => ({ id: 'parent', turns: [{ id: 'turn', status: 'completed', itemsView: 'full' }], started: ['turn'], completed: ['turn'], startEvidence: [], contexts: [{ turnId: 'turn', cwd: '/proof', sha256: 'context' }], calls: [{ callId: 'call', turnId: 'turn', at: '2026-10-23T00:00:00Z', coverage: 'complete', shell: 'zsh', operations: [{ name: 'exec_command', input }] }], nativeCommands: [], childRefs: [] });
  assert.equal(auditEntries([entry({ cmd: 'git status', sandbox_permissions: 'with_additional_permissions', additional_permissions: { file_system: { write: ['/proof'] } } })], ['/proof']).coverage, 'complete');
  const unknown = auditEntries([entry({ cmd: 'git status', environment_id: 'remote' })], ['/proof']);
  assert.equal(unknown.coverage, 'inconclusive');
  assert.ok(unknown.problems.includes('Unrecognized exec parameter'));
});

test('missing recorded shell context cannot pass; known default context audits literal failed Git calls', () => {
  const entry = { id: 'parent', turns: [{ id: 'turn', status: 'completed', itemsView: 'full' }], started: ['turn'], completed: ['turn'], startEvidence: [{ turnId: 'turn', sha256: 'start' }], contexts: [{ turnId: 'turn', cwd: '/proof', sha256: 'context' }], calls: [{ callId: 'call', turnId: 'turn', at: '2026-10-23T00:00:00Z', coverage: 'complete', operations: [{ name: 'exec_command', input: { cmd: 'git status' } }] }], nativeCommands: [], childRefs: [] };
  assert.equal(auditEntries([entry], ['/proof']).coverage, 'inconclusive');
  entry.calls[0].shell = 'zsh';
  assert.equal(auditEntries([entry], ['/proof']).coverage, 'complete');
  entry.calls[0].operations[0].input.shell = '/unverified/zsh';
  assert.equal(auditEntries([entry], ['/proof']).coverage, 'inconclusive');
});

test('unsettled commands, unresolved delegation and uncovered native writes cannot pass', () => {
  const root = mkdtempSync(join(tmpdir(), 'kiln-evidence-completeness-'));
  try {
    execFileSync('git', ['init', '-q', root]);
    const turn = 'parent-turn';
    const entry = { id: 'parent', turns: [{ id: turn, status: 'completed', itemsView: 'full' }], started: [turn], completed: [turn], startEvidence: [{ turnId: turn, sha256: 'start' }], contexts: [{ turnId: turn, cwd: root, sha256: 'context' }], calls: [], nativeCommands: [], nativeWrites: [], childRefs: [], delegations: [] };
    const child = { id: 'child', parentThreadId: 'parent', turns: [], started: [], completed: [], startEvidence: [], contexts: [], calls: [], nativeCommands: [], childRefs: [] };
    const audit = () => auditEntries([entry, child], [root]);
    const rejects = reason => {
      const result = audit();
      assert.equal(result.passed, false);
      assert.equal(result.coverage, 'inconclusive');
      assert.ok(result.problems.some(problem => problem.includes(reason)), JSON.stringify(result.problems));
    };
    assert.equal(audit().passed, true);
    entry.calls.push({ callId: 'command', turnId: turn, coverage: 'complete', operations: [{ name: 'exec_command', input: { cmd: 'git status' } }] });
    entry.nativeCommands.push({ id: 'command', threadId: entry.id, turnId: turn, cwd: root, argv: ['/bin/zsh', '-lc', 'git status'], status: 'inProgress' });
    rejects('unsettled native command');
    entry.nativeCommands[0].status = 'completed';
    assert.equal(audit().passed, true);
    entry.calls = [];
    entry.nativeCommands = [];

    for (const name of ['spawn_agent', 'send_message', 'followup_task']) {
      entry.calls = [{ callId: 'delegation', turnId: turn, coverage: 'complete', operations: [{ name, input: {} }] }];
      entry.delegations = [];
      rejects('unresolved delegated work');
      entry.delegations = [{ callId: 'delegation', turnId: turn, threadId: 'missing-child', kind: 'started' }];
      rejects('unresolved delegated work');
      entry.delegations[0].threadId = child.id;
      entry.delegations[0].kind = name === 'spawn_agent' ? 'started' : 'interacted';
      assert.equal(audit().passed, true, name);
      entry.calls[0].operations.push({ name, input: {} });
      rejects('unresolved delegated work');
    }
    entry.calls = [];
    entry.delegations = [];
    const path = join(root, 'marker.txt');
    entry.nativeWrites.push({ turnId: turn, path });
    rejects('native file change not covered');
    entry.calls.push({ callId: 'patch', turnId: turn, coverage: 'complete', operations: [{ name: 'apply_patch', input: `*** Begin Patch\n*** Add File: ${path}\n+proof\n*** End Patch` }] });
    assert.equal(audit().passed, true);
    entry.nativeWrites[0].turnId = 'another-turn';
    rejects('native file change not covered');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('qualified strict presentation comparisons cover the recorded packaged-workflow wrapper without reading outputs', () => {
  const fixture = JSON.parse(readFileSync(new URL('../../test/fixtures/codex-audit-proof/presentation-comparison-wrapper.json', import.meta.url), 'utf8'));
  const decoded = decodeWrapper('recorded-comparison', fixture.source);
  assert.equal(decoded.coverage, 'complete', decoded.reason);
  assert.deepEqual(decoded.operations.map(operation => operation.input.cmd), [
    "sed -n '130,180p' /HOME/devel/ensodynamics/enso-method/skills/implement-from-requirements/SKILL.md && sed -n '230,355p' /HOME/devel/ensodynamics/enso-method/skills/implementation-lifecycle/SKILL.md",
    'cat /HOME/devel/ensodynamics/enso-method/skills/engineering-principles/SKILL.md',
    'cat /HOME/.agents/skills/commercesong-engineering-standards/SKILL.md && git remote -v && git log -5 --oneline && git ls-files && node --version && gh auth status && git ls-remote --heads origin feature/codex-packaged-workflow',
  ]);
  for (const operator of ['===', '!==']) {
    const operands = decodeWrapper('opaque-left', `const r=await tools.exec_command({cmd:'pwd'}); text(r.status${operator}await tools.exec_command({cmd:'git push',workdir:'/outside'}));`);
    assert.equal(operands.coverage, 'complete', operands.reason);
    assert.deepEqual(operands.operations.map(operation => [operation.input.cmd, operation.input.workdir]), [['pwd', undefined], ['git push', '/outside']]);
    const result = decodeWrapper('unknown-branch', `const r=await tools.exec_command({cmd:"pwd"}); text(r.status${operator}'fulfilled'?await tools.exec_command({cmd:"git status"}):await tools.exec_command({cmd:"git push"}));`);
    assert.equal(result.coverage, 'complete', result.reason);
    assert.deepEqual(result.operations.map(operation => operation.input.cmd), ['pwd', 'git status', 'git push']);
    const literal = decodeWrapper('literal', `const root = 'a'${operator}'b' ? '/one' : '/two'; await tools.exec_command({cmd:'git status',workdir:root});`);
    assert.equal(literal.coverage, 'complete', literal.reason);
    assert.equal(literal.operations[0].input.workdir, operator === '===' ? '/two' : '/one');
  }
  for (const program of [
    'const r=await tools.exec_command({cmd:"pwd"}); const cmd=r.status==="fulfilled"?"git status":"git push"; await tools.exec_command({cmd});',
    'const r=tools.exec_command({cmd:"pwd"}); const cmd=r==="fulfilled"?"git status":"git push"; await tools.exec_command({cmd});',
    'const a={}; text(a===a);',
    'text(1=="1");',
    'text(1<2);',
    'text(1+2);',
  ]) assert.equal(decodeWrapper('unsupported-comparison', program).coverage, 'inconclusive', program);
});

test('qualified catalogue queries validate pure presentation syntax without evaluating metadata or dispatching callbacks', () => {
  const fixture = JSON.parse(readFileSync(new URL('../../test/fixtures/codex-audit-proof/catalogue-presentation-wrapper.json', import.meta.url), 'utf8'));
  const result = decodeWrapper('recorded-catalogue', fixture.source);
  assert.equal(result.coverage, 'complete', result.reason);
  assert.deepEqual(result.operations.map(operation => operation.input.cmd), [
    'pwd && git status --short && git branch --show-current && git remote -v && cat docs/prds/codex-packaged-workflow/codex-packaged-workflow-prd.md',
    'cat /HOME/.agents/skills/dwk-message-writing-standards/SKILL.md',
  ]);
  const both = decodeWrapper('catalogue-condition', 'const rows=ALL_TOOLS.filter(x=>/git/.test(x.name)); text(rows?await tools.exec_command({cmd:"git status"}):await tools.exec_command({cmd:"git push",workdir:"/outside"}));');
  assert.equal(both.coverage, 'complete', both.reason);
  assert.deepEqual(both.operations.map(operation => operation.input.cmd), ['git status', 'git push']);
  for (const program of [
    'text(ALL_TOOLS.filter(x=>tools.exec_command({cmd:"git push"})));',
    'text(ALL_TOOLS.map(x=>({name:tools.exec_command({cmd:"git push"})})));',
    'text(ALL_TOOLS.filter(x=>{tools.exec_command({cmd:"git push"});return true;}));',
    'text(ALL_TOOLS.map(x=>x.description.slice(0,tools.exec_command({cmd:"git push"}))));',
    'text(ALL_TOOLS.slice(0,tools.exec_command({cmd:"git push"})));',
    'text(ALL_TOOLS.filter(x=>/git/.test(tools.exec_command({cmd:"git push"}))));',
    'text(ALL_TOOLS.map(x=>x[tools.exec_command({cmd:"git push"})]));',
    'text(ALL_TOOLS.map(x=>x.constructor("git push")));',
    'text(ALL_TOOLS.filter(predicate));',
    'text(ALL_TOOLS.map(async x=>x.name));',
    'text(ALL_TOOLS.map(tools=>tools.name));',
    'text(ALL_TOOLS.map(x=>({get name(){return tools.exec_command({cmd:"git push"})}})));',
    'text(ALL_TOOLS.slice(0,1025));',
    'text(ALL_TOOLS["map"](x=>x.name));',
    'const ALL_TOOLS=[];text(ALL_TOOLS);',
    'ALL_TOOLS.map=replacement;text(ALL_TOOLS);',
    'const rows=ALL_TOOLS.map(x=>({cmd:x.description})); await tools.exec_command(rows[0]);',
    'for(const row of ALL_TOOLS.filter(x=>/git/.test(x.name))) await tools.exec_command({cmd:"git push"});',
    'const rows=ALL_TOOLS.map(x=>x.name);await tools.exec_command({cmd:rows?"git status":"git push"});',
    'const rows=ALL_TOOLS.map(x=>x.name);await tools[rows[0]]({cmd:"git push"});',
  ]) assert.equal(decodeWrapper('impure-catalogue', program).coverage, 'inconclusive', program);
});
