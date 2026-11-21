/**
 * The audit prompt's `{{nextSteps}}` (Kiln Deliver When Audit Loops Run Out technical design,
 * "Prompts"): a pure forecast of the step Kiln takes once each outcome's work is done, by the rules
 * of "Routing After the Last Loop". It names steps, never loop numbers, and never tells a session
 * it is the last loop.
 *
 *   nextStepsForecast({ kind: "delivery_audit", fixing: false, closed: { delivery: true, test: false }, latestTestContinues: false })
 *   // "- passed: Kiln runs the test audit.\n- completion_phases: …"
 */
import type { AuditKind } from "../audit/contracts.js";

export interface ForecastInput {
  kind: AuditKind;
  /** A session of test fixes: a test audit continuation. */
  fixing: boolean;
  /** Whether each kind is closed, this session's own loop counted. */
  closed: { delivery: boolean; test: boolean };
  /** A delivery audit only: whether the latest settled test audit before it counts as continue_test. */
  latestTestContinues: boolean;
}

type Step = "delivery audit" | "test audit" | "session of test fixes" | "pull request";

const say = (steps: Step[]) => steps.map(step => step === "pull request" ? "goes on to the pull request" : step === "session of test fixes" ? "starts a session of test fixes" : `runs the ${step}`).join(", then ");

/** Only the pull request follows, with any delivery audit still due first: Kiln's hold check is the last before it (Items for a Person, "The hold stop"). */
const toPullRequest = (steps: Step[]) => steps.at(-1) === "pull request" && !steps.includes("test audit") && !steps.includes("session of test fixes");
const HOLD_LINE = " Kiln stops before the pull request while a blocker or business question not marked waived is open.";
const TEST_ROWS = " List each test row still missing, failing or Weak as a `test` item with its criterion.";

export function nextStepsForecast(input: ForecastInput): string {
  const { closed } = input;
  // After a delivery audit that passed: the test audit while one is left; otherwise saved test work, or the pull request.
  const afterDelivery = (testContinues: boolean): Step[] => !closed.test ? ["test audit"] : testContinues ? ["session of test fixes"] : ["pull request"];
  const lines: string[] = [];
  const line = (text: string, ...chains: Step[][]) => {
    const last = chains.some(toPullRequest);
    lines.push(`${text}${last ? HOLD_LINE : ""}${last && input.kind === "test_audit" ? TEST_ROWS : ""}`);
  };
  if (input.kind === "delivery_audit") {
    const passed = afterDelivery(input.latestTestContinues);
    line(`- passed: Kiln ${say(passed)}.`, passed);
    const phases: Step[] = closed.delivery ? afterDelivery(input.latestTestContinues) : ["delivery audit"];
    line(`- completion_phases: Kiln builds the phases you added, then ${say(phases)}.`, phases);
  } else {
    // After a test audit's work changed implementation, a delivery audit runs first while one is left.
    const recheck = (then: Step[]): Step[] => closed.delivery ? then : ["delivery audit", ...afterDelivery(then[0] === "session of test fixes")];
    line(`- passed: Kiln goes on to the pull request; with changedImplementation true, Kiln ${say(recheck(["pull request"]))}.`, ["pull request"], recheck(["pull request"]));
    const phases: Step[] = closed.delivery ? closed.test ? ["pull request"] : ["test audit"] : ["delivery audit", ...afterDelivery(false)];
    line(`- completion_phases: Kiln builds the phases you added, then ${say(phases)}.`, phases);
    line(`- continue_test: Kiln starts a session of test fixes; with changedImplementation true, Kiln ${say(recheck(["session of test fixes"]))}.`, recheck(["session of test fixes"]));
  }
  lines.push("- needs_you: Kiln stops at Needs you.");
  const fixing = input.fixing ? "\nIf you raised none of the rows you took, do not report continue_test: report passed and list each row left as a `test` item. That ends the test work." : "";
  return `What Kiln does after each outcome, once its work is done:\n${lines.join("\n")}${fixing}`;
}
