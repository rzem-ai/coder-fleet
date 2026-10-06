---
id: CF-59
title: Revise the CF-12 and CF-24 specs for a fleet without plans
status: Done
assignee: []
created_date: '2026-09-28 13:00'
updated_date: '2026-10-06 14:08'
labels: []
dependencies: []
priority: Medium
ordinal: 86000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From the CF-58 review, 2026-09-28: docs/specs/CF-12.md and docs/specs/CF-24.md, committed in CF-58 with Status approved, rest on plans: spec-to-plan's plan stage, planning gates in lead step 3, "the plan wins" (CF-24 Q7) and plan Done when sections. Each needs the human's word on what survives without plans before either item is built.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 each spec names no plan stage, plan gate or Done when, and the human has approved the revision
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 `bash claude/evals/lib/check-all.sh` passes on the branch
- [x] #2 The reviewer approved, and a refuter round ran where lead.md step 4 calls for one
- [x] #3 `migration-checklist` findings are in the PR when an agent body or skill frontmatter changed
- [x] #4 The version is bumped in plugin.json and .claude-plugin/marketplace.json, and the release is tagged and pushed
- [x] #5 The port divergence register has a row where a ported artefact changed
- [x] #6 The spec, where there is one, is linked as a reference
<!-- DOD:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: lead
created: 2026-09-29 13:23
---
Decision from the human, 2026-09-29 session: run CF-59 now for docs/specs/CF-12.md, so that CF-12.3 to CF-12.5 can be built. Keep the answers already given (Q1 to Q19). Replace only what depends on plans: spec-to-plan's plan stage, the planning gate in lead step 3, and "Done when" sections. Move the spec-editor challenge gate to the lead's check before building. docs/specs/CF-24.md is not part of this pass and stays open under this card.
---

author: @SubagentStop
created: 2026-09-29 13:31
---
Blocked by human. coder-fleet:spec-writer raised 3 blocker(s). From "## Decisions needed" in its handoff:

- Should `spec-to-card`'s card stage also run the challenge gate and the close before it files criteria onto a card (recommended: yes, since otherwise `[challenge Cn]` markers on criterion lines get filed onto the card verbatim), or is the lead's check in `lead.md` step 3 the only gate?
- When a project's `AGENTS.md` records no editor answer, should the lead skip the spec-editor spawn and the gate and suggest `/kickoff` (recommended), or apply the gate, so that older specs such as CF-12 and CF-24 need a closed marker typed by hand before building, as CF-12.3 comment #3 expected?
- Do you approve `docs/specs/CF-12.md` as revised on 2026-09-29, so that its per-sub-issue criteria can go onto CF-12.3, CF-12.4 and CF-12.5?
---

author: lead
created: 2026-09-29 13:39
---
The human answered all three actions in the session on 2026-09-29.

#1: yes. spec-to-card's card stage also runs the challenge gate and the close before it files criteria onto a card, so `[challenge Cn]` markers never reach a card. The gate runs in two places: lead step 3 and spec-to-card.

#2: skip. When AGENTS.md records no editor answer, the lead does not spawn the spec-editor and does not run the gate, and it suggests `/kickoff` instead. Older specs such as CF-12 and CF-24 therefore build without a closed marker.

#3: approved. The human approved docs/specs/CF-12.md as revised on 2026-09-29, on condition that answers #1 and #2 are recorded in it. spec-writer is recording them. The re-cut criteria then go onto CF-12.3, CF-12.4 and CF-12.5. CF-59 stays open for docs/specs/CF-24.md.
---

author: @board
created: 2026-09-29 13:39
---
Actions for Human cleared: CF-59 moved from Blocked by human to In Progress.

- #1 (ticked) Should `spec-to-card`'s card stage also run the challenge gate and the close before it files criteria onto a card (recommended: yes, since otherwise `[challenge Cn]` markers on criterion lines get filed onto the card verbatim), or is the lead's check in `lead.md` step 3 the only gate?
- #2 (ticked) When a project's `AGENTS.md` records no editor answer, should the lead skip the spec-editor spawn and the gate and suggest `/kickoff` (recommended), or apply the gate, so that older specs such as CF-12 and CF-24 need a closed marker typed by hand before building, as CF-12.3 comment #3 expected?
- #3 (ticked) Do you approve `docs/specs/CF-12.md` as revised on 2026-09-29, so that its per-sub-issue criteria can go onto CF-12.3, CF-12.4 and CF-12.5?
---

author: @SubagentStop
created: 2026-09-29 13:43
---
Done. coder-fleet:spec-writer finished with no blockers. From "## Done" in its handoff:

- I recorded your answers as Q20 and Q21 in `/Users/alex/Dev/Work/extensions/coder-fleet/docs/specs/CF-12.md`, and set its Status line to "approved 2026-09-29 (revised under CF-59)". I didn't commit it, as instructed.
- Q20: the challenge gate is one shared script, run in two places. `lead.md` step 3 runs it before the first build spawn on an item, and `spec-to-card`'s card stage runs it before filing criteria onto a card. The "Which workflow runs the gate" section now matches.
- Q20, card stage: if the gate refuses, the card stage files nothing and names the blocking challenges. If the gate passes, it runs the close first, so no `[challenge Cn]` marker ever reaches a card.
- Q21: a project whose `AGENTS.md` records no editor answer gets no spec-editor spawn and no gate, plus a `/kickoff` suggestion. The gate's test fixtures treat that case as a pass, not a refusal, and CF-12 and CF-24 can be built without a closed marker.
- Criteria: CF-12.3 now has 21, adding `spec-to-card` tests for the three things you asked for. CF-12.4 has 9 and CF-12.5 has 9. Each fits on one card line, under 500 characters.
- The full criteria lists, word for word, are in the report I handed to the lead, ready to paste.
- The spec no longer has any blocking open questions.
---

author: lead
created: 2026-09-29 14:05
---
CF-24 half, 2026-09-30. The human briefly archived CF-24 on the lead's incomplete summary (see CF-24 comment #11), then chose to restore it and re-scope it. spec-writer now revises docs/specs/CF-24.md for a fleet without plans. It keeps every live criterion, drops the four that depend on plans (2, 3, 5, 17), and folds in CF-71 and CF-72. This card closes when the human approves that revision.
---

author: @SubagentStop
created: 2026-09-29 14:12
---
Blocked by human. coder-fleet:spec-writer raised 1 blocker(s). From "## Decisions needed" in its handoff:

- Do you approve docs/specs/CF-24.md as revised on 2026-09-30? The revision drops old criteria 2, 3, 5 and 17, makes the card authoritative in place of "the plan wins" (Q7), folds CF-71 and CF-72 into criteria 10, 11 and 1, and re-cuts the card to 15 criteria. Open questions 1 and 2 recommend keeping criterion 14 and Q6's fixed first line.
---

author: lead
created: 2026-09-29 14:14
---
Criterion #1 is proven on local main. docs/specs/CF-12.md was revised and approved on 2026-09-29 (4086831). docs/specs/CF-24.md was revised and approved on 2026-09-30 (c4ec107). Each spec's grep for plan, spec-to-plan and "Done when" was accounted for by spec-writer: every hit that remains is a recorded answer, history or a void marker, and none is something to build. The CF-12.3 to CF-12.5 and CF-24 cards (with sub-issues CF-24.1 to CF-24.4) carry the re-cut criteria. Closing through the gate.
---

author: lead
created: 2026-09-29 14:14
---
Action #1 answered by the human in the session on 2026-09-30: yes, docs/specs/CF-24.md is approved as revised (committed in c4ec107). The human also accepted open questions 1 and 2 as recommended, and split CF-24 into CF-24.1 to CF-24.4.
---

author: @board
created: 2026-09-29 14:18
---
Actions for Human cleared: CF-59 moved from Blocked by human to Done.

- #1 (ticked) [not a question] Do you approve docs/specs/CF-24.md as revised on 2026-09-30? The revision drops old criteria 2, 3, 5 and 17, makes the card authoritative in place of "the plan wins" (Q7), folds CF-71 and CF-72 into criteria 10, 11 and 1, and re-cuts the card to 15 criteria. Open questions 1 and 2 recommend keeping criterion 14 and Q6's fixed first line.
---

author: @SubagentStop
created: 2026-09-30 00:15
---
Done. coder-fleet:scout finished with no blockers. From "## Done" in its handoff:

- Definition: `types/index.ts:348` has `taskResolutionStrategy?: "most_recent" | "most_progressed";`.
- Config parse: `file-system/operations.ts` has no `taskResolution` or `task_resolution` match, and the `parseConfig` switch (about lines 2170-2190) has no case for it.
- Config serialise: `file-system/operations.ts` about lines 2215-2270 does not write the key.
- Config key lists: `core/content-store.ts:60-80` does not list it in the boolean, integer or array key sets.
- Default: applied at read time as `config?.taskResolutionStrategy ?? "most_progressed"` (or `||`), not in a defaults object.
- Web UI render: `web/components/Settings.tsx:370-383` renders the "Task Resolution Strategy" select, bound to `config.taskResolutionStrategy`.
- Web UI onChange: `web/components/Settings.tsx:376` is `onChange={(e) => handleInputChange('taskResolutionStrategy', e.target.value as 'most_recent' | 'most_progressed')}`.
- Web UI options: `web/components/Settings.tsx:379-380` are `<option value="most_recent">Most Recent</option>` and `<option value="most_progressed">Most Progressed</option>`.
- Web UI help text: "Strategy for resolving conflicts when tasks exist in multiple branches".
- Web UI save: `web/components/Settings.tsx:88-95` spreads `config` and calls `apiClient.updateConfig(normalizedConfig)`.
- Read that changes behaviour: `core/backlog.ts:3865` has `const resolutionStrategy = config?.taskResolutionStrategy || "most_progressed";`.
- That value is passed to `buildTaskIdentityIndex` at `core/backlog.ts:3884-3891`.
- Other reads: `core/backlog.ts:930` and `core/backlog.ts:3823`, plus use as a cache key at `core/backlog.ts:544`.
- `core/backlog.ts:370-413` passes it on to `new TaskIdentityIndex(...)`.
- The only branch on the value is `core/task-identity-index.ts:127-147`, in `selectTaskRecord`: `if (strategy === "most_progressed") { const leftRank = Math.max(0, statuses.indexOf(left.task?.status ?? "")); ...`.
- `selectTaskRecord` is called at `core/task-identity-index.ts:249-253`.
- Working-copy records sort first, before the strategy applies (`core/task-identity-index.ts:135-137`).
- The cross-branch input is empty. All three `buildTaskIdentityIndex` callers pass `[]` for `branchRecords`: `core/backlog.ts:925-933`, `3818-3825` and `3884-3891`. The push is `records.push(...branchRecords)` at `core/backlog.ts:403`.
- `file-system/operations.ts:234-240` `forceFilesystemOnly` sets `config.filesystemOnly = true;`, `config.checkActiveBranches = false;` and `config.remoteOperations = false;`. It is applied at `:2049` (cached config) and `:2067` (parsed config).
- The comment above `forceFilesystemOnly` says "Cross-branch task loading and remote operations are not carried".
- The repo's `.boards/config.yml` has no strategy key. It sets only `project_name`, `task_prefix`, `statuses`, `default_status`, `labels`, `priorities` and `auto_commit: true`.
- `core/backlog.ts:1113-1187` `loadWorktreeTaskStateEntries` feeds only ID reservation (`occupiedIds`), not resolution.
- The trim removed the cross-branch loader input but kept the setting, the selector and the UI.
- Valid values are `most_recent` and `most_progressed`. The default is `most_progressed`.
- Tests set it only in in-memory config objects: `test/test-utils.ts:303` (`"most_recent"`), `test/core.test.ts:95` and `:317`, `test/mcp-tasks.test.ts:268`, `test/task-identity-index.test.ts:25`, `test/content-store.test.ts:98` and `:865`.
---

created: 2026-10-06 14:06
---
Sub-issue 1 of 1: merged to main at c4ec107 (CF-24 spec) and 4086831 (CF-12 spec). Done still needs: nothing; closing through the gate now.

Done: both specs are revised for a fleet without plans and approved by the human (comments #8 and #9), which proves criterion 1, ticked on 2026-09-29. The card went back to In Progress on 2026-09-30 when a scout for other work bound to it through a stale focus (comment #11 is that scout's handoff; the CF-70 bug, fixed in v0.37.1), so this is the second close.

Definition of Done: 1 is the gate's own run at this close. 2 not applicable: a spec revision, reviewed by the human's approval, no code path. 3 not applicable: no agent body or skill changed. 4 not applicable: the specs ship with the items that build them, not with a plugin version. 5 not applicable: no ported artefact. 6: docs/specs/CF-12.md and docs/specs/CF-24.md are the specs, named in the description and comments.

Not done: nothing on this card.
---
<!-- COMMENTS:END -->
