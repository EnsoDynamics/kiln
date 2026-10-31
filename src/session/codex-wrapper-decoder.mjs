// Static syntax/dataflow only: never executes provider JavaScript or reads real tool outputs.
import { parse } from 'acorn';
import { Buffer } from 'node:buffer';
import { posix, win32 } from 'node:path';

const UNKNOWN = Symbol('opaque tool result');
const TOOLS = new Set(['exec_command', 'write_stdin', 'view_image', 'apply_patch', 'spawn_agent', 'send_message', 'wait_agent', 'list_agents', 'followup_task', 'interrupt_agent']);
const OUTPUT = new Set(['text', 'notify', 'image', 'audio', 'generatedImage']);
const RESERVED = new Set(['tools', 'Promise', 'JSON', 'ALL_TOOLS', ...OUTPUT, 'store', 'load']);
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const MAX_ARRAY = 1024;

// This contract only reads an image; no output or destination parameter is admitted.
function imageInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).some(key => !['path', 'detail'].includes(key))
    || typeof input.path !== 'string' || !input.path || !(posix.isAbsolute(input.path) || win32.isAbsolute(input.path))
    || input.detail !== undefined && !['high', 'original'].includes(input.detail)) throw new Error('Unsupported view_image input');
}

export function decodeWrapper(callId, program) {
  const operations = [];
  const taints = new WeakMap();
  const promises = new WeakMap();
  function pending(value) { const promise = Object.create(null); promises.set(promise, value); return promise; }
  function awaited(value) { return value && typeof value === 'object' && promises.has(value) ? promises.get(value) : value; }
  let visited = 0;
  function fail(node, why) { throw new Error(`${why} (${node.type} at ${node.start})`); }
  function isData(value) {
    if (value === UNKNOWN) return false;
    if (!value || typeof value !== 'object') return true;
    if (promises.has(value)) return false;
    if (!taints.has(value)) taints.set(value, Object.values(value).every(isData));
    return taints.get(value);
  }
  function literal(value, node) {
    if (!isData(value)) fail(node, 'Tool input depends on nonliteral data');
    return value;
  }
  function array(value, node) {
    if (!Array.isArray(value) || value.length > MAX_ARRAY) fail(node, 'Unknown or oversized iteration array');
    return value;
  }
  function bind(pattern, value, scope) {
    if (pattern.type === 'Identifier') {
      if (RESERVED.has(pattern.name)) fail(pattern, 'Reserved orchestration binding');
      scope.set(pattern.name, value);
    } else if (pattern.type === 'ArrayPattern') {
      if (value !== UNKNOWN) array(value, pattern);
      pattern.elements.forEach((element, index) => { if (element) bind(element, value === UNKNOWN ? UNKNOWN : value[index], scope); });
    } else fail(pattern, 'Unsupported binding');
  }
  function exactMember(node) {
    return node.type === 'MemberExpression' && !node.computed && !node.optional && node.object.type === 'Identifier' && node.property.type === 'Identifier'
      ? `${node.object.name}.${node.property.name}` : undefined;
  }
  function catalogueRoot(node) {
    if (node.type === 'Identifier') return node.name === 'ALL_TOOLS';
    return node.type === 'CallExpression' && node.callee.type === 'MemberExpression' && catalogueRoot(node.callee.object);
  }
  // Validate metadata-only syntax without consulting or evaluating the live catalogue.
  // No callback here may dispatch work; even a validated query returns opaque data.
  function catalogue(node, scope = new Set()) {
    if (++visited > 50_000) fail(node, 'AST budget exceeded');
    if (node.type === 'Identifier') {
      if (node.name === 'ALL_TOOLS') return 'catalogue';
      if (scope.has(node.name)) return 'descriptor';
    }
    if (node.type === 'Literal') {
      if (node.regex) return 'regexp';
      if (!node.bigint && (node.value === null || ['string', 'number', 'boolean'].includes(typeof node.value))) return typeof node.value;
    }
    if (node.type === 'MemberExpression' && !node.computed && !node.optional && catalogue(node.object, scope) === 'descriptor' && ['name', 'description'].includes(node.property.name)) return 'string';
    if (node.type === 'BinaryExpression' && node.operator === '+' && catalogue(node.left, scope) === 'string' && catalogue(node.right, scope) === 'string') return 'string';
    if (node.type === 'ObjectExpression') {
      for (const property of node.properties) {
        if (property.type !== 'Property' || property.computed || property.method || property.kind !== 'init') fail(property, 'Impure catalogue projection');
        const key = property.key.type === 'Identifier' ? property.key.name : property.key.value;
        if (typeof key !== 'string' || FORBIDDEN_KEYS.has(key) || !['string', 'number', 'boolean', 'object'].includes(catalogue(property.value, scope))) fail(property, 'Unsupported catalogue projection');
      }
      return 'object';
    }
    if (node.type === 'CallExpression' && !node.optional && node.callee.type === 'MemberExpression' && !node.callee.computed && !node.callee.optional) {
      const receiver = catalogue(node.callee.object, scope), method = node.callee.property.name;
      if (receiver === 'catalogue' && ['filter', 'map'].includes(method) && node.arguments.length === 1) {
        const fn = node.arguments[0];
        if (fn.type !== 'ArrowFunctionExpression' || fn.async || fn.params.length !== 1 || fn.params[0].type !== 'Identifier' || RESERVED.has(fn.params[0].name)) fail(fn, 'Impure catalogue callback');
        const nested = new Set(scope); nested.add(fn.params[0].name);
        const result = catalogue(fn.body, nested);
        if (method === 'filter' && result !== 'boolean') fail(fn, 'Unsupported catalogue predicate');
        if (method === 'map' && !['string', 'number', 'boolean', 'object'].includes(result)) fail(fn, 'Unsupported catalogue projection');
        return method === 'filter' ? 'catalogue' : 'projection';
      }
      if (receiver === 'regexp' && method === 'test' && node.arguments.length === 1 && catalogue(node.arguments[0], scope) === 'string') return 'boolean';
      if (['catalogue', 'projection', 'string'].includes(receiver) && method === 'slice' && node.arguments.length >= 1 && node.arguments.length <= 2 && node.arguments.every(argument => argument.type === 'Literal' && Number.isInteger(argument.value) && argument.value >= 0 && argument.value <= MAX_ARRAY)) return receiver;
    }
    fail(node, 'Outside pure catalogue presentation grammar');
  }
  function callback(fn, values, scope) {
    // Built-in presentation callbacks cannot dispatch tools. Reserved bindings cannot
    // be shadowed; arbitrary identifier callbacks remain outside the grammar.
    if (fn?.type === 'Identifier' && OUTPUT.has(fn.name)) return UNKNOWN;
    if (fn?.type !== 'ArrowFunctionExpression' || fn.params.length > 3) fail(fn, 'Only inline array callbacks are admitted');
    const nested = new Map(scope);
    fn.params.forEach((param, index) => bind(param, values[index], nested));
    const value = read(fn.body, nested);
    return fn.async ? pending(awaited(value)) : value;
  }
  function read(node, scope) {
    if (++visited > 50_000) fail(node, 'AST budget exceeded');
    switch (node.type) {
      case 'Program':
      case 'BlockStatement': {
        const nested = new Map(scope);
        for (const statement of node.body) read(statement, nested);
        return UNKNOWN;
      }
      case 'EmptyStatement': return undefined;
      case 'ExpressionStatement': return read(node.expression, scope);
      case 'AwaitExpression': return awaited(read(node.argument, scope));
      case 'Literal':
        if (node.regex || node.bigint) fail(node, 'Unsupported literal');
        return node.value;
      case 'Identifier':
        if (node.name === 'ALL_TOOLS') return UNKNOWN;
        if (!scope.has(node.name)) fail(node, `Unbound identifier ${node.name}`);
        return scope.get(node.name);
      case 'VariableDeclaration':
        if (node.kind !== 'const') fail(node, 'Only immutable declarations are admitted');
        for (const declaration of node.declarations) {
          if (!declaration.init) fail(node, 'Uninitialized declaration');
          bind(declaration.id, read(declaration.init, scope), scope);
        }
        return undefined;
      case 'ArrayExpression': {
        const value = [];
        let opaque = false;
        for (const element of node.elements) {
          if (!element) fail(node, 'Array hole');
          if (element.type === 'SpreadElement') {
            const spread = read(element.argument, scope);
            if (spread === UNKNOWN) opaque = true;
            else value.push(...array(spread, element));
          }
          else value.push(read(element, scope));
          array(value, node);
        }
        return opaque ? UNKNOWN : value;
      }
      case 'ObjectExpression': {
        const value = Object.create(null);
        let tainted = false;
        for (const property of node.properties) {
          if (property.type === 'SpreadElement') {
            const source = read(property.argument, scope);
            if (!isData(source)) tainted = true;
            else if (source && typeof source === 'object') Object.assign(value, source);
            else fail(property, 'Unsupported object spread');
          } else {
            if (property.type !== 'Property' || property.computed || property.method || property.kind !== 'init') fail(property, 'Unsupported property');
            const key = property.key.type === 'Identifier' ? property.key.name : property.key.value;
            if (typeof key !== 'string' || FORBIDDEN_KEYS.has(key)) fail(property, 'Unsupported property key');
            value[key] = read(property.value, scope);
          }
        }
        return tainted ? UNKNOWN : value;
      }
      case 'MemberExpression': {
        const object = read(node.object, scope);
        const key = node.computed ? literal(read(node.property, scope), node) : node.property.name;
        if (FORBIDDEN_KEYS.has(key) || node.optional) fail(node, 'Unsupported property access');
        if (object === UNKNOWN || object && typeof object === 'object' && promises.has(object)) return UNKNOWN;
        if (Array.isArray(object) && key === 'length') return object.length;
        if (object && typeof object === 'object' && Object.hasOwn(object, key)) return object[key];
        return UNKNOWN;
      }
      case 'TemplateLiteral': {
        let value = node.quasis[0].value.cooked;
        let tainted = false;
        for (let index = 0; index < node.expressions.length; index++) {
          const part = read(node.expressions[index], scope);
          if (part === UNKNOWN) tainted = true;
          else if (typeof part !== 'string' && typeof part !== 'number') fail(node, 'Nonliteral template part');
          else value += String(part) + node.quasis[index + 1].value.cooked;
        }
        return tainted ? UNKNOWN : value;
      }
      case 'BinaryExpression': {
        const left = read(node.left, scope), right = read(node.right, scope);
        if (node.operator === '===' || node.operator === '!==') {
          if (!isData(left) || !isData(right)) return UNKNOWN;
          if ((left !== null && typeof left === 'object') || (right !== null && typeof right === 'object')) fail(node, 'Object identity comparison is unsupported');
          return node.operator === '===' ? left === right : left !== right;
        }
        if (node.operator !== '+') fail(node, 'Unsupported binary expression');
        if (left === UNKNOWN || right === UNKNOWN) return UNKNOWN;
        if (typeof left !== 'string' || typeof right !== 'string') fail(node, 'Nonstring concatenation');
        return left + right;
      }
      case 'UnaryExpression':
        if (node.operator === '-' && node.argument.type === 'Literal' && typeof node.argument.value === 'number') return -node.argument.value;
        fail(node, 'Unsupported unary expression');
        break;
      case 'IfStatement':
        read(node.test, scope); read(node.consequent, new Map(scope));
        if (node.alternate) read(node.alternate, new Map(scope));
        return UNKNOWN;
      case 'ConditionalExpression': {
        const test = read(node.test, scope);
        const yes = read(node.consequent, new Map(scope)), no = read(node.alternate, new Map(scope));
        return !isData(test) ? UNKNOWN : test ? yes : no;
      }
      case 'ForOfStatement': {
        if (node.await || node.left.type !== 'VariableDeclaration' || node.left.kind !== 'const' || node.left.declarations.length !== 1) fail(node, 'Unsupported for-of binding');
        const values = array(read(node.right, scope), node);
        for (const value of values) {
          const nested = new Map(scope);
          bind(node.left.declarations[0].id, value, nested);
          read(node.body, nested);
        }
        return UNKNOWN;
      }
      case 'ForStatement': {
        const declaration = node.init?.declarations?.[0];
        const name = declaration?.id?.name;
        if (node.init?.type !== 'VariableDeclaration' || node.init.kind !== 'let' || node.init.declarations.length !== 1 || declaration.id.type !== 'Identifier' || declaration.init?.type !== 'Literal' || declaration.init.value !== 0 || node.test?.type !== 'BinaryExpression' || node.test.operator !== '<' || node.test.left.type !== 'Identifier' || node.test.left.name !== name || node.test.right.type !== 'MemberExpression' || node.test.right.computed || node.test.right.property.name !== 'length' || node.update?.type !== 'UpdateExpression' || node.update.operator !== '++' || node.update.argument.type !== 'Identifier' || node.update.argument.name !== name) fail(node, 'Unsupported counted loop');
        if (node.test.right.object.type !== 'Identifier' || node.test.right.object.name === name) fail(node, 'Counted loop requires a stable immutable array binding');
        const values = array(read(node.test.right.object, scope), node);
        for (let index = 0; index < values.length; index++) {
          const nested = new Map(scope);
          bind(declaration.id, index, nested);
          read(node.body, nested);
        }
        return UNKNOWN;
      }
      case 'CallExpression': {
        const name = exactMember(node.callee);
        if (node.optional) fail(node, 'Optional invocation is unsupported');
        if (catalogueRoot(node)) { catalogue(node); return UNKNOWN; }
        if (node.callee.type === 'Identifier' && ['store', 'load'].includes(node.callee.name)) {
          const arity = node.callee.name === 'store' ? 2 : 1;
          if (node.arguments.length !== arity) fail(node, 'Unsupported note storage invocation');
          const key = literal(read(node.arguments[0], scope), node);
          if (typeof key !== 'string') fail(node, 'Nonliteral note storage key');
          if (arity === 2) read(node.arguments[1], scope);
          return UNKNOWN;
        }
        if (name?.startsWith('tools.')) {
          const tool = name.slice(6);
          if (!TOOLS.has(tool) || node.arguments.length !== 1) fail(node, 'Unknown tool or invocation');
          const input = literal(read(node.arguments[0], scope), node);
          if (tool === 'view_image') imageInput(input);
          operations.push({ name: tool, input });
          return pending(UNKNOWN);
        }
        if (name === 'Promise.all' || name === 'Promise.allSettled') {
          if (node.arguments.length !== 1) fail(node, 'Invalid Promise input');
          const values = array(read(node.arguments[0], scope), node);
          return pending(values.map(value => name === 'Promise.all' ? awaited(value) : UNKNOWN));
        }
        if (name === 'JSON.stringify') {
          if (node.arguments.length !== 1) fail(node, 'Unsupported serialization');
          read(node.arguments[0], scope);
          return UNKNOWN;
        }
        if (node.callee.type === 'Identifier' && OUTPUT.has(node.callee.name)) {
          for (const argument of node.arguments) read(argument, scope);
          return UNKNOWN;
        }
        if (node.callee.type === 'MemberExpression' && !node.callee.computed && !node.callee.optional) {
          const method = node.callee.property.name;
          const receiver = read(node.callee.object, scope);
          if (['map', 'forEach'].includes(method) && node.arguments.length === 1) {
            const values = array(receiver, node);
            const mapped = values.map((value, index) => callback(node.arguments[0], [value, index, values], scope));
            return method === 'map' ? mapped : UNKNOWN;
          }
          if (method === 'endsWith' && typeof receiver === 'string' && node.arguments.length === 1) {
            const suffix = literal(read(node.arguments[0], scope), node);
            if (typeof suffix !== 'string') fail(node, 'Nonliteral string predicate');
            return receiver.endsWith(suffix);
          }
        }
        fail(node, 'Unknown helper or dynamic call');
        break;
      }
      default: fail(node, 'Outside compatibility grammar');
    }
  }
  try {
    if (typeof program !== 'string' || Buffer.byteLength(program) > 1024 * 1024) throw new Error('Missing or oversized wrapper');
    read(parse(program, { ecmaVersion: 2025, sourceType: 'module', allowAwaitOutsideFunction: true }), new Map());
    return { callId, operations, coverage: 'complete' };
  } catch (error) {
    return { callId, operations, coverage: 'inconclusive', reason: error.message };
  }
}

export function decodeRawCall(payload) {
  if (payload.type === 'custom_tool_call' && payload.name === 'exec' && (payload.namespace === undefined || payload.namespace === 'functions')) return decodeWrapper(payload.call_id, payload.input);
  // Observed native functions.wait (0.162.1) only polls a previously yielded exec
  // cell. The originating wrapper and all native commands remain independently
  // decoded/covered; this exact, non-executing envelope cannot dispatch new work.
  if (payload.type === 'function_call' && payload.name === 'wait' && (payload.namespace === undefined || payload.namespace === 'functions')) {
    try {
      const input = JSON.parse(payload.arguments);
      if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['cell_id', 'yield_time_ms', 'max_tokens'].includes(key)) || typeof input.cell_id !== 'string' || !input.cell_id.length || input.cell_id.length > 128 || input.yield_time_ms !== undefined && (!Number.isSafeInteger(input.yield_time_ms) || input.yield_time_ms < 0) || input.max_tokens !== undefined && (!Number.isSafeInteger(input.max_tokens) || input.max_tokens <= 0)) throw new Error('Unsupported wait envelope');
      return { callId: payload.call_id, operations: [{ name: 'wait', input }], coverage: 'complete' };
    } catch { return { callId: payload.call_id, operations: [], coverage: 'inconclusive', reason: 'Malformed or unsupported wait envelope' }; }
  }
  const name = payload.name;
  const namespace = ['exec_command', 'write_stdin', 'apply_patch', 'view_image'].includes(name) ? 'functions' : 'collaboration';
  if (!['function_call', 'custom_tool_call'].includes(payload.type) || !TOOLS.has(name) || payload.namespace !== undefined && payload.namespace !== namespace || payload.type === 'custom_tool_call' && name !== 'apply_patch') return { callId: payload.call_id, operations: [], coverage: 'inconclusive', reason: `Unknown raw tool form ${payload.namespace ?? ''}/${payload.name}` };
  try {
    const input = payload.type === 'custom_tool_call' ? payload.input : JSON.parse(payload.arguments);
    if (name === 'view_image') imageInput(input);
    return { callId: payload.call_id, operations: [{ name, input }], coverage: 'complete' };
  } catch {
    return { callId: payload.call_id, operations: [], coverage: 'inconclusive', reason: 'Malformed tool input' };
  }
}
