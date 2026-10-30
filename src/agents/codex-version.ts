/** Version eligibility only; RPC, permissions and history still require their own checks. */
export const CODEX_MIN_VERSION = "0.162.1";
export const CODEX_VERSION_REQUIREMENT = `stable codex-cli ${CODEX_MIN_VERSION} or later`;

export function supportedCodexVersion(output: string): string | undefined {
  const match = /^codex-cli ((0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?)$/.exec(output.trim());
  if (!match) return undefined;
  const actual = match.slice(2, 5).map(Number);
  if (!actual.every(Number.isSafeInteger)) return undefined;
  const minimum = CODEX_MIN_VERSION.split(".").map(Number);
  for (let i = 0; i < minimum.length; i++) {
    if (actual[i]! > minimum[i]!) return match[1];
    if (actual[i]! < minimum[i]!) return undefined;
  }
  return match[1];
}
