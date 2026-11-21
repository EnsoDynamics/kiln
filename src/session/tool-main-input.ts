/** A tool call's main input, as the session output's tool line shows it (`Bash git status`, `Read src/a.ts`). No imports: the checkpoint hook uses it. */
const MAIN_INPUT_KEYS = ["command", "file_path", "notebook_path", "description", "pattern", "url", "query", "path", "skill"];

export function toolMainInput(input: Record<string, unknown> | undefined): string | undefined {
  const values = input ?? {};
  const key = MAIN_INPUT_KEYS.find((candidate) => typeof values[candidate] === "string");
  return key ? (values[key] as string) : Object.values(values).find((value): value is string => typeof value === "string");
}
