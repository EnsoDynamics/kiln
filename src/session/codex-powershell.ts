// Interpret a deliberately bounded PowerShell AST. The provider's text is stdin data only.
import { fileURLToPath } from "node:url";
import { posix, win32 } from "node:path";
import { spawnDetached, endProcessTree } from "../platform/helper-process.js";
import { gitCommandsIn, gitChange, type GitCommandSeen, type PathContext } from "./outside-workspace.js";

interface Ast {
  type: string; value?: string | number | boolean; variable?: string; splatted?: boolean;
  body?: Ast; statements?: Ast[]; elements?: Ast[]; expression?: Ast; redirections?: Ast[];
  invocation?: string; background?: boolean; path?: Ast; name?: string; argument?: Ast;
  left?: Ast; right?: Ast; operator?: string; branches?: { condition: Ast; body: Ast }[]; otherwise?: Ast;
}
export interface ShellEffects { paths: string[]; git: GitCommandSeen[] }
export const POWERSHELL_VERSION = "7.5.2";
const NESTED_SHELLS = new Set(["powershell", "powershell.exe", "pwsh", "pwsh.exe", "bash", "bash.exe", "sh", "sh.exe", "zsh", "zsh.exe", "cmd", "cmd.exe"]);

export async function readPowerShell(body: string, options: { executable: string; cwd: string; env: NodeJS.ProcessEnv; signal: AbortSignal; context: PathContext }): Promise<ShellEffects> {
  if (Buffer.byteLength(body) > 1024 * 1024 || options.signal.aborted) throw new Error("PowerShell evidence exceeded its input/deadline bound.");
  const child = spawnDetached(options.executable, ["-NoLogo", "-NoProfile", "-NonInteractive", "-File", fileURLToPath(new URL("../../prompts/codex-powershell-ast.ps1", import.meta.url))], { cwd: options.cwd, env: options.env, stdin: "pipe" });
  const result = await new Promise<string>((resolve, reject) => {
    let output = ""; let failure: Error | undefined;
    const fail = (error: Error) => { failure ??= error; void endProcessTree(child.pid, "SIGKILL"); };
    const abort = () => fail(new Error("PowerShell parser timed out or stopped."));
    options.signal.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(abort, 30_000);
    child.stdout!.on("data", (chunk: Buffer) => { output += chunk.toString(); if (Buffer.byteLength(output) > 16 * 1024 * 1024) fail(new Error("PowerShell AST exceeds output bound.")); });
    child.stderr!.resume();
    child.on("error", fail); child.stdin!.on("error", fail);
    child.once("close", (code) => { clearTimeout(timer); options.signal.removeEventListener("abort", abort); if (failure) reject(failure); else if (code !== 0) reject(new Error("PowerShell parser rejected evidence or is unavailable.")); else resolve(output); });
    child.stdin!.end(body);
    if (options.signal.aborted) abort();
  });
  const parsed = JSON.parse(result) as { version: string; aliases: string[]; ast: Ast };
  if (parsed.version !== POWERSHELL_VERSION) throw new Error(`PowerShell ${parsed.version} is unqualified; parser profile requires ${POWERSHELL_VERSION}.`);
  if (!Array.isArray(parsed.aliases) || !parsed.aliases.every(alias => typeof alias === "string")) throw new Error("PowerShell alias inventory is unavailable.");
  return powerShellEffects(parsed.ast, options.cwd, options.context, new Set(parsed.aliases.map(alias => alias.toLowerCase())));
}

export function powerShellEffects(ast: Ast, cwd: string, context: PathContext, aliases: ReadonlySet<string>): ShellEffects {
  const path = context.platform === "win32" ? win32 : posix;
  const effects: ShellEffects = { paths: [], git: [] };
  const variables = new Map<string, string>();
  const environment = new Map<string, string>();
  let directory: string | undefined = cwd;
  let stack: (string | undefined)[] = [];
  let steps = 0;
  const literal = (node: Ast | undefined): string => {
    if (!node) throw new Error("Missing literal PowerShell argument.");
    if (node.type === "CommandExpressionAst" && !node.redirections?.length) return literal(node.expression);
    if (node.type === "PipelineAst" && node.elements?.length === 1 && !node.background) return literal(node.elements[0]);
    if (["StringConstantExpressionAst", "ExpandableStringExpressionAst", "ConstantExpressionAst"].includes(node.type) && ["string", "number", "boolean"].includes(typeof node.value)) return String(node.value);
    if (node.type === "VariableExpressionAst" && !node.splatted && node.variable && variables.has(node.variable.toLowerCase())) return variables.get(node.variable.toLowerCase())!;
    throw new Error("Unresolved PowerShell value.");
  };
  const placed = (text: string): string => {
    if (!directory || !text || /[*?[\]~$`]/.test(text) || /^[a-z]:[^\\/]/i.test(text) || (text.includes(":") && !/^[a-z]:[\\/]/i.test(text))) throw new Error("Unresolved PowerShell path or provider.");
    if (context.platform === "win32" && /^[\\/](?![\\/])/.test(text)) throw new Error("Drive-implicit PowerShell path.");
    return path.resolve(directory, text);
  };
  const redirections = (node: Ast) => { for (const redirection of node.redirections ?? []) { if (redirection.type !== "FileRedirectionAst") throw new Error("Unsupported PowerShell redirection."); effects.paths.push(placed(literal(redirection.path))); } };
  const command = (node: Ast) => {
    if (node.invocation !== "Unknown") throw new Error("Dynamic or dot-sourced PowerShell command.");
    const elements = node.elements ?? [];
    const name = literal(elements[0]); const lower = name.toLowerCase();
    // Module-qualified cmdlets and rooted executable names must not disappear into the
    // ordinary-external-program policy. Qualified cmdlets need their own verified profile.
    const basename = name.replaceAll("\\", "/").split("/").at(-1)!.toLowerCase();
    if (name.includes("\\") && !/^[a-z]:[\\/]/i.test(name) && !name.startsWith("\\\\")) throw new Error("Module-qualified PowerShell command is outside the profile.");
    if (NESTED_SHELLS.has(basename)) throw new Error("Unsupported nested PowerShell shell.");
    if (aliases.has(lower) && !["cd", "pushd", "popd"].includes(lower)) throw new Error(`Unsupported PowerShell alias ${name}.`);
    const args: string[] = []; const named = new Map<string, string>();
    const switches = new Set(["force", "recurse", "append", "noclobber", "nonewline", "confirm", "whatif"]);
    for (let i = 1; i < elements.length; i++) {
      const element = elements[i]!;
      if (element.type === "CommandParameterAst") {
        const key = element.name!.toLowerCase();
        if (named.has(key)) throw new Error("Duplicate PowerShell option.");
        if (switches.has(key) && !element.argument) named.set(key, "true");
        else named.set(key, literal(element.argument ?? elements[++i]));
      } else args.push(literal(element));
    }
    redirections(node);
    if ([...named.keys()].some(key => ["outvariable", "errorvariable", "warningvariable", "informationvariable", "pipelinevariable"].some(parameter => parameter.startsWith(key)) || ["ov", "ev", "wv", "iv", "pv"].includes(key))) throw new Error("PowerShell common variable mutation is unsupported.");
    if (["set-alias", "new-alias", "set-item", "invoke-expression", "iex"].includes(lower)) throw new Error("Unsupported PowerShell alias, write or nested shell.");
    const option = (key: string): string => { const value = named.get(key); if (value === undefined) throw new Error(`PowerShell ${name} requires literal -${key}.`); return value; };
    if (["set-location", "cd", "push-location", "pushd"].includes(lower)) {
      if (args.length > 1 || [...named.keys()].some(key => !["literalpath", "path"].includes(key))) throw new Error("Unsupported PowerShell location.");
      const before = directory; directory = placed(named.get("literalpath") ?? named.get("path") ?? args[0] ?? "");
      if (["push-location", "pushd"].includes(lower)) stack.push(before);
    } else if (["pop-location", "popd"].includes(lower)) {
      if (args.length || named.size || !stack.length) throw new Error("Unresolved PowerShell location stack.");
      directory = stack.pop();
    } else if (lower === "git" || lower === "git.exe" || /[/\\]git(?:\.exe)?$/i.test(name)) {
      if (!directory) throw new Error("Unplaced mutating Git command.");
      // Reuse Git's option/mutability policy with literal words; quote for the POSIX lexer only.
      const words: string[] = [];
      for (let i = 1; i < elements.length; i++) { const e = elements[i]!; if (e.type === "CommandParameterAst") { words.push(`-${e.name!}`); if (e.argument) words.push(literal(e.argument)); } else words.push(literal(e)); }
      const quote = (text: string) => "'" + text.replaceAll("'", "'\\''") + "'";
      const prefix = [...environment].map(([key, value]) => `${key}=${quote(value)}`).join(" ");
      const found = gitCommandsIn(`${prefix} git ${words.map(quote).join(" ")}`, directory, context);
      if (found.some(git => gitChange(git.subcommand, git.args) && !git.place)) throw new Error("Unplaced PowerShell Git mutation.");
      effects.git.push(...found);
    } else {
      const writes: Record<string, string[]> = {
        "set-content": ["literalpath", "value", "encoding", "force", "nonewline"], "add-content": ["literalpath", "value", "encoding", "force", "nonewline"],
        "out-file": ["filepath", "encoding", "append", "force", "noclobber", "nonewline", "width", "inputobject"],
        "new-item": ["path", "name", "itemtype", "value", "force"], "copy-item": ["literalpath", "destination", "force", "recurse"], "move-item": ["literalpath", "destination", "force"], "remove-item": ["literalpath", "force", "recurse"],
      };
      const allowed = writes[lower];
      if (allowed) {
        if (args.length || [...named.keys()].some(key => !allowed.includes(key))) throw new Error("Unsupported PowerShell write options.");
        if (lower === "new-item") { if (!["file", "directory"].includes(option("itemtype").toLowerCase())) throw new Error("Unsupported PowerShell item type."); effects.paths.push(placed(path.join(option("path"), named.get("name") ?? ""))); }
        else if (["copy-item", "move-item"].includes(lower)) { const source = placed(option("literalpath")); const destination = placed(option("destination")); effects.paths.push(destination, path.join(destination, path.basename(source))); if (lower === "move-item") effects.paths.push(source); }
        else effects.paths.push(placed(option(lower === "out-file" ? "filepath" : "literalpath")));
      } else if (/^[a-z]+-/i.test(name) && !["get-content", "get-childitem", "get-item", "get-location", "get-command", "get-alias", "test-path", "select-object", "select-string", "sort-object", "measure-object", "compare-object", "convertto-json", "convertfrom-json", "write-output", "write-host", "write-error"].includes(lower)) throw new Error("Unsupported PowerShell cmdlet.");
      // Other literal external programs have the same limited policy as POSIX commands.
    }
  };
  const visit = (node: Ast | undefined): void => {
    if (!node) return;
    if (++steps > 50_000) throw new Error("PowerShell AST traversal bound exceeded.");
    switch (node.type) {
      case "ScriptBlockAst": visit(node.body); break;
      case "NamedBlockAst": case "StatementBlockAst": for (const statement of node.statements ?? []) visit(statement); break;
      case "PipelineAst": if (node.background) throw new Error("Background PowerShell pipeline."); for (const element of node.elements ?? []) visit(element); break;
      case "CommandAst": command(node); break;
      case "CommandExpressionAst": literal(node.expression); redirections(node); break;
      case "AssignmentStatementAst": {
        if (node.operator !== "Equals" || node.left?.type !== "VariableExpressionAst" || node.left.splatted) throw new Error("Unsupported PowerShell assignment.");
        const key = node.left.variable!.toLowerCase(); const value = literal(node.right);
        if (["env:git_dir", "env:git_work_tree"].includes(key)) environment.set(key.slice(4).toUpperCase(), value);
        else if (/^[a-z_][\w]*$/i.test(key) && !variables.has(key)) variables.set(key, value);
        else throw new Error("Mutable or unsupported PowerShell variable.");
        break;
      }
      case "IfStatementAst": {
        const original = directory; const originalStack = [...stack]; const savedVariables = new Map(variables); const savedEnvironment = new Map(environment);
        for (const branch of [...(node.branches ?? []).map(branch => branch.body), node.otherwise]) {
          directory = original; stack = [...originalStack]; variables.clear(); for (const pair of savedVariables) variables.set(...pair); environment.clear(); for (const pair of savedEnvironment) environment.set(...pair);
          visit(branch);
        }
        // Do not execute condition commands; unsupported conditions are rejected, never ignored.
        for (const branch of node.branches ?? []) { directory = original; visit(branch.condition); }
        directory = undefined; variables.clear(); environment.clear(); stack = [];
        break;
      }
      default: throw new Error(`Unsupported PowerShell AST ${node.type}.`);
    }
  };
  visit(ast); return effects;
}
