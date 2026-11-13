---
id: CF-206
title: >-
  Make the spec editor and tech editor ordinary agents: no per-project option,
  no AGENTS.md line, always run
status: In Progress
assignee: []
created_date: '2026-11-12 23:06'
updated_date: '2026-11-13 02:43'
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
- [x] #1 The lead spawns spec-editor once on every revised spec and tech-editor once on every tech-writer output, in every project, with no AGENTS.md line consulted; disabling either through /coder-fleet:agents is the only way to stop it, as for any agent
- [x] #2 The challenge gate gates every spec by the spec editor's challenges in every project, reading no `Spec editor:` line, and still lets a spec through when spec-editor is disabled through /coder-fleet:agents
- [x] #3 scripts/editor-models.py, its contract test and every call to it are gone; templates/AGENTS.md carries no `Spec editor:` or `Tech editor:` line; /kickoff asks and checks nothing about editors
- [x] #4 In a project whose AGENTS.md has a `Spec editor:` or `Tech editor:` line, or whose .claude/settings.json or settings.local.json permissions.deny holds `Agent(coder-fleet:spec-editor)`, `Agent(coder-fleet:tech-editor)` or either `-fable` form, /kickoff says what it found and offers once to remove them; on yes it removes exactly those lines and rules, leaving every other byte as it was, and on no it changes nothing and says an editor deny rule keeps that editor from running
- [x] #5 No prose in the plugin, the templates, claude/README.md, docs/ or this repo's AGENTS.md describes an editor choice, `opus or neither`, or `Spec editor:` / `Tech editor:` lines, except as history in docs/decisions/
- [ ] #6 `bash claude/evals/lib/check-all.sh` passes
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 `bash claude/evals/lib/check-all.sh` passes on the branch
- [x] #2 The reviewer approved, and a refuter round ran where lead.md step 4 calls for one - satisfied with no refuter round and no substitute gate run when .claude/coder-fleet.json disables the refuter
- [x] #3 `migration-checklist` findings are in the PR when an agent body or skill frontmatter changed
- [ ] #4 The version is bumped in plugin.json and .claude-plugin/marketplace.json, and the release is tagged and pushed
- [x] #5 The port divergence register has a row where a ported artefact changed
- [x] #6 The spec, where there is one, is linked as a reference
<!-- DOD:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: lead
created: 2026-11-12 23:09
---
Places still describing the editor choice after 4cab3168, found by the PR #180 reviewer on 13 Nov 2026, for whoever builds this card: claude/coder-fleet/commands/kickoff.md:19 (preflight 8 tells the lead to ask 'exactly as step 2c of commands/init.md says', a step that no longer exists, so /kickoff in a project with no editor answer points at nothing - functional, and the suite does not catch it); claude/README.md:80 ('Init also asks ... whether the project runs each editor'); claude/evals/lib/editor-models-contract.sh:3 (says /init runs editor-models.py); opencode/docs/divergence-register.md:282 (lists init.md step 2c as a deferred counterpart). The reviewer also proposed a contract check that a command names no init step that does not exist.
---

author: lead
created: 2026-11-12 23:58
---
Sub-issue 1 of 1: started, on the human's order ("fix the broken editor agents", 13 Nov 2026). Done still needs: criteria 1 to 6.

What lands: every project runs spec-editor on every revised spec and tech-editor on every tech-writer output, with no question and no AGENTS.md line; /coder-fleet:agents disable is the only way to switch one off. New projects get spec and tech editing back.

Lead's defaults, easy to reverse: a disabled spec-editor means the challenge gate passes every spec (nothing to gate on), as a 'neither' answer did; this repo's own `Spec editor:` and `Tech editor:` lines go from its AGENTS.md; the two leftover `Agent(coder-fleet:*-fable)` deny rules in this repo's .claude/settings.json go too, as they name agents that no longer exist; a project's old deny rule for an editor keeps working as a plain permission deny, and /init and /kickoff say so once rather than removing it.

Done: nothing yet. Not done: a project set up since 4cab3168 runs no editors. A coder is being spawned; the challenge gate passed (no spec).
---

author: lead
created: 2026-11-13 02:27
---
Built on branch cf-206-editors-always-run at b5146bec by the coder; check-all exit 0 (127.3 s). The coder's Blocker: a project with an old `Agent(coder-fleet:spec-editor)` deny but no disabledAgents entry has every spec refused, since the gate reads only disabledAgents.

The human asked where that old setting lives. Answer: each project's .claude/settings.json permissions.deny, written by the old /init. None of the human's projects ever answered 'neither'; the rules there are leftovers of the Opus-or-Fable choice - agents, fathom and fathom-alt deny only the removed -fable editors, and blaise (`Spec editor: fable`) denies the real spec-editor. The human chose "Kickoff cleans + I fix now" (13 Nov 2026): criterion 4 is rewritten so /kickoff offers once to remove old editor lines and deny rules, and the lead removed them by hand from agents, blaise, fathom and fathom-alt (settings.json deny lists emptied, editor lines and agents' explanatory paragraph removed from AGENTS.md; left uncommitted in each repo). The gate keeps reading disabledAgents alone. The same coder is making the change.
---

author: lead
created: 2026-11-13 02:34
---
Built on cf-206-editors-always-run at 13518b67, six commits; review round 1 running with break mode on editor-leftovers.py and the gate's disabled read, since the script edits permissions.deny. Done still needs: the review, a second round after any fix, the pull request.

Done, by the coder's account and not yet reviewed: both editors run in every project with no AGENTS.md line; the gate gates every spec unless disabledAgents lists spec-editor; editor-models.py, its contract and kickoff's question are gone; /kickoff finds old editor lines and deny rules, asks once, and on yes removes exactly those through scripts/editor-leftovers.py (33-case contract, byte-for-byte checks); check-all exit 0, 164.5 s, 42 sections. Not done: review, pull request, merge, release.

Coder's proposals, recorded and not filed: a contract check that every command's 'step N' or 'check N' reference names a step that exists; recount the root-skip permission cases and put an exact number back in docs/limits.md.
---

author: lead
created: 2026-11-13 02:43
---
Review round 1 at 13518b67 (modes review and break): approve with follow-ups, no must fix. PR #182 open and marked ready; CI running.

Evidence for the ticks. Criterion 1: lead.md step 2 and lead-procedures' Editors and gate paragraphs, read by the reviewer - every project, no AGENTS.md line, no contradicting sentence left. Criterion 2: challenge-gate-contract 80 passed, including run-old-neither-line-is-not-read, run-disabled-passes, run-invalid-config-disables-nothing; break mutants M7 (invalid config disables) and M8 (worktree copy read) both killed; the reviewer confirmed the gate fails closed on every unreadable config. Criterion 3: editor-models.py, its contract and section gone; template and kickoff carry no editor line or question (reviewer's grep). Criterion 4: editor-leftovers-contract 33 passed; mutants M2, M3, M5, M6 killed; hostile fixtures (escaped strings, JSON comments, nested permissions, near names) removed only exact rules or refused. Criterion 5: the reviewer's grep across claude/, docs/, opencode/, AGENTS.md and .claude/settings.json finds `Spec editor:` only in gate fixtures that test an old line is ignored. Definition of Done 2: approved, with the break round an authorisation-config change calls for; no fix round, so no second round. Definition of Done 3: migration-checklist findings in PR #182. Definition of Done 5: register rows 280-282 rewritten. Definition of Done 6: no spec.

Done still needs: criterion 6 and Definition of Done 1 on CI, then merge and release (Definition of Done 4).

Dropped lows, recorded: editor-leftovers.py checks for a link only on the file itself, so a .claude directory symlinked outside the project has its settings edited on the human's yes; editor lines inside a code fence count as leftovers; the near-names contract case should carry one exact rule (why mutant M1 lived; the reparse check refuses that wider edit at runtime). Reviewer's proposal on the first two, recorded and not filed.
---
<!-- COMMENTS:END -->
