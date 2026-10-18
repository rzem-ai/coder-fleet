---
name: glossary
description: The fleet's shared vocabulary - the agreed meaning of Initiative, Project, Milestone, Issue, Sub-issue, Task, Spec, Phase, Round, Session, Lead, Subagent, Teammate, Handoff, Run article, Gate, Board, Next, Human queue, Eval, Intermittent failure and Sprite, and what each maps to on OpenCode and in the repo. Preloaded into every fleet agent; use these words with these meanings and no others.
---

Vendored copy. The canonical file is `claude/coder-fleet/skills/glossary/SKILL.md`. Terms and meanings are verbatim and must stay that way, with one deliberate exception recorded in `opencode/docs/divergence-register.md`: Memory, because this port wires no memory of its own and leaves it to the harness. The Maps to column is OpenCode's, because the canonical one names Claude Code mechanisms and a copy that kept them would be wrong in every agent at once.

| Term | Meaning | Maps to |
|---|---|---|
| Initiative | A goal spanning several projects (e.g. "agent platform v5") | none; a shared milestone or a document |
| Project | A bounded body of work in one repo or product area | the repository |
| Milestone | A checkpoint inside a project with a date or a deliverable | none on this port; the board is deferred |
| Issue | The unit of tracked work a human cares about. Has a spec or is trivial | the item the human names to the lead; no task file, since the board is deferred |
| Sub-issue | A child of an issue, still tracked on the board | none on this port; the lead names each part to the human |
| Task | The unit of agent execution inside a session. Cheap, many, never on the board | `todowrite` list item |
| Spec | What and why, human-approved before building. Written by `spec-writer`; its acceptance criteria go on the card | `docs/specs/<issue>.md` |
| Contract | The evaluator's checks for an item, one per acceptance criterion - the user's steps and what passes - agreed before building. Verify mode grades against it and nothing else | a card comment whose first line is `Contract: <n> checks` |
| Phase | A sequential stage of a workflow; phases don't overlap | No counterpart in the runtime - OpenCode has no workflow engine, so the lead drives each stage by hand |
| Round | One pass of an iterative loop (review round, ralph iteration). Rounds are numbered | No counterpart on OpenCode. Rounds are numbered by the lead, not by a flag |
| Session | One Claude Code conversation, from the lead's first turn to its last | OpenCode session |
| Lead | The main session that routes and delegates. A named agent, not a subagent | `default_agent: "lead"` in `opencode.json`, `mode: primary` in `.opencode/agent/lead.md` |
| Subagent | A role agent spawned by the lead with fresh context | `task` tool |
| Teammate | A subagent running as a full session with a mailbox (Agent Teams) | No counterpart on OpenCode. `subagent_depth` is 1 and a subagent has no mailbox |
| Handoff | The structured result a subagent returns. Always four headings: Done, Not done, Unverified, Decisions needed. Lines under the last are typed: `Blocker:`, `Propose item:` | `task` tool result, `handoff` skill |
| Run article | The readable account of one run - what was tried, abandoned and why - written only when the spawn prompt asks for one, and kept locally, never committed | `docs/runs/<date>-<agent>-<issue>.md` in the main checkout, which git ignores; `run-article` skill |
| Memory | Whatever the harness keeps for an agent's later runs. The fleet wires no memory of its own | none in this port |
| Gate | A point the work cannot pass without the human's word or a passing check | the human's order on an item. No hook counterpart - OpenCode has no lifecycle events, so a gate holds only if the agent stops at it |
| Board | The tracked items as six columns: to do, next, in progress, blocked, blocked by human, done | Deferred on this port: nothing here reads or writes it |
| Next | The column the human fills with the cards the fleet takes before anything else queued, top first. A card there is the human's order to build it. Only the human moves a card into it | Deferred with the board |
| Human queue | The "blocked by human" column. The one thing the human monitors | Deferred with the board. A `Blocker:` line reaches the human because the lead puts it in front of them |
| Eval | A smoke test for one agent: three to five prompts, a rubric, a baseline score. Deterministic checks run in CI; the model runs are manual | No model evals on this port yet (deferred); `opencode/test/run.sh` is the deterministic half, in `coder-fleet` CI |
| Intermittent failure | A result that differs across runs on the same commit, shown by at least two runs with different outcomes. Until a rerun shows that, a red result is a failure and is reported as one | both runs' commands and exit codes, in the handoff |
| Sprite | A home-lab AI personal assistant with a persistent identity. Out of scope here; the fleet has no Sprites | Agent SDK agent |

Consequences of those definitions that are routinely got wrong:

An issue may spawn many tasks; a task never creates a board item on its own. Tasks live and die inside a session.

Of the typed Decisions needed lines, only `Blocker:` reaches the human queue - it moves the item into "blocked by human" with the blocker text as a comment. `Propose item:` never touches the column; the lead handles it.

Board columns are written by hooks, never by an agent deciding to update something. The board is deferred on this port, so nothing here moves a column at all.

Dropped on purpose: "subtask" (say sub-issue or task, whichever you actually mean), "epic" (a project or a milestone covers it), "sprint" (the fleet serves one person; a dated milestone covers time boxes), "story", "plan" (a coder builds from the card and the lead's brief; a big item splits into sub-issues), "flake" and "flaky" (say intermittent failure, and only once a rerun has shown one; a failure nobody reran is a failure).
