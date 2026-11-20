/**
 * An operation's display label, recorded by the checkpoint hook at admission (Kiln Pause Now,
 * "Naming the command"): the tool, and its main input capped at 200 characters with an ellipsis.
 * A missing or unexpected `tool_input` gives the bare tool name; it never decides anything.
 *
 *   operationLabel("Bash", { command: "npm test" })  // { tool: "Bash", input: "npm test" }
 *   operationLabel("Bash", "oops")                   // { tool: "Bash" }
 */
import { toolMainInput } from "../session/tool-main-input.js";

export const capLabel = (text: string, limit = 200): string => text.length > limit ? `${text.slice(0, limit - 1)}…` : text;

export function operationLabel(tool: string, toolInput: unknown): { tool: string; input?: string } {
  const input = toolInput && typeof toolInput === "object" && !Array.isArray(toolInput) ? toolMainInput(toolInput as Record<string, unknown>) : undefined;
  return input ? { tool, input: capLabel(input) } : { tool };
}
