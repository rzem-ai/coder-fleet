---
name: subagent-brief-on-disk
description: No hook event carries a subagent's spawn prompt; it is line 1 of <session transcript minus .jsonl>/subagents/agent-<id>.jsonl, read off 2.1.322 on 2026-11-11
metadata:
  type: reference
---

Read off Claude Code 2.1.322's bundle and a live transcript on 2026-11-11 (CF-192). Re-check on a newer version before building on it.

- `SubagentStart` sends only the common fields plus `agent_id` and `agent_type`; `SubagentStop` adds `agent_transcript_path`. Every event's `transcript_path` is the session's own transcript, never the subagent's.
- The subagent's transcript is `<transcript_path without .jsonl>/subagents/agent-<agent_id>.jsonl`, or under `subagents/workflows/wf_<run>/` for a workflow lane, with a `.meta.json` beside it naming `agentType`. Its first `type: "user"` line is the spawn prompt.
- Nothing correlates a `PreToolUse` on the Agent tool with the agent id the spawn will get, so a record keyed by id cannot be written there.
- `lib/reviewer-modes.sh` is the working reader; reuse it rather than writing another.

Related: [[memory-resolution-facts]]
