---
id: CF-202
title: 'Ship one definition per editor: drop the Fable spec-editor and tech-editor'
status: To Do
assignee: []
created_date: '2026-11-12 12:03'
labels: []
dependencies: []
priority: Medium
type: enhancement
ordinal: 330000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The human asked (2026-11-12) to remove the doubled editors and keep only the Opus versions. Today each editor ships as two generated definitions, `spec-editor`/`spec-editor-fable` and `tech-editor`/`tech-editor-fable`, rendered from `claude/agent-pairs/` by `claude/scripts/gen-agent-pairs.sh`, and `/init` asks Opus, Fable or neither for each. After this change the plugin ships one Opus definition per editor, and a project chooses only whether it has each editor.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `claude/coder-fleet/agents/` has `spec-editor.md` and `tech-editor.md` and no `-fable` definition, and `claude/evals/` has no `spec-editor-fable` or `tech-editor-fable` eval
- [ ] #2 Each editor's body is edited directly in its definition: `claude/agent-pairs/`, `claude/scripts/gen-agent-pairs.sh`, its fixture and its contract test are gone, and `check-all.sh` no longer runs a pair check
- [ ] #3 `editor-models.py` records only `opus` or `neither`, `/init` and `/kickoff` offer only those two answers, and a project whose `AGENTS.md` records `fable` is told to re-answer, with `set <editor> opus` there removing the deny rule on the Opus definition
- [ ] #4 No hook, skill, command or agent body names a `-fable` editor, including `enforce-agent-scope.sh`, `check-write-scope.py`, `hooks.json` and `lead-procedures`
- [ ] #5 `docs/fleet-design.md`, `docs/agent-contract.md`, `docs/limits.md`, `claude/README.md`, `AGENTS.md` and `opencode/docs/divergence-register.md` describe one definition per editor, and `bash claude/evals/lib/check-all.sh` is green on the branch
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 `bash claude/evals/lib/check-all.sh` passes on the branch
- [ ] #2 The reviewer approved, and a refuter round ran where lead.md step 4 calls for one - satisfied with no refuter round and no substitute gate run when .claude/coder-fleet.json disables the refuter
- [ ] #3 `migration-checklist` findings are in the PR when an agent body or skill frontmatter changed
- [ ] #4 The version is bumped in plugin.json and .claude-plugin/marketplace.json, and the release is tagged and pushed
- [ ] #5 The port divergence register has a row where a ported artefact changed
- [ ] #6 The spec, where there is one, is linked as a reference
<!-- DOD:END -->
