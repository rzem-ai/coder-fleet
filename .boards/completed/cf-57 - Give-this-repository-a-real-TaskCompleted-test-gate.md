---
id: CF-57
title: Give this repository a real TaskCompleted test gate
status: Done
assignee: []
created_date: '2026-09-28 09:17'
updated_date: '2026-09-28 13:39'
labels: []
dependencies: []
priority: Medium
ordinal: 84000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found 2026-09-28 in the CF-20 release: all fifteen items moved to Done through TaskCompleted were moved ungated, because this repository sets no CODER_FLEET_TEST_COMMAND and no .claude/test-status, and the lenient default passes (hooks.log: "no test gate configured ... moving to Done ungated"). The route works; the gate it was meant to carry is off here. check-all.sh is the natural command, but it takes about 200 seconds (CF-56) against the hook's 600-second timeout. Decide the command and the strict or lenient setting, then set it. CF-24's checklist gate sits on the same path.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 This repository's settings name a CODER_FLEET_TEST_COMMAND (or a test-status marker) that TaskCompleted runs, and a failing run moves the item to Blocked, proven live once
- [ ] #2 The hooks README and board-conventions say what an unconfigured gate does
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: lead
created: 2026-09-28 12:14
---
Decided by the human 2026-09-28: CODER_FLEET_TEST_COMMAND runs claude/evals/lib/check-all.sh with a 480s timeout, and CODER_FLEET_TEST_GATE is strict. This repo's .claude/settings.json and .claude/rules/glossary.md get committed, and .claude/.cc-writes/ gitignored. Phase 1 of 1 starting on cf-57-test-gate.
---

author: lead
created: 2026-09-28 13:35
---
History, recorded after the fact on 2026-09-28, because no hook saw this work: CF-57 was built from 22:14 to 22:25 by the lead in its own worktree, while the coder-fleet plugin was enabled but not yet loaded in the session, so no SubagentStart or SubagentStop fired and the card stayed in To Do. The work: the task-tools contract gained seven checks, red first (e338b08). This repository's .claude/settings.json and .claude/rules/glossary.md were committed with CODER_FLEET_TEST_COMMAND running check-all.sh, a 480-second timeout and a strict gate (68a3c0c). The review's must-fix was that the gate's inherited env made the hook contract fail and would have refused every close; it was fixed by unsetting the CODER_FLEET_TEST_* variables, reproduced red with the repository env exported and green after (ab5fd5a). Fail path proven live in a throwaway repository: a failing command under a strict gate moved the card to Blocked with the exit code. Merged as #33, tagged v0.27.12. The pass path is proven by this card's own close through the gate.
---
<!-- COMMENTS:END -->
