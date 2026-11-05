# Kiln idea: Merge the final PR

**Roadmap:** [Kiln roadmap](../kiln-roadmap.md).

By default, Kiln ends with review pull requests or recognizes work already integrated under its existing rules. This idea would add explicit authority to carry the final review PRs through required checks and merge, then confirm the resulting state.

Existing [early-merge authorization](../changes/kiln-development-deployments/kiln-development-deployments-prd.md) already permits named repository/base merges when a PRD requires deployment or verification. That feature explicitly excludes automatic merging of every final review PR. A future design must distinguish this proposed final-review permission from those existing grants and retain repository checks, reviews and production boundaries.
