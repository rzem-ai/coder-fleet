---
name: editors-and-gate
description: Since CF-206 (2026-11-13) both editors always run; the challenge gate reads disabledAgents through hooks/lib/fleet-config.sh, never an AGENTS.md line, and cannot see a permission-rule deny
metadata:
  type: project
---

Since CF-206 there is no `Spec editor:` / `Tech editor:` line and no `editor-models.py`. `challenge-gate.py run` shells out to `hooks/lib/fleet-config.sh` (the spawn hook's reader) to ask whether `spec-editor` is under `disabledAgents`; `check` stays git-free and takes `--spec-editor-disabled` instead. Reasons left: resolved, closed-marker, disabled, no-spec, open, no-section, ambiguous.

**Why:** the human said the editors should be "just like all the other agents, no option". A second parser of coder-fleet.json would drift from the hook on the main-checkout and core-agent edge cases.

**How to apply:** a change to how agents are disabled now reaches the gate too; run challenge-gate-contract.sh with it. Open as of 2026-11-13: an old `Agent(coder-fleet:spec-editor)` deny rule stops the editor but the gate cannot see it and refuses every spec (Blocker on CF-206); check the card for the human's answer before touching the gate. When changing a test helper's parameter meaning, grep every caller: a leftover truthy `'opus'` silently meant "disabled". See [[phrase-pinned-prose]].
