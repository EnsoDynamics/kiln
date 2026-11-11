# Kiln 1.1.3

Installing a new Kiln no longer breaks runs that are still going.

## Fixed

- **A run keeps its own version.** Each installed version of Kiln now runs from its own
  private copy in `kiln-installs`, beside Kiln's state folder. When `npm install -g` puts a
  newer Kiln in place, a run that is still going carries on with the prompts, hooks, helper
  scripts, browser view and `kiln` command of the version it started on. Commands started
  after the install use the new version. Before, a run could read the newer version's files
  partway through and crash, for example with `Prompt placeholder {{outstanding}} has no
  value.`
- **No half-installed copies.** A `kiln` command started while npm is still installing Kiln
  stops with a message to run it again once the install finishes. It never runs from a
  partial copy.
- **Old copies are cleaned up.** A version's copy is removed once no Kiln process is using it
  and it hasn't been used for seven days. The installed version and any copy a run is still
  going on are never removed.

The first `kiln` command after installing a new version takes a few seconds longer while its
copy is made. A Kiln linked from a local checkout with `npm link` still runs from its own
files. On Windows, a bare `kiln add-repository` typed by an agent reaches the newly installed
version.

## Upgrade

This protects runs started on 1.1.3 or later. Runs started on an earlier version are not
protected, so let them finish before installing this one.

```sh
npm install -g @ensodynamics/kiln@1.1.3
```
