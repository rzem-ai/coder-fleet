---
id: EX-3
title: Route inventory script
status: To Do
assignee: []
created_date: '2026-09-19 08:30'
updated_date: '2026-09-20 09:10'
labels: []
dependencies: []
references:
  - docs/specs/EX-3-route-inventory.md
  - src/api/routes.ts
priority: Medium
ordinal: 3000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Filed by the human: "I want a list of the routes this service exposes without reading routes.ts, and EX-2 will need it." Add scripts/list-routes.mjs, which reads src/api/routes.ts as text and prints `METHOD path` for every `app.<method>("<path>"` call, sorted by path. Nothing under src/ changes. The spec is docs/specs/EX-3-route-inventory.md, approved by the human.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `node scripts/list-routes.mjs` prints `METHOD path`, one route per line, sorted by path; for this repository that is `GET /me` then `POST /sessions/refresh`
- [ ] #2 A missing routes file exits non-zero with a message
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @lead
created: 2026-09-20 09:10
---
The human said go on EX-3 on 2026-09-20. Decision, the human: a text match over the one routes file is enough; no TypeScript parser.
---
<!-- COMMENTS:END -->
