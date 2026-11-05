# Reporting Security Issues in Kiln

For a suspected security vulnerability in Kiln, email doug@ensodynamics.com. Do not open a public GitHub issue for it, and do not post credentials, confidential project data or an exploitable vulnerability anywhere public.

Include:

- the Kiln version (`kiln --version`), the agent (Claude Code or Codex) and its version, and your operating system;
- what you ran and what Kiln did that it shouldn't have, such as reaching outside its assigned worktrees, running work without the billing approval it needed, or exposing a credential;
- the smallest steps that reproduce it, with sensitive information redacted.

Reports are investigated with reasonable care. There is no guaranteed response time and no bug bounty. The latest version published on npm is the supported version, and security fixes are published as new versions of it.
