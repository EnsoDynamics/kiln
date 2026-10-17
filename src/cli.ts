#!/usr/bin/env node
import { runKilnCommand } from "./kiln-command.js";

process.exitCode = await runKilnCommand(process.argv.slice(2), {
  cwd: process.cwd(),
  env: process.env,
  stdout: process.stdout,
  stderr: process.stderr,
});
