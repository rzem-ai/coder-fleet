---
id: CF-52
title: >-
  Cut agent worktrees from the local HEAD, and give coders the project's
  worktree setup
status: In Progress
assignee: []
created_date: '2026-09-28 01:36'
updated_date: '2026-09-30 09:28'
labels: []
dependencies: []
references:
  - 'https://github.com/rzem-ai/coder-fleet/issues/25'
  - claude/coder-fleet/templates/project-settings.json
  - docs/limits.md
priority: High
ordinal: 79000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
GitHub issue #25, from the Fathom Models post-mortem (fathom docs/runs/2026-09-28-lead-models-live.md, finding 7). Every agent worktree that week was cut from origin/main nine merges behind the unpushed local main, and every coder brief carried the fast-forward and node_modules steps by hand. Found in triage on 2026-09-28: Claude Code 2.1.283 defines the setting worktree.baseRef as "fresh" (default, origin/<default-branch>) or "head" (the current local HEAD), so the base is a setting the fleet ships, not a hook. Dependencies are a separate problem, and project-specific, so they live in each project's AGENTS.md, not in the plugin. The human chose to handle both in this item.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 templates/project-settings.json sets worktree.baseRef to "head", and /init writes it
- [ ] #2 /kickoff detects a project on the default and offers the change, changing nothing without the human's yes
- [ ] #3 a live run shows a type-isolated coder spawn and a review-round worktree both cut from local HEAD with local main ahead of origin, recorded in docs/limits.md, which drops or rewrites its fresh-baseRef entry; hooks/README.md item 18 updated to match
- [ ] #4 lead.md says in one clause that agent worktrees cut from the lead's current HEAD, so a spawn from a feature branch stacks on it
- [ ] #5 templates/AGENTS.md gains a worktree setup section (how a fresh worktree gets its dependencies, or none needed), /init asks for it, and coder.md tells coders to follow that section before building
- [ ] #6 check-all green, migration-checklist run on coder.md and lead.md, version bumped and tagged
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-09-30 08:33
---
The human ordered this built on 2026-09-30 ("fix the github issues", #25). Split: the coder builds #1, #2 and #5 now, and drafts the docs/limits.md wording for #3. The lead does #3's live run after merge, because it needs real spawns. #4's lead.md clause lands in the serial lead.md track after CF-51. #6's version bump is batched into a joint release.
---

author: @SubagentStop
created: 2026-09-30 08:49
---
Done. coder-fleet:scripter finished with no blockers. From "## Done" in its handoff:

- Commit `Cut agent worktrees from the local HEAD and give coders the project's worktree setup` (#1): `claude/coder-fleet/templates/project-settings.json` sets `worktree.baseRef: "head"`. `claude/coder-fleet/commands/init.md` merges it as a fourth key and lists "worktree setup" among the sections it checks an existing `AGENTS.md` for.
- Same commit (#2): `claude/coder-fleet/commands/kickoff.md` has a new preflight check 7, "Worktree base". Absent or `"fresh"` is a note, not a failure. It offers `"head"` with AskUserQuestion and writes `.claude/settings.json` only on the human's yes. It also notes a missing or unfilled Worktree setup section.
- Same commit (#5): `claude/coder-fleet/templates/AGENTS.md` has a new `## Worktree setup` section with a `<FILL: ...>` marker, and "none needed" is allowed. `init.md` always asks for it. `claude/coder-fleet/agents/coder.md` step 2 tells coders to follow it before building, and to say so in the handoff if it is missing or unfilled.
- Same commit: new test `claude/evals/lib/worktree-base-contract.sh` (11 checks), wired into `claude/evals/lib/check-all.sh`.
- Commit `Rewrite the fresh-baseRef limit and hooks README item 18 for head` (#3, docs half): `docs/limits.md` "Worktree isolation for a workflow-spawned coder" is rewritten in place. It says the template ships `"head"`, the live run is not yet recorded, and the entry stays until it is. The no-remote clause is dropped, since the docs say `fresh` falls back to local HEAD with no remote.
- Same commit: `claude/coder-fleet/hooks/README.md` item 18 is updated the same way. The live run is not claimed.
- Commit `Make the worktree-base contract executable and update the init fixture line`: the new contract script had no exec bit, and the whitelisted `init.md` line in `claude/evals/lib/instruction-file-contract.sh` needed the new "worktree setup" wording.
- Setting name confirmed: the installed Claude Code 2.1.285 binary defines `baseRef:G(["fresh","head"])`. Its description reads "'fresh' (default) branches from origin/<default-branch> ... 'head' branches from your current local HEAD".
- Same source check: https://code.claude.com/docs/en/worktrees, section "Choose the base branch", agrees, with the example `{"worktree": {"baseRef": "head"}}`.
- Conflicting source: a summarising fetch of https://code.claude.com/docs/en/settings-reference returned `"remote"`/`"local"` with default `"remote"`. It disagrees with the binary and the worktrees page, so I followed the binary and treat that fetch as unreliable.
- `coder.md` is not generated: `claude/agent-pairs/` does not exist in this checkout and `gen-agent-pairs.sh` reports no pair sources, so I edited the agent file directly.
- Migration-checklist over `coder.md`, single-agent checks, run through a scratchpad script, all pass: frontmatter parses, `tools` is a string, `skills` is a list and all four skills exist.
- Same run: `name` matches the filename, `isolation` is `worktree`, `effort` is `medium`, 56 lines (limit 60), four H2 sections in order, no dashes, no hard-wrapped prose. The only `# ` line is a YAML comment inside the frontmatter.
- Test failure modes: `worktree-base-contract.sh` passed 2 of 11 before the changes and 11 of 11 after. The "kickoff changes nothing without a yes" check is scoped to the check-7 line, because it passed vacuously against the existing preflight-2 text. Each check fails if its named setting, section or sentence is removed.
- `./claude/evals/lib/check-all.sh`, first run: exit 1 with two failures, both mine (`worktree-base` exec bit, `instruction-file` whitelisted line).
- After the fixes I ran `instruction-file-contract.sh` and `worktree-base-contract.sh` alone (13 and 11 passed), then `check-all.sh` again in full: exit 0. The full suite therefore ran twice, not once, and neither run timed out.
---

author: @SubagentStop
created: 2026-09-30 09:18
---
Done. coder-fleet:reviewer finished with no blockers. From "## Done" in its handoff:

- Verdict: approve with follow-ups. No must-fix findings.
- Reviewed `git diff main...HEAD` in `/Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-a7406e0112554f70b` (three commits, 10 files) against CF-52 criteria #1, #2, #5 and the docs half of #3, per comment #1.
- Confirmed `"fresh"`/`"head"` from `/Users/alex/.local/share/claude/versions/2.1.285`: the schema enum and description, the `Xe().worktree?.baseRef==="head"` check in worktree creation, and the `/config` enum. The `"remote"`/`"local"` fetch was wrong.
- Contract test: every check fails on a revert of its piece, and the kickoff yes-check is non-vacuous. The exec bit is committed (100755).
- low: claude/coder-fleet/commands/kickoff.md:18 - reads `settings.local.json` first but writes `settings.json`, so a local `"fresh"` shadows the yes; user-scope `"head"` set via `/config` is not read and gets re-offered
- low: claude/coder-fleet/agents/coder.md:30 - the missing-section fallback names no handoff heading and does not say the brief's setup steps still count
- low: claude/coder-fleet/hooks/README.md:555 - "is pending and is recorded in docs/limits.md" can read as the live run being recorded
- low: claude/coder-fleet/commands/kickoff.md:18 - the yes-gate is stated twice; say it once and point the contract grep at the phrase that stays
- low: claude/coder-fleet/commands/init.md:54 - "always asked, never inferred silently" contradicts line 56's fill-on-decline rule for the Worktree setup marker
---

author: @SubagentStop
created: 2026-09-30 09:22
---
Done. coder-fleet:refuter finished with no blockers. From "## Done" in its handoff:

- Baseline: `bash claude/evals/lib/worktree-base-contract.sh -v` 11 passed, exit 0, 0.06s. `./claude/evals/lib/check-all.sh` exit 0, "Every deterministic check passes", 4m23s.
- Killed by the narrow contract (exit 1): m1 `baseRef` set to `"fresh"`; m2 `worktree` object removed from the template; m4 coder.md's Worktree setup sentences removed; m5 init.md's Worktree setup question removed; m7 Worktree setup section removed from `templates/AGENTS.md`.
- survived: `claude/coder-fleet/commands/init.md:26`, conflict rule changed to "is replaced with the template value" - init could overwrite a project's existing different `worktree.baseRef` (or any key) and nothing checks the no-overwrite rule (narrow contract exit 0).
- survived: `claude/coder-fleet/commands/kickoff.md` step 7, ask sentence replaced by "Do not ask: merge it now" while keeping the literal "only on the human's yes" in a parenthetical - the consent check matches a phrase, not the rule (narrow contract exit 0).
- survived: `docs/limits.md` Worktree isolation entry rewritten to say the live run was recorded and started at local HEAD, and the "entry stays" sentence removed - nothing guards limits.md against a false claim (narrow contract exit 0).
- Question 3: the init.md text as written neither overwrites a different `worktree.baseRef` nor drops other keys (lines 22 and 26), and kickoff says "without touching another key". Only the wording protects this.
- Worktree `/Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-a7406e0112554f70b` confirmed clean.
---

created: 2026-09-30 09:23
---
Round 1, 2026-09-30. Review: approve with five lows. It confirmed 'head' against the 2.1.285 binary's schema, worktree-creation code and /config enum; the remote/local fetch was wrong. Gap: scripter.md (also isolation: worktree) lacks the setup instruction coder.md got. Refuter: 5 of 8 mutants killed; three wording survivors: init.md's no-overwrite rule is unguarded (m8), kickoff's consent check pins a phrase rather than the rule (m3), and limits.md could falsely claim the live run happened (m6). Fix round 1 (scripter resumed) covers all of these. Follow-ups already filed: CF-92 (this repo's own AGENTS.md setup section and gates). The live run (#3) will need worktree.baseRef 'head' in the target project's settings first.
---

author: @SubagentStop
created: 2026-09-30 09:23
---
Done. coder-fleet:refuter finished with no blockers. From "## Done" in its handoff:

- Baseline: `bash claude/evals/lib/worktree-base-contract.sh -v` 11 passed, exit 0, 0.06s. `./claude/evals/lib/check-all.sh` exit 0, "Every deterministic check passes", 4m23s.
- Killed by the narrow contract (exit 1): m1 `baseRef` set to `"fresh"`; m2 `worktree` object removed from the template; m4 coder.md's Worktree setup sentences removed; m5 init.md's Worktree setup question removed; m7 Worktree setup section removed from `templates/AGENTS.md`.
- survived: `claude/coder-fleet/commands/init.md:26`, conflict rule changed to "is replaced with the template value" - init could overwrite a project's existing different `worktree.baseRef` or any key; narrow contract and full `check-all.sh` both exit 0.
- survived: `claude/coder-fleet/commands/kickoff.md` step 7, ask sentence replaced by "Do not ask: merge it now" while keeping the literal "only on the human's yes" in a parenthetical - the consent check matches a phrase, not the rule; narrow and full both exit 0.
- survived: `docs/limits.md` Worktree isolation entry rewritten to say the live run was recorded and started at local HEAD, and the "entry stays" sentence removed - nothing guards limits.md against a false claim; narrow and full both exit 0.
- Question 3: the init.md text as written neither overwrites a different `worktree.baseRef` nor drops other keys (lines 22 and 26), and kickoff says "without touching another key". Only the wording protects this.
- Worktree `/Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-a7406e0112554f70b` confirmed clean.
---

author: @SubagentStop
created: 2026-09-30 09:28
---
Done. coder-fleet:scripter finished with no blockers. From "## Done" in its handoff:

- Commit `Give scripter the worktree setup step and file a missing section under Unverified`: `claude/coder-fleet/agents/scripter.md` step 2 now carries the same Worktree setup instruction as `coder.md`.
- Same commit: in both agents, a missing or unfilled section is noted "under Unverified" (review low 2), and setup steps given in the brief still run.
- Same commit: `claude/coder-fleet/templates/AGENTS.md` now says "Coders and scripters follow this section before building."
- Commit `Guard kickoff consent, init no-overwrite and the pending live run, and fix the review lows`, kickoff (`claude/coder-fleet/commands/kickoff.md` step 7): reads the local settings file, then the project file, then `~/.claude/settings.json`. A user-scope `"head"` set through `/config` passes (low 1).
- Same commit, kickoff: the duplicated consent phrase is gone, and the one that stays is "on the human's yes, and only then, merge".
- Same commit, kickoff: when `settings.local.json` is the file that set `"fresh"`, the change goes into that file. Otherwise it goes into `.claude/settings.json`.
- Same commit: `claude/coder-fleet/commands/init.md` says a declined interview always leaves the `Worktree setup` marker (low 4).
- Same commit: `claude/coder-fleet/hooks/README.md` item 18 now reads "is pending; docs/limits.md carries it until it runs" (low 3).
- Same commit: `claude/evals/lib/worktree-base-contract.sh` grows from 11 to 27 checks. Kickoff step 7 asks with AskUserQuestion, merges only on yes, never says "Do not ask" or "without asking", names `settings.local.json`, and counts a user-scope head as passing (m3).
- Same commit, new checks: `init.md` keeps its "report it and leave it alone" rule for a differing existing key (m8), and the declined interview leaves the Worktree setup marker.
- Same commit, new checks: scripter follows Worktree setup and the template names scripter. Both agents file a missing section under Unverified and honour setup given in the brief, checked against the step-2 line only, because "under Unverified" already appeared in each Handoff section.
- Same commit, new checks: `docs/limits.md` says the live run is pending and does not say it "has been recorded" (m6), with a comment that the check must change when the lead records the live run. The hooks README says the run is pending.
- Failing before the fix: before I changed any text, the new checks gave 10 FAIL on the current tree (17 passed, 10 failed).
- Failing against each survivor: the refuter's m3, m6 and m8 directories are copies of the pre-fix tree, so they lack the fixes and would fail trivially. I re-applied each mutation to a scratch copy of the fixed tree with `mut.py` in my scratchpad; the wording is reconstructed from the diffs against m3, m6 and m8.
- Mutation results: the unmutated copy passes 27 of 27. m3 fails 3 checks ("asks with AskUserQuestion", "merges only on yes", "never says it merges unasked"). m6 fails 2 ("says the live run is pending", "does not claim it was recorded"). m8 fails 1 ("init leaves a differing existing key alone").
- Migration-checklist over `scripter.md`, with the scratchpad script: it parses, `tools` is a string, `skills` is a list and all four skills exist, `name` is scripter and `isolation` is worktree. It is 56 lines, has four H2 sections, and has no dashes or hard-wrapped prose. `coder.md` re-checked at 56 lines.
- `./claude/evals/lib/worktree-base-contract.sh` exited 0 (27 passed, 0 failed), output captured.
- `./claude/evals/lib/check-all.sh` exited 0 ("Every deterministic check passes"), output captured, one run.
- I did not touch `lead.md` and did not bump the version.
---
<!-- COMMENTS:END -->
