#!/usr/bin/env bun
// The Stop hook: reads Claude Code's hook JSON on stdin when the main session
// stops, and sends the lead back once when the checkout's focused card still
// has an unticked acceptance criterion and nothing is waiting on the human.
//
// It is the one exception to the rule that nothing at a stop holds the lead
// up (CF-207 criterion 65, overridden for this hook alone by the human on
// 14 Nov 2026, CF-4). It stays narrow: it never sends the lead back while
// Claude Code is already continuing for a stop hook (`stop_hook_active`), so
// one stop costs at most one extra turn, and it lets the stop through, saying
// nothing, when there is no focus, the card is fully ticked, the card has an
// unticked Action for Human or is Blocked or Blocked by Human, the lead's
// last message asked a question, or a background task is still running.
//
// It reads the board through the same reader as the SessionStart hook
// (boardForHook, readFocus, readCard, checklist, openActions), writes nothing
// to the board and moves no column. Its instruction agrees with SessionStart's
// reconcile reminder: finish, or reconcile the board before stopping.
//
// A board whose config.yml sets `sendBackAtStop: false` switches it off.
// Any error reading the focus or the card lets the stop through and is logged
// on stderr; nothing goes to stdout but a send-back.
import { openActions } from "../actions.ts";
import { readCard } from "../cards.ts";
import { checklist } from "../checklists.ts";
import { focusBase, readFocus } from "../focus.ts";
import { boardForHook } from "../hook-board.ts";

interface StopInput {
	cwd?: string;
	session_id?: string;
	stop_hook_active?: boolean;
	last_assistant_message?: string;
	background_tasks?: unknown[];
}

function letThrough(why?: string): never {
	if (why) process.stderr.write(`board: the stop check let the stop through: ${why}\n`);
	process.exit(0);
}

let input: StopInput = {};
try {
	input = JSON.parse(await Bun.stdin.text());
} catch {
	letThrough("its input was not JSON");
}

if (input.stop_hook_active === true) letThrough();
if (Array.isArray(input.background_tasks) && input.background_tasks.length > 0) letThrough();
if (/\?\s*$/m.test(input.last_assistant_message ?? "")) letThrough();

let reason: string | null = null;
try {
	const cwd = focusBase(input.cwd || process.cwd());
	// The no-board message is SessionStart's to give: anything printed here
	// would continue the turn.
	const { board } = boardForHook({ cwd, sessionId: input.session_id });
	if (!board) letThrough();
	if (board.config.sendBackAtStop === false) letThrough();
	const id = readFocus(cwd);
	if (!id) letThrough();
	const { card } = readCard(board, id);
	if (card.column === "Blocked" || card.column === "Blocked by Human") letThrough();
	if (openActions(card).length > 0) letThrough();
	const open = checklist(board, card, "criteria").filter((i) => !i.ticked);
	if (!open.length) letThrough();
	reason =
		`${id} is this checkout's focus and its acceptance criteria ${open.map((i) => `${i.n} "${i.text}"`).join(", ")} are still unticked. ` +
		"Finish them, or reconcile the board before you stop: tick what you finished, comment on what you didn't, and raise a `Blocker:` line for anything only the human can decide.";
} catch (e) {
	letThrough(`could not read the focus or its card: ${(e as Error).message}`);
}

process.stdout.write(`${JSON.stringify({ decision: "block", reason })}\n`);
