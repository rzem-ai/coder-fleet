---
name: cf-205-release-close
description: CF-205 round 1 - release-tag close and session-start merged listing; DoD "tagged and pushed" vs gate-at-push tension, default Shipping step 5 tags a merge commit
metadata:
  type: project
---

CF-205 (round 1, head dde0c9dc, 2026-11-13) added `board-release-close.sh` (PostToolUse Bash: tag push closes fully ticked cards the release subject's trailing `[ids]` names, through `lib/gates.sh`) and `board-merged-cards.sh` (SessionStart: lists fully ticked In Progress cards whose `ready to merge in PR #<n>` PRs merged). Round 1 approved with follow-ups; gates green.

Open tensions routed as follow-ups, not blockers: (1) this repo's DoD item 4 reads "the release is tagged and pushed", but the hook needs every DoD item ticked at the moment the tag push runs, so lead-procedures tells the lead to tick before the tag goes; (2) lead-procedures Shipping step 5 tags the merge commit, whose subject carries no `vX.Y.Z: ... [ids]`, so in other projects the tag close never fires and only the session-start listing helps. The coder proposed (2) and the 8-minute in-hook suite run; the lead did not file them.

**Why:** a later round or a follow-up card will revisit these; do not re-raise them as new.

**How to apply:** on a CF-205 fix round or a follow-up touching release close, check whether either tension was decided before flagging it. The release-close contract stubs the board (`<id>  <status>  <title>` matches the real `task list --plain`) and gh; `CODER_FLEET_TEST_*` sit at `env` level in `.claude/settings.json`, so they reach every hook, not just TaskCompleted.
