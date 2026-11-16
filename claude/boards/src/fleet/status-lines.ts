// `boards fleet status-lines [dir]`: what the two lines coder-fleet draws
// under the prompt (hooks/boards-status.ts) need from the board, as one line
// of JSON, so the hooks module asks the board once and reads nothing of its
// files itself. For the repo at `dir`, the session's directory by default:
//
//   board           whether the repo has a board
//   next            the card the board would hand out next (takeNext), or null
//   blockedByHuman  how many cards wait in Blocked by Human
//   focus           the checkout's focus, or null: the card a spawn with no
//                   Board-Item: line is bound to
//   web             the web UI's address while it runs for this board, or null
//
// It never fails for want of a board: a repo without one answers
// board: false, so the lines can say there is nothing to show.
import { existsSync } from "node:fs";
import { openBoard } from "../board.ts";
import { listCards } from "../cards.ts";
import { focusBase, readFocus } from "../focus.ts";
import { alive } from "../lock.ts";
import { takeNext } from "../moves.ts";
import { type Env, privateStateDir } from "../paths.ts";
import { readWebState, webUrl } from "../web.ts";
import { join } from "node:path";

export interface StatusLinesFacts {
	board: boolean;
	next: string | null;
	blockedByHuman: number;
	focus: string | null;
	web: string | null;
}

// The running web UI's address for the board with this prefix, read without
// creating its state directory.
function runningWeb(prefix: string, env: Env): string | null {
	const state = join(privateStateDir(env), "web", `${prefix}.json`);
	if (!existsSync(state)) return null;
	const s = readWebState(state);
	return s && s.error === undefined && s.port > 0 && alive(s.pid) ? webUrl(s.port) : null;
}

export function statusLinesFacts(cwd: string, env: Env = process.env): StatusLinesFacts {
	const focus = readFocus(focusBase(cwd, env), env);
	const board = openBoard(cwd, env);
	if (!board) return { board: false, next: null, blockedByHuman: 0, focus, web: null };
	return {
		board: true,
		next: takeNext(board)?.id ?? null,
		blockedByHuman: listCards(board).filter((f) => f.card.column === "Blocked by Human").length,
		focus,
		web: runningWeb(board.config.prefix, env),
	};
}

export function statusLinesCommand(args: string[]): number {
	if (args.length > 1) {
		process.stderr.write("usage: boards fleet status-lines [dir]\n");
		return 2;
	}
	process.stdout.write(`${JSON.stringify(statusLinesFacts(args[0] ?? process.cwd()))}\n`);
	return 0;
}
