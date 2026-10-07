# CF-81: what reports as coder-fleet:lead and fails the handoff gate

Board item: CF-81. Captured 2026-10-07 on Claude Code 2.1.292 (`claude --version`), with `claude/coder-fleet/hooks/board-subagent-stop.sh` from branch `cf-81-lead-typed-stops` loaded through `--plugin-dir`. Home directories are shown as `~` and the scratch directory as `$S`; nothing else is redacted, since the events carry no secrets.

## Verdict

The lead-typed stops are the main session's prompt-suggestion side call. After a main-session turn ends in a session whose `agent` setting is `coder-fleet:lead`, the runtime runs a side call that predicts the human's next prompt, and that call fires `SubagentStop` with `agent_type` `"coder-fleet:lead"`, no `SubagentStart`, and an `agent_transcript_path` naming a file that is never written. Its final message is the predicted prompt, so the gate refused it as a malformed handoff and exited 2, and the exit 2 made the side call run a second model turn, which wrote a handoff from the conversation it had forked. Nothing spawned it: no Agent tool call, no workflow and no untyped spawn was involved.

The card's first hypothesis, untyped workflow lanes reporting the session's type, is not what these stops are. The second, the main session's own side calls, is confirmed for the prompt suggestion. Other side calls (the away summary, for one) may fire the same way; only the prompt suggestion was observed.

## How it was captured

A throwaway project at `$S/cf81proj`, set up the way the coder-fleet repo is: `.claude/settings.json` with `"agent": "coder-fleet:lead"`, the env var `CODER_FLEET_HOOK_DUMP` pointing at `$S/cf81hookdump`, and a separate capture hook on `SubagentStart`, `SubagentStop` and `Stop` that copies its stdin to `$S/cf81dump`. The plugin came from the branch with `--plugin-dir`, so the opt-in dump this item added to the stop hook was the copy that ran.

Four print-mode runs captured nothing but `Stop`:

```
claude -p --plugin-dir <worktree>/claude/coder-fleet "Reply with the single word ready."
claude -p --plugin-dir <worktree>/claude/coder-fleet "Run the shell command ls -la with the Bash tool, then use the Write tool ..."
claude -p --plugin-dir <worktree>/claude/coder-fleet "Use the Bash tool to run exactly: rm -f hi.txt hi2.txt && touch ..."
```

A print-mode session makes no prompt suggestion, which is why. One interactive session, driven by `expect` (`spawn claude --plugin-dir <worktree>/claude/coder-fleet`, accept the trust dialog, send one prompt, wait 90 seconds, `/exit`), captured the `Stop` and then two `SubagentStop` events for one agent id, two seconds apart. No `SubagentStart` was captured, and neither `agent_transcript_path` nor the session's own transcript existed afterwards.

The main turn's `Stop`:

```json
{"session_id":"25b96358-a8ac-4d3b-9eec-571abd21438c","transcript_path":"~/.claude/projects/-private-tmp-...-scratchpad-cf81proj/25b96358-a8ac-4d3b-9eec-571abd21438c.jsonl","cwd":"$S/cf81proj","prompt_id":"8c050b66-569f-49da-96ec-3e2fc3f51021","permission_mode":"auto","agent_type":"coder-fleet:lead","effort":{"level":"medium"},"hook_event_name":"Stop","stop_hook_active":false,"last_assistant_message":"ready","background_tasks":[],"session_crons":[]}
```

The side call's first stop, which the gate refused:

```json
{"session_id":"25b96358-a8ac-4d3b-9eec-571abd21438c","transcript_path":"~/.claude/projects/-private-tmp-...-scratchpad-cf81proj/25b96358-a8ac-4d3b-9eec-571abd21438c.jsonl","cwd":"$S/cf81proj","scratchpad_dir":"/private/tmp/claude-501/-private-tmp-...-scratchpad-cf81proj/25b96358-a8ac-4d3b-9eec-571abd21438c/scratchpad","prompt_id":"8c050b66-569f-49da-96ec-3e2fc3f51021","permission_mode":"auto","agent_id":"a41757ecf7f9b29ef","agent_type":"coder-fleet:lead","effort":{"level":"medium"},"hook_event_name":"SubagentStop","stop_hook_active":false,"agent_transcript_path":"~/.claude/projects/-private-tmp-...-scratchpad-cf81proj/25b96358-a8ac-4d3b-9eec-571abd21438c/subagents/agent-a41757ecf7f9b29ef.jsonl","last_assistant_message":"Now write hi4 to hi4.txt and reply ready","background_tasks":[],"session_crons":[]}
```

Its second stop, after the exit 2, differing only in these fields:

```json
{"agent_id":"a41757ecf7f9b29ef","agent_type":"coder-fleet:lead","stop_hook_active":true,"last_assistant_message":"ready\n\n## Done\n- `ls -la` ran in the project directory. It holds only `.claude/` and `.remember/`.\n- You can now open `hi3.txt` in the project directory and read the word `hi3`.\n\n## Not done\n- None\n\n## Unverified\n- None\n\n## Decisions needed\n- None"}
```

`hooks.log` for the same stops:

```
2026-10-07T01:14:21Z [SubagentStop] handoff from coder-fleet:lead a41757ecf7f9b29ef (bound to no item) is malformed; exit 2 to make it re-emit
2026-10-07T01:14:23Z [SubagentStop] coder-fleet:lead a41757ecf7f9b29ef (bound to no item) succeeded with no blockers; commenting 2 "## Done" item(s), leaving the column alone for TaskCompleted
```

## What the log shows across sessions

On 2026-10-07 at 01:15Z the human's `hooks.log` held 7,438 lead-typed "is malformed" lines. 189 lead-typed stops ended "succeeded with no blockers", which is a re-emit that wrote a handoff and cost a model turn, and 23 raised `Blocker:` lines that no fleet agent wrote. Nine of those were bound to no item; the other 14, from 26 September onwards, are in the older log format, which says "moving to Blocked by human" without saying whether an item was bound, so some may have moved a card. Lead stops arrived about once per main-session turn across every session running the lead, which is why the coder-fleet repo's session b60f21ed saw three in a turn that spawned nothing.

## What changed because of it

The `SubagentStop` matcher no longer names `lead`, and `board-subagent-stop.sh` stands down on `lead` or `coder-fleet:lead` as a backstop. A gated stop re-emits at most three times per agent. Every line the stop hook logs carries the session and the checkout. `CODER_FLEET_HOOK_DUMP` stays in the hook, off by default. `claude/coder-fleet/hooks/README.md` item 27 has the reasoning and the contract cases.
