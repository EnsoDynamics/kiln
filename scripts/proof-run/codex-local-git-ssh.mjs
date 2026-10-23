// Disposable Git transport: two exact Git commands, one owned local bare origin; no network.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
const [root, ...args] = process.argv.slice(2);
const commands = new Map([['git-upload-pack \'kiln-proof-fixture/kiln-proof-extra.git\'', 'git-upload-pack'], ['git-receive-pack \'kiln-proof-fixture/kiln-proof-extra.git\'', 'git-receive-pack']]);
const command = commands.get(args.at(-1));
if (!command || !args.includes('git@github.com')) process.exit(1);
const result = spawnSync(command, [join(root, 'kiln-proof-extra.git')], { stdio: 'inherit' });
process.exit(result.status ?? 1);
