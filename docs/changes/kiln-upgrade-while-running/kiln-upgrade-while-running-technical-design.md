# Technical Design: Kiln Upgrade While Running

**PRD:** [Kiln Upgrade While Running](kiln-upgrade-while-running-prd.md)

## The Problem in the Code

Node loads a module once, but Kiln resolves many files from `import.meta.url` when it uses them: `prompts/*.txt` on every prompt, `dist/live/checkpoint-hook.js` and the `dist/**/*-worker.js` helpers as child processes, `dist/cli.js` for the command agents call, `dist/view/` for the browser, and dependencies imported lazily. `npm install -g` moves the old package folder aside and extracts the new one at the same path; a quick check with npm 11 showed the package folder's inode changes on every upgrade. A running Kiln then resolves those files into the new version.

## Running From a Private Copy

`dist/cli.js` becomes a launcher that imports only Node built-ins, `dist/installed-copy.js` and `dist/state/state-files.js`, all loaded as it starts, so nothing it needs comes from the npm folder later. It decides where Kiln runs from, then imports `dist/kiln-main.js` from there. `kiln-main.js` holds the old body of `cli.js`. Every later lookup through `import.meta.url` then resolves inside the copy, including the `dist/cli.js` path given to agents, whose launcher sees it is already in a copy.

| Where `cli.js` is | What runs |
|---|---|
| Inside the copy store | That copy. It writes nothing: a Codex session may write only its workspace, and the run that started the session holds the copy's lease |
| An npm-installed package (its real path has a `node_modules` folder) that npm is changing (below) | Nothing: the command stops with the AC-UPG-02 message |
| An npm-installed package with a `dist/build-info.json` and every production dependency in its own `node_modules` | The copy for that install, made first if needed |
| Anything else: a linked checkout, source, or a project install whose dependencies were hoisted | In place, as today (PRD Out of Scope) |

The store is `kiln-installs` beside the state root (`~/.local/state/kiln-installs`, or `%LOCALAPPDATA%\kiln-installs` on Windows). It sits outside the state root because `kiln status` and the other commands read every folder in there as saved work. It is not a cache folder, which an operating system or a cleanup tool might empty while a run is still going. A copy's name is the package version for a release build, or `<version>-dev-<build time>` for a development build from `dist/build-info.json`, followed by a short hash of the package's real path, so two installs of one version (one per Node architecture, say) never share a copy.

On macOS and Linux, the launcher also keeps `kiln-installs/.bin/<key>/kiln`, a link to the copy's `dist/cli.js`. Kiln puts that folder first on each session's PATH in place of npm's, so the bare `kiln add-repository` the phase prompts tell agents to run reaches the run's own version. On Windows Kiln leaves a session's PATH alone, as it does today, so that bare `kiln` is npm's (PRD Out of Scope).

## Making a Copy (AC-UPG-02)

npm 11 changes an install in this order (`@npmcli/arborist`, `reify.js` and `retire-path.js`): it moves each package it will replace aside to `.<name>-<hash>` in the same folder, creates the new packages' folders, unpacks them in parallel, moves unchanged dependencies back from the moved-aside folder, builds, and only then deletes the moved-aside folders. So a moved-aside folder beside the package, or in any `node_modules` folder inside it, means npm is part way through, and the tree may be missing whole packages without anything being written. The launcher checks for one before it decides anything else.

Under the store lock, if `kiln-installs/<key>/` does not exist:

1. List the package folder: every path, with its size and modification time, and each symbolic link's target. Record the folder's inode.
2. Copy it with `fs.cp` (recursive, symbolic links verbatim, timestamps kept, copy-on-write clones where the file system has them) into `kiln-installs/.tmp-<key>-<pid>/`.
3. List the package folder again and list the copy. Use the copy only when the folder's inode is unchanged, npm has no moved-aside folder, the two listings of the folder are identical, the copy has the same paths, sizes and link targets, and every dependency is in the copy: each package's `dependencies`, and its `optionalDependencies` that are installed, found as Node finds them without leaving the copy. Then rename it to `kiln-installs/<key>/`. Otherwise remove it and stop with the AC-UPG-02 message, which also says to install Kiln again if no install is running.

A copy's folder only appears through that rename, so `kiln-installs/<key>/` existing means it is complete.

## Leases and Clean-Up (AC-UPG-03)

Every launcher started from the npm folder writes `kiln-installs/.leases/<key>/<pid>` and touches `kiln-installs/.used/<key>` under the lock, and removes its lease when the process exits. A process killed without exiting leaves a lease whose pid is no longer running, which counts as no lease. A reused pid can only keep a copy longer. Processes started from a copy, such as an agent's `kiln audit submit` or the checkpoint hook, take no lease: each is a session's, and the run that started the session holds one until it exits.

After making or finding its copy, a launcher from the npm folder removes, under the lock, each other copy with no live lease and an `.used` time more than seven days old: it renames the copy to `kiln-installs/.trash-<key>-<pid>` first, so no half-removed copy is ever under a copy's name, then deletes it. It also deletes `.tmp-*` and `.trash-*` folders whose pid is no longer running. A rename or delete that fails, such as on Windows while a file is open, leaves that folder for a later launch.

## The Store Lock

The lock is the directory `kiln-installs/.lock`, made with `mkdir` and holding the owner's pid. A launcher waits for it, up to ten minutes so another launcher can finish a copy; it takes over a lock whose pid is no longer running, or a lock with no pid, or an empty one, that is over a minute old. It is held only while making a copy, writing a lease and cleaning up, never while Kiln runs.

## Tests

- Unit tests of `installed-copy.ts` against temporary folders: copy made once and reused, a source changed during copying refused with no copy left, a moved-aside npm folder refused, a copy missing a nested dependency refused, nothing written when started from a copy, leases, clean-up of old unleased copies only, stale `.tmp`/`.trash`/lock handling.
- The package test installs the packed tarball into a temporary prefix, runs `kiln`, and checks it ran from the copy; then installs a second build over it while a `kiln` process from the first is still running and checks that process still reads its own version's files.
