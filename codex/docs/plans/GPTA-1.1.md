# GPTA-1.1: Prove Codex subagent hooks fire for a custom agent

Status: awaiting approval.

Spec: `docs/specs/GPTA-1.md`, open question 21 and the Unverified lines behind questions 8, 11 and 16. Parent: GPTA-1.

## Goal

Before GPTA-1 is planned, prove on the installed codex-cli 0.156.1 which of the hook behaviours the port depends on actually happen, and record the answer as evidence rather than as a reading of the docs. The output is a findings file, not port code.

## What the spike must answer

Each is a yes or no with the payload or log line that shows it.

1. Does `SubagentStart` fire when the main session spawns a custom agent defined in a TOML under `.codex/agents/` or `$CODEX_HOME/agents/`, and does its payload carry the agent's name?
2. Does `SubagentStop` fire for that subagent, does it carry `last_assistant_message`, and does returning `decision: "block"` with a reason send the subagent back to work?
3. Does `PreToolUse` fire for a file edit made through `apply_patch`, for a shell command, and for an MCP tool call, and what tool name and `agent_type` does each payload carry? Does `decision: "block"` stop each one?
4. Is `[features] codex_hooks = true` still required on 0.156.1?
5. Does `SubagentStart` accept `additionalContext`, and does that text reach the subagent?
6. Do user-level hooks in `$CODEX_HOME/hooks.json` fire when the session runs inside a git worktree, and do project-level ones (#27133)?
7. With `sandbox_mode = "read-only"` on a custom agent, is a write refused?

## Approach

One phase, `scripter`. Everything runs in the session scratchpad and nothing outside this repository is touched:

- A throwaway git repo in the scratchpad, with a worktree of it for question 6.
- A scratch `CODEX_HOME` in the scratchpad holding the test `config.toml`, `hooks.json` and two custom agents (one ordinary, one read-only). The real `~/.codex` is never written.
- Each hook is a small script that appends its raw JSON payload to a log file and, where the question needs it, returns a block decision the first time only.
- A trivial stub MCP server for question 3's MCP case.
- Codex driven non-interactively with `codex exec` where possible; where a behaviour only shows in the interactive TUI, say so and record it as unverified rather than guessing.

Deliverables, committed on a branch, never on `main`:

- `docs/findings/GPTA-1.1-codex-hooks.md`: one section per question, the verdict, and the exact payload excerpt or log line behind it.
- `scripts/spike/codex-hooks/`: the harness, so the result can be re-run on the next Codex release.

## Decision needed before approval

Authentication. A scratch `CODEX_HOME` has no sign-in. The options are: (a) symlink the real `~/.codex/auth.json` into the scratch home, read-only, never copied into the repo or a log; (b) the human signs in once into the scratch home; (c) run with an API key from the environment. Recommended: (a). It touches a credential file by reference only, and the harness must never print, log or commit it. Because this is a credential path, the review of the spike diff gets the deeper security pass.

## Gate

The findings file is read by the lead and the human. If questions 1, 2 or 3 (file edits) come back no, GPTA-1 is re-scoped before any plan is written, per the spec's question 21.

## Out of scope

Porting any agent, skill or hook. Writing to `~/.codex`. Anything in `coder-fleet`.
