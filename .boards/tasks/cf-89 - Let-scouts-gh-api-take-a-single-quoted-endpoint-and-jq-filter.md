---
id: CF-89
title: 'Make scout''s gh api usable: quoted endpoint, jq filter, API version header'
status: To Do
assignee: []
created_date: '2026-09-30 07:11'
updated_date: '2026-09-30 14:03'
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
- [ ] #4 The human decides whether scout's gh api also allows -H X-GitHub-Api-Version:<date> (read-only, in GitHub's documented gh api examples, and denied by CF-84's Accept-only header rule); if yes, an allow case for it and deny cases for other non-Accept headers stay
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
created: 2026-09-30 07:32
---
Widened 2026-09-30 from CF-84 review round 3: the Accept-only -H rule (added to block X-HTTP-Method-Override) also denies X-GitHub-Api-Version, which only selects the response schema. Whether to allow it is the human's call, recorded as the new criterion.
---
<!-- COMMENTS:END -->
