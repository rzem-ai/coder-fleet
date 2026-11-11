---
name: plugin-prose-vs-repo-settings
description: Plugin commands and agent bodies ship to every project; prose that states coder-fleet's own strict check-all gate as universal is wrong for installs, where the TaskCompleted gate is lenient by default
metadata:
  type: project
---

The coder-fleet repo's committed `.claude/settings.json` sets `CODER_FLEET_TEST_GATE=strict` and `CODER_FLEET_TEST_COMMAND` to check-all.sh. An installed project gets the hook defaults instead: lenient, with no test command, so a `[board:<id>]` close runs only the card gate and is near-instant. The card gate (at least one AC, everything ticked, else move to Blocked) runs under both modes.

**Why:** CF-185 round 2 (2026-11-10) added "each close runs the strict gate, the whole suite, which can take several minutes per card" to `commands/triage.md`, which is true only when triage runs in this repo.

**How to apply:** when a diff under `claude/coder-fleet/` (commands, agents, skills) describes what a gate does, check it against `hooks/README.md` "The test gate" defaults, not against this repo's settings. Usually Low. See [[gate-run-quirks]].
