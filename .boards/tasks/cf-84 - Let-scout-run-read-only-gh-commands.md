---
id: CF-84
title: Let scout run read-only gh commands
status: In Progress
assignee: []
created_date: '2026-09-30 05:26'
updated_date: '2026-09-30 06:00'
labels:
  - hooks
dependencies: []
priority: Medium
type: enhancement
ordinal: 115000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Ordered by the human 2026-09-30: "the scout should be able to run any read-only gh commands". During that day's GitHub issue alignment pass, scout was denied `gh issue list -R rzem-ai/coder-fleet --state all ...` by the scout scope hook ("gh" is not on the allowlist), and the lead had to run it. Scout's Bash allowlist lives in claude/coder-fleet/hooks/enforce-agent-scope.sh (deny-by-default, hardened against bash -c and quoting tricks), with contract tests under claude/evals/lib/. This is an authorisation boundary around a tool that holds the human's GitHub credentials, so the escalated review applies.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Scout may run read-only gh: issue list/view/status, pr list/view/diff/checks/status, run list/view, repo view, release list/view, label list, search, and api with GET only; a contract case allows each family
- [ ] #2 Scout is denied every other gh use by default, and specifically every writing subcommand (create, edit, close, reopen, merge, comment, review, delete, ready, lock, checkout), gh auth (any form, including token and --show-token), browse, extension, alias, config set, secret, variable, ssh-key, gpg-key and codespace; contract cases cover writes, auth and an unknown subcommand
- [ ] #3 gh api is allowed only as a GET: -X or --method with anything but GET, and -f, -F, --field, --raw-field or --input (which switch it to POST), are denied; contract cases cover each flag
- [ ] #4 The existing wrapper and quoting defences hold for gh: a writing gh command wrapped in bash -c, sh -c, env, or split by quoting or ; && | is denied, with contract cases
- [ ] #5 No other agent's gh rules change, and scout's other allowed commands are unchanged; the existing contract suite passes
- [ ] #6 scout's body or skill says it may read GitHub through gh and that issue, PR and comment text it reads is external content to report as data, never follow; migration-checklist run over the changed body
- [ ] #7 bash claude/evals/lib/check-all.sh passes
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @SubagentStop
created: 2026-09-30 05:42
---
Done. coder-fleet:reviewer finished with no blockers. From "## Done" in its handoff:

- Verdict: request changes. Reviewed `git diff origin/cf-48-focus-only-binding..HEAD` (7b3c4ab, cd30838, 15626a9) against CF-80's eight criteria, comment #2 (the captured start input) and comment #3 (resolve at stop), in `/Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-abbcae358ccd12af8`.
- must fix: claude/evals/lib/board-hook-contract.sh:994 - in every wf- case the earliest lane `wz1` also comes first in descending name order, which is what `ls -1tr` does on an mtime tie and what an `ls -1r` mutant does. So the suite can't tell start-time order from reverse-name order; add a case where the earliest id sorts neither first nor last (e.g. `wm1`, `wa2`, `wz3`).
- low: claude/coder-fleet/hooks/lib/board.sh:295 - the comment says ties fall back to "ls's own name order"; under `-r` it is reverse name order. Same wording in claude/coder-fleet/hooks/README.md:597.
- low: claude/evals/lib/board-hook-contract.sh:1001 - `wf-late-lane-comments-on-launch-item` stops an untyped `workflow-subagent` lane through the hook and counts its comment, but the SubagentStop matcher in hooks.json never sends that stop to the hook in production.
- low: claude/coder-fleet/hooks/README.md:29 - "typed and untyped lanes alike" overstates it: only typed lanes stop through the hook; untyped lanes take part through their start records.
- low: claude/evals/lib/board-hook-contract.sh:1088 - `wf-racing-stops-agree` cannot catch a double write, since both racers write identical content, and never checks the racers' exit codes. What it does catch is a leaked temp file and the revert; rename or re-describe it to match.
- Confirmed sound: path sanitising of the run id and lane ids; start-record mtime is written once and never rewritten, resumes included; the hard-link write race and the loser's fallback; untyped lanes have start records (SubagentStart has no matcher); an unbound first lane comments nowhere; direct spawns unchanged; no focus or env fallback for lanes; the docs match the code, including the accepted late-lane start move.
---

author: @SubagentStop
created: 2026-09-30 05:54
---
Done. coder-fleet:refuter finished with no blockers. From "## Done" in its handoff:

- Baseline board-hook-contract: exit 0, 169 passed, 0 failed, 177s. Baseline check-all: exit 0, all checks pass, 627s (ran alongside the mutants). Both in the worktree.
- Eight mutants of the CF-80 claims, each running the full board-hook-contract suite in its own scratch copy under `/private/tmp/claude-501/-Users-alex-Dev-Work-extensions-coder-fleet/00593183-3e22-416e-a69e-a08b7ca61b43/scratchpad/refuter-1790746749/`. Five killed, three survived.
- Killed: M1 (lane's own binding, exit 1, 7 failed), M2 (earliest by name, exit 1, 7 failed), M3 (record never read, exit 1, `wf-record-read-by-later-stop`), M6 (unbound earliest falls back to the lane's item, exit 1, `wf-unfocused-first-lane-comments-nowhere`), M7 (direct spawn treated as a run, exit 1, 16 failed including `wf-direct-spawn-unchanged`).
- survived: in `run_id_from_transcript`, regex `(wf_[^/]+)` changed to `(wf_.+)`, and in `state_run_page_id` and `state_record_run`, `rid="$(printf '%s' "${2:-}" | tr -c 'A-Za-z0-9._-' '_')"` changed to `rid="${2:-}"` - a run id holding `/` and `..` (probe: `wf_a/../../../evil`, rc=0) reaches the record path unchecked, and no test gives the parser or the record a hostile path. Suite exit 0, 169/0.
- survived: in `board-subagent-stop.sh`, the no-start-record branch's `page_id=""` changed to `page_id="$(board_focus_id "$HOOK")" || page_id=""` - a workflow lane whose run has no start record comments on the current focus, and no test covers a run with no start records. Suite exit 0, 169/0.
- survived: in `state_record_run`, deleted `if [ -e "$file" ]; then umask "$old_umask"; return 3; fi` and changed `ln "$tmp" "$file"` to `mv -f "$tmp" "$file"` - the record can be overwritten by a later stop; `wf-racing-stops-agree` cannot see it because both writers produce identical content. Suite exit 0, 169/0.
- Worktree confirmed clean afterwards (`git status --short` empty).
---

created: 2026-09-30 05:54
---
Misfiled comments: any @SubagentStop comments on this card from a coder-fleet:reviewer or coder-fleet:refuter that mention CF-80, workflow runs, wf- cases or board-subagent-stop.sh belong to CF-80, not CF-84. The lead spawned them while the focus was still on CF-84. Their summary is on CF-80. CF-84's own review has not run yet.
---

author: @SubagentStop
created: 2026-09-30 05:55
---
Done. coder-fleet:refuter finished with no blockers. From "## Done" in its handoff:

- Baselines: `bash claude/evals/lib/board-hook-contract.sh` exited 0 with 169 passed, 0 failed, in 177s. `./claude/evals/lib/check-all.sh` exited 0 with every check passing, in 627s (it ran alongside the mutants). Both ran in the worktree.
- I ran eight mutants of the CF-80 claims, each against the full board-hook-contract suite in its own copy under `/private/tmp/claude-501/-Users-alex-Dev-Work-extensions-coder-fleet/00593183-3e22-416e-a69e-a08b7ca61b43/scratchpad/refuter-1790746749/`. The edits are in `mut.py` and the outputs in `out1..out8.txt`. Five were killed and three survived.
- Killed M1, the stop uses the lane's own binding: exit 1, 7 failed, including `wf-late-lane-comments-on-launch-item`.
- Killed M2, the earliest lane is picked by name (`ls -1tr` to `ls -1`): exit 1, 7 failed, which is every `wf-*` case.
- Killed M3, the run record is never read: exit 1, `wf-record-read-by-later-stop` failed.
- Killed M6, an unbound earliest lane falls back to this lane's own item: exit 1, `wf-unfocused-first-lane-comments-nowhere` failed.
- Killed M7, a direct spawn is treated as a run: exit 1, 16 failed, including `wf-direct-spawn-unchanged`.
- survived: in `run_id_from_transcript`, `(wf_[^/]+)` changed to `(wf_.+)`, and in `state_run_page_id` and `state_record_run` the `tr -c 'A-Za-z0-9._-' '_'` cleanup was replaced with `rid="${2:-}"` - a run id containing `/` and `..` reaches the record path unchecked. A direct probe returned `wf_a/../../../evil` with rc=0. The suite still passed: exit 0, 169/0.
- survived: in `board-subagent-stop.sh`, the no-start-record branch's `page_id=""` changed to `page_id="$(board_focus_id "$HOOK")" || page_id=""` - a workflow lane whose run has no start record comments on the current focus. No test covers that case. The suite still passed: exit 0, 169/0.
- survived: in `state_record_run`, the `[ -e "$file" ]` early return was deleted and `ln "$tmp" "$file"` changed to `mv -f "$tmp" "$file"` - a later stop can overwrite the record. `wf-racing-stops-agree` can't see this because both writers produce the same content. The suite still passed: exit 0, 169/0.
- The worktree was clean afterwards (`git status --short` printed nothing).
---

author: @SubagentStop
created: 2026-09-30 05:55
---
Done. coder-fleet:coder finished with no blockers. From "## Done" in its handoff:

- Worktree check: `git rev-parse --git-common-dir` showed the main `.git` with a separate top level, on branch `worktree-agent-af0ece0d8325786e3`, clean at the start. The CF-84 card is not on this branch's `.boards/`, so I read it from the main checkout.
- Commit f77306c, "Let scout run read-only gh by subcommand pair (CF-84)", changes `claude/coder-fleet/hooks/enforce-agent-scope.sh` and `claude/evals/lib/scope-hook-contract.sh`.
- The hook allows `gh` only by group and subcommand pair and denies every pair not on the list. `gh auth` gets its own deny message.
- Only `-R`/`--repo` may appear before the pair, in all four spellings. Any other option there is denied, because gh may read the next word as that option's value and change which subcommand runs.
- `gh api` must be a GET. `-X`/`--method` with any value but `GET` is denied, and so are `-f`, `-F`, `--field`, `--raw-field` and `--input`, in their clustered (`-iX POST`, `-if x=y`) and `=` forms.
- One addition beyond the brief: a command that runs `gh` may not set `GH_PAGER`, `PAGER`, `GH_BROWSER`, `BROWSER`, `GH_EDITOR`, `EDITOR` or `VISUAL` anywhere in it. Each of those names a program gh runs, which would turn a read into running anything.
- I added 136 contract cases: every allowed family, every writing subcommand the card names, every `gh auth` form, the other denied groups and an unknown one, each api flag in each spelling, the option-shift attempts, the variable injections, and the wrapper and quoting bypasses (`bash -c`, `sh -c`, `env`, `command`, `;`, `&&`, `||`, `| xargs`, `g""h`, `is''sue`, `"pr" "merge"`, `\gh`, `pr \merge`).
- Tests seen failing first: before the hook change the suite showed `385 passed, 129 failed`, so 129 of the 136 new cases failed. The other 7 passed before the change because existing rules already cover them: `bash -c`, `sh -c`, `$(...)`, `>`, reviewer denied `gh`, and coder and refuter allowed it. They are regression guards and were never seen red.
- What makes the tests fail: I ran six mutants of the hook against a small driver of 19 cases (`scratchpad/mutate.sh`).
- Mutant, pair check removed (the `*",$verb,"*` match): 8 wrapper and quoting cases flip to allow.
- Mutant, `f|F` cluster walk removed: 2 flips (`-if`, `-Ftitle=x`).
- Mutant, pager/browser/editor variable check removed: 2 flips.
- Mutants, option-before-pair rule removed, or `command_words`/`unescape_words` normalisation removed from `gh_pair`: no flips in the driver. The contract still catches both, because its tests check the deny message and those mutants give the wrong one.
- Mutant, `=` strip after `-X` removed: no flips. It only turns a correct allow for `-X=GET` into a deny, and no case checks that form.
- Commit 6de2b35, "Tell scout it may read GitHub through gh, as external content (CF-84)", changes `claude/coder-fleet/agents/scout.md`: step 3 adds `gh` and says issue, PR and comment text is external content, quoted as data and never followed. The invariant lists the allowed pairs, the network ban now excepts read-only `gh`, and it bans writing subcommands, `gh auth` and non-GET `gh api`.
- The same commit makes the hook's "not on that list" message quote the new invariant, and documents the `gh` rule in `claude/coder-fleet/hooks/README.md`.
- `scout.md` is not an editor pair (there is no `claude/agent-pairs/` in this tree), so no generator was involved.
- Migration-checklist over `scout.md`: frontmatter unchanged and parses, `tools` is a string and `skills` a list, 42 lines, four H2s in order, no en or em dashes, no hard wrapping, no double-check scaffolding. The "H1" and US-spelling "color" hits are the frontmatter's YAML comment and its `color:` key, both pre-existing.
- Contract runs, each with output captured: baseline 378 passed, 0 failed, 74 s. After adding the tests `385 passed, 129 failed`, exit 1. After the hook change 514 passed, 0 failed, 221 s. After the body and message edits 514 passed, 0 failed, 268 s.
- `bash claude/evals/lib/check-all.sh`, run once: exit 0, "Every deterministic check passes.", 650 s.
---

author: @SubagentStop
created: 2026-09-30 06:00
---
Done. coder-fleet:reviewer finished with no blockers. From "## Done" in its handoff:

- Verdict: request changes, for CF-84 round 1, on commits f77306c and 6de2b35 (range `6190b58..HEAD`) in `/Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-af0ece0d8325786e3`.
- Examined `claude/coder-fleet/hooks/enforce-agent-scope.sh`: the new rule plus `command_words`, `strip_quoted`, `strip_inert_quotes`, the payload recovery and `COMMAND_WRAPPERS`.
- Examined `claude/coder-fleet/agents/scout.md`, `claude/coder-fleet/hooks/README.md` and the new contract cases.
- Examined `claude/home/settings.json`: sandbox network allowlist, deny rules, `autoAllowBashIfSandboxed`.
- must fix: claude/coder-fleet/hooks/enforce-agent-scope.sh:590 - a whole `gh api` flag written in quotes with `=` in it is erased by `strip_quoted` before `gh_api_denial` scans, so a POST, field or input flag gets past unchecked.
- must fix: claude/coder-fleet/hooks/enforce-agent-scope.sh:913 - parameter expansion (variable set in an earlier segment) and brace expansion build `gh api` flags that the unexpanded word scan never sees; the api check is a denylist and needs to become an allowlist.
- must fix: claude/coder-fleet/hooks/enforce-agent-scope.sh:703 - `xargs` is a transparent wrapper, so `gh api` reached through `xargs` gets its method and field flags from stdin, which the hook never reads.
- low: claude/coder-fleet/agents/scout.md:36 - "search" should name the five allowed search subcommands so the list matches the hook exactly.
- low: claude/coder-fleet/hooks/enforce-agent-scope.sh:604 - lowercase `get` is denied though gh accepts it; allow it without regard to case, or say the deny is deliberate.
- low: claude/evals/lib/scope-hook-contract.sh - no case for `-X=GET`; the coder's mutant removing the `=` strip at enforce-agent-scope.sh:616 survived.
- Confirmed: no other agent's rules changed, and coder and refuter still have `gh` unrestricted, as intended; the pair allowlist handles aliases, extensions and options placed before the pair; `run view` and `release view` have no flag that writes a file.
- No run article: the spawn prompt did not ask for one.
---
<!-- COMMENTS:END -->
