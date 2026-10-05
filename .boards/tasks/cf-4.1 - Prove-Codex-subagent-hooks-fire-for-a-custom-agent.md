---
id: CF-4.1
title: Prove Codex subagent hooks fire for a custom agent
status: To Do
assignee: []
created_date: '2026-09-25 01:08'
updated_date: '2026-09-30 14:02'
labels: []
dependencies: []
references:
  - codex/docs/specs/GPTA-1.md
  - codex/docs/plans/GPTA-1.1.md
parent_task_id: CF-4
type: spike
ordinal: 3000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Formerly GPTA-1.1 on the gptcode-agents board, renumbered when the boards were folded into the coder-fleet repo on 26 September 2026. Log entries below keep the old ids.

Go/no-go spike from the GPTA-1 spec, open question 21. On the installed Codex CLI (0.156.1), prove that SubagentStart, SubagentStop with decision: block, and PreToolUse on a file edit (apply_patch, not only shell) all fire for a custom subagent defined in TOML. Also record: whether [features] codex_hooks is still required, SubagentStart additionalContext support, the MCP tool-name prefix PreToolUse sees, and whether project hooks load inside a worktree. The answer decides the port's shape.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Provisional: the spec settles what done means here, and its criteria replace this one
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 `bash claude/evals/lib/check-all.sh` passes on the branch
- [ ] #2 The reviewer approved, and a refuter round ran where lead.md step 4 calls for one
- [ ] #3 `migration-checklist` findings are in the PR when an agent body or skill frontmatter changed
- [ ] #4 The version is bumped in plugin.json and .claude-plugin/marketplace.json, and the release is tagged and pushed
- [ ] #5 The port divergence register has a row where a ported artefact changed
- [ ] #6 The spec, where there is one, is linked as a reference
<!-- DOD:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @SubagentStop
created: 2026-09-25 09:06
---
Done. claudecode-agents:scripter finished with no blockers. From "## Done" in its handoff:

- Confirmed the worktree: `git rev-parse --git-common-dir` points at the main repo's `.git`, branch `worktree-agent-af83b7d1806f0e868`, base `e234444 initial commit`, which contains both `docs/plans/GPTA-1.1.md` and `docs/specs/GPTA-1.md`. Working tree was clean before I started.
- Built the harness under `/private/tmp/.../scratchpad/gpta-1.1/`: a throwaway git repo plus a worktree of it, a scratch `CODEX_HOME` (`config.toml`, `hooks.json`, four hook shell scripts), two custom agent TOMLs (`spike-worker`, ordinary; `spike-readonly`, `sandbox_mode = "read-only"`), symlinked to the real `~/.codex/auth.json` (never copied, never printed).
- Ran the harness against codex-cli 0.156.1: two `codex exec` runs spawning `spike-worker` (SubagentStart/Stop/PreToolUse lifecycle), two spawning `spike-readonly` (sandbox refusal), one `codex features list`, one `codex doctor`. Six Codex invocations total, run one at a time.
- Wrote `docs/findings/GPTA-1.1-codex-hooks.md`: one section per plan question (1-7), each with a verdict and the evidence behind it, opening with the required three-line go/no-go summary for questions 1-3.
- Wrote the re-runnable harness at `scripts/spike/codex-hooks/` (`setup.sh`, `run-subagent-lifecycle.sh`, `run-readonly-sandbox.sh`, `features-list.sh`, the `codex-home/` template and `agents/` TOMLs) with a `README.md` explaining how to re-run it, including the auth-symlink step and the hook-trust wall it hit.
- Grepped both deliverables for em/en dashes, emoji ranges and token-shaped strings before committing - all clean.
- Committed on branch `worktree-agent-af83b7d1806f0e868`, commit `f4b09d8`: "Add GPTA-1.1 codex-hooks spike findings and harness". `git status` is clean after the commit.
- Verdicts: question 4 (codex_hooks flag) - No, not required, confirmed via `codex features list` showing `hooks stable true` and no `codex_hooks` entry among 149 flags. Question 7 (read-only sandbox) - No, the write was not refused; `spike-readonly-output.txt` was created both times with exit 0 and no error text. Questions 1, 2, 3, 5, 6 - unverified: every hook in `hooks.json` needs a one-time interactive trust review that `codex exec` has no prompt for, so hooks were silently skipped (empty logs, no error) across every run. The one documented non-interactive path, `codex exec --dangerously-bypass-hook-trust`, was refused by this session's own safety classifier before it reached Codex - a property of my run environment, not a proven Codex limitation. Full detail and exact log/doctor output is in the findings file.
---

author: @SubagentStop
created: 2026-09-25 09:12
---
Done. claudecode-agents:reviewer finished with no blockers. From "## Done" in its handoff:

- Verdict: approve with follow-ups. The credential path is clean: nothing copies, prints, logs or commits `auth.json`, and no token-shaped strings are committed.
- Reviewed the diff `e234444...f4b09d8` (14 files) against `/Users/alex/Dev/Work/extensions/gptcode-agents/docs/plans/GPTA-1.1.md` and spec question 21.
- Checked every verdict against the spike's on-disk evidence in `/private/tmp/claude-501/-Users-alex-Dev-Work-extensions-gptcode-agents/fa930995-41f6-45af-a94e-9a7e6d4828cd/scratchpad/gpta-1.1/`. Q4 No follows from `features-list.txt` (`hooks stable true`, no `codex_hooks` row). Q7 No is confirmed, and more strongly than stated, by the subagent rollout's `sandbox_policy` of `workspace-write`. Q1, Q2, Q3, Q5 and Q6 are correctly unverified.
- Checked the writing conventions: pure ASCII, no dashes, no emojis, no hard-wrapped prose, Australian spelling.
- No run article: the spawn prompt did not ask for one.
---

author: @SubagentStop
created: 2026-09-25 09:19
---
Done. claudecode-agents:scripter finished with no blockers. From "## Done" in its handoff:

- Cited the subagent's own session rollout for question 7 in `docs/findings/GPTA-1.1-codex-hooks.md`: `codex-home/sessions/2026/09/25/rollout-2026-09-25T19-01-29-*.jsonl` is the `spike-readonly` subagent's own thread (`"agent_role":"spike-readonly"`), carrying `"sandbox_policy":{"type":"workspace-write","network_access":false,...}`, and the parent's `spawn_agent` call in `rollout-2026-09-25T19-01-18-*.jsonl` carries only `{"task_name":"spike_readonly","agent_type":"spike-readonly","message":"..."}` with no sandbox override. Dropped the "worth re-checking" hedge - the finding is now stated plainly: the agent TOML's `sandbox_mode = "read-only"` was not applied.
- Fixed the run counts: one lifecycle exec, one readonly exec - the bypass-flag attempt never reached Codex, so it was not a second run of either.
- Restated the hook-trust wall as an inference from the docs plus the harness's own empty logs, not something observed in any Codex log, and added a "Two confounds" subsection naming both: `$CODEX_HOME` expansion in the hook `command` field, and guessed output shapes.
- Fixed the follow-up note: trusting the scratch `CODEX_HOME`'s hooks via `/hooks` trusts only those scratch hooks, keyed to their hash, and does nothing for the real `~/.codex/hooks.json`, which needs its own separate trust step.
- Used WebFetch on `https://developers.openai.com/codex/hooks` and the config reference, both re-fetched this round for schema/output-shape detail. Added a "Hook output shapes, confirmed from the docs" section quoting: the `hooks.<Event>[].{matcher,hooks[]}` schema and that `matcher` is optional; the docs' shell-substitution example as evidence for shell execution, noting the docs never say "runs through a shell" outright; the SubagentStart shape `{"hookSpecificOutput":{"hookEventName":"SubagentStart","additionalContext":"..."}}`; the SubagentStop shape `{"decision":"block","reason":"..."}`; and PreToolUse's primary shape `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"..."}}` versus its documented-as-legacy flat form. Both docs pages were fetchable.
- Harness fixes in `scripts/spike/codex-hooks/`: `setup.sh` now writes absolute, already-expanded hook command paths into `hooks.json` instead of relying on `$CODEX_HOME` shell expansion; `subagent-start-context.sh` and `pretooluse-log.sh` now emit the primary documented output shapes; `subagent-stop-block-once.sh` keeps the flat shape, the only one documented for that event. Exported `SPIKE_LOG_DIR`/`SPIKE_STATE_DIR` in `run-readonly-sandbox.sh`. Removed the `/tmp` fallback from every hook script - each now fails loudly if unset. Every script resolves its scratch-dir argument to an absolute path, refuses on an empty argument, and refuses if the scratch `codex-home` it would use resolves to the real `~/.codex`. `setup.sh` is now idempotent. Added the "do not write the file yourself" clause to the readonly prompt. Added `teardown.sh`; `README.md` gets a teardown step and drops the old claim that nothing writes to `~/.codex` through the symlink - a token refresh writes back through it, and the README now says so. Deleted the unused `log-payload.sh`.
- Ran the committed `setup.sh` from scratch into a fresh `/private/tmp/claude-501/-Users-alex-Dev-Work-extensions-gptcode-agents/fa930995-41f6-45af-a94e-9a7e6d4828cd/scratchpad/gpta-1.1-r2/`, twice (idempotency check), both exits 0. Inspected the generated `hooks.json` and `config.toml`: all placeholders resolved correctly, no leftover tokens including comments (fixed a cosmetic bug where a comment also contained the literal placeholder text). `gpta-1.1-r2/` is left in place for the human's `/hooks` step. Did not run `codex exec` against these hooks this round, so hooks.json and the hook scripts stayed final.
- Syntax-checked all eleven shell scripts with `bash -n` individually - all clean.
- Grepped both deliverables for em/en dashes and token-shaped strings after every edit - clean.
- Committed on branch `worktree-agent-af83b7d1806f0e868`, commit `0271b40`: "Fix GPTA-1.1 codex-hooks reviewer findings on f4b09d8". `git status` clean afterwards.
- To open Codex against `gpta-1.1-r2` for the `/hooks` step: `export CODEX_HOME=/private/tmp/claude-501/-Users-alex-Dev-Work-extensions-gptcode-agents/fa930995-41f6-45af-a94e-9a7e6d4828cd/scratchpad/gpta-1.1-r2/codex-home` then `cd /private/tmp/claude-501/-Users-alex-Dev-Work-extensions-gptcode-agents/fa930995-41f6-45af-a94e-9a7e6d4828cd/scratchpad/gpta-1.1-r2/scratch-repo && codex`. In the TUI, `/hooks` should show exactly three pending: `SubagentStart` -> `subagent-start-context.sh`, `SubagentStop` -> `subagent-stop-block-once.sh`, `PreToolUse` -> `pretooluse-log.sh`, each an absolute path under `.../gpta-1.1-r2/codex-home/hooks/`. Trust all three, then use `codex exec` from the same `CODEX_HOME`/cwd to run `run-subagent-lifecycle.sh` and `run-readonly-sandbox.sh` to clear questions 1, 2, 3, 5 and 6.
---

author: @SubagentStop
created: 2026-09-25 10:28
---
Done. claudecode-agents:scripter finished with no blockers. From "## Done" in its handoff:

- Verified `gpta-1.1-r2/codex-home` before touching anything: three `[hooks.state...]` tables with `trusted_hash` entries already present in `config.toml`, `auth.json` symlink in place, `hooks.json` and `hooks/` unchanged from what round 2 committed. Did not edit either.
- Registered the MCP stub via `codex mcp add spike_stub -- python3 .../mcp-stub/server.py` against `gpta-1.1-r2/codex-home` (adding an MCP server entry only, no hook edit, as permitted).
- Ran `run-subagent-lifecycle.sh` against `gpta-1.1-r2` with plain `codex exec` (no bypass flag): all three hooks fired on the first attempt. `SubagentStart.log` carries `agent_type:"spike-worker"` plus `session_id`, `turn_id`, `cwd`, `model`, `permission_mode`. `SubagentStop.log` shows two calls for the same `agent_id`, `stop_hook_active` false then true, and the subagent's own `last_assistant_message` on the second call says "Received the one-time SubagentStop block" - decision:block measurably sent it back. `PreToolUse.log` captured the shell write (`tool_name:"Bash"`, `agent_type:"spike-worker"` carried since the call came from inside the subagent) and the parent's own `spawn_agent`/`wait_agent` calls (no `agent_type` at the top level for those, since they are the parent's own calls). Both `SubagentStop` messages end in the literal token `SPIKE_MARKER_9f3a`, confirming `additionalContext` reached the subagent.
- Ran a second, targeted prompt (now committed as `run-applypatch-mcp.sh`) asking `spike-worker` to use `apply_patch` on `README.md` then call the MCP tool `spike_echo`, appending to the same logs. Captured: `tool_name:"apply_patch"` with the exact patch body and `agent_type:"spike-worker"`; the parent's own run log shows `Command blocked by PreToolUse hook: spike: refusing this apply_patch call once...` and `README.md` in the scratch repo is unchanged - the deny actually stopped it, confirmed both at the tool-router level and by the subagent quoting the refusal back in its own report. Captured `tool_name:"mcp__spike_stub__spike_echo"` with `agent_type:"spike-worker"` - PreToolUse fires for an MCP call too, confirming the `mcp__<server>__<tool>` naming. The stub call itself then failed for an unrelated reason - Codex's own MCP client returned `"MCP tool call requires approval, but approval policy is never"` before the stub's logic ran - noted as a Codex-side quirk, not tested for a `PreToolUse` deny since `pretooluse-log.sh` only matches `apply_patch`.
- Ancillary finding recorded: the first `spawn_agent` attempt with `task_name:"spike-worker"` (hyphen) failed with `agent_name must use only lowercase letters, digits, and underscores`; the retry with `task_name:"spike_worker"` succeeded. `task_name` needs snake_case; the custom agent's own hyphenated `name` (used as `agent_type`) was unaffected.
- Attempted `run-readonly-sandbox.sh` (question 7 re-confirmation with the "do not write it yourself" clause) and a worktree run (question 6): both hit `ERROR: You've hit your usage limit. ... try again at Sep 29th, 2026 8:48 PM.` before producing any hook or sandbox output. Did not retry a third time - the error is unambiguous about the reset time. Recorded both as unverified this round for that reason, distinct from the hook-trust wall, and noted both are otherwise ready to re-run with no new trust step needed once quota resets.
- Updated `docs/findings/GPTA-1.1-codex-hooks.md`: rewrote the three-line summary to Go for questions 1-3 with exact payload excerpts; questions 1, 2, 3, 5 now Yes with quoted JSON; question 4 unchanged (No); question 6 unverified (quota, not hooks); question 7 states round 1's No stands, not re-confirmed this round, with reasoning for why the rollout evidence already answers the "who wrote it" concern; rewrote "Why hooks never fired" into "Why hooks never fired in rounds 1 and 2, and what actually explained it", confirming the trust wall was the whole explanation; added the `config.toml` `[hooks.state...]`/`trusted_hash` discovery, not previously known from the docs; updated "What this means for the gate" to reflect the Yes verdicts; updated Sources.
- Added `scripts/spike/codex-hooks/mcp-stub/server.py` (minimal stdio MCP server, one tool `spike_echo`), `register-mcp-stub.sh`, and `run-applypatch-mcp.sh` to the committed harness, and rewrote `README.md`: status line, the new scripts, the `/hooks` trust step as an explicit numbered step, the confirmed `[hooks.state...]` trust-storage location, and the worktree re-run instructions for question 6.
- Removed only `gpta-1.1-r2/codex-home/auth.json` (the symlink). Confirmed the real `~/.codex/auth.json` is untouched (same size, same 17 September mtime as before this round started - no token refresh occurred). Left the rest of `gpta-1.1-r2` in place as evidence, including its session rollouts and hook logs. Did not run `teardown.sh`.
- Grepped the diff for token-shaped strings before committing; the only `trusted_hash` hits are sha256 content hashes of the hook scripts, not credentials - checked and confirmed safe. Grepped for em/en dashes - clean.
- Syntax-checked both new scripts with `bash -n`, individually - clean. `chmod +x` on the new scripts and the MCP stub.
- Committed on branch `worktree-agent-af83b7d1806f0e868`, commit `3c40624`: "Confirm GPTA-1.1 codex-hooks findings against human-trusted hooks". `git status` clean afterwards. `git log`: `3c40624` -> `0271b40` -> `f4b09d8` -> `e234444`.
---

author: @SubagentStop
created: 2026-09-25 10:44
---
Blocked by human. claudecode-agents:reviewer raised 2 blocker(s). From "## Decisions needed" in its handoff:

- `scripts/spike/codex-hooks/teardown.sh:43` runs `rm -rf "$SP"` on any existing directory, with a ~/.codex guard that cannot fire because it compares a logical path with a physical one, so `bash teardown.sh ~` deletes the home directory. An earlier run in this spike already resolved the scratch path to `$HOME`. Before merge, require `$SP/scratch-repo/.git` and `$SP/codex-home/hooks.json`, refuse `/`, `$HOME` and the repo toplevel, and resolve both sides with `pwd -P` in every script's guard.
- `docs/findings/GPTA-1.1-codex-hooks.md` lines 75 and 93 and `scripts/spike/codex-hooks/README.md` lines 38 and 45 present unverified claims as fact. The evidence does not show that the trust hash covers script contents, so a script edit re-triggering review is unproven. Line 93 also denies a config-file mechanism for granting trust, contradicting the finding that trust is a `config.toml` table. GPTA-1's install design would inherit both. Reword both as unverified, or verify them, before merge.
---

author: @SubagentStop
created: 2026-09-25 10:55
---
Done. claudecode-agents:scripter finished with no blockers. From "## Done" in its handoff:

- Built `scripts/spike/codex-hooks/lib/guard.sh`: `resolve_scratch_dir` resolves the scratch-dir argument with `pwd -P` on both sides of every comparison (not the logical `pwd` a symlink could spoof), refusing an empty argument, `/`, `$HOME`, a `codex-home` under the argument that resolves to the real `~/.codex`, and this harness's own repo toplevel (via `git rev-parse --show-toplevel`, resolved and compared with `pwd -P` too). `require_scratch_shape` refuses unless `scratch-repo/.git` and `codex-home/hooks.json` both already exist. Every script (`setup.sh`, `teardown.sh`, `run-subagent-lifecycle.sh`, `run-readonly-sandbox.sh`, `run-applypatch-mcp.sh`, `register-mcp-stub.sh`, `features-list.sh`) now sources this and uses `resolve_scratch_dir` instead of its own inline check; `teardown.sh` additionally calls `require_scratch_shape` immediately before its `rm -rf "$SP"`, before any other destructive step runs.
- Tested the refusals against a throwaway directory under the scratchpad (`gpta-1.1-r4-test/`, created and later torn down by the harness itself), never against `~` or the repo: `bash teardown.sh ~` refuses ("scratch dir is $HOME"), `bash teardown.sh <main-repo-root>` and `bash teardown.sh <this-worktree-root>` both refuse, `bash teardown.sh /` refuses, `bash teardown.sh <empty-throwaway-dir>` refuses via `require_scratch_shape`. Then ran `setup.sh` against the throwaway dir (succeeds), re-ran `setup.sh` against it (confirms item 8's fix: prints that `codex-home` already exists and is left untouched), then ran `teardown.sh` against it (succeeds, removes the whole directory cleanly). All exit codes as expected.
- `setup.sh` (item 8): now leaves an existing `codex-home` (has `hooks.json`) untouched entirely, rather than `rm -rf`-ing and rebuilding it, so a re-run no longer wipes hook trust, MCP registrations or session rollout history. Documented in the README.
- `run-applypatch-mcp.sh` (item 9): now does `rm -f "$SPIKE_STATE_DIR/blocked-apply_patch"` at the start of every run, so a re-run exercises the `apply_patch` deny again instead of silently skipping it because a previous run already tripped the marker.
- `docs/findings/GPTA-1.1-codex-hooks.md`: rewrote the summary and "Why hooks never fired in rounds 1 and 2" to withdraw the "entire explanation" / "sole cause" claim (item 3) - round 2 changed the hook command paths and output shapes before any trust step and never ran Codex to isolate the two changes, so round 3 shows trust-plus-round-2's-fixes are sufficient, not that trust alone would have been. Added "What trusted_hash actually covers": computed sha256 of each hook script's bytes and roughly twenty canonical-JSON forms of each handler entry against `gpta-1.1-r2/codex-home/config.toml`'s three real `trusted_hash` values - none matched (item 2). Declared this unverified, named the settling test (a byte-identical hook script under a differently-worded `hooks.json` entry in a fresh `CODEX_HOME`, checked via `/hooks`), and assigned it to GPTA-1.2. Rewrote "What this means for the gate" to remove the "no config-file mechanism for trust" claim, replacing it with: trust is a plain `config.toml` table keyed by `<abs hooks.json path>:<event>:<group>:<index>`, moving `hooks.json` breaks trust regardless of what the hash covers, and whether an installer can write the table directly depends on reproducing the hash - unresolved, GPTA-1.2's. Question 6: corrected to say the worktree run was never reached at all - no rollout, no hook-log entry anywhere in `gpta-1.1-r2` for any run from `scratch-worktree` - and corrected which run actually hit the usage cap (the question-7 re-confirmation attempt in `scratch-repo`, not a worktree attempt). Question 7: corrected the citation to round 1's own scratch area, `gpta-1.1/` not `gpta-1.1-r2/`, and added the subagent's own `custom_tool_call` (`exec`, running the `printf`) versus the parent rollout's only two `function_call` names (`spawn_agent`, `wait_agent`) as direct evidence of who did the write, confirmed by grepping both round 1 rollout files. Question 5: corrected "four for four" to the actual five `SubagentStop` calls, explained the fifth (`stop_hook_active:false` again, after a `followup_task`) as a per-turn reset rather than the block re-firing, since the block-once marker is keyed by `agent_id` not `turn_id`; cited the `"role":"developer"` input item carrying the literal `additionalContext` text in both subagent rollouts as the direct mechanism evidence. Summary line: noted the apply_patch/MCP run itself ended on the usage-cap error with no final parent message, though the question 3 payloads were already written before that happened.
- `scripts/spike/codex-hooks/README.md`: rewrote to match - the guard/shape-check description, `setup.sh`'s preserve-existing behaviour, the trust-hash section softened to "confirmed the table exists and its key format; unverified what the hash covers" with a pointer to the findings file, "entire explanation" language removed, question 6 and 7 status corrected, and a new provenance note (item 10): `register-mcp-stub.sh` and `run-applypatch-mcp.sh` as committed are round 4's guarded rewrite of the scratch-copy scripts that actually produced round 3's evidence - stub, hooks and prompt text are byte-identical, only the argument handling changed - and their first run as committed is unverified, assigned to GPTA-1.2.
- `bash -n` on all eight scripts, individually - all clean. Grepped the full diff for em/en dashes and token-shaped strings - clean (the `trusted_hash` sha256 hex strings that matched a broader grep are content hashes of the hook scripts, not credentials, checked and confirmed safe).
- Did not run Codex at any point this round. Did not touch `gpta-1.1-r2/codex-home/hooks.json`, `hooks/` or `config.toml` - confirmed by md5 before and after (`hooks.json` md5 unchanged) - only read them, for the trust-hash computation and the rollout/log evidence corrections.
- Committed on branch `worktree-agent-af83b7d1806f0e868`, commit `96cfaff`: "Fix reviewer round 2 findings on GPTA-1.1 codex-hooks (f4b09d8..3c40624)". `git status` clean afterwards. `git log`: `96cfaff` -> `3c40624` -> `0271b40` -> `f4b09d8` -> `e234444`. `teardown.sh` and every other script committed as executable (`100755`) - several had regressed to `100644` in earlier commits and are now fixed.
---

author: @SubagentStop
created: 2026-09-25 11:01
---
Blocked by human. claudecode-agents:reviewer raised 1 blocker(s). From "## Decisions needed" in its handoff:

- `/Users/alex/Dev/Work/extensions/gptcode-agents/scripts/spike/codex-hooks/setup.sh` accepts any existing, non-empty directory. From line 15 on, it creates exactly the `scratch-repo/.git` and `codex-home/hooks.json` that `require_scratch_shape` (guard.sh:81-83) accepts as proof the harness built the directory, so the later `teardown.sh:42` runs `rm -rf` on all of it. Examples: `setup.sh <main checkout>` run from the worktree passes the toplevel check at guard.sh:69, and the teardown after it deletes the main checkout's `.git`, `.boards/` and the nested `.claude/worktrees/`. `setup.sh .` run from `scripts/spike/codex-hooks` passes because the template already supplies `codex-home/hooks.json`, and the teardown after it deletes the harness source. Ancestors of `$HOME` such as `~/Dev` behave the same. guard.sh:21 ("a destructive step never runs against a directory this harness did not itself create") and README lines 5, 11 and 17 claim more than the code guarantees. This branch merges as reference material the GPTA-1 installer will copy, and this spike's scratch path has resolved to `$HOME` once already. Fix: setup should refuse a non-empty directory that lacks a marker file it writes, and teardown should require that marker. Better still, teardown should remove only the named children setup creates (`scratch-repo`, `scratch-worktree`, `codex-home`, `logs`, `state`, `*-output.log`, `features-list.txt`), then `rmdir "$SP"` only if it is empty.
---

author: @SubagentStop
created: 2026-09-25 11:11
---
Done. claudecode-agents:scripter finished with no blockers. From "## Done" in its handoff:

- Fixed the blocker structurally, not with another path check. `lib/guard.sh` now has three functions: `resolve_scratch_dir` (identity checks against `/`, `$HOME`, real `~/.codex`, repo toplevel, all via `pwd -P`), `setup_or_refuse_dir` (new - refuses a non-empty directory unless it already carries the `.gpta-spike-scratch` marker), and `require_scratch_shape` (rewritten - now checks the marker plus `codex-home/hooks.json`, since the marker is what actually proves this harness built the directory rather than merely observing a shape any directory could be made to have).
- `setup.sh`: calls `setup_or_refuse_dir` before touching anything, and `write_scratch_marker` as one of its first actions on a directory it has just confirmed is empty or already its own - so even a run that fails partway leaves the marker for `teardown.sh` to recognise.
- `teardown.sh`: calls `require_scratch_shape` before doing anything, then removes named children one at a time - `auth.json` symlink, `scratch-worktree` (via `git worktree remove`, then a fallback `rm -rf`), `scratch-repo`, `codex-home`, `logs`, `state`, a legacy `mcp-stub/`, the three run output logs, `features-list.txt`, the marker - then `rmdir "$SP"`, which only succeeds if that leaves it empty. No `rm -rf "$SP"` anywhere in the script any more. If `rmdir` fails, it reports what is left via `ls -A` rather than deleting it.
- `run-subagent-lifecycle.sh`, `run-readonly-sandbox.sh`, `run-applypatch-mcp.sh`, `features-list.sh`, and `register-mcp-stub.sh` all call `require_scratch_shape "$SP"` immediately after `resolve_scratch_dir`, before any `rm`, `tee`, or `codex mcp add`.
- `guard.sh`'s `~/.codex` check: `$resolved/codex-home` is now resolved with `cd ... && pwd -P` whenever it exists, before comparing against the real `~/.codex`'s physical path, so a `codex-home` that is a symlink to `~/.codex` is caught by physical-path equality, not string equality.
- Tested all of it against throwaway directories under the scratchpad, never `~`, the repo, the main checkout, the worktree, or `gpta-1.1-r2`: a canary directory (`gpta-1.1-r5-canary`, holding `canary.txt`) - `setup.sh` refused it outright, and the file was confirmed byte-unchanged afterwards; an empty directory (`gpta-1.1-r5-empty`) - `setup.sh` then `teardown.sh` (with an unexpected file dropped in between) removed every known child but correctly left the directory and the unexpected file behind, reporting it; a second clean empty directory (`gpta-1.1-r5-clean`) - `setup.sh` then `teardown.sh` with nothing extra removed the directory entirely; and a directory with `codex-home` symlinked to the real `~/.codex` - refused directly by `resolve_scratch_dir`. All throwaway test directories cleaned up afterwards.
- Committed `scripts/spike/codex-hooks/trust-hash-investigation/` (`hash-test.py`, `hash-test2.py`, `hash-test3.py`, `README.md`): all three now take a `<scratch-dir>` argument and parse `trusted_hash` straight out of `config.toml` via regex rather than hardcoding the three values, and re-running all three against `gpta-1.1-r2` reproduces the exact hashes from the original investigation. `hash-test3.py` adds two families not tried before: raw `hooks.json` file bytes and the handler object with plausible default fields filled in (`matcher`, `timeout`, `statusMessage`, `async`, `additionalContextLimit`) in nine combinations, compact and sort-keyed. None of the roughly thirty candidates across all three scripts matched any of the three real `trusted_hash` values. The README names the families still not tried: the full cross product of every optional field, a real Rust/serde_json serialiser, and non-JSON forms.
- Reworded `docs/findings/GPTA-1.1-codex-hooks.md` and the harness README: the trust-hash-investigation section now reflects the thirty-candidate count and cites the committed, re-runnable scripts instead of the scratchpad path; the "confirmed" claim about the key's last two index fields is now explicitly unverified, since every key observed anywhere in this spike is `:0:0`; the "breaks trust" claim about relocating `hooks.json` is now stated as an inference from the key format, not an observed event; added the security-decision framing - an installer writing `trusted_hash` directly bypasses each human's own `/hooks` review, which is a decision for the port's plan to make deliberately, not a convenience to default into; reworded the paragraph about round 2's confounds to match the paragraph above it.
- `bash -n` on all eight shell scripts individually - clean. `python3 -m py_compile` on all three new Python scripts - clean (accidentally staged their `__pycache__` directories on first `git add`; caught it, unstaged and deleted them before committing). Grepped the full diff for em/en dashes and token-shaped strings - clean.
- Confirmed `gpta-1.1-r2/codex-home/hooks.json` and `config.toml` md5 unchanged before and after this round's work - only read, never edited.
- Committed on branch `worktree-agent-af83b7d1806f0e868`, commit `9947a27`: "Fix reviewer round 3 blocker on GPTA-1.1 codex-hooks (3c40624..96cfaff)". `git status` clean afterwards. `git log`: `9947a27` -> `96cfaff` -> `3c40624` -> `0271b40` -> `f4b09d8` -> `e234444`.
---

author: @SubagentStop
created: 2026-09-25 11:15
---
Blocked by human. claudecode-agents:refuter raised 6 blocker(s). From "## Decisions needed" in its handoff:

- teardown.sh's `git worktree remove --force "$SP/scratch-worktree"` follows a symlinked `scratch-worktree`. With a marker and `codex-home/hooks.json` present, plus `scratch-repo` and `scratch-worktree` symlinked to another repo and its worktree, `bash teardown.sh <dir>` deleted that worktree outside SP, including its untracked files (attack D).
- the run scripts follow symlinked `logs/`, `state/` and `scratch-repo/`, and symlinked output files. In a marked directory they deleted foreign `*.log`, `*.json`, `blocked-*` and `spike-readonly-output.txt`, and overwrote four foreign output files, all before `codex exec` ran (attack E).
- setup.sh in a marked directory writes through a symlinked `codex-home` that has no `hooks.json`, overwriting a foreign `config.toml` and hook script. It also writes through a symlinked `scratch-repo`, overwriting that repo's `.codex/agents/*.toml` (attack G).
- the `~/.codex` guard in `lib/guard.sh` is skipped silently when HOME is unset. `env -u HOME bash setup.sh <marked dir whose codex-home symlinks to the real codex home>` overwrote that home's `config.toml` (attack F).
- `setup_or_refuse_dir` reads a failed `ls -A` as an empty directory. A mode-0300 directory holding data was adopted: setup overwrote its `codex-home/config.toml`, and teardown deleted its `logs/` and `state/` (attack A).
- `resolve_scratch_dir` strips a trailing newline, so `<dir>$'\n'` makes every script act on the sibling `<dir>`. Setup wrote into an empty directory the caller never named, and teardown removed a marked directory and its `logs` canary (attack B).
---

author: lead
created: 2026-09-25 12:07
---
Closing on the Go verdict (human decision, 25 Sep 2026 22:06 AEST). Findings merged to main as a672a35 (docs/findings/GPTA-1.1-codex-hooks.md): SubagentStart, SubagentStop decision: block, and PreToolUse on apply_patch all fire for a TOML custom agent on codex-cli 0.156.1 once trusted. Per-agent sandbox_mode read-only is not applied. Harness left unmerged on branch worktree-agent-af83b7d1806f0e868 at 9947a27; hardening and the open checks (Q6, Q7, trust-hash coverage) moved to GPTA-1.2.
---
<!-- COMMENTS:END -->
