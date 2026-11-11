import { EXIT_SIGNALLED, runKilnCommand } from "./kiln-command.js";

const code = await runKilnCommand(process.argv.slice(2), {
  cwd: process.cwd(),
  env: process.env,
  stdout: process.stdout,
  stderr: process.stderr,
  signals: process,
});
// After a stop Kiln exits at once, once its last line is written, rather than waiting on any
// git or gh call it abandoned.
if (Object.values(EXIT_SIGNALLED).includes(code)) process.stdout.write("", () => process.exit(code));
else process.exitCode = code;
