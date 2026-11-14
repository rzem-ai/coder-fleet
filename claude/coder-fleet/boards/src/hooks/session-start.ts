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
//
// It also clears the checkout's focus on a new, cleared or resumed session,
// and keeps it on a compaction (focusOnSessionStart in src/hook-moves.ts).
import { boardForHook } from "../hook-board.ts";
import { focusOnSessionStart } from "../hook-moves.ts";
import { StateDirRefused } from "../paths.ts";
import { releaseCatchUp, restartVanishedRuns } from "../releases.ts";

const CHECK_FIRST =
	"This repo has a board. Before starting work, check it: take the top card in Next, or the card this checkout is bound to.";
const RECONCILE =
	"Before you stop, reconcile the board: tick what you finished, comment on what you didn't, and raise a `Blocker:` line for anything only the human can decide.";

// Any unexpected error ends it with nothing printed; it never fails a session.
try {
	const raw = await Bun.stdin.text();
	let input: { cwd?: string; session_id?: string; source?: string } = {};
	try {
		input = JSON.parse(raw);
	} catch {}

	const cwd = input.cwd || process.cwd();
	// A refused state directory is named here, once per session start, and
	// every other hook keeps quiet about it.
	let focusLine: string | null = null;
	try {
		focusLine = focusOnSessionStart(cwd, input.source);
	} catch (e) {
		// Any other failure to clear (EACCES, EROFS) is logged and the
		// reminders below still go out.
		if (e instanceof StateDirRefused) focusLine = e.message;
		else process.stderr.write(`board: could not clear the focus: ${(e as Error).message}\n`);
	}
	const { board, message } = boardForHook({ cwd, sessionId: input.session_id });
	// The test gate's catch-up, on every start but a compaction: a release run
	// whose process vanished starts again, and a release tag pushed outside any
	// session starts its gate now (src/releases.ts).
	const releaseLines: string[] = [];
	if (board && input.source !== "compact") {
		try {
			releaseLines.push(...restartVanishedRuns(board, process.env, input.session_id), ...releaseCatchUp(board, cwd, process.env, input.session_id, "on-base"));
		} catch (e) {
			process.stderr.write(`board: the release catch-up failed: ${(e as Error).message}\n`);
		}
	}
	const context = [board ? `${CHECK_FIRST}\n${RECONCILE}` : message, focusLine, ...releaseLines].filter(Boolean).join("\n");
	if (context) {
		process.stdout.write(`${JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: context } })}\n`);
	}
} catch {}
