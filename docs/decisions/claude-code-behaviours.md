# Claude Code behaviours the fleet depends on

Each of these was observed on a live Claude Code run, not read from the docs, and the fleet's hooks, editor pairs and init questions are built on it. Each names the version it was seen on. Re-check one after a Claude Code upgrade before relying on a change to it; `claude/scripts/spike/cf-12.1/` is the re-runnable harness for the first three sections.

## A run the `maxTurns` cap cuts off

Observed on 2.1.283 and 2.1.284, foreground spawns, inside and outside the sandbox.

- It ends in plain prose, never a handoff: 4 of 4 cut-offs.
- `SubagentStop` does not fire for it: 0 of 3 cut-offs outside the sandbox and 0 of 4 inside, against every normal finish firing under the same settings. Background spawns are unmeasured.
- The Agent tool still returns, and its result opens with the runtime's note, verbatim: `NOTE: this agent stopped at its 3-turn limit before finishing. The text below is PARTIAL output; treat it as incomplete. Send the agent a message (SendMessage) to let it continue from where it stopped.` No other field says the cap was hit.
- The cap counts assistant turns, not tool calls. A model that packs six reads into its last turn still runs out.
- An instruction to hand off on the last turn worked on Opus (2 of 2) and failed on Haiku (1 of 1). It is untested on Fable.

So `maxTurns` is a backstop against a hung run, never a working budget, and a body that sets it also tells the agent to hand off before the cap. `board-agent-return.sh` reads the Agent tool's return on `PostToolUse` to catch a run that ended without `SubagentStop` (`claude/coder-fleet/hooks/README.md`, "When a run ends without SubagentStop").

The order the hooks fire in, for one foreground spawn: `SubagentStart`, `SubagentStop`, then the Agent tool's `PostToolUse` about 0.25 s later, all carrying the same `agent_id` and `session_id`. A cut-off fires `SubagentStart` then `PostToolUse`. The runtime waits for every `SubagentStop` hook to finish before the Agent tool returns, so a marker the stop hook writes is always in place before the return hook reads it. The `PostToolUse` payload's `tool_response` carries `agentId`, `agentType` (plugin-prefixed), `status`, `content` (text blocks), `resolvedModel` and usage counters.

## Denying a plugin agent

Observed on 2.1.283 and 2.1.292, under `--plugin-dir`, `--setting-sources project,local` and `--permission-mode dontAsk`.

- `Agent(coder-fleet:<name>)` in `permissions.deny` refuses a spawn by the `coder-fleet:` name with `Agent type 'coder-fleet:<name>' has been denied by permission rule 'Agent(coder-fleet:<name>)' from projectSettings.`
- A rule for the unsuffixed definition does not catch its `-fable` sibling, nor the other way round.
- A plugin agent never resolves by its bare name: `spec-editor-fable` reads `Agent type 'spec-editor-fable' not found` whether or not any rule exists. That is expected and not a sign the rule failed.
- A denied definition leaves the agent list at spawn time, both in the "Available agents" list of that error and in the Agent tool description the model sees, though the init event still lists it. So a preflight that requires every editor to appear as an agent type fails in a project that denied one.
- Not tried: a marketplace install rather than `--plugin-dir`, user settings in play, interactive mode, and a same-named agent under a project's own `.claude/agents/`.

## Models on a subagent

Observed on 2.1.283, on a non-Pro account.

- A `model: fable` subagent runs on Fable 5.1, and the transcript's `message.model` field says so. A fallback to another model shows in that field, so it is never silent.
- A model id that does not exist fails the spawn with `model_not_found`, HTTP 404, as an error tool result.
- `availableModels` set in project settings has no effect; the docs say it is read from managed settings only.
- On Pro, Fable is outside the plan's usage limits and billed to usage credits, and under `-p` Claude Code bills it without asking (Claude Code model-config docs, Anthropic support article 15424964). No Pro account was available, so this is inferred, not observed, and nothing in a run's output tells "billed normally" from "billed to usage credits". The init and kickoff editor questions say so.
- The init event carries no `subscriptionType`, `unavailable_models` or `account` key.

## The plugin loader

Observed on 2.1.283. The loader scans `agents/` recursively and namespaces an agent in a subdirectory as `<plugin>:<subdir>:<name>`. A directory outside `agents/`, such as `claude/agent-pairs/`, is never loaded as agents.

`${CLAUDE_PLUGIN_ROOT}` is substituted inline in agent, skill and command Markdown but is not in the Bash tool's environment (plugins-reference, "Where each variable resolves"). So an instruction names the path literally for the model to run, and a workflow lane finds the plugin by searching the cache.

## A stop typed as the lead

Observed on 2.1.292. After a main-session turn in a session whose `agent` is `coder-fleet:lead`, the runtime's prompt-suggestion side call fires `SubagentStop` with `agent_type` `coder-fleet:lead`, no `SubagentStart`, an `agent_transcript_path` that names no file, and the predicted next prompt as its final message. An exit 2 makes it run another model turn, which writes a handoff from the conversation it forked. A `-p` session makes no prompt suggestion, so print-mode probing never reproduces it; an interactive session does. That is why the `SubagentStop` matcher leaves out `lead` and the stop hook stands down on a side call's shape (`claude/coder-fleet/hooks/README.md`, item 27).

The captured events, home directories shortened:

```json
{"hook_event_name":"SubagentStop","agent_id":"a41757ecf7f9b29ef","agent_type":"coder-fleet:lead","stop_hook_active":false,"agent_transcript_path":"~/.claude/projects/<project>/<session>/subagents/agent-a41757ecf7f9b29ef.jsonl","last_assistant_message":"Now write hi4 to hi4.txt and reply ready"}
{"hook_event_name":"SubagentStop","agent_id":"a41757ecf7f9b29ef","agent_type":"coder-fleet:lead","stop_hook_active":true,"last_assistant_message":"ready\n\n## Done\n- ...\n\n## Not done\n- None\n\n## Unverified\n- None\n\n## Decisions needed\n- None"}
```

## Agent worktrees

With `worktree.baseRef` `"head"`, a type-isolated Agent-tool `coder` spawn is cut at the local HEAD: one was cut at the local HEAD while local main was ten commits ahead of `origin`. A workflow `agent()` call with the same `agentType` gets no worktree at all and starts in the main checkout, which is why `review-round`'s fix lane cuts its own worktree at the pinned head (`docs/limits.md`, "Worktree isolation for a workflow-spawned `coder`").

The harness locks an agent's worktree only while the agent runs, with the pid in the lock reason (`claude agent <id> (pid N start <date>)`), and a finished worktree is unlocked. git refuses to remove a locked worktree without a double force and refuses to prune a locked entry, so a script that removes worktrees must never unlock one: the lock is the only signal that a freshly cut, clean worktree is in use.

## How to observe one of these

Vary one thing per run, and run a negative result ("X does not happen") at least twice before concluding, with a control that shows X happening under the same settings. Read what happened from the runtime's own events (the stream, the hook payloads, `message.model`), never from a model's summary of them. When the raw logs are torn down, keep a list of which log files existed.
