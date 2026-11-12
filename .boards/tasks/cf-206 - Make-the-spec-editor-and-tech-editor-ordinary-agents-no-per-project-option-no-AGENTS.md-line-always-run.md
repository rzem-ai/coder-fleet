---
id: CF-206
title: >-
  Make the spec editor and tech editor ordinary agents: no per-project option,
  no AGENTS.md line, always run
status: Next
assignee: []
created_date: '2026-11-12 23:06'
updated_date: '2026-11-12 23:09'
labels: []
dependencies: []
priority: High
type: enhancement
ordinal: 334000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Ordered by the human, 13 Nov 2026, filed in Next at his word. He removed /init step 2c (the editor question) in 4cab3168 and, asked what should happen now, said: "the option is gone, so it should be just like all the other agents, no option to chose from, no defaults, it just is".

Today the fleet still treats each editor as a project choice: templates/AGENTS.md ships `Spec editor: <opus or neither>` and `Tech editor: <opus or neither>` placeholders; scripts/editor-models.py reads and writes them and adds a deny rule for neither; the lead (lead-procedures, Editors) spawns an editor only where its line records opus; the challenge gate (scripts/challenge-gate.py) gates a spec only where a spec editor is recorded; /kickoff step 8 checks the lines; claude/README.md, docs/fleet-design.md, docs/limits.md and this repo's AGENTS.md describe the choice. With step 2c gone, a new project keeps the placeholder, so the lead and the gate run no editors at all.

After this change the two editors are like every other fleet agent: always present, always used at their point in the flow, and switched off only the way any agent is, through /coder-fleet:agents disable.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The lead spawns spec-editor once on every revised spec and tech-editor once on every tech-writer output, in every project, with no AGENTS.md line consulted; disabling either through /coder-fleet:agents is the only way to stop it, as for any agent
- [ ] #2 The challenge gate gates every spec by the spec editor's challenges in every project, reading no `Spec editor:` line, and still lets a spec through when spec-editor is disabled through /coder-fleet:agents
- [ ] #3 scripts/editor-models.py, its contract test and every call to it are gone; templates/AGENTS.md carries no `Spec editor:` or `Tech editor:` line; /kickoff asks and checks nothing about editors
- [ ] #4 A project whose AGENTS.md still has a `Spec editor:` or `Tech editor:` line, or a deny rule an earlier /init wrote for `Agent(coder-fleet:spec-editor)` or `Agent(coder-fleet:tech-editor)`, gets one line from /init or /kickoff saying the line is no longer read and the rule now disables that editor, and nothing is changed for it
- [ ] #5 No prose in the plugin, the templates, claude/README.md, docs/ or this repo's AGENTS.md describes an editor choice, `opus or neither`, or `Spec editor:` / `Tech editor:` lines, except as history in docs/decisions/
- [ ] #6 `bash claude/evals/lib/check-all.sh` passes
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

## Comments

<!-- COMMENTS:BEGIN -->
author: lead
created: 2026-11-12 23:09
---
Places still describing the editor choice after 4cab3168, found by the PR #180 reviewer on 13 Nov 2026, for whoever builds this card: claude/coder-fleet/commands/kickoff.md:19 (preflight 8 tells the lead to ask 'exactly as step 2c of commands/init.md says', a step that no longer exists, so /kickoff in a project with no editor answer points at nothing - functional, and the suite does not catch it); claude/README.md:80 ('Init also asks ... whether the project runs each editor'); claude/evals/lib/editor-models-contract.sh:3 (says /init runs editor-models.py); opencode/docs/divergence-register.md:282 (lists init.md step 2c as a deferred counterpart). The reviewer also proposed a contract check that a command names no init step that does not exist.
---
<!-- COMMENTS:END -->
