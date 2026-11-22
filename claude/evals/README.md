# Evals

One smoke eval per agent, eleven in total. The glossary defines an eval as three to five prompts, a rubric and a baseline score, with the deterministic checks run in CI and the model runs manual. Every eval here has that shape, and `evals/lib/roster-contract.sh` checks the prompt count rather than leaving this sentence to assert it. **In CI** below says which half runs where, and why.

An eval is not a quality measure. It is a smoke test for the failures that actually matter for one agent - the reviewer editing instead of reporting, the scout returning opinions - plus one check every agent shares, because three hooks parse the handoff format and a body that drifts off it breaks the board rather than just reading badly.

## Layout

```
evals/
  run.sh                    the runner
  README.md                 this file
  lib/handoff-check.sh      the four-heading check, shared by every subagent's eval
  lib/final-message.sh      pulls the final assistant message out of a run
  lib/handoff-parity.sh     proves this gate and the hook are one rule set
  lib/judge-prompt.md       instructions given to the grader
  fixtures/
    sample-app/             the workspace each prompt runs in, copied fresh
    gates-app/              the base tree for the reviewer's gate prompt, which declares its gates
    inputs/                 diffs, handoffs, notes and model lists a prompt points at
    handoff-cases/          handoffs, valid and malformed, for the parity check
    spec-drafts/            a small codebase and four spec drafts for the spec editor's prompts
    tech-docs/              a small cache tool and three tech-writer documents for the tech editor's prompts
  <agent>/
    prompts/01-*.md         three to five prompts, one per file
    rubric.md               why this eval exists, then the criteria
    checks.sh               mechanical gates, where the agent has any
    baseline.json           the recorded score, unset until the first run
  results/<timestamp>/      one directory per run, not committed
```

A directory per agent rather than a file per agent, for three reasons. A prompt goes to `claude -p` verbatim, so it lives in its own file with nothing to strip. The mechanical gates are a script, not prose. And the baseline is written by the runner, so it has to be machine-readable and separate from the rubric a human edits.

## Running

```
evals/run.sh --list                 what exists, and each agent's baseline
evals/run.sh                        all eleven
evals/run.sh reviewer               one agent
evals/run.sh reviewer scout         several
evals/run.sh reviewer --prompt 02   one prompt
evals/run.sh --no-judge             gates only, no grader call
evals/run.sh --dry-run              print the commands, run nothing
```

Each prompt runs in a fresh copy of `fixtures/sample-app` with `fixtures/inputs` mounted at `.eval-inputs/`, so an agent can write freely and whether it did is part of what is measured. The workspace is deleted after scoring unless you pass `--keep-workspace`.

Each subagent under test starts with the skills its frontmatter lists under `skills:`, as a spawned subagent does. `claude -p --agent` runs the agent as the session, and an agent run as the session gets none of its `skills:` (`docs/limits.md`), so the runner hands them over itself: for every listed skill, the line `Base directory for this skill: <path>` and then the skill's body with its frontmatter stripped and the rest verbatim, written to `preloaded-skills.md` beside the prompt's results and passed with `--append-system-prompt-file`. A listed skill that does not exist stops the runner before any call. The lead gets nothing preloaded, because it is the one agent that runs as the session in production too, and its eval runs it as the fleet does. `lib/runner-skills.sh` proves all three with a stub, no model.

Environment, for the things that differ per box or per CLI version:

| Variable | Default | What it is for |
|---|---|---|
| `EVAL_CLAUDE_BIN` | `claude` | The binary to run |
| `EVAL_AGENT_FLAG` | `--agent` | The flag that selects the agent. If your CLI spells it differently, set this rather than editing the runner |
| `EVAL_CLAUDE_ARGS` | `--permission-mode acceptEdits` | Extra arguments on every run. Add `--max-turns` here to cap the lead eval |
| `EVAL_ALLOWED_TOOLS` | `Bash(node --test:*),Bash(node --check:*)` | Permission rules every run is granted, separated by commas. These are the gates the fixtures declare; `claude -p` has nobody to approve a command, so without them a reviewer cannot run the gate it is graded on. Set it empty to grant nothing |
| `EVAL_JUDGE_MODEL` | `sonnet` | The model that grades against the rubric |
| `EVAL_TIMEOUT` | `900` | Per-prompt timeout in seconds, when `timeout(1)` exists |
| `EVAL_OUTPUT_FORMAT` | `auto` | `json`, `text` or `auto`. `auto` is `json` when `jq` is installed, because `json` names the final assistant message in a field of its own. Ignored if `EVAL_CLAUDE_ARGS` already sets `--output-format` |

## How a run is scored

Three layers, and only two of them can fail a run.

**The handoff gate.** `lib/handoff-check.sh` parses the final message the way the `SubagentStop` hook does: the four headings exactly, in order, once each; no other level-2 heading; one top-level list item per line; no blank line between two items in a section; an empty section as exactly `- None`; every Decisions needed line typed `Blocker:` or `Propose item:`; no typed line under any other heading; and nothing after the last item. Every subagent's eval runs it, ten of the eleven, and a failure here is a failure whatever else the agent did. The lead is the session and not a subagent, so it emits no handoff: its column reads `n/a`, and `lead/checks.sh` fails a reply that carries any of the four headings instead.

"the way the hook does" is a claim, so it is tested. `lib/handoff-parity.sh` runs this gate and the production hook, `boards hook subagent-stop` (`claude/boards/src/hooks/subagent-stop.ts`), over every case in `fixtures/handoff-cases/` - valid handoffs, a typed line in each of the three wrong sections, blank lines, missing and out-of-order headings, a stray H2, untyped lines, trailing prose - and fails if the two ever disagree. Run it after touching either side. It needs `jq` and no network.

Note what the gate does not do: it says nothing about prose above `## Done`. Neither does the hook, which parses nothing before the first heading. So an agent explaining what it did with another agent's `Blocker:` line is writing ordinary prose, not a malformed handoff. Only a line that *starts* with a typed prefix, under a heading other than `## Decisions needed`, is a failure.

### What the gate reads

The hook is handed exactly one string, `last_assistant_message`. The gate has to read the same string or CI and production disagree about the same run, so the runner isolates it rather than checking everything `claude -p` printed:

1. The run is made with `--output-format json` when `jq` is available. That form carries the final assistant message in its own `result` field.
2. `lib/final-message.sh` pulls that field out and writes it to `transcript.txt`. Everything the CLI printed stays beside it in `raw-output.txt`, and `final-message.method` records which route was taken.
3. `handoff-check.sh` and the grader both read `transcript.txt`.

Two residual differences remain, and neither is fixable from here:

- **Without `jq`**, the runner falls back to the text output format and `final-message.sh` passes the whole capture through, recording `text-passthrough`. In text mode the CLI prints the final message and nothing else, so this is almost certainly the same string, but the runner cannot prove it. Install `jq` on any box that runs the suite in CI.
- **`result` is the CLI's report of the final message**, not the harness's `last_assistant_message` field itself. They are the same text in every case observed; if a CLI version ever truncates or reformats one and not the other, this is the place it would show up.

**The agent gate.** `<agent>/checks.sh`, where the agent has one. These are the facts a script can settle rather than a judge: the reviewer's workspace is byte-identical to the fixture, the spec-writer wrote nothing outside `specs/`, no value from `.env` reached the coder's answer, the tech-writer used no em dash. A gate is pass or fail. Every gate that reads the list of changed files leaves out the agent's own notes under `.claude/agent-memory/` at the top of the checkout it ran in, since that is its memory and not a change to the workspace, and nothing else: the read-only gates of the reviewer, the scout and the researcher, the spec-writer's `SW-paths`, the scope gates of the spec-editor and the tech-editor, the lead's `LD-gate` and the tech-writer's `TW-dashes`. `lib/memory-notes-gate.sh` proves each with a stub, and `lib/gate-faults-contract.sh` does the same for the coder's stub marker gate, the researcher's injection gate and the commands the runner grants. The grader's list of changed files still shows the notes.

**The rubric.** `<agent>/rubric.md`, graded by a second `claude -p` call against the transcript and the list of files the agent changed. Criteria are identified in brackets and grouped by prompt, with an "All prompts" section that applies to every one. The grader emits `RESULT <id> PASS|FAIL - <evidence>` lines and nothing else, so the runner counts them with `grep` and needs no JSON parser. The rubric produces a percentage, not a verdict.

Reading the summary:

```
AGENT            GATES    RUBRIC   BASELINE   DELTA      VERDICT
reviewer         ok       92%      88         +4         ok
scout            1 FAIL   75%      90         -15        FAIL (1 gate)
```

`GATES` is how many prompts failed a gate. `RUBRIC` is criteria passed over criteria graded, across every prompt in that eval. `VERDICT` is `FAIL` if any gate failed, `REGRESSED` if the rubric dropped more than five points below the baseline, and `ok` otherwise. The runner exits non-zero if any gate failed.

Per-prompt detail is under `results/<timestamp>/<agent>/<prompt>/`: `transcript.txt` is the agent's final message, which is all the board ever sees; `raw-output.txt` is everything the CLI printed and `final-message.method` says how one was got from the other; `handoff.txt` and `checks.txt` are the gates line by line; `judge.txt` is the grader's `RESULT` lines; `preloaded-skills.md` is the skill text a subagent was given; and `changed-files.txt` is every file the agent added, modified or deleted.

## Baselines

Each agent's `baseline.json` holds the score of the last run recorded for it, with the date, the commit and whether its gates passed; one that has never been recorded holds `"score": null`. `evals/run.sh --list` shows what is recorded now, a score per agent or `unset`, so this file does not repeat the figures. That is deliberate: a baseline is the number a representative run produced, and inventing one would mean comparing against a figure nobody measured. A delta of `n/a` means no baseline yet, not a pass.

Record one with a full run of that agent's eval, every prompt and the grader on, after you have read its results and believe them:

```
claude/evals/run.sh reviewer --update-baseline --out /some/dir/outside/the/repo
```

That writes the score, the date and the commit into `claude/evals/reviewer/baseline.json`, whatever `--out` says. Commit the file. Re-record it when an agent body or a skill it preloads changes on purpose, and never edit it by hand to make a run look green.

## In CI

The evals have two halves, and only one of them is in CI.

**The deterministic half runs on every push to `main` and every pull request.** `.github/workflows/checks.yml` runs `evals/lib/check-all.sh` and then `evals/lib/check-slow.sh`: the hook contracts, the roster, the glossary rule being current, the parity between the handoff gate and the production hook, the runner and gate checks that use a stub in place of `claude`, and the workflow logic tests. No model, no network at run time and no real board. A release runs `check-all.sh` again on its tagged commit.

**The model runs are manual, on purpose.** `evals/run.sh` calls `claude -p`, which costs money and needs a key that a public CI run should not carry, so a person runs it, when a change under `claude/coder-fleet/agents/`, `claude/coder-fleet/skills/` or `evals/` calls for it. Put the scores on the pull request as a comment, so the eval run is evidence for the human's decision rather than a gate that lets a change through by itself.

By hand, in this order:

```
scripts/gen-glossary-rule.sh --check
evals/lib/handoff-parity.sh
evals/run.sh
```

The first two come first because they are free. The generator check catches a stale `claude/coder-fleet/templates/rules/glossary.md` before eleven agent runs pay for it, and the parity check catches the handoff gate and the production hook drifting apart, which is worse than either being wrong: it means the evals fail handoffs the fleet accepts, or pass ones it does not. All three exit non-zero on failure.

Two things to know before a full run. The suite makes one agent call per prompt, forty-seven in all, plus a grader call each, so it is not a per-commit job. And the `lead` eval is the expensive one because the lead can spawn subagents; cap it with `EVAL_CLAUDE_ARGS="--max-turns 30"`, or run the other ten when a definition changes and the lead less often.

## Adding or changing an eval

Keep it to three to five prompts. A prompt should provoke one specific failure and be answerable in one turn. Write the rubric criteria as things a grader can see in a transcript - "names the file and the line" rather than "understands the bug" - and put anything a script can settle into `checks.sh` instead, where it is a gate and not a judgement.

Prompts may carry directives on their first lines, stripped before the text reaches the model:

```
#!fixture: sample-app     the workspace to copy in. `none` for an empty one.
#!review: some.diff       review mode: see below.
```

`#!review: <diff>` names a diff under `fixtures/inputs/` and turns the workspace into a review: the fixture is committed as `main/` on branch `main`, a linked worktree `review/` is cut on branch `review`, the diff is applied and committed there as `review: <diff>`, the inputs are mounted at `review/.eval-inputs/`, and the agent starts in `review/`. That is what the reviewer's gate rule needs - the top of a linked worktree, with the declared gates in the main checkout's `AGENTS.md` - and it is what `reviewer/prompts/05-failing-gate.md` runs in. With json output the run also gets `--verbose`, so `raw-output.txt` holds every message and the reviewer's `checks.sh` can see the gate's tool call rather than only the handoff's report of it. The read-only gate leaves `.git` directories out of its manifest in this mode, because `git status` refreshes the index and that is git's bookkeeping rather than a change to the tree. `lib/runner-gate.sh` proves the workspace with a stub, no model: a linked worktree, the head committed, and the `test` gate failing on the head and passing on the base.

Rubric headings must match the prompt filename exactly - a prompt at `prompts/02-just-fix-it.md` is graded by the criteria under `## Prompt 02-just-fix-it` - because that is how the runner tells the grader which criteria apply.
