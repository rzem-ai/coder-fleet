---
name: glossary
description: The fleet's shared vocabulary - the agreed meaning of Initiative, Project, Milestone, Issue, Sub-issue, Task, Spec, Phase, Round, Session, Lead, Subagent, Teammate, Handoff, Run article, Gate, Board, Next, Human queue, Eval, Intermittent failure and Sprite, and what each maps to on the board, in Claude Code and in the repo. Preloaded into every fleet agent; use these words with these meanings and no others.
---

Canonical copy. `claude/coder-fleet/templates/rules/glossary.md` is generated from this file - edit here, never there.

| Term | Meaning | Maps to |
|---|---|---|
| Initiative | A goal spanning several projects (e.g. "agent platform v5") | none; a shared milestone or a document |
| Project | A bounded body of work in one repo or product area | the repository; the optional `project` field on an item names a part of a monorepo |
| Milestone | A checkpoint inside a project with a date or a deliverable | a milestone file |
| Issue | The unit of tracked work a human cares about. Has a spec or is trivial | a task file (`BD-12`) |
| Sub-issue | A child of an issue, still tracked on the board | a sub-task (`BD-12.1`) |
| Task | The unit of agent execution inside a session. Cheap, many, never on the board | Claude Code task list item (`TaskCreate`) |
| Spec | What and why, human-approved before building. Written by `spec-writer`; its acceptance criteria go on the card | `docs/specs/<issue>.md` |
| Phase | A sequential stage of a workflow; phases don't overlap | Workflow `phase()` |
| Round | One pass of an iterative loop (review round, ralph iteration). Rounds are numbered | `--max-iterations` |
| Session | One Claude Code conversation, from the lead's first turn to its last | Claude Code session |
| Lead | The main session that routes and delegates. A named agent, not a subagent | `agent` in project settings |
| Subagent | A role agent spawned by the lead with fresh context | `Agent` tool |
| Teammate | A subagent running as a full session with a mailbox (Agent Teams) | Agent Teams teammate |
| Handoff | The structured result a subagent returns. Always four headings: Done, Not done, Unverified, Decisions needed. Lines under the last are typed: `Blocker:`, `Propose item:`, `Propose memory:` | Agent tool result, `handoff` skill |
| Run article | The readable account of one run - what was tried, abandoned and why - written only when the spawn prompt asks for one | `docs/runs/<date>-<agent>-<issue>.md`, `run-article` skill |
| Gate | A point the work cannot pass without the human's word or a passing check | the human's order on an item; the `TaskCompleted` hook |
| Board | The tracked items as six columns: to do, next, in progress, blocked, blocked by human, done | the task files under `.boards/` in the repository, grouped by status; `board export` or the web UI |
| Next | The column the human fills with the cards the fleet takes before anything else queued, top first. A card there is the human's order to build it. Only the human moves a card into it | the `Next` status |
| Human queue | The "blocked by human" column. The one thing the human monitors | the `Blocked by human` status |
| Eval | A smoke test for one agent: three to five prompts, a rubric, a baseline score. Deterministic checks run in CI; the model runs are manual | `claude/evals/run.sh`, and `claude/evals/lib/check-all.sh` in `coder-fleet` CI |
| Intermittent failure | A result that differs across runs on the same commit, shown by at least two runs with different outcomes. Until a rerun shows that, a red result is a failure and is reported as one | both runs' commands and exit codes, in the handoff |
| Sprite | A home-lab AI personal assistant with a persistent identity. Out of scope here; the fleet has no Sprites | Agent SDK agent |

Consequences of those definitions that are routinely got wrong:

An issue may spawn many tasks; a task never creates a board item on its own. Tasks live and die inside a session.

Of the typed Decisions needed lines, only `Blocker:` reaches the human queue - it moves the item into "blocked by human" with the blocker text as a comment. `Propose item:` and `Propose memory:` never touch the column; the lead handles both.

Board columns are written by hooks, never by an agent deciding to update something.

Dropped on purpose: "subtask" (say sub-issue or task, whichever you actually mean), "epic" (a project or a milestone covers it), "sprint" (the fleet serves one person; a dated milestone covers time boxes), "story", "plan" (a coder builds from the card and the lead's brief; a big item splits into sub-issues), "flake" and "flaky" (say intermittent failure, and only once a rerun has shown one; a failure nobody reran is a failure).
