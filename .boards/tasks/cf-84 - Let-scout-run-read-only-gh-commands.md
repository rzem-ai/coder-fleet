---
id: CF-84
title: Let scout run read-only gh commands
status: In Progress
assignee: []
created_date: '2026-09-30 05:26'
updated_date: '2026-09-30 05:54'
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
<!-- COMMENTS:END -->
