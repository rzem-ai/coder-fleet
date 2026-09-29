---
id: CF-69
title: >-
  gen-agent-pairs.sh should refuse any description that breaks a YAML plain
  scalar
status: To Do
assignee: []
created_date: '2026-09-29 13:31'
labels: []
dependencies: []
references:
  - claude/scripts/gen-agent-pairs.sh
  - CF-12.3
  - docs/specs/CF-12.md
priority: Low
type: bug
ordinal: 96000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Proposed by spec-writer in CF-59 (2026-09-29), originally raised in CF-12.3 comment #1. The generator refuses only `: ` and ` #` in `description.opus:` and `description.fable:`. Other strings, such as a leading `-`, `[`, `{`, `&`, `*`, `!`, `|`, `>`, `%` or `@`, or a trailing `:`, also break a YAML plain scalar in the generated frontmatter. docs/specs/CF-12.md lists this under the roster ripple, but no criterion owns it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 gen-agent-pairs.sh refuses every description value that is not a valid YAML plain scalar, naming the source file and the offending field
- [ ] #2 The pair contract under claude/evals/lib/ has a case for each refused shape, and each case fails with the refusal removed
- [ ] #3 bash claude/evals/lib/check-all.sh is green
<!-- AC:END -->
