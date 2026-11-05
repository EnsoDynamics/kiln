import type { Engine } from "../engine/engine.js";

/** Mimic a current client reading the stopped target; non-phase recovery keeps its contract. */
export function recoveryRequest(engine: Engine, intent?: "verify" | "advance"): Record<string, unknown> {
  const target = engine.phaseRecoveryTarget();
  return target ? { target, ...(intent ? { intent } : {}) } : {};
}
