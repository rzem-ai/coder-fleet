---
name: opencode-port-review-only
description: CF-192.1 settled the OpenCode port's reviewer as review-only, with retired refuter/evaluator refused by RETIRED_AGENTS in scope.ts; break mode waits on the human
metadata:
  type: project
---

The OpenCode port's reviewer carries review mode alone (CF-192.1, reviewed 2026-11-12). Break mode, use mode, the one gate run and the progress log are not carried because OpenCode's ruleset cannot vary by the brief's `Modes:` line, so granting them would give every review an open shell and outside writes. Each gap is a divergence-register row, and break mode is an open human action on the card. Criterion 1's "matches the Claude Code reviewer's modes" is read as "as far as the harness allows", the lead's stated default.

`RETIRED_AGENTS` at the top of `decide()` in `opencode/coder-fleet/lib/scope.ts` refuses every call (reads included) from `refuter` or `evaluator`, because `install-project.sh` never deletes and a stale `refuter.md` would otherwise run with no plugin rule.

**Why:** the lead ruled a security boundary in scope.ts is never widened on a coder's judgement; the human decides break mode.

**How to apply:** do not raise "the port's reviewer lacks break/use mode" as a finding while the card's action is open. The live tests (`rulesets.test.ts`, `live.test.ts`) need the pinned OpenCode binary and run only in CI's check-slow; a local review can't run them, so list them under Unverified. See [[cf-192-reviewer-modes-settled]].
