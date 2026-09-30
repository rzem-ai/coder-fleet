---
id: CF-89
title: Let scout's gh api take a single-quoted endpoint and jq filter
status: To Do
assignee: []
created_date: '2026-09-30 07:11'
labels:
  - hooks
dependencies:
  - CF-84
priority: Low
type: enhancement
ordinal: 120000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From the CF-84 round-2 review, 2026-09-30. CF-84's gh api allowlist denies every quoted word, so query strings (an unquoted `?` fails under zsh's NOMATCH, and an unquoted `&` backgrounds gh) and jq filters like `.[].title` can't be used. jq is not on scout's allowlist either, so there is no pipe route. Single quotes do no expansion in bash or zsh, and pflag always consumes a flag's value word, so a single-quoted endpoint or filter value can't become a flag.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Scout's gh api accepts a single-quoted endpoint (checked against GH_API_ENDPOINT_RE after unquoting, with & allowed in the query) and a single-quoted value directly after -q/--jq/-t/--template, read from the raw command, with allow cases
- [ ] #2 Double quotes, $'...', and any single-quoted word elsewhere stay denied, with deny cases
- [ ] #3 bash claude/evals/lib/check-all.sh passes
<!-- AC:END -->
