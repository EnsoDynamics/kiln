#!/usr/bin/env node
// Exploration script — not part of the main program.
// For kiln-find-repositories-anywhere, AC-FIND-05: runs Kiln's real repository search (the built
// dist/engine/repository-search.js, Git reads included) against the real home folder, then reads
// the macOS unified log's TCC subsystem for the search's window and reports every privacy access
// request whose accessing process is this one, or a git it ran. Prints counts only, never folder
// names. Reads; never writes, never changes a setting. Run `npm run build` first.
//
// Usage: node scripts/exploration/real-search-tcc-log.mjs <a PRD repository's main checkout>

import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const { searchCheckouts, homeFolder } = await import(new URL('../../dist/engine/repository-search.js', import.meta.url).href);
const prd = path.resolve(process.argv[2] ?? process.cwd());
const fmt = (d) => d.toISOString().replace('T', ' ').slice(0, 19);
const local = (d) => fmt(new Date(d.getTime() - d.getTimezoneOffset() * 60000));
const t0 = new Date(Date.now() - 1000);
const began = process.hrtime.bigint();
const result = await searchCheckouts({ git: { git: 'git', env: process.env }, prdMainCheckoutPath: prd, home: homeFolder(process.env) });
const ms = Number(process.hrtime.bigint() - began) / 1e6;
await new Promise((r) => setTimeout(r, 5000)); // let the log flush
const t1 = new Date(Date.now() + 1000);
const log = execFileSync('/usr/bin/log', ['show', '--style', 'compact', '--start', local(t0), '--end', local(t1), '--predicate', 'subsystem == "com.apple.TCC"'], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
const lines = log.split('\n');
// The search's own process, or a git it ran (whose parent is this process).
const ours = new Set(lines.filter((l) => l.includes('AUTHREQ_ATTRIBUTION') && (l.includes(`accessing={TCCDProcess: identifier=node, pid=${process.pid},`) || /accessing=\{TCCDProcess: identifier=(com\.apple\.)?git/.test(l)))
  .map((l) => l.match(/msgID=([\d.]+)/)?.[1]));
const services = lines.filter((l) => l.includes('AUTHREQ_CTX') && ours.has(l.match(/msgID=([\d.]+)/)?.[1])).map((l) => l.match(/service=(\w+)/)?.[1]);
console.log(JSON.stringify({ pid: process.pid, home: os.homedir() === homeFolder(process.env), roots: result.roots.length, searchMs: Math.round(ms), foldersListed: result.listed.length, checkoutsFound: result.checkouts.length, unreadable: result.unreadable.length, tccLinesInWindow: Math.max(0, lines.length - 2), requestsBySearch: services }, null, 2));
