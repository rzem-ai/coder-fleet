# CF-12.1 spike harness

Re-runnable harness behind `docs/findings/CF-12.1-claude-code-behaviours.md`, built against `docs/plans/CF-12.1.md`. It answers three Claude Code behaviours CF-12's editor agents depend on: what `model: fable` does on a Pro account, whether a run stopped at `maxTurns` still ends with a valid handoff, and whether `permissions.deny` with `Agent(coder-fleet:<name>)` blocks a plugin-namespaced agent without leaking to its prefix-sharing pair. Re-run it on a later Claude Code CLI version to see whether the answers changed - the findings file's header names the version this run is pinned to.

Everything here runs in a scratch area outside this repository (never under `.claude/worktrees/`), and nothing here ever writes to a real board or a real `~/.claude` - `CODER_FLEET_STATE_DIR` and `BOARD_LOG_FILE` are always pointed into the scratch area's own `state/` directory.

## What each script does

- `lib/guard.sh` - shared safety functions. `resolve_scratch_dir` turns a script's `<scratch-dir>` argument into a checked, physically-resolved absolute path, refusing an empty argument, a relative path, `/`, `$HOME`, and any path under this repository's main checkout root (`.claude/worktrees/` included). `setup_or_refuse_dir` and `require_scratch_shape` decide whether a directory is safe to adopt or safe to delete from, respectively - neither trusts `resolve_scratch_dir`'s identity checks alone to mean "safe".
- `selftest.sh` - the failing-test-first check behind `guard.sh`: it was written before `guard.sh` existed, failed for that reason, and now passes. Free, no network, re-runnable any time.
- `setup.sh <scratch>` - builds the cf12spike throwaway plugin under `<scratch>/plugin` (from `template/plugin/`) and one project directory per row in the plan's run table under `<scratch>/projects/`, each with its own `.claude/settings.json` (hooks and, where relevant, `permissions.deny` or `availableModels`). Refuses a non-empty scratch directory with no marker; safe to re-run against a directory it already built.
- `teardown.sh <scratch>` - removes only the files and directories `setup.sh` is known to create, by name, never `rm -rf` on the scratch root. Reports and leaves anything it does not recognise.
- `bin/capture-stop.sh <scratch> <capture|hook>` - the `SubagentStop` hook every scratch project's settings.json points at. Always writes the raw payload to `<scratch>/logs/stop-<agent_id>-<timestamp>.json` and copies the transcript file the payload names into `<scratch>/logs/`. In `hook` mode it also pipes the payload into the hook path recorded in `<scratch>/hook-under-test`, with `CODER_FLEET_STATE_DIR` and `BOARD_LOG_FILE` pointed into `<scratch>/state`, and passes the hook's exit code and stderr straight through so the live runtime acts on them exactly as it would on the real hook.
- `run.sh <scratch> <run-name|E1|E2|E3|all> [--dry-run]` - runs one named run from the plan's table, or all ten core runs in order. `--dry-run` prints the exact command it would run and does nothing else. Every run's stdout goes to `<scratch>/logs/<run>.jsonl`, stderr to `<run>.stderr`, exit code to `<run>.rc`.
- `replay.sh <scratch> <absolute hook path>` - feeds every captured `stop-*.json` payload into a given hook version offline and prints its exit code and log line. Free and re-runnable after any hook change. With no captured payloads yet, it replays three synthetic payloads instead (a valid handoff, a message with no headings, and an absent message with a transcript ending in a tool call) so the hook's expected behaviour is on record before any live run.
- `summarise.sh <scratch>` - writes `<scratch>/summary.md`: CLI version and date, each run's `subscriptionType` and `unavailable_models` (dropping `account.email` and `account.organization`), each run's loaded agent list, `Agent` tool_use calls and results, each captured subagent transcript's `message.model` values and assistant-turn count, any `max_turns_reached` attachment, and any captured hook exit code. Greps every log for token-shaped strings first and refuses to write anything if it finds one.
- `template/plugin/` - the throwaway `cf12spike` plugin: `probe.md` / `probe-fable.md` (haiku, name-only), `fablecheck.md` (`model: fable`), `badmodel.md` (`model: claude-fable-0-0`, which does not exist), `turncap.md` (`maxTurns: 3`, haiku, no early-handoff instruction) / `turncap-early.md` (`maxTurns: 3`, opus, the early-handoff instruction) / `turncap-early-haiku.md` (added in review round 1: the same instruction as `turncap-early`, but on haiku, to isolate the instruction from the model), `sub/nested.md` (confirms the recursive `agents/` scan for CF-12.2), and `pairs-src/decoy.md` (outside `agents/`, should never load).
- `projects/` - committed project templates, one per row in the plan's run table, each with its own `.claude/settings.json` (a `CAPTURE_CAPTURE_PLACEHOLDER` or `CAPTURE_HOOK_PLACEHOLDER` in the hook command, and, where relevant, `permissions.deny` or `availableModels`) and, for `turns`, the eight small `f1.txt`-`f8.txt` files. `setup.sh` copies this whole directory into `<scratch>/projects/` and substitutes the two placeholders for absolute paths - see the table in the plan for what each project's settings hold.

## Run order and cost

1. `bash selftest.sh` - free, instant.
2. `bash setup.sh <scratch>` - free, local only.
3. `bash run.sh <scratch> all --dry-run` - free, prints the ten core commands, runs nothing.
4. `bash replay.sh <scratch> <hook path>` - free; with no captured payloads yet, runs the three synthetic checks.
5. The paid batch: `bash run.sh <scratch> preflight`, then (if that succeeds) `bash run.sh <scratch> all` - real API/plan spend. Every main session runs on `haiku` with `--max-budget-usd 0.25` per run; the Fable run (`E1a`) gets `1.00`. A few US dollars at API rates; on Max, a trivial share of the weekly cap.
6. `bash summarise.sh <scratch>` - free, reads the logs `run.sh` wrote.
7. `bash teardown.sh <scratch>` when you are done with the scratch area - never against a scratch area whose logs you still want; `summary.md` and any redacted excerpt should be pulled out first, since raw logs are never committed.

## Evidence privacy

Raw logs under `<scratch>` are never committed - only redacted excerpts, pulled from `summary.md`, go into the findings file. `summarise.sh` drops `account.email` and `account.organization` by name if either is present - on this harness's own account and CLI, the init event was observed to carry no `account` key at all (see the findings file, "What the init event actually carries"), but the drop stays in place for any account or CLI version where it does. Separately, `summarise.sh` greps every log for token-shaped strings (`sk-` prefixes of 20+ characters, `Bearer ` headers, JWTs, and AWS/GitHub/Slack key prefixes - narrowed from an earlier, broader heuristic that matched this harness's own long scratch paths as false positives) before writing anything, refusing outright if it finds one.

## Re-running on a new CLI version

Run `claude --version` and compare it against the findings file's header. If it differs, re-run steps 2-6 above against a fresh scratch directory (never reuse one you have already torn down) and update the findings file's header and verdicts from the new evidence, noting what changed and what did not.

## The instruction-file contract

Nothing under this directory names the other instruction-file the fleet avoids naming; if you add a script here, keep it that way.
