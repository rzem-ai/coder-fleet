---
id: CF-39
title: Make bun run check lint the board package
status: To Do
assignee: []
created_date: '2026-09-27 06:51'
labels: []
dependencies: []
priority: Low
type: chore
ordinal: 66000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Proposed by the CF-26 coder. `bun run check` in claude/coder-fleet/board stops before linting: biome.json sets vcs.useIgnoreFile: true and board/ has no ignore file, so biome errors with "couldn't find an ignore file". The package has no working lint command; CF-26 linted its five files with --vcs-enabled=false as a workaround.
<!-- SECTION:DESCRIPTION:END -->
