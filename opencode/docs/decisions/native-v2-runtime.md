# Native V2 runtime and configurable models

The human approved a native OpenCode 2 migration on 18 November 2026, with configurable providers and models rather than local-only inference. This supersedes the old port's fixed LM Studio model policy and the decisions that deferred roles because no matching local model existed. Behavioural parity remains the target, not a claim about the current state.

## Runtime boundary

The server plugin uses OpenCode's V2 context, tool and execution events. It runs the OpenCode board as a compiled subprocess through a native JSON lifecycle interface, not fabricated Claude hook JSON. Board parsing, card moves, handoff checks and release gates stay in the board. OpenCode's plugin storage holds per-session progress and retry counts; the board stores immutable child bindings and completion receipts. A receipt suppresses duplicate delivery after a plugin reload. A process crash between a board effect and its receipt remains an at-least-once gap, not exactly-once processing.

Session and parent ids come from OpenCode, never model input. The first child context binds the original Board-Item line, or the checkout focus. A resume keeps that binding. Focus is checkout-wide, so concurrent sessions must use explicit Board-Item lines. The native adapter never clears another session's focus as a side effect of loading a plugin instance.

The compiled parser validates a completed child's handoff before any blocker or card-gate effect. Invalid results request up to three handoff-only corrections; exhaustion reports a failed run to the parent. OpenCode can report the child to its parent before this asynchronous correction, so the lead must still reject malformed reports. Missing binary is visible in the prompt and install output, and disables these mechanisms rather than pretending they ran.

## Configuration and role scope

The payload installs no provider, endpoint, model pin or credential. Native agents.<role>.model overrides are optional; otherwise OpenCode owns selection. No automatic local model swap or model-specific concurrency limit survives. The Paid runs rule still applies.

The copied board now reads the main checkout's `.opencode/coder-fleet.json` directly in TypeScript. Parsing and fallback semantics come from the Claude implementation, but no installed Python shim is required. The roster reader uses the port's actual agent/ layout. The plugin checks disabled roles before a spawn and at the child's context boundary.

V2 discovers AGENTS.md per directory and may fall back to CLAUDE.md where it is absent; a root AGENTS.md does not hide every nested legacy instruction file. Init and kickoff consult the V2 instructions guide rather than applying Claude's shadowing rule or preserving the old port's claim that fallback files are never read. The repository-wide instruction-file check permits only its historical exact legacy-filename lines in commands, so the commands point to the current guide instead of duplicating discovery rules there.

All eleven roles load. Scripter shares coder's command-history checks. Editors have native deny-by-default permission rules and an additional runtime check requiring an Edit-Paths JSON array of absolute paths in the original brief. This is a role guard, not OS containment; lexical path checks do not make symlinked files a sandbox. Spec-writer's write root comes from repository board discovery when a board exists, with docs/specs as the no-board fallback.

## Installation

The installer copies a locally built native binary, or an explicitly supplied CODER_FLEET_BOARDS_BIN, into bin/ with the payload. All binary destinations receive the existing symlink preflight before any copy. No source code in a target project is run as a board fallback. No native release asset is published by this change. The pruning helper is restricted to `.opencode/worktrees/` and no longer sweeps Claude scratch directories; OpenCode's worktree inventory integration is still outstanding.

## State of the migration

| Area | State |
|---|---|
| Provider and model inheritance | Implemented; no endpoint or model installed |
| Eleven role definitions | Implemented and live-load checked; no model quality baseline claimed |
| Native board session and child bindings | Implemented, with resume and duplicate-delivery tests |
| Handoff validation, blocker routing and completion gate | Implemented, with bounded corrections and explicit parent-report race |
| Push release catch-up | Connected to successful shell calls and root-session initialisation |
| Project settings and editor path guards | Implemented and tested |
| Six human commands and compiled-binary install | Implemented; the broader command set remains outstanding |
| Deterministic spec-to-card, review-round and deep-research | Not implemented |
| Automatic builder worktrees and reviewer gate execution | Not implemented |
| Reviewer break/use modes and progress logs | Not implemented |
| Native goal-loop equivalent, drain, triage, ask and sweep | Not implemented |
| TUI fleet status, per-session web leases and stop send-back | Not implemented |
| Board legacy helper and copied-test migration | Incomplete; legacy hook entrypoints are reference compatibility, not native integration |
| Native binary release assets and model smoke evals | Not implemented |

The migration-checklist was read against the changed definitions. Harness-only fields, model aliases, effort tiers, memory and isolation frontmatter are not carried into native V2 definitions. The four body headings, explicit role permissions, skill availability, inherited model policy and structured handoff remain. Live permission tests verify that every definition loads and that new subagents remain deny-by-default. Instruction meaning was reviewed by reading; no phrase-presence test is offered as proof of behaviour.
