import { readFileSync } from "node:fs";
import { commandText, ControlFailure } from "./result.js";
export interface CommandContract {
  path: string[]; purpose: string; side_effect: string; implemented: boolean; availability: string; usage: string;
  arguments: { name: string; required: boolean; source: string }[];
  flags: Record<string, { value: string | null; source: string; repeatable?: boolean }>;
  required_exclusive_groups: { exactly_one?: string[]; required?: string[] }[];
  limits: string[]; result_fields: Record<string, string>; errors: string[]; error_meanings?: Record<string, string>; exits: Record<string, string>;
  examples: { request: string; argv: string[]; stdin?: string }[];
}
const reference = JSON.parse(readFileSync(new URL("../../prompts/kiln-command-contracts.json", import.meta.url), "utf8")) as { schema_version: "1"; commands: CommandContract[]; guidance: string };
export const commandContracts = reference.commands;
export function commandHelp(path: string[], json: boolean): string {
  const contract = commandContracts.find(c => c.path.join(" ") === path.join(" "));
  if (path.length && !contract) throw new ControlFailure("command_not_found", "Unknown command. Use kiln --help.", 2);
  const data = path.length ? { schema_version: "1", command: contract, subcommands: commandContracts.filter(c => c.path.length > path.length && path.every((p, i) => c.path[i] === p)), guidance: reference.guidance } : reference;
  if (json) return `${JSON.stringify(data)}\n`;
  const selected = path.length ? [contract!] : commandContracts.filter(c => c.path.length === 1);
  if (!path.length) return `Kiln — inspect existing work and run an Enso Method plan.\nUse kiln <command> --help for complete details.\n\n${selected.map(c => `${c.path.join(" ")} — ${c.purpose} [${c.availability}]`).join("\n")}\n\nCommon flags: --help (-h), --json. Existing helpers retain their execution formats.\n${reference.guidance}\n`;
  const c = contract!;
  return [c.usage, c.purpose, `Availability: ${c.availability}`, `Side effects: ${c.side_effect}`,
    ...c.arguments.map(a => `${a.name}${a.required ? " (required)" : " (optional)"}: ${a.source}`),
    ...Object.entries(c.flags).map(([name, f]) => `--${name}${f.value ? ` <${f.value}>` : ""}: ${f.source}`),
    ...c.required_exclusive_groups.map(g => g.exactly_one ? `Exactly one: ${g.exactly_one.join(", ")}` : `Required together: ${g.required?.join(", ")}`),
    ...c.limits, "Result fields:", ...Object.entries(c.result_fields).map(([k, v]) => `${k}: ${v}`),
    `Errors: ${c.errors.join(", ")}`, ...Object.entries(c.error_meanings ?? {}).map(([code, meaning]) => `${code}: ${meaning}`), ...Object.entries(c.exits).map(([code, meaning]) => `Exit ${code}: ${meaning}`),
    ...c.examples.flatMap(e => [`Request: ${e.request}`, `Invocation: ${commandText(e.argv)}`, `Invocation argv: ${JSON.stringify(e.argv)}`, ...(e.stdin ? [`Standard input: ${e.stdin}`] : [])]),
    ...commandContracts.filter(child => child.path.length > c.path.length && c.path.every((p, i) => child.path[i] === p)).map(child => `Subcommand: kiln ${child.path.join(" ")} --help`), reference.guidance, ""].join("\n");
}
export interface ParsedCommand { contract: CommandContract; positionals: string[]; flags: Record<string, string | true | string[]> }
export function parseCommand(args: string[]): ParsedCommand {
  const contract = [...commandContracts].sort((a, b) => b.path.length - a.path.length).find(c => c.path.every((p, i) => args[i] === p));
  if (!contract) throw new ControlFailure("command_not_found", "Unknown command. Use kiln --help.", 2);
  const flags: ParsedCommand["flags"] = {}; const positionals: string[] = [];
  for (let index = contract.path.length; index < args.length; index++) {
    const arg = args[index]!;
    if (!arg.startsWith("-")) { positionals.push(arg); continue; }
    const name = arg === "-h" ? "help" : arg.slice(2); const spec = contract.flags[name];
    if (!arg.startsWith("--") && arg !== "-h" || !spec || flags[name] !== undefined && !spec.repeatable) throw new ControlFailure("invalid_input", `Unknown or duplicate flag ${arg}. Use kiln ${contract.path.join(" ")} --help.`, 2);
    if (spec.value === null) flags[name] = true;
    else { const value = args[++index]; if (!value || value.startsWith("--")) throw new ControlFailure("invalid_input", `Missing value for --${name}.`, 2); if (spec.repeatable) flags[name] = [...(flags[name] as string[] | undefined ?? []), value]; else flags[name] = value; }
  }
  if (!flags.help) {
    if (positionals.length > contract.arguments.length || positionals.length < contract.arguments.filter(a => a.required).length) throw new ControlFailure("invalid_input", `Invalid arguments. Use kiln ${contract.path.join(" ")} --help.`, 2);
    for (const g of contract.required_exclusive_groups) if (g.exactly_one && g.exactly_one.filter(name => flags[name] !== undefined).length !== 1) throw new ControlFailure("invalid_input", `Exactly one of ${g.exactly_one.map(n => `--${n}`).join(", ")} is required.`, 2);
    if (contract.side_effect === "change" && (!flags["command-id"] || !flags["only-if-status-matches"])) throw new ControlFailure("invalid_input", "Changing commands require --command-id and --only-if-status-matches.", 2);
  }
  return { contract, positionals, flags };
}
