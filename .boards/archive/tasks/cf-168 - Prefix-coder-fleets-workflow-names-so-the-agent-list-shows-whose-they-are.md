---
id: CF-168
title: Prefix coder-fleet's workflow names so the agent list shows whose they are
status: In Progress
assignee: []
created_date: '2026-10-22 01:35'
updated_date: '2026-11-11 23:16'
labels:
  - workflows
dependencies: []
priority: Low
ordinal: 9000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Alex, 22 Oct 2026, watching a Fathom session: the running-agents list showed "coder-fleet:reviewer" beside a bare "review-round" and he read them as two separate review processes; "coder-fleet:review-round gets shortened to just review-round which caused me some confusion". He asked for this card: "yes, file it in coder-fleet".

Cause: an agent is listed by its plugin-qualified type, but a workflow is listed by the name in its script's own meta block, and all three shipped workflows declare a bare name - claude/coder-fleet/workflows/review-round.js:2 name: 'review-round', deep-research.js:2 'deep-research', spec-to-card.js:2 'spec-to-card'. They are invoked as coder-fleet:<name>, so the list and the invocation disagree.

Check before changing: whether anything keys on the bare meta.name (hooks, the evals, docs, the workflow-authoring rule that meta is a pure literal, resume by runId) and whether a colon is allowed in meta.name.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each workflow shipped under claude/coder-fleet/workflows/ shows in the running-agents list with a name that says it is coder-fleet's (e.g. coder-fleet:review-round)
- [ ] #2 Nothing that reads a workflow's meta.name breaks: hooks, evals and docs that name the workflows are updated in the same change, and a check pins the prefix on every shipped workflow
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 `bash claude/evals/lib/check-all.sh` passes on the branch
- [ ] #2 The reviewer approved, and a refuter round ran where lead.md step 4 calls for one - satisfied with no refuter round and no substitute gate run when .claude/coder-fleet.json disables the refuter
- [ ] #3 `migration-checklist` findings are in the PR when an agent body or skill frontmatter changed
- [ ] #4 The version is bumped in plugin.json and .claude-plugin/marketplace.json, and the release is tagged and pushed
- [ ] #5 The port divergence register has a row where a ported artefact changed
- [ ] #6 The spec, where there is one, is linked as a reference
<!-- DOD:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: lead
created: 2026-11-11 22:26
---
Sub-issue 1 of 1: started, 12 Nov 2026, by drain; the card is in Next, which is the human's order. Done still needs: criteria 1 and 2.

Lead notice: the three shipped workflows declare a name that says they are coder-fleet's, so the running-agents list shows `coder-fleet:review-round` and not a bare `review-round`, and a check pins the prefix on every shipped workflow. What the human will see: a workflow in the agent list named the way it is invoked.

Lead defaults for the builder: first establish whether Claude Code accepts a colon in a workflow's meta.name and how a plugin workflow is then invoked (the risk is `coder-fleet:coder-fleet:review-round`, or a name the harness refuses); if a colon cannot work, that is a Blocker for the human with the alternatives named, not a guess such as a hyphen. Nothing can be run live from a builder's worktree, so what the list shows stays unverified until a session runs the released plugin.

Done: nothing yet. Not done: the three workflows still declare bare names.
---

author: lead
created: 2026-11-11 22:31
---
Drain, 12 Nov 2026: parked on the coder's Blocker; nothing was built and no name changed. Sub-issue 1 of 1: started. Done still needs: the human's choice, then criteria 1 and 2.

What the coder found, read from the installed Claude Code 2.1.322 and its docs, not from a live run: a colon is accepted in a workflow's meta.name, but the plugin loader always registers a plugin workflow as `<plugin>:<meta.name>` and finds it by exact name. So `meta.name: 'coder-fleet:review-round'` registers as `coder-fleet:coder-fleet:review-round` and today's `coder-fleet:review-round` call stops resolving. The agent list labels a run by the script's bare meta.name, which is why it shows `review-round`. No hook, eval or doc keys on meta.name; hooks bind a run to its card through the `wf_<run>` folder.

The choices: (1) take the doubled name, so the list reads `coder-fleet:review-round` and every call becomes `coder-fleet:coder-fleet:review-round`; (2) a hyphen prefix, `coder-fleet-review-round`, called as `coder-fleet:coder-fleet-review-round`; (3) set meta.title and leave the name, which by the code changes only one timeline view; (4) leave the names and ask Anthropic to label plugin workflows by their registered name. The lead's lean is (4) or (2): (1) and (2) both change how every workflow is called, in the lead, the commands and 28 files.

Done: the cause is established. Not done: the list still shows bare names.
---

author: lead
created: 2026-11-11 23:16
---
The human's answer to the coder's Blocker, asked in the session on 12 Nov 2026: "Leave names (Recommended)" - keep the bare workflow names and close the card as not buildable here, since the clean fix is Anthropic labelling plugin workflows by their registered name. Nothing was built and no name changed. The card is archived on that answer, with its criteria unticked because they cannot be met in this repo.

Done: the cause is recorded above. Not done: the running-agents list still shows `review-round` beside `coder-fleet:reviewer`, by the human's decision.
---
<!-- COMMENTS:END -->
