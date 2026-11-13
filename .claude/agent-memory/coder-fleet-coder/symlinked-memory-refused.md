---
name: symlinked-memory-refused
description: Claude Code 2.1.323 refuses agent memory whose folder is a link - index not loaded, memory read-only; prompt_snapshot in the subagent transcript shows what the harness said
metadata:
  type: reference
---

Measured 2026-11-14 on Claude Code 2.1.323 (CF-207.1) with `claude/evals/memory-symlink/run.sh`: when `.claude/agent-memory` is a symlink out of the checkout, a `memory: project` subagent gets "Your MEMORY.md was not loaded: it or its folder is a link or a special file, or could not be verified to be inside this working copy" and "This memory is read-only this session". Same in a linked worktree.

- The subagent's system prompt as sent is in its transcript, `~/.claude/projects/<slug>/<session>/subagents/agent-<id>.jsonl`, as an `attachment` of type `prompt_snapshot` (`systemPrompt` list). Read it before spending on another paid probe.
- In `claude -p` probes, haiku spawns subagents async unless the prompt says `run_in_background false`; the async result ends the session with nothing to check.
- Paid probes need the Bash sandbox off (network, writes to ~/.claude).

**How to apply:** any design keeping memory outside the working copy via links fails on this version; rerun the script on newer versions before assuming otherwise.

Related: [[memory-resolution-facts]]
