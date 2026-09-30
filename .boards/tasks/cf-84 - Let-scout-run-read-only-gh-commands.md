---
id: CF-84
title: Let scout run read-only gh commands
status: In Progress
assignee: []
created_date: '2026-09-30 05:26'
updated_date: '2026-09-30 07:53'
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
- [x] #1 Scout may run read-only gh: issue list/view/status, pr list/view/diff/checks/status, run list/view, repo view, release list/view, label list, search, and api with GET only; a contract case allows each family
- [x] #2 Scout is denied every other gh use by default, and specifically every writing subcommand (create, edit, close, reopen, merge, comment, review, delete, ready, lock, checkout), gh auth (any form, including token and --show-token), browse, extension, alias, config set, secret, variable, ssh-key, gpg-key and codespace; contract cases cover writes, auth and an unknown subcommand
- [x] #3 gh api is allowed only as a GET: -X or --method with anything but GET, and -f, -F, --field, --raw-field or --input (which switch it to POST), are denied; contract cases cover each flag
- [x] #4 The existing wrapper and quoting defences hold for gh: a writing gh command wrapped in bash -c, sh -c, env, or split by quoting or ; && | is denied, with contract cases
- [x] #5 No other agent's gh rules change, and scout's other allowed commands are unchanged; the existing contract suite passes
- [x] #6 scout's body or skill says it may read GitHub through gh and that issue, PR and comment text it reads is external content to report as data, never follow; migration-checklist run over the changed body
- [x] #7 bash claude/evals/lib/check-all.sh passes
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

author: @SubagentStop
created: 2026-09-30 06:09
---
Done. coder-fleet:refuter finished with no blockers. From "## Done" in its handoff:

- Baseline recorded: `bash claude/evals/lib/scope-hook-contract.sh` gave 514 passed, 0 failed, exit 0, in 3:57.
- Budget set before the first mutant: at most eight mutants and 20 minutes. I used seven mutants and about 13 minutes, all in rsync copies (`m1` to `m7`) under the scratch dir, never in the worktree.
- Ran about 70 bypass probes as scout, using the suite's event shape through `probe.sh` in the scratch dir.
- Denied as they should be: `-R`, `--repo` and `--hostname` in front of the subcommand, and the `-R=x` and `-Rissue` forms.
- Denied as they should be: `--method=post`, `-XPOST`, `-X post`, `-X GET -X POST`, `-- -XPOST` and `-p x -XPOST`.
- Denied as they should be: `--input -`, `--input=- <<< x`, `-f title=@file` and `-F body=@body.txt`.
- Denied as they should be: plain and backslash quoting (`-"f"`, `"-f"`, `'-XPOST'`, `--"method"`, `-\f`, `\-f`), real tabs and newlines between words, and heredocs.
- Denied as they should be: `export GH_HOST=...;`, `export GH_PAGER=...;`, an alias name (`gh co`), `gh extension list`, `gh auth status` and `gh -R o/r auth token`.
- survived: `gh api repos/o/r/issues $'-f' title=x` (and `$"-f"`) is allowed. Bash turns `$'-f'` into `-f`, so gh sends a POST that writes to GitHub. I confirmed the expansion with `bash -c`, which printed `[api][x][-f][t=x]`. The hook's quote stripping leaves a `$` in front, and `gh_api_denial` skips any word that does not start with `-`. No contract case covers this.
- survived: `gh api repos/o/r/issues ${IFS}-XPOST` and `gh api repos/o/r/issues $IFS-ftitle=x` are allowed. Bash splits these into `-XPOST` and `-ftitle=x` (confirmed: `[x][-XPOST][-ftitle=x]`), so gh again sends a POST. No contract case covers `$IFS`.
- survived: `GH_TOKEN=x GH_CONFIG_DIR=<dir> gh search repos foo --web` is allowed, and it runs whatever `browser:` names in `<dir>/config.yml`. I reproduced it with the real gh 2.101.0: the command exited 0 and my marker script wrote `ran https://github.com/search?q=foo&type=repositories`. It gets round the pager/browser/editor variable rule because `GH_RUNS_VARS_RE` does not include `GH_CONFIG_DIR`. The config file only has to be readable, for example one sitting in a repo scout is reading.
- M1, the pair check's deny made a no-op (`*) : deny ...`): killed, 461 passed and 53 failed, exit 1.
- M2, the option-before-pair rule removed (`-*) continue ;;` in `gh_pair`): killed, 509/5, exit 1.
- M3, the api method check removed (the three GET comparisons made always-true or always-false): killed, 503/11, exit 1.
- M4, the api field-flag check removed (`f|F` changed to `Z`, and the long forms to `--zzz-none`): killed, 502/12, exit 1.
- M5, the variable check's deny made a no-op (`true || deny`): killed, 509/5, exit 1.
- M7, the variable check reads only the gh segment (`$first`) instead of the whole command (`$whole`): killed, 510/4, exit 1.
- M6, the `gh auth` deny branch removed (`auth|auth\ *)` changed to `zz-no-auth)`), passed the suite at 514/0, exit 0. It is an equivalent mutant: `auth` is not on `SCOUT_ALLOWED_GH`, so the pair check still denies every `gh auth` form, with a message that still contains "gh auth token". Only the deny wording changes.
- These findings are new. There was no earlier refuter round on this card to compare against.
- Worktree confirmed clean at 6de2b35 with `git status --short` at the end.
---

created: 2026-09-30 06:47
---
Round 1, 2026-09-30. Review: request changes, three must-fix holes in gh api (quoted flag words erased before the scan, parameter and brace expansion building flags, xargs supplying flags from stdin). Refuter: 6 of 7 mutants killed; M6, the auth branch, is equivalent because the pair check already denies it. Three live bypasses were allowed: `$'-f'` ANSI-C quoting and `${IFS}-XPOST` both turn gh api into a POST, and `GH_CONFIG_DIR=<dir> gh search repos foo --web` ran a program from a config file, reproduced against real gh 2.101.0. Root cause: the api check is a denylist over unexpanded text. Fix round 1 (coder resumed) makes gh api an allowlist (plain endpoint plus known read flags, GET only), denies gh through xargs, denies any NAME= assignment in a command running gh, denies --web and -w, and pins that alias names are denied. The human decided in session that CF-84 ships in the same patch release as CF-48 and CF-80. Follow-ups filed: CF-86 (the same pager class for git), CF-87 (OpenCode port). Runtime concern (scope suite 74s to about 250s) is noted for CF-56.
---

author: @SubagentStop
created: 2026-09-30 07:04
---
Done. coder-fleet:coder finished with no blockers. From "## Done" in its handoff:

- Commit 3a897b6, "Make scout's gh api an allowlist and close the round-1 bypasses (CF-84)", changes `claude/coder-fleet/hooks/enforce-agent-scope.sh` and `claude/evals/lib/scope-hook-contract.sh`.
- `gh api` now takes one plain endpoint, which may end in a query string, plus only `--paginate`, `--slurp`, `-i`/`--include`, `-q`/`--jq`, `-t`/`--template`, `-H`/`--header` and `--cache`. Their values must be unquoted and must not start with `-`. The method may be given as GET or get, as `-X GET`, `-XGET`, `-X=GET`, `--method GET` or `--method=GET`. Every other word is denied, and so is any quote in an api word.
- Every gh segment now denies a word holding `$`, `{`, `*`, `[` or a backtick, and `?` everywhere except the api endpoint's query string. It also denies an option with a quoted part, a quote that opens a word starting with `-`, and `--web` or `-w`, alone or in a cluster.
- A command that runs gh may not assign any variable in any segment: in front of a command, behind `env` or another wrapper, or behind `export`/`declare`. It may not run `read` either. This replaces the seven-name list.
- gh reached through `xargs` is denied, whatever the pair.
- Bypass 1, `$'-f'` and `$"-f"`: now denied by `gh api repos/o/r/issues $'-f' title=x` and `... $"-f" title=x`, both with the "expands" message.
- Bypass 2, IFS: denied by `gh api repos/o/r/issues ${IFS}-XPOST` and `... $IFS-ftitle=x` ("expands").
- Bypass 3, a whole flag word in quotes: denied by `gh api repos/o/r/issues "--method=POST"`, `gh pr view 1 "--web=true"` and `gh pr view 1 -"-web=true"` ("quoted").
- Bypass 4, parameter and brace expansion: denied by `V=-XPOST; gh api repos/o/r/issues $V` ("assign"), `gh api repos/o/r/issues $V`, `gh issue view 1 $N`, `gh api repos/o/r/issues -{X,}POST` and `gh issue view 1 -*` ("expands").
- Bypass 5, xargs: denied by `echo -XPOST | xargs gh api repos/o/r/issues` and `echo 1 | xargs gh issue view` ("xargs").
- Bypass 6, `GH_CONFIG_DIR` and `--web`: denied by `GH_TOKEN=x GH_CONFIG_DIR=/tmp/c gh search repos foo`, `env HTTPS_PROXY=http://x gh issue list`, `GH_REPO=... gh issue list` and `echo /tmp/c | read GH_CONFIG_DIR; gh issue list` for the variables. `gh search repos foo --web`, `gh issue view 1 -w` and `gh issue view 1 -cw` cover `--web`.
- The allowlist also denies other api words: `gh api repos/o/r --verbose` (unknown flag), `gh api repos/o/r/issues repos/o/r/pulls` (second endpoint), `gh api repos/o/r -H "Accept: x"` (quoted), `gh api repos/o/r/issues -q .x?` (`?` in a value) and `gh api -iX POST repos/o/r/issues` (cluster).
- Lows: new allow cases cover `gh api -X get` and `gh api -X=GET`. `gh co 12` pins that an alias or extension name as the first word is denied.
- Seen failing first: against 6de2b35 the new block gave `445 passed, 26 failed`. All 26 were the mechanism cases above plus the `-X get` allow. Three new cases were not seen failing because the old code already denied or allowed them: the `gh co 12` pin, `gh api -H -f repos/o/r` and the `-X=GET` allow.
- A first version of the no-assignment check used a regex over the whole command. It denied argument words such as `-f title=x`, which made three contract cases fail for the wrong reason, and I replaced it with a walk over each segment's leading words.
- Collapsed the gh block from 136 cases to 94. The allowed families are now one to three cases per group, writes and unknown groups are one per mechanism, and api method and field spellings are down to 10. Each mechanism keeps at least one case.
- Commit 611d091, "Describe scout's gh api allowlist and word rules in its body and the README (CF-84)": `claude/coder-fleet/agents/scout.md` names `search issues`/`prs`/`repos`/`code`/`commits`, the api read flags, and the word, assignment and xargs rules.
- The same commit documents those rules in `claude/coder-fleet/hooks/README.md`.
- Migration-checklist rerun over `scout.md`: frontmatter unchanged and parses, 42 lines, four H2s in order, no dashes, no hard wraps. The only hits are the same pre-existing YAML comment and `color:` key.
- Scope contract, run on the final hook code: `471 passed, 0 failed`, 137 s. The later commit changed only docs.
- `bash claude/evals/lib/check-all.sh`, run once: exit 0, "Every deterministic check passes.", 225 s.
- A probe outside the suite (`scratchpad/probe.sh`) allowed `gh issue list --search "is:open label:bug"`, `gh pr view 1 -c`, `gh issue list | grep -w foo` and `timeout 30 gh run list`.
- The same probe denied `nice -n 5 X=1 gh issue list`, `( X=1 gh issue list )`, `gh api repos/o/r -X GET -X POST`, `gh api repos/o/r -X\ POST`, `gh api repos/o/r -- -XPOST`, `gh api @body.json` and `gh api repos/o/r -q=.x`.
---

author: @SubagentStop
created: 2026-09-30 07:11
---
Done. coder-fleet:reviewer finished with no blockers. From "## Done" in its handoff:

- Verdict: request changes, for CF-84 round 2. I reviewed `git diff 6de2b35..HEAD` (3a897b6, 611d091) in `/Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-af0ece0d8325786e3` against the card's seven criteria and the round-1 comments.
- Examined: `claude/coder-fleet/hooks/enforce-agent-scope.sh` (`gh_api_denial`, `gh_words_denial`, `gh_via_xargs`, `gh_command_assigns`, `GH_QUOTED_FLAG_RE`, the gh branch of `enforce_scout`, and `command_words`, `strip_leading_syntax` and `strip_quoted`), `claude/evals/lib/scope-hook-contract.sh:196-318`, `claude/coder-fleet/agents/scout.md` and `claude/coder-fleet/hooks/README.md:266`.
- Round-1 must-fixes: all three are closed by design. This round's findings are not substantially round 1's.
- must fix: claude/evals/lib/scope-hook-contract.sh:303 - the trim dropped the `sh -c` and single-pipe gh cases that criterion #4 names.
- must fix: claude/evals/lib/scope-hook-contract.sh:260 - `--raw-field` has no case, though criterion #3 requires one for each flag.
- low: claude/coder-fleet/hooks/enforce-agent-scope.sh:623 - `--cache` writes files; drop it from the allowlist and the docs.
- low: claude/coder-fleet/hooks/enforce-agent-scope.sh:623 - restrict the `-H` value to `Accept:`.
- low: claude/coder-fleet/hooks/enforce-agent-scope.sh:707 - a for-header assigns a variable the walk never sees; deny it or soften the README's "any segment" claim.
- low: claude/coder-fleet/hooks/enforce-agent-scope.sh:721 - the export/declare branch is unreachable for scout; the comment and README present it as live.
- low: claude/coder-fleet/hooks/enforce-agent-scope.sh:1024 - the quoted-option check scans the whole command, not the gh segment, and the README says gh segment.
- low: claude/evals/lib/scope-hook-contract.sh - no case covers a wrapper with options or a duration before an assignment.
- No run article: the spawn prompt did not ask for one.
---

author: @SubagentStop
created: 2026-09-30 07:16
---
Done. coder-fleet:refuter finished with no blockers. From "## Done" in its handoff:

- Baseline: `bash claude/evals/lib/scope-hook-contract.sh` in the worktree gave 471 passed, 0 failed, exit 0, 155 seconds, the same as the coder's report. Output is in `/private/tmp/claude-501/-Users-alex-Dev-Work-extensions-coder-fleet/00593183-3e22-416e-a69e-a08b7ca61b43/scratchpad/refuter-1790751916/baseline.out`.
- Round 1's bypasses, checked at the hook decision only with round 1's `refuter-1790747758/probe.sh` against the worktree hook (gh never ran). These are all denied: `gh api repos/o/r/issues $'-f' t=x`, `gh api repos/o/r/issues $"-f" t=x`, `gh api repos/o/r ${IFS}-XPOST`, `GH_CONFIG_DIR=/tmp/x gh issue view 1 --web`, and `export GH_CONFIG_DIR=/tmp/x; gh issue view 1 --web`. `gh issue view 1` and `gh api repos/o/r` are still allowed.
- Mutants: seven, each on a fresh rsync copy in `refuter-1790751916/<mN>/`, run in parallel. Before running, I diffed each copy's hook against the worktree, and every diff showed only the intended edit. All seven exited 1, so all are killed.
- m1 (api flag allowlist): in `gh_api_denial`, `-*) printf '"%s" is not one of its read flags'...` became `-*) ;;`. Result: 466 passed, 5 failed, exit 1.
- m2 (expansion-character check): in `gh_words_denial`, the `expands:` printf became `: ;;`. Result: 463 passed, 8 failed, exit 1.
- m3a: in `gh_words_denial`, the `quoted:` printf became `: ;;`. Result: 470 passed, 1 failed, exit 1. Only `scout: gh pr view 1 -"-web=true"` catches it, because `GH_QUOTED_FLAG_RE` doesn't match a quote that opens mid-word.
- m3b: m3a plus `GH_QUOTED_FLAG_RE`'s check in `enforce_scout` became `if false; then`. Result: 469 passed, 2 failed, exit 1.
- m4 (--web check): in `gh_words_denial`, both `--web` checks and the `-w` cluster check became no-ops. Result: 468 passed, 3 failed, exit 1.
- m5 (assignment walk): `gh_command_assigns` now returns empty at its first line. Result: 466 passed, 5 failed, exit 1.
- m6 (xargs deny): `gh_via_xargs` now returns 1 at its first line. Result: 469 passed, 2 failed, exit 1.
- Nothing survived. There's no convergence signal to report: round 1 had live bypasses and this round has none.
- Worktree: `git status --short` in the worktree printed nothing, so it's clean. Nothing was written inside the project.
- Time used: about 11 minutes of the 20, and 7 of the 8 mutants.
---

author: @SubagentStop
created: 2026-09-30 07:17
---
Done. coder-fleet:refuter finished with no blockers. From "## Done" in its handoff:

- Baseline: `bash claude/evals/lib/scope-hook-contract.sh` in the worktree gave 471 passed, 0 failed, exit 0, 155 seconds, the same as the coder's report. Output is in `/private/tmp/claude-501/-Users-alex-Dev-Work-extensions-coder-fleet/00593183-3e22-416e-a69e-a08b7ca61b43/scratchpad/refuter-1790751916/baseline.out`.
- Round 1's bypasses, checked at the hook decision only with round 1's `refuter-1790747758/probe.sh` against the worktree hook (gh never ran). These are all denied: `gh api repos/o/r/issues $'-f' t=x`, `gh api repos/o/r/issues $"-f" t=x`, `gh api repos/o/r ${IFS}-XPOST`, `GH_CONFIG_DIR=/tmp/x gh issue view 1 --web`, and `export GH_CONFIG_DIR=/tmp/x; gh issue view 1 --web`. `gh issue view 1` and `gh api repos/o/r` are still allowed.
- Mutants: seven, each on a fresh rsync copy in `refuter-1790751916/<mN>/`, run in parallel. Before running, I diffed each copy's hook against the worktree, and every diff showed only the intended edit. All seven exited 1, so all are killed.
- m1 (api flag allowlist): in `gh_api_denial`, `-*) printf '"%s" is not one of its read flags'...` became `-*) ;;`. Result: 466 passed, 5 failed, exit 1.
- m2 (expansion-character check): in `gh_words_denial`, the `expands:` printf became `: ;;`. Result: 463 passed, 8 failed, exit 1.
- m3a: in `gh_words_denial`, the `quoted:` printf became `: ;;`. Result: 470 passed, 1 failed, exit 1. Only `scout: gh pr view 1 -"-web=true"` catches it, because `GH_QUOTED_FLAG_RE` doesn't match a quote that opens mid-word.
- m3b: m3a plus `GH_QUOTED_FLAG_RE`'s check in `enforce_scout` became `if false; then`. Result: 469 passed, 2 failed, exit 1.
- m4 (--web check): in `gh_words_denial`, both `--web` checks and the `-w` cluster check became no-ops. Result: 468 passed, 3 failed, exit 1.
- m5 (assignment walk): `gh_command_assigns` now returns empty at its first line. Result: 466 passed, 5 failed, exit 1.
- m6 (xargs deny): `gh_via_xargs` now returns 1 at its first line. Result: 469 passed, 2 failed, exit 1.
- Nothing survived. There's no convergence signal to report: round 1 had live bypasses and this round has none.
- Worktree: `git status --short` in the worktree printed nothing, so it's clean. Nothing was written inside the project.
- Time used: about 11 minutes of the 20, and 7 of the 8 mutants.
---

created: 2026-09-30 07:17
---
Round 2, 2026-09-30. Review: request changes, test-only must-fixes. The trim dropped the sh -c, single-pipe and --raw-field cases that criteria #3 and #4 name. Lows: --cache writes files; -H is unconstrained; a for-header is missed by the assignment walk; the export branch is unreachable but described as live; GH_QUOTED_FLAG_RE's scope is misdescribed; no wrapper-with-options assignment case. All three round-1 must-fixes are closed by design. Refuter: all three round-1 bypasses are denied at the hook, and 7 of 7 mutants were killed (m1-m6, m3a/m3b). The new-bypass hunt was cut short by a safety classifier; the reviewer's round-2 design review covered the same ground. Fix round 2 (coder resumed) restores the cases and applies the lows. Filed from this round: CF-88 (audit the scope hook's bash reasoning against zsh) and CF-89 (single-quoted gh api endpoint and jq filter).
---

author: @SubagentStop
created: 2026-09-30 07:28
---
Done. coder-fleet:coder finished with no blockers. From "## Done" in its handoff:

- Commit 9c0f025, "Tighten scout's gh api and assignment checks for review round 2 (CF-84)", changes `claude/coder-fleet/hooks/enforce-agent-scope.sh` and `claude/evals/lib/scope-hook-contract.sh`.
- Item 1 (coverage): restored `sh -c 'gh pr merge 1'`, which is denied because `sh` is not on scout's list. Restored `gh issue list | gh issue close 1`, which is denied as "gh issue close", for the writing pair and not for xargs.
- Item 2 (coverage): restored `gh api repos/o/r/issues --raw-field title=x`, denied as "gh api".
- Item 3: `--cache` is removed from the `gh api` allowlist. `gh api --cache 1h repos/o/r` is now denied, and the existing allow case no longer uses `--cache`.
- Item 4: `-H`/`--header` accepts only an `Accept:` header, in any letter case, in both the separate-word and `=` forms. New denials: `gh api -H X-HTTP-Method-Override:POST repos/o/r/issues` and `gh api --header=Authorization:x repos/o/r`. New allow: `gh api --header=accept:application/vnd.github+json repos/o/r`.
- Item 5: a `for NAME in` header is matched before `strip_leading_syntax` consumes it, so `for GH_HOST in evil.example; do gh issue list; done` is now denied ("a for loop").
- Item 6: the comment on `gh_command_assigns` now says the export/declare/typeset/readonly/local branch decides nothing for scout, because the allowlist denies those in either segment order and the branch only chooses which message shows. The README no longer describes it as a live path.
- Item 7: I chose to document rather than scope. `GH_QUOTED_FLAG_RE` stays a whole-command check: scoping it would mean splitting the raw command where quotes can hide separators. The comment and the README now say it is whole-command.
- Item 8 (coverage): added `nice -n 5 X=1 gh issue list` and `timeout 30 X=1 gh issue list`, both denied as "assigns X".
- Item 9 (coverage): added a second, independent case for the `quoted:` branch, `gh issue view 1 --comments"=x y"`. The whole-command regex misses it, so only that branch denies it.
- Seen failing first: against 611d091 the contract gave `478 passed, 4 failed`. The four were exactly the behaviour changes: `--cache`, `X-HTTP-Method-Override`, `Authorization` and the `for` header. The coverage cases from items 1, 2, 8 and 9 passed before, as expected.
- Mutant, wrapper-option skip removed from `gh_command_assigns`: the `nice -n 5 X=1` case flips to allow (`scratchpad/mutate.sh`).
- Mutant, duration skip removed: both the `nice` and the `timeout` cases flip to allow.
- Mutant, `quoted:` branch removed: both quoted-option cases flip to allow.
- Commit 8f0a9e0, "Describe the round-2 gh tightenings in scout's body and the README (CF-84)": `claude/coder-fleet/agents/scout.md` drops `--cache`, limits `-H` to `Accept:` and adds `for` loops to the banned assignments. `claude/coder-fleet/hooks/README.md` says the same.
- Migration-checklist rerun over `scout.md`: frontmatter unchanged and parses, 42 lines, four H2s in order, no dashes, no hard wraps. The only hits are the same pre-existing YAML comment and `color:` key.
- Scope contract, run on the final hook code: `482 passed, 0 failed`, 132 s. The later commit changed only docs.
- `bash claude/evals/lib/check-all.sh`, run once: exit 0, "Every deterministic check passes.", 237 s.
---

author: @SubagentStop
created: 2026-09-30 07:31
---
Done. coder-fleet:reviewer finished with no blockers. From "## Done" in its handoff:

- Verdict: approve with follow-ups for CF-84 round 3. I reviewed `git diff 611d091..HEAD` (9c0f025, 8f0a9e0) in `/Users/alex/Dev/Work/extensions/coder-fleet/.claude/worktrees/agent-af0ece0d8325786e3` against the eight round-2 items from card comment #10.
- Examined: `claude/coder-fleet/hooks/enforce-agent-scope.sh` (`gh_api_denial`, `gh_words_denial`, `gh_command_assigns`, `GH_FOR_HEADER_RE`, `GH_QUOTED_FLAG_RE`, `strip_leading_syntax`, `command_words` and the gh branch of `enforce_scout`), `claude/evals/lib/scope-hook-contract.sh:221-325`, `claude/coder-fleet/agents/scout.md` and `claude/coder-fleet/hooks/README.md:266`.
- All eight round-2 items are closed. The round-2 must-fixes (the `sh -c`, single-pipe and `--raw-field` cases) are restored. This round's findings are not substantially round 2's.
- Probes, by reading: an `Accept-X:` header and a second header smuggled into an Accept value are both denied. The for-header is caught after `;`, `&&`, `(`, `{`, `!`, keywords and extra spaces, and the forms the regex misses are denied by the allowlist. The only new false deny on a common read is `X-GitHub-Api-Version`.
- low: claude/evals/lib/scope-hook-contract.sh:311 - no for-header case where the loop comes after `;` or inside `{`, so a mutant shrinking `GH_FOR_HEADER_RE` to `^for` would pass the suite.
- low: claude/evals/lib/scope-hook-contract.sh:274 - no `Accept-`-prefixed deny case, so dropping the `:` from `GH_API_ACCEPT_RE` would pass the suite.
- No run article: the spawn prompt did not ask for one.
---

created: 2026-09-30 07:35
---
Ready to merge, not on main yet: PR #46 (https://github.com/rzem-ai/coder-fleet/pull/46), branch cf-84-scout-read-only-gh. It holds the six commits cherry-picked cleanly onto main; outside .boards, main differs from the tested base only by docs/specs/CF-51.md. Review round 3: approve, with two test-coverage lows that were not fixed (no for-header case after ; or {, no Accept- prefix deny case). The lead confirmed independently: scope contract 482/0, 4 targeted mutants each failing exactly their case (Accept check in both forms, for-header detector, --cache re-added), and check-all green on 8f0a9e0. Done still needs: merge, the joint v0.28.2 release with CF-48 and CF-80, then ticking on main.
---

created: 2026-09-30 07:53
---
On main via PR #46; release in PR #47 (v0.28.2). All seven criteria are proven by the scope contract (482/0 on the release tree): allowed families (#1); denied writes, auth and an unknown group (#2); each api method and field flag including --raw-field (#3); bash -c, sh -c, env, quoting, ;, && and a single pipe (#4); the unchanged pre-existing cases (#5); scout.md with a clean migration-checklist (#6); check-all green (#7). Closes when #47 merges.
---
<!-- COMMENTS:END -->
