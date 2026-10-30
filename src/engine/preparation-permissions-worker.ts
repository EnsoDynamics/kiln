/** Passive Claude settings projection. Never emit secret-bearing settings or evaluate rules. */
import { createHash } from "node:crypto";
import { resolveSettings } from "@anthropic-ai/claude-agent-sdk";
try {
  const resolved = await resolveSettings({ cwd: process.cwd(), settingSources: ["user", "project", "local"] });
  const effective = resolved.effective as Record<string, unknown>;
  const permissions = effective.permissions as { deny?: unknown[]; ask?: unknown[] } | undefined;
  const hooks = Object.fromEntries(["PreToolUse", "PostToolUse", "PostToolUseFailure"].map(event => [event, (effective.hooks as Record<string, unknown> | undefined)?.[event] ?? []]));
  const restricted = effective.policyHelper !== undefined || effective.sandbox !== undefined || !!permissions?.ask?.length || Object.values(hooks as Record<string, { hooks?: { type?: string; async?: boolean; asyncRewake?: boolean; once?: boolean; if?: string; shell?: string }[] }[]>).some(groups => groups.some(group => group.hooks?.some(hook => hook.type !== "command" || hook.async || hook.asyncRewake || hook.once || hook.if || hook.shell === "powershell")));
  const requiresNativeEvidence = !!permissions?.deny?.length;
  const digest = createHash("sha256").update(JSON.stringify({ permissions: effective.permissions, hooks, sandbox: effective.sandbox, policyHelper: effective.policyHelper, env: effective.env })).digest("hex");
  process.stdout.write(JSON.stringify({ allowed: !restricted, requiresNativeEvidence, digest, env: effective.env ?? {}, hooks, ...(restricted ? { reason: "Claude command restrictions, hooks or sandbox settings need supported permission evaluation before native verification. Resolve the existing restriction in Claude; Kiln will not bypass it." } : {}) }));
} catch { process.stdout.write(JSON.stringify({ allowed: false, reason: "Claude verification permissions could not be read. Restore the existing settings before retrying." })); }
