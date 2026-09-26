---
name: glossary
description: The fleet's shared vocabulary - the agreed meaning of Initiative, Project, Milestone, Issue, Sub-issue, Task, Spec, Plan, Phase, Round, Session, Lead, Subagent, Teammate, Handoff, Run article, Gate, Board, Human queue, Eval and Sprite, and what each maps to in Notion, OpenCode and the repo. Preloaded into every fleet agent; use these words with these meanings and no others.
---

Vendored copy. The canonical file is `claude/coder-fleet/skills/glossary/SKILL.md`, which this deliberately diverges from in the Maps to column only - the generator emits Claude Code mechanisms, and a copy that kept them would be wrong in every agent at once. Terms and meanings are verbatim and must stay that way. See `opencode/docs/divergence-register.md`.

| Term | Meaning | Maps to |
|---|---|---|
| Initiative | A goal spanning several projects (e.g. "agent platform v5") | Select field on the Projects database |
| Project | A bounded body of work in one repo or product area | Row in the Projects database |
| Milestone | A checkpoint inside a project with a date or a deliverable | Field on a Tasks row |
| Issue | The unit of tracked work a human cares about. Has a spec or is trivial | Row in the Tasks database |
| Sub-issue | A child of an issue, still tracked on the board | Self-relation on the Tasks database |
| Task | The unit of agent execution inside a session. Cheap, many, never on the board | `todowrite` list item |
| Spec | What and why, human-approved before planning. Written by `spec-writer` | `docs/specs/<issue>.md` |
| Plan | How, in phases, produced from a spec. Written by the lead, approved by the human | `docs/plans/<issue>.md` |
| Phase | A sequential stage of a plan or workflow; phases don't overlap | A section of `docs/plans/<issue>.md`. No counterpart in the runtime - OpenCode has no workflow engine, so nothing executes a phase |
| Round | One pass of an iterative loop (review round, ralph iteration). Rounds are numbered | No counterpart on OpenCode. Rounds are numbered by the lead, not by a flag |
| Session | One OpenCode conversation, from the lead's first turn to its last | OpenCode session |
| Lead | The main session that plans and delegates. A named agent, not a subagent | `mode: primary` in `.opencode/agent/lead.md` |
| Subagent | A role agent spawned by the lead with fresh context | `task` tool |
| Teammate | A subagent running as a full session with a mailbox (Agent Teams) | No counterpart on OpenCode. `subagent_depth` is 1 and a subagent has no mailbox |
| Handoff | The structured result a subagent returns. Always four headings: Done, Not done, Unverified, Decisions needed. Lines under the last are typed: `Blocker:`, `Propose item:`, `Propose memory:` | `task` tool result, `handoff` skill |
| Run article | The readable account of one run - what was tried, abandoned and why - written only when the spawn prompt asks for one | `docs/runs/<date>-<agent>-<issue>.md`, `run-article` skill |
| Gate | A point where a human must approve before the next phase | Plan approval. No hook counterpart - OpenCode has no lifecycle events, so a gate holds only if the agent stops at it |
| Board | The Tasks database as five columns: to do, doing, blocked, blocked by human, done | Notion board view. Deferred in v1, so nothing here reads or writes it |
| Human queue | The "blocked by human" column. The one thing the human monitors | Notion board column. Deferred in v1 |
| Eval | A smoke test for one agent: three to five prompts, a rubric, a baseline score. Run in CI on every definition change | No counterpart on OpenCode. The evals harness is deferred |
| Sprite | A home-lab AI personal assistant with a persistent identity. Out of scope here; the fleet has no Sprites | Agent SDK agent |

The first five mappings are Notion's schema rather than a mechanism this port drives. They say where the vocabulary's terms live in the human's world, and they stay true whether or not anything here reaches them: Alex's Projects and Tasks databases exist, an Issue really is a row on one. What is deferred in v1 is the integration, so nothing in this port files a row, moves a column or reads the queue, and no agent should reason as though it can.

Consequences of those definitions that are routinely got wrong:

An issue may spawn many tasks; a task never creates a board item on its own. Tasks live and die inside a session.

Of the typed Decisions needed lines, only `Blocker:` reaches the human queue - it moves the item into "blocked by human" with the blocker text as a comment. `Propose item:` and `Propose memory:` never touch the column; the lead handles both.

Board columns are written by hooks, never by an agent deciding to update something.

Dropped on purpose: "subtask" (say sub-issue or task, whichever you actually mean), "epic" (a project or a milestone covers it), "sprint" (the fleet serves one person; a dated milestone covers time boxes), "story".
