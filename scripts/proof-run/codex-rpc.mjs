// Isolated prerequisite proof transport, not Kiln's execution adapter.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { EventEmitter } from 'node:events';
import { setTimeout, clearTimeout } from 'node:timers';

export function requestDecision(method) {
  if (['item/commandExecution/requestApproval', 'item/fileChange/requestApproval'].includes(method)) return { result: { decision: 'decline' } };
  if (method === 'item/permissions/requestApproval') return { result: { permissions: {}, scope: 'turn' } };
  if (method === 'mcpServer/elicitation/request') return { result: { action: 'decline' } };
  return { error: { code: -32601, message: 'No unattended human answer is available' }, interrupt: true };
}

export class CodexRpc extends EventEmitter {
  pending = new Map();
  sequence = 0;
  terminal = new Map();
  stopped = false;
  humanStops = [];

  constructor(cwd, record, peer = { executable: 'codex', args: ['app-server', '--listen', 'stdio://'] }) {
    super();
    this.record = record;
    this.process = spawn(peer.executable, peer.args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    createInterface({ input: this.process.stdout }).on('line', line => {
      try { this.receive(JSON.parse(line)); } catch (error) { this.fail(error); }
    });
    this.process.stderr.on('data', chunk => record({ stderr: chunk.toString() }));
    this.process.on('error', error => this.fail(error));
    this.process.on('exit', (code, signal) => this.fail(new Error(`app-server exited ${code}/${signal}`)));
  }

  fail(error) {
    this.stopped = true;
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
    this.emit('failed', error);
  }

  send(message) {
    if (this.stopped) throw new Error('app-server is stopped');
    this.process.stdin.write(JSON.stringify(message) + '\n');
  }

  receive(message) {
    this.record(message);
    if (message.method && message.id !== undefined) {
      const decision = requestDecision(message.method);
      this.send({ id: message.id, ...(decision.result ? { result: decision.result } : { error: decision.error }) });
      this.record({ decisionFor: message.id, method: message.method, decision, at: new Date().toISOString() });
      if (decision.interrupt) this.interruptForHuman(message);
    } else if (message.id !== undefined) {
      const pending = this.pending.get(message.id);
      if (pending) {
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(JSON.stringify(message.error)));
        else pending.resolve(message.result);
      }
    } else {
      if (message.method === 'turn/completed') {
        this.terminal.set(message.params.turn.id, message.params.turn);
        console.log('TURN', message.params.turn.id, message.params.turn.status);
      }
      if (message.method === 'item/completed') {
        const item = message.params.item;
        console.log('ITEM', item.type, item.type === 'agentMessage' ? item.text?.slice(-180) : item.status ?? '');
        const questions = Array.isArray(item.questions) ? [...item.questions] : [];
        if (item.type === 'agentMessage' && typeof item.text === 'string' && item.text.trimStart().startsWith('{')) {
          try {
            const parsed = JSON.parse(item.text).questions;
            if (Array.isArray(parsed)) questions.push(...parsed);
          } catch { /* Ordinary prose is not a structured question. */ }
        }
        if (questions.length) this.interruptForHuman(message);
      }
      this.emit('notification', message);
    }
  }

  interruptForHuman(message) {
    this.humanStops.push(message);
    const { threadId, turnId } = message.params ?? {};
    if (threadId && turnId) void this.call('turn/interrupt', { threadId, turnId }).catch(error => this.fail(error));
    else this.fail(new Error(`Cannot place human request ${message.method}`));
  }

  call(method, params, timeout = 30_000) {
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`${method} deadline exceeded`)); }, timeout);
      this.pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
      try { this.send({ id, method, params }); } catch (error) { this.pending.get(id).reject(error); this.pending.delete(id); }
    });
  }

  async initialize() {
    await this.call('initialize', { clientInfo: { name: 'kiln_audit_proof', version: '0.1.0' }, capabilities: { experimentalApi: true } });
    this.send({ method: 'initialized' });
  }

  async waitTurn(turnId) {
    if (this.terminal.has(turnId)) return this.terminal.get(turnId);
    return new Promise((resolve, reject) => {
      const cleanup = () => { this.off('notification', changed); this.off('failed', failed); };
      const changed = () => { if (this.terminal.has(turnId)) { cleanup(); resolve(this.terminal.get(turnId)); } };
      const failed = error => { cleanup(); reject(error); };
      this.on('notification', changed);
      this.on('failed', failed);
      if (this.stopped) failed(new Error('app-server stopped before terminal turn'));
    });
  }

  async close() {
    if (this.process.exitCode !== null || this.process.signalCode !== null) return;
    await new Promise(resolve => {
      const timer = setTimeout(() => this.process.kill('SIGTERM'), 5000);
      const force = setTimeout(() => this.process.kill('SIGKILL'), 10_000);
      this.process.once('exit', () => { clearTimeout(timer); clearTimeout(force); resolve(); });
      this.process.stdin.end();
    });
  }
}
