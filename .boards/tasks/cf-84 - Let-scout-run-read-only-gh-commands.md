---
id: CF-84
title: Let scout run read-only gh commands
status: In Progress
assignee: []
created_date: '2026-09-30 05:26'
updated_date: '2026-09-30 05:42'
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
<!-- COMMENTS:END -->
