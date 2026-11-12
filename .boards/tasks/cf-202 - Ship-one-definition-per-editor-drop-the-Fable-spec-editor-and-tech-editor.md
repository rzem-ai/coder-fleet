---
id: CF-202
title: 'Ship one definition per editor: drop the Fable spec-editor and tech-editor'
status: Done
assignee: []
created_date: '2026-11-12 12:03'
updated_date: '2026-11-12 22:18'
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
- [x] #1 `claude/coder-fleet/agents/` has `spec-editor.md` and `tech-editor.md` and no `-fable` definition, and `claude/evals/` has no `spec-editor-fable` or `tech-editor-fable` eval
- [x] #2 Each editor's body is edited directly in its definition: `claude/agent-pairs/`, `claude/scripts/gen-agent-pairs.sh`, its fixture and its contract test are gone, and `check-all.sh` no longer runs a pair check
- [x] #3 `editor-models.py` records only `opus` or `neither`, `/init` and `/kickoff` offer only those two answers, and a project whose `AGENTS.md` records `fable` is told to re-answer, with `set <editor> opus` there removing the deny rule on the Opus definition
- [x] #4 No hook, skill, command or agent body names a `-fable` editor, including `enforce-agent-scope.sh`, `check-write-scope.py`, `hooks.json` and `lead-procedures`
- [x] #5 `docs/fleet-design.md`, `docs/agent-contract.md`, `docs/limits.md`, `claude/README.md`, `AGENTS.md` and `opencode/docs/divergence-register.md` describe one definition per editor, and `bash claude/evals/lib/check-all.sh` is green on the branch
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 `bash claude/evals/lib/check-all.sh` passes on the branch
- [x] #2 The reviewer approved, and a refuter round ran where lead.md step 4 calls for one - satisfied with no refuter round and no substitute gate run when .claude/coder-fleet.json disables the refuter
- [x] #3 `migration-checklist` findings are in the PR when an agent body or skill frontmatter changed
- [x] #4 The version is bumped in plugin.json and .claude-plugin/marketplace.json, and the release is tagged and pushed
- [x] #5 The port divergence register has a row where a ported artefact changed
- [x] #6 The spec, where there is one, is linked as a reference
<!-- DOD:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-11-12 12:04
---
Started. A coder is removing the Fable spec-editor and tech-editor from the plugin, along with the generator that made two definitions per editor. Done: nothing yet. Not done: all five criteria. When it lands, the agent list will show only the Opus editors and /init will only ask whether a project has each editor.
---

created: 2026-11-12 13:06
---
Built, now in review. Done: on branch cf-202-one-definition-per-editor (head 181d766e), the Fable spec and tech editors are gone from the plugin, along with the generator that made two of each. /init and /kickoff now ask only Opus or neither. A project that recorded Fable is told to answer again, and the scope hook refuses the two removed names. The full suite passed in 122 s. Not done: review, pull request and merge. The version bump and release are the human's.
---

created: 2026-11-12 13:07
---
Proposed follow-ups from the coder, not filed. (1) Make enforce-agent-scope.sh deny any unknown agent type with the coder-fleet: prefix, so a future removed fleet agent can't fall through to allow without someone listing it by hand. (2) Drop the two leftover deny rules for the -fable editors from this repo's .claude/settings.json, which now block agents that no longer exist.
---

created: 2026-11-12 14:54
---
Review round 1: approved, with all five criteria met and the suite green at 181d766e. Seven of eight attempts to break the agent-guard code were caught by the tests. The eighth was a deny rule listed twice, where the setup script refuses and asks the human to remove it rather than removing both copies, and no test covers it. A fix round is adding that test and correcting a cosmetic indentation slip in the same script, then a second review runs because the change touches the agent guard. The human dropped both coder follow-ups. Not done: fix round, second review, pull request, merge.
---

created: 2026-11-12 15:03
---
Ready to merge: PR #175 (https://github.com/rzem-ai/coder-fleet/pull/175), waiting on CI. Done: both review rounds approved, the duplicate-rule test and the indentation fix are in, all five criteria are ticked, and the migration checklist findings are in the PR. Not done: CI, merge, then the human's version bump and release. Known minor gap, left as it is: a hand-formatted settings file with commas at the start of each line makes `set <editor> opus` stop with an error, and nothing is written.
---

created: 2026-11-12 15:10
---
Merged: PR #175 is on main as 9c326b9d, and the worktree and branch are removed. Done: the plugin source on main ships only the Opus spec-editor and tech-editor, and /init and /kickoff ask only Opus or neither. Not done: the human's version bump, tag and release, the last Definition of Done item. Until then, installed copies still show the Fable editors.
---

created: 2026-11-12 15:23
---
Released as v0.54.0: release PR #176 merged with a merge commit, and the annotated tag v0.54.0 is pushed on ef2cef1e. Done: a plugin update now brings installs to 0.54.0, where only the Opus editors appear. Not done: nothing on this card.
---
<!-- COMMENTS:END -->
