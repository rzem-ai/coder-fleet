---
id: CF-156
title: Remove the printf-into-grep -q pipe race from gen-agent-pairs.sh
status: In Progress
assignee: []
created_date: '2026-10-07 00:48'
updated_date: '2026-10-07 09:56'
labels:
  - evals
dependencies: []
priority: Medium
type: bug
ordinal: 286000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by the lead on 2026-10-07, on PR #80's CI: `claude/scripts/gen-agent-pairs.sh: line 325: printf: write error: Broken pipe` failed the agent-pairs section, and the rerun of the same commit (16e443d) passed, so it is an intermittent failure shown by two runs. Lines 325, 329 and 333 pipe `printf '%s\n' "$template"` into `grep -qx`; grep -q exits on the first match, printf can then hit SIGPIPE, and under pipefail the pipeline fails. It is the race v0.37.4 removed from about 80 sites in the eval helpers, where `x | grep -q` became a here-string. Not ordered by the human.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 No `printf ... | grep -q` (or other early-exiting reader) pipeline remains in claude/scripts/gen-agent-pairs.sh; each is a here-string or an equivalent that cannot SIGPIPE
- [ ] #2 A search over claude/scripts and claude/coder-fleet/scripts finds no other such pipeline, or each one found is fixed the same way
- [ ] #3 bash claude/evals/lib/check-all.sh passes on the branch
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
created: 2026-10-07 09:53
---
Ordered by the human, 2026-10-07, with the instruction that the lead does the fix itself rather than handing it to an agent. Sub-issue 1 of 1: started. Done still needs: criteria 1 to 3.

It has now failed CI three times: PR #80's first run, a push to main, and CF-29's branch run. The lead builds it in its own worktree under the size floor and lands it through a PR.

Done: nothing yet.

Not done: any CI run can still fail at random in agent-pairs.
---

created: 2026-10-07 09:56
---
Sub-issue 1 of 1: built by the lead, in review; no PR yet. Done still needs: the review, the PR, v0.39.8 on main, criteria 1 to 3 ticked on evidence.

Done: branch cf-156-pipe-race (head ccd4b5e): gen-agent-pairs.sh's three placeholder checks read the template through here-strings. New case generate-large-source in agent-pairs-contract.sh feeds a source of about 200 KB; it fails on the old pipes and passes on the fix (72 of 72). A standalone probe showed the old pipe gives a false 'missing placeholder' 200 times in 200 on a large template and the here-string never does; the real editor templates are about 5 KB, which is why CI hit it only sometimes.

Criterion 2, the wider search: the same pipe shape also appears in claude/coder-fleet/hooks/enforce-agent-scope.sh (five places, under pipefail) and in scripts/board-git-check.sh (one, not under pipefail, so it cannot fail this way). The hooks directory is outside this card's two directories, and a probe of the scope hook with padded sed -i commands from 3 KB to 100 KB was denied 15 times in 15 at every size on main, so there the race fails closed. Those five are left for a card of their own rather than pulling the authorisation hook into this fix.

Not done: nothing is on main; any CI run can still fail at random until it merges.
---
<!-- COMMENTS:END -->
