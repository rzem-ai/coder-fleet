import { mkdirSync, openSync, closeSync } from "node:fs";
import { join } from "node:path";
import { type Board, noBoardMessage, openBoard } from "./board.ts";
import { type Env, privateStateDir, StateDirRefused } from "./paths.ts";
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
// in the user's private state directory (privateStateDir in src/paths.ts),
// never in the repo or the boards root.
export function boardForHook(opts: { cwd: string; sessionId?: string; env?: Env; stateDir?: string }): HookBoard {
	const env = opts.env ?? process.env;
	const board = openBoard(opts.cwd, env);
	if (board) return { board, message: null };

	const message = `${noBoardMessage(resolveBoard(opts.cwd, env))} The board's hooks do nothing in this session.`;
	let dir = opts.stateDir;
	if (!dir) {
		try {
			dir = join(privateStateDir(env), "no-board");
		} catch (e) {
			// No private place to remember it was said, so it is said every time.
			if (e instanceof StateDirRefused) return { board: null, message };
			throw e;
		}
	}
	mkdirSync(dir, { recursive: true, mode: 0o700 });
	const session = (opts.sessionId || "no-session").replace(/[^A-Za-z0-9._-]/g, "_");
	try {
		closeSync(openSync(join(dir, session), "wx"));
	} catch (e) {
		if ((e as NodeJS.ErrnoException).code === "EEXIST") return { board: null, message: null };
		throw e;
	}
	return { board: null, message };
}
