#!/usr/bin/env bun
// The web UI's server process, started detached by startWebUI in src/web.ts:
// `bun web-server.ts <board directory> <holder pid>`. It serves the board on
// a free loopback port, records its pid and port in the state file, and once
// a second checks its holders, stopping when none is left.
import { unlinkSync } from "node:fs";
import { boardAt } from "./board.ts";
import { alive, withLock } from "./lock.ts";
import { readWebState, serveWeb, webStatePaths, writeWebState } from "./web.ts";

const CHECK_MS = 1_000;

const [dir, holderArg] = process.argv.slice(2);
const board = boardAt(dir ?? "");
const { state, lock } = webStatePaths(board.config.prefix);
const server = serveWeb(board);
// Written without the lock: the starter holds it while it waits for this.
writeWebState(state, { pid: process.pid, port: server.port ?? 0, holders: [Number(holderArg)] });

// True when the server should stop: every holder has gone, or another server
// has taken over the state file.
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
