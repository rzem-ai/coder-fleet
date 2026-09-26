# Proving three OpenCode mechanisms nobody had exercised

2026-09-12, `coder`, `opencode-agents-port` Phase 0. A throwaway spike answering four questions about OpenCode's plugin interface with observed output rather than argument.

## What the run was

The port rests on three mechanisms in OpenCode that nobody had ever run: a system-prompt transform that would carry the handoff contract into every agent, a tool hook that would have to work out which agent is running, and throwing from that hook to deny a call. The brief was blunt that a confident inference was a failure of the phase.

All three work. `docs/measurements/phase-0-spike.md` has the pasted evidence. This is what it cost and what Phases 3 and 4 should take from it.

## What was tried and abandoned

**Driving everything through the real model.** It worked for Question 1 - push a sentinel into `output.system`, ask `qwen3-coder-next` for it, get `XYZZY-7F3A-PLUGH` back. Then runs needing a tool call began hanging for minutes with no output. I assumed my plugin was wrong and instrumented it before checking `ps`, which showed five `opencode run` processes from the concurrent Phase 1 stacked against the same LM Studio. A three-token probe returned `Engine protocol predict request returned 500: Context size has been exceeded`, and a plain `say OK` then timed out at 30 seconds. Abandoned: the shared box was not going to be reliable while another phase used it.

**Waiting it out.** Briefly. I messaged the lead and kept retrying, then dropped it - the remaining questions were about OpenCode's plumbing, and there was no reason for a 38GB model to be in the loop.

**A mock OpenAI-compatible endpoint.** What I should have started with. Sixty lines of Bun serving `/v1/models` and an SSE `/v1/chat/completions` that returns a canned `tool_calls` response first and echoes the tool result back second. Runs went from stalling for minutes to finishing in two seconds. It also answered Question 3 better than the real model could: echoing the tool-result content back captured exactly what text reaches the model on a denial, rather than asking a model to quote it and trusting the quote.

Three false starts inside the mock, all mine. `nohup` from a Bash call dies with that call's process group, so the server kept vanishing. I wrote `const cmd = blob...` above `const blob = ...`, which OpenCode surfaced as a bare `Error: Internal Server Error`. And my first `toolDone` test was `msgs.some(m => m.role === "tool")`, which is true immediately on a `--continue` run because replayed history contains tool messages - it silently skipped the tool call I was trying to observe and produced a convincing `probe-ok` from history. Checking the last message's role fixed it.

**Caching the agent lookup by `sessionID`.** The brief asked whether it was safe. I built it. It is not.

## What the constraint turned out to be

Not the hook interface. All three mechanisms are better than the plan assumed: the transform survives the `request.ts:77` rewrite, `.agent` is populated for both primary and task-spawned sessions, `output.args` is fully available so Phase 4's payload inspection is possible, and a thrown `Error.message` reaches the model byte-for-byte with no wrapper.

The real constraint was that reading source is not evidence, and twice it would have led me wrong in opposite directions.

On skills, the source says the glob is `skills/**/SKILL.md` rooted at `~/.claude`, so the fleet's own eight skills under `~/.claude/plugins/marketplaces/rzem/claude-agents/skills/` should not be found. That reasoning is right, and I only trust it because I vendored eight stubs, saw no duplicate warning, then planted a deliberate second `handoff` as a positive control to prove the detector was armed at all. Without it, "no warnings" and "no instrumentation" look identical. The same exercise turned up two discovery roots the brief did not name - `~/.config/opencode/skills` and `~/.opencode/skills`, 12 skills between them - visible only in warnings about other names.

On the cache, the source says `setAgentModel` re-patches `agent` whenever it changes. But separate `opencode run` processes each get a fresh cache, so that proves nothing about a deployment. I started `opencode serve` - one process, one plugin instance, one cache - and drove it twice over `--attach`, switching agent on the second call. The hook reported `agent: "build", cached: true` while `GET /session/{id}` said `agent: spike-alt`. The cache returned the wrong agent for a live call: one agent's rules applied to another agent's command, silently, with enforcement reporting success. The lookup it was optimising costs 0.65ms at p50 over 50 samples.

The surprise was the race. `loadSkills` runs at `concurrency: "unbounded"` and `add` overwrites after logging. I expected to argue this from source and instead watched the same two files on the same machine resolve to different winners across consecutive runs.

The second surprise was cheap and annoying: the transform fires three times for one prompt, one of them the thread-title generator. Its input is exactly `["sessionID", "model"]` - no agent, no flag - so the only way to skip it is matching `You are a title generator.` against `output.system[0]`, a string match against an upstream prompt that will break silently when reworded. The preload tax is also per step, not per session, which changes what Phase 3 measures.

## What to do differently

Start with the mock, as the default harness for Phases 3 and 4 rather than a contingency. Asserting on OpenCode's behaviour does not need a model.

Write the positive control before trusting a negative result. "No warning appeared" is worth nothing until you have made one appear on purpose.

When a run hangs, check `ps` before instrumenting your own code.

For Phase 4: no cache keyed on `sessionID`, and consider reading `subagent_type` off the `task` call, which is visible on the parent one call before the child session exists. For Phase 2: survey four skill roots, and note `OPENCODE_DISABLE_CLAUDE_CODE_SKILLS` suppresses one while `OPENCODE_DISABLE_EXTERNAL_SKILLS` suppresses two - the OpenCode-native roots survive both.

And serialise phases that need a real model. Declare-and-batch was invented for the fleet the port ships; the fleet building it has the same problem and no policy.
