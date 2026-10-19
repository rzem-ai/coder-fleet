---
id: CF-113
title: Warn in --check on a disabledAgents name that matches no fleet agent
status: Done
assignee: []
created_date: '2026-10-04 09:23'
updated_date: '2026-10-06 04:41'
labels: []
dependencies:
  - CF-111
priority: Low
type: enhancement
ordinal: 165000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Proposed by the CF-111 reviewer, 2026-10-04. A hand-edited misspelling in `.claude/coder-fleet.json` (e.g. `refutor`) silently disables nothing. CF-111.1's command refuses unknown names, but only for edits made through the command. `enforce-disabled-agents.sh --check`, and so check-all, should warn on a name that matches no file under the plugin's `agents/` directory. Not ordered yet: waits for the human's go.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `enforce-disabled-agents.sh --check` reports a `disabledAgents` entry that names no agent under the plugin's agents/ directory, naming the entry, and a contract test covers it
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 `bash claude/evals/lib/check-all.sh` passes on the branch
- [x] #2 The reviewer approved, and a refuter round ran where lead.md step 4 calls for one
- [x] #3 `migration-checklist` findings are in the PR when an agent body or skill frontmatter changed
- [x] #4 The version is bumped in plugin.json and .claude-plugin/marketplace.json, and the release is tagged and pushed
- [x] #5 The port divergence register has a row where a ported artefact changed
- [x] #6 The spec, where there is one, is linked as a reference
<!-- DOD:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: lead
created: 2026-10-04 09:58
---
The human ordered this, 2026-10-04 ('go ahead with CF-113 too'). Plan: it starts when CF-111's fix round (`cf-111-fix-1`) hands back, on a branch from that tip, because it edits the same `hooks/lib/fleet-config.sh` and `enforce-disabled-agents.sh --check` the fix round has open. It ships in the same 0.30.0 PR and is covered by CF-111's round 2 review and refuter. Lead decisions for the build: (1) an unknown name is a warning, not an error: `--check` prints a line naming the entry and still exits 0, and the file stays valid. Its entry was already harmless, because it disables nothing; failing would break a project that lists an agent a newer plugin version adds. (2) The roster comes from the same source as CF-111.1's `fleet-agents.sh` (the plugin's `agents/*.md` with `-fable` folded in), moved into `fleet-config.sh` so the command and `--check` share one roster function.
---

author: @SubagentStop
created: 2026-10-04 10:15
---
Done. coder-fleet:scripter finished with no blockers. From "## Done" in its handoff:

- Confirmed this is a linked worktree (`git rev-parse --git-common-dir` returns the main `.git`). Work is on branch `cf-113-unknown-names`, cut from `cf-111-fix-1`, in two commits. Nothing was pushed, merged, tagged or opened as a PR, and the version stays 0.30.0.
- Commit `Warn when --check finds a disabledAgents entry that names no fleet agent (CF-113)` changes `claude/coder-fleet/hooks/lib/fleet-config.sh`. It adds the shared `fleet_roster <plugin root>`, which reads `agents/*.md`, folds `-fable` names into their base and prints a sorted, space-separated list.
- Same commit, `claude/coder-fleet/hooks/enforce-disabled-agents.sh`: `--check` prints `warning: .claude/coder-fleet.json lists "<entry>" under disabledAgents, which matches no fleet agent...` for each valid entry that is not on the roster after dropping `-fable`. It still exits 0, and the spawn hook path is unchanged.
- Same commit, `claude/coder-fleet/scripts/fleet-agents.sh`: its own roster loop is replaced by a call to `fleet_roster`.
- Same commit, docs: `claude/coder-fleet/hooks/README.md` (Disabled agents `--check` paragraph) describes the warning and the shared roster. `docs/limits.md` ("A name that is no agent's is accepted") now says `--check` warns and nothing warns at spawn time.
- Same commit, tests in `claude/evals/lib/disabled-agents-contract.sh` and `claude/evals/lib/agents-command-contract.sh`.
- Commit `Document that no config is read outside a git repository or with a bare main (CF-113)` adds one sentence to `README.md` and one entry to `docs/limits.md`.
- Tests that failed on the old code, each run before the change: `--check` warns on `refutor`, names it, exits 0 (the old `--check` printed no warning). `--check` warns about every unknown entry and only those (same cause). `fleet_roster` lists the agents with `-fable` folded (the function did not exist). `fleet_roster` matches the roster read from `agents/`, in the agents-command contract (the function did not exist). The script builds no roster of its own, in the agents-command contract (`fleet-agents.sh` still globbed `agents/*.md`).
- Tests that passed on the old code, so they are guards and not proof of the change: `--check` gives no warning for a known name. `--check` recognises a `-fable` name as its base (only proves the roster check, not the fold). A known name (`refuter`, `scout`) is still denied beside an unknown one, and an unlisted agent is still allowed (the spawn hook is unchanged).
- Ran `bash claude/evals/lib/disabled-agents-contract.sh`: 106 passed, 0 failed.
- Ran `bash claude/evals/lib/agents-command-contract.sh`: 66 passed, 0 failed.
- Ran `bash claude/evals/lib/check-all.sh` once, output captured in the scratchpad (`ca.txt`): exit 0, "Every deterministic check passes." The versions line reads `plugin.json 0.30.0, marketplace entry 0.30.0`.
---

author: lead
created: 2026-10-04 10:15
---
Built: b039f06 and 4541e0b on `cf-113-unknown-names` (on top of `cf-111-fix-1`, not on main). The scripter reports disabled-agents 106/0, agents-command 66/0 and check-all exit 0. Next: it is reviewed and refuted as part of CF-111's round 2 over the combined branch, then ships in the 0.30.0 PR.
---

author: lead
created: 2026-10-04 13:07
---
Reviewed and refuted as part of CF-111 rounds 2 and 3. Round 2's L4 changed the fold to the roster side only, so a `refuter-fable` entry with no agent file now warns. Ships in PR #55 (v0.30.0), not merged yet. The lead's gate run on 1f5202d: check-all exit 0.
---

author: lead
created: 2026-10-04 21:20
---
Merged to main at fc5bd80 (PR #55) and released in v0.30.0. Criterion #1 is proven on main by disabled-agents-contract.sh: --check warns on refutor, warns on every unknown entry and only those, warns on refuter-fable (fold on the roster side only), and exits 0. DoD: check-all exit 0; reviewed and refuted in CF-111 rounds 2 and 3; #3 not applicable, as no agent body changed; tagged and pushed; #5 not applicable, as no ported artefact changed; #6 not applicable, as there's no spec.
---
<!-- COMMENTS:END -->
