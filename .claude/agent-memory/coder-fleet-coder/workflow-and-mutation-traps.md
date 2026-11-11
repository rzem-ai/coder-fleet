---
name: workflow-and-mutation-traps
description: review-round.js has hundreds of top-level function declarations, so a reused name silently shadows; piping a mutation script into head kills it mid-mutant
metadata:
  type: feedback
---

A workflow under `claude/coder-fleet/workflows/` is one function body of hoisted declarations, so a new `function normalisePath` in review-round.js silently lost to an existing one 300 lines down and the tests failed for no visible reason. Grep the file for a name before adding one.

**Why:** cost a debugging round on CF-183.2 (2026-11-08); the matcher worked when lifted out and failed inside the workflow.

**How to apply:** `grep -n 'function <name>'` the workflow first. And never pipe a mutate-and-restore script into `head`: SIGPIPE killed it with a mutant still applied. Write its output to a file and read that, keep a backup copy of the file under mutation, and `cmp` it afterwards.

review-round's verdict lane carries a schema, so the reviewer's handoff never reaches the script: anything the workflow reads from the reviewer (its gate lines, CF-193.4) must be a schema field, and workflow-logic.mjs's `reviewDefaults` fills it for stubs that omit it. A fix the gate accepts must touch a file a round-one finding names, so a fixture that changes other files stops as "unverified fix". And a fixture path that two rules both catch (`tests/fixtures/x.md`) hides a mutant of either: run the mutant, do not assume the row pins it.

Also: a workflow runs no command itself, so "deterministic git output" in a workflow means a lane told to run a fixed command and return its raw output, matched again in JS.

Related: [[memory-resolution-facts]], [[worktree-guard-traps]]
