# Codex hooks, as observed

What Codex's hooks do for a custom subagent, observed on codex-cli 0.156.1 with the harness at `codex/scripts/spike/codex-hooks/`, which re-runs the observations on a later release. Every *(verified 0.156.1)* line in `docs/specs/GPTA-1.md` rests on this file.

## What fires, and what it carries

- **SubagentStart** fires for a custom TOML agent. The payload carries `agent_type` (the agent's `name` from its TOML), `agent_id`, `session_id`, `turn_id`, `transcript_path`, `cwd`, `model` and `permission_mode`.
- **SubagentStart's `additionalContext` reaches the subagent.** Returning `{"hookSpecificOutput":{"hookEventName":"SubagentStart","additionalContext":"..."}}` puts the text into the subagent's own input as a developer-role message, verbatim.
- **SubagentStop** fires, carries `last_assistant_message`, and `{"decision":"block","reason":"..."}` (or exit 2 with the reason on stderr) sends the subagent back to work with the reason; the hook then fires again with `stop_hook_active` true. `stop_hook_active` reports whether this turn was itself forced by a block, and reads false again on a later turn the parent starts with `followup_task`. So "already blocked once" state is keyed on `agent_id`, never on `stop_hook_active`.
- **PreToolUse** fires for a shell command (`tool_name` `Bash`), an `apply_patch` edit and an MCP call, each carrying the top-level `agent_type` when the call comes from inside a subagent. MCP tools are named `mcp__<server>__<tool>`. The parent's own `spawn_agent` call (`tool_name` `collaborationspawn_agent`) carries no top-level `agent_type`; the target agent is a field inside `tool_input`.
- **A PreToolUse deny stops an `apply_patch` call**: `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"..."}}` left the file unchanged, and the subagent quoted the refusal. The legacy `{"decision":"block","reason":"..."}` and exit 2 are documented too. A deny on a shell or MCP call is not yet observed.
- **`sandbox_mode = "read-only"` on a custom agent does not stop its writes**: the subagent's thread ran under `workspace-write` and wrote the file. The sandbox is not applied to subagents, so PreToolUse is the only lock.
- **`[features] codex_hooks` is not needed**: `features.hooks` is stable and on by default, and `codex_hooks` is its deprecated alias.

## Trust

A non-managed hook runs only after the human trusts its exact definition, through `/hooks`; until then it is skipped silently, with no message anywhere. Trust is recorded in `config.toml` as one table per hook, `[hooks.state."<absolute path to hooks.json>:<event_snake_case>:0:0"]`, holding `trusted_hash = "sha256:..."`. The last two fields are probably the matcher-group and hook indices; only `:0:0` has been seen.

What `trusted_hash` covers is unknown: no hash of the script bytes, the `hooks.json` bytes, or about thirty canonical forms of the handler entry matched (`codex/scripts/spike/codex-hooks/trust-hash-investigation/`). So an installer cannot yet write trust itself, and whether it should - the installer's author, rather than each human, deciding a hook is safe - is a security decision for the port to make deliberately. Moving a trusted `hooks.json` is expected to need a fresh review, since its absolute path is in the key; that is inferred, not observed. The port's install has a named, one-time trust step on every machine.

## Other details

- `spawn_agent`'s `task_name` must be snake_case (`spike_worker`); the agent's own `name`, and so `agent_type`, may carry hyphens.
- An MCP call under `approval_policy = "never"` was refused with `MCP tool call requires approval, but approval policy is never`; per-tool `mcp_servers.<server>.tools.<tool>.approval_mode` is the documented way through.
- Hook commands run with the session cwd as their working directory.

## Not yet observed

- Whether user-level hooks fire inside a git worktree, and whether project-level ones do (#27133).
- A stricter re-run of the read-only sandbox case with a prompt that rules out the parent writing.
