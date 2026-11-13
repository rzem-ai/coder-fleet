#!/usr/bin/env bun
// The SessionStart hook: reads Claude Code's hook JSON on stdin and, in a repo
// with a board, adds both board reminders to the agent's context. SessionStart
// fires on startup, resume, clear and compact alike, so the reminders come back
// after every compaction.
//
// The reminder to reconcile before stopping is delivered here rather than from
// a Stop hook: any Stop output that reaches the agent, additionalContext
// included, continues the turn instead of letting it end, and this reminder
// must never hold up a stop.
import { boardForHook } from "../hook-board.ts";

const CHECK_FIRST =
	"This repo has a board. Before starting work, check it: take the top card in Next, or the card this checkout is bound to.";
const RECONCILE =
	"Before you stop, reconcile the board: tick what you finished, comment on what you didn't, and raise a `Blocker:` line for anything only the human can decide.";

const raw = await Bun.stdin.text();
let input: { cwd?: string; session_id?: string } = {};
try {
	input = JSON.parse(raw);
} catch {}

const { board, message } = boardForHook({ cwd: input.cwd || process.cwd(), sessionId: input.session_id });
const context = board ? `${CHECK_FIRST}\n${RECONCILE}` : message;
if (context) {
	process.stdout.write(`${JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: context } })}\n`);
}
