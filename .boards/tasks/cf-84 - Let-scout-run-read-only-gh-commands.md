---
id: CF-84
title: Let scout run read-only gh commands
status: To Do
assignee: []
created_date: '2026-09-30 05:26'
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
