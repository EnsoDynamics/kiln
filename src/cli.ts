#!/usr/bin/env node
// The `kiln` command's launcher. It loads only Node and installed-copy.js, picks the folder Kiln
// runs from (its own private copy of this installed version), and starts Kiln there, so every
// file Kiln reads later comes from that copy even after a newer Kiln is installed (Kiln Upgrade
// While Running PRD, AC-UPG-01).
import { join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { kilnRootToRunFrom } from "./installed-copy.js";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
let root: string;
try {
  root = await kilnRootToRunFrom(packageRoot, process.env);
} catch (error) {
  process.stderr.write(`${(error as Error).message}\n`);
  process.exit(1);
}
const main = join(root, relative(packageRoot, fileURLToPath(new URL("./kiln-main.js", import.meta.url))));
await import(pathToFileURL(main).href);
