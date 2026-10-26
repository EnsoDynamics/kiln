# Kiln development deployments — Business assumptions

<!-- EDITING THIS FILE? Load assumptions-document-writing before editing, and
     assumptions-document-feedback when recording stakeholder answers.
     Assumption IDs are permanent. Keep one Last Updated line; remove superseded
     entry text, which version control retains. -->

**Last Updated:** 2026-10-26
**Status:** One grouping assumption pending; AUTH-002 validated

These are the business assumptions used in the [development-deployments PRD](kiln-development-deployments-prd.md). Work proceeds on the pending assumption unless corrected.

<a id="auth-001"></a>

### AUTH-001. Can the PRD repository group remembered choices? — ⏳ PENDING (Ruled 2026-10-24 — we read your words; 65% confidence)

**Since your answer:** The documents now explicitly support **a product repository holding PRDs and separate application repositories**. The remaining proposal concerns only the grouping of saved choices; sharing a PRD repository does not establish that two PRDs are the same project.

**Assumption:** Use **the PRD repository as a provisional storage group** for remembered development-deployment choices, whether it holds application code or only product requirements. Show that group and its exact approved repository and branch targets before Start. **Reuse is an explicit choice for the current PRD**, never automatic permission inferred from where a PRD is stored. Other PRD repositories do not inherit these choices automatically.

**Why your 2026-10-24 answer did not close this:** Your correction settles where requirements and code may live, but does not select a grouping rule for remembering permission. We read it as rejecting the claim that PRD storage necessarily defines the project. The proposed storage group is therefore still an assumption, not an approved definition of project identity.

**Evidence:** Doug's feedback on review `40085e080547`, exported 2026-10-24, in conversation `01a16e16-9587-7861-bdb7-4c50d9014c9d`:

> Sometimes, but we can't guarantee this. I thought this was a thought, a point that we already had described elsewhere in requirements where the PRDs may or main not be in the same repo that the project work happens in. Often they will be in a separate repo, like the product repo, which is meant to handle things where the actual application is spread across multiple repos. So it may or it may not.

The [multi-repository PRD](../kiln-multi-repo-delivery/kiln-multi-repo-delivery-prd.md), Summary, Terms and AC-REPO-01/03, already requires this separation. It does not define a remembered-permission group. Retaining the existing PRD-repository storage boundary avoids inventing a cross-repository project registry, while explicit reuse prevents storage location alone from granting authority.

**Example:** A PRD in a product-only repository can approve development targets in its API and web repositories without approving deployment in the product repository. Another PRD stored alongside it receives no effective permission until the person explicitly chooses reuse and starts that execution.

**Confirm or Correct:**

- [ ] Correct — group saved choices by PRD repository, with explicit reuse for each new PRD
- [ ] Wrong — different grouping for remembered choices: _______________

**Confidence:** 65% | **Impact if Wrong:** 🟡 MEDIUM — remembered choices need a different grouping; concrete execution grants remain unchanged.

## Validated Assumptions

| ID | Assumption | Validated | Notes |
|---|---|---|---|
| AUTH-002 | Approve early merges to a named repository and configured base branch for this execution, without an environment field or non-production attestation; retain the grant across restarts without changing preferences or resuming | 2026-10-26 | Doug corrected the earlier environment-based ruling in conversation `01a17975-ea88-7082-ae74-c10be2ad7121`: “the whole thing is we’re merging to a Git branch”; PRD AC-PERMIT-02/05 and Technical Design → Execution grants |
