import { mkdirSync, openSync, closeSync } from "node:fs";
import { join } from "node:path";
import { type Board, noBoardMessage, openBoard } from "./board.ts";
import { type Env, stateRoot } from "./paths.ts";
import { resolveBoard } from "./resolve.ts";

export interface HookBoard {
	board: Board | null;
	// Set only when there is no board and this session has not been told yet.
	message: string | null;
}

// Every board hook starts here. With a board, it gets the board. Without one
// (no git repository, or a repo nobody has made a board for, as in a Claude
// Code web session whose ~/.config/boards is empty) the hook does nothing,
// and the first call in a session carries one message saying so; every later
// call in that session carries none. The once-per-session marker is a file
// under the system temporary directory, never in the repo or the boards root.
export function boardForHook(opts: { cwd: string; sessionId?: string; env?: Env; stateDir?: string }): HookBoard {
	const env = opts.env ?? process.env;
	const board = openBoard(opts.cwd, env);
	if (board) return { board, message: null };

	const dir = opts.stateDir ?? join(stateRoot(env), "no-board");
	mkdirSync(dir, { recursive: true });
	const session = (opts.sessionId || "no-session").replace(/[^A-Za-z0-9._-]/g, "_");
	try {
		closeSync(openSync(join(dir, session), "wx"));
	} catch (e) {
		if ((e as NodeJS.ErrnoException).code === "EEXIST") return { board: null, message: null };
		throw e;
	}
	const why = noBoardMessage(resolveBoard(opts.cwd, env));
	return { board: null, message: `${why} The board's hooks do nothing in this session.` };
}
