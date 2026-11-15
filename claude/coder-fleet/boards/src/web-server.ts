// The web UI's server process, the CLI's hidden `web-server` subcommand,
// started detached by startWebUI in src/web.ts with the board's directory and
// the holder's pid. It serves the board on the address and port its
// config.yml names (127.0.0.1 and a free port unless set), records its pid,
// port and address in the state file, and once a second checks its holders,
// stopping when none is left. One that cannot listen records why in the state
// file instead, for the starter to report, and exits. It never returns: the
// process exits when the server stops.
import { unlinkSync } from "node:fs";
import { boardAt } from "./board.ts";
import { webConfig } from "./config.ts";
import { alive, withLock } from "./lock.ts";
import { DIST, readWebState, serveWeb, webStatePaths, writeWebState } from "./web.ts";

const CHECK_MS = 1_000;

export function webServer(args: string[]): Promise<never> {
	const [dir, holderArg] = args;
	const board = boardAt(dir ?? "");
	const { state, lock } = webStatePaths(board.config.prefix);
	const holders = [Number(holderArg)];
	const { server, want } = listen();
	// Written without the lock: the starter holds it while it waits for this.
	writeWebState(state, { pid: process.pid, port: server.port ?? 0, holders, listen: want.listen, asked: want.port });

	// The server on the address config.yml names, or, when it cannot listen
	// there, why not in the state file and an exit.
	function listen(): { server: ReturnType<typeof serveWeb>; want: ReturnType<typeof webConfig> } {
		let want: ReturnType<typeof webConfig> | undefined;
		try {
			want = webConfig(board.config, board.paths.config);
			return { server: serveWeb(board, want.port, DIST, want.listen), want };
		} catch (e) {
			const error =
				want && (e as NodeJS.ErrnoException).code === "EADDRINUSE"
					? `Port ${want.port} is already in use on this machine, so the board's web UI cannot listen on ${want.listen}:${want.port}. Free it, or change port: in ${board.paths.config}.`
					: `The board's web UI could not start: ${(e as Error).message}`;
			writeWebState(state, { pid: process.pid, port: 0, holders, error });
			process.exit(1);
		}
	}

	// True when the server should stop: every holder has gone, or another
	// server has taken over the state file.
	function check(): boolean {
		const s = readWebState(state);
		if (!s || s.pid !== process.pid) return true;
		const holders = s.holders.filter(alive);
		if (!holders.length) {
			unlinkSync(state);
			return true;
		}
		if (holders.length !== s.holders.length) writeWebState(state, { ...s, holders });
		return false;
	}

	setInterval(() => {
		let done = false;
		try {
			done = withLock(lock, `The web UI of ${board.config.prefix}`, undefined, check);
		} catch {
			// The lock was busy past its wait; the next tick looks again.
		}
		if (done) {
			server.stop(true);
			process.exit(0);
		}
	}, CHECK_MS);
	return new Promise<never>(() => {});
}
