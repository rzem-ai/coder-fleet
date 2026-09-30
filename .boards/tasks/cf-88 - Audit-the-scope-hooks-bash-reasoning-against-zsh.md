---
id: CF-88
title: Audit the scope hook's bash reasoning against zsh
status: To Do
assignee: []
created_date: '2026-09-30 07:11'
labels:
  - hooks
dependencies: []
priority: Medium
type: bug
ordinal: 119000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From the CF-84 round-2 review, 2026-09-30. claude/coder-fleet/hooks/enforce-agent-scope.sh reasons about commands in bash semantics (quoting, expansion, word splitting, globbing), but Claude Code runs Bash tool commands in the human's login shell, which is zsh on this machine. zsh differs: NOMATCH makes an unmatched glob such as `?` an error; its parameter-expansion flags, glob qualifiers, `=cmd` expansion, and `setopt`-dependent behaviour have no bash equivalent. A check that is sound for bash may be unsound, or falsely strict, for zsh. This covers every allowlist role (scout, reviewer, refuter's git rule, and others), not only CF-84's gh rule.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Which shell the Bash tool actually runs a hook-approved command in is established (zsh or bash, and which options) and recorded in hooks/README.md
- [ ] #2 Every zsh-only expansion that could turn an allowed command into a different one (glob qualifiers, =cmd, parameter flags, history expansion, and others found) is listed, with a contract case showing it is denied or harmless
- [ ] #3 bash claude/evals/lib/check-all.sh passes
<!-- AC:END -->
