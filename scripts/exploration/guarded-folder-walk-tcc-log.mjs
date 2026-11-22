#!/usr/bin/env node
// Exploration for kiln-find-repositories-anywhere, AC-FIND-05 (the search never raises a
// permission prompt). Walks the search roots under the technical design's rules ("The search")
// using only directory listings and lstat, then reads the macOS unified log's TCC subsystem for
// the walk's window and reports every privacy access request whose accessing process is this
// one. Prints counts only, never folder names. Reads; never writes, never changes a setting.
//
// Usage: node scripts/exploration/guarded-folder-walk-tcc-log.mjs <the PRD repository's parent folder>
//
// A request is logged even when the terminal already holds the grant (the prompt is then hidden,
// the request is not), so a clean log is meaningful on a machine with per-folder grants.
// It is not meaningful under Full Disk Access for the AllFiles category alone.

import { readdir, lstat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const GUARDED = new Set(['desktop', 'documents', 'downloads', 'library', 'pictures', 'music', 'movies']);
const DEPTH = 4;

const home = os.homedir();
const start = path.resolve(process.argv[2] ?? process.cwd());
if (!start.startsWith(home + path.sep) && start !== home) throw new Error('start must be under the home folder for this check');

const roots = [];
for (let p = start; ; p = path.dirname(p)) { roots.push(p); if (p === home) break; }

const stats = { listed: 0, candidates: 0, links: 0, dot: 0, otherDevice: 0, guarded: 0, unlisted: {}, gitFile: 0 };

async function walk(dir, level, dev) {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); stats.listed++; }
  catch (e) { stats.unlisted[e.code] = (stats.unlisted[e.code] ?? 0) + 1; return; }
  if (level > 0) {
    const git = entries.find((e) => e.name === '.git');
    if (git) { if (git.isDirectory()) stats.candidates++; else stats.gitFile++; return; }
  }
  if (level >= DEPTH) return;
  for (const e of entries) {
    if (e.isSymbolicLink()) { stats.links++; continue; }
    if (!e.isDirectory()) continue;
    if (e.name.startsWith('.')) { stats.dot++; continue; }
    if (dir === home && GUARDED.has(e.name.toLowerCase())) { stats.guarded++; continue; }
    const child = path.join(dir, e.name);
    const st = await lstat(child);
    if (st.dev !== dev) { stats.otherDevice++; continue; }
    await walk(child, level + 1, dev);
  }
}

const fmt = (d) => d.toISOString().replace('T', ' ').slice(0, 19);
const t0 = new Date(Date.now() - 1000);
const began = process.hrtime.bigint();
for (const r of roots) await walk(r, 0, (await lstat(r)).dev);
const ms = Number(process.hrtime.bigint() - began) / 1e6;
await new Promise((r) => setTimeout(r, 3000)); // let the log flush
const t1 = new Date(Date.now() + 1000);

// log show takes local time without a zone; convert.
const local = (d) => fmt(new Date(d.getTime() - d.getTimezoneOffset() * 60000));
const log = execFileSync('log', ['show', '--style', 'compact', '--start', local(t0), '--end', local(t1),
  '--predicate', 'subsystem == "com.apple.TCC"'], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

const lines = log.split('\n');
const ours = new Set(lines.filter((l) => l.includes('AUTHREQ_ATTRIBUTION') && l.includes(`accessing={TCCDProcess: identifier=node, pid=${process.pid},`))
  .map((l) => l.match(/msgID=([\d.]+)/)?.[1]));
const services = lines.filter((l) => l.includes('AUTHREQ_CTX') && ours.has(l.match(/msgID=([\d.]+)/)?.[1]))
  .map((l) => l.match(/service=(\w+)/)?.[1]);
const allFile = lines.filter((l) => /service=kTCCService(SystemPolicy|FileProvider)/.test(l)).length;

console.log(JSON.stringify({ pid: process.pid, roots: roots.length, walkMs: Math.round(ms), ...stats,
  tccLinesInWindow: lines.length - 2, fileAccessRequestsInWindowAnyProcess: allFile,
  requestsByThisProcess: services }, null, 2));
