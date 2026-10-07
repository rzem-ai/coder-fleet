// Where a board commit that did not happen is written down (CF-21).
//
// The binary runs under two parents. A hook calls it through `board_cli`,
// which keeps its stderr only when it exits non-zero, and a write whose commit
// fails still exits 0, because the file write stood. The MCP server's stderr
// goes to the client's own MCP log, which nobody reads. So neither path's
// console.error ever reached the human, and on 2026-09-27 a stale index.lock
// left hours of writes uncommitted without a word in hooks.log. The line goes
// straight into that file instead, the one the hook library writes and the
// README sends the human to, in the library's own format.
import { appendFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/** The hook library's `BOARD_LOG_FILE`, resolved with the same defaults it uses. */
export function boardLogPath(): string {
	const explicit = process.env.BOARD_LOG_FILE;
	if (explicit) return explicit;
	const state =
		process.env.CODER_FLEET_STATE_DIR ||
		join(process.env.XDG_STATE_HOME || join(homedir(), ".local", "state"), "coder-fleet");
	return join(state, "log", "hooks.log");
}

/**
 * `skipped` is a commit something asked not to make: auto_commit off,
 * CODER_FLEET_BOARD_NO_COMMIT, an ignored .boards, no repository. `failed` is
 * one git refused. Both leave the write on disk and uncommitted, and the line
 * says so. Logging never throws: a board write must not fail for want of a log.
 */
export function logBoardCommit(
	outcome: "skipped" | "failed",
	action: string,
	by: string | undefined,
	reason: string,
): void {
	const stamp = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
	const writer = by ? ` (writer ${by})` : "";
	const line = `${stamp} [board] commit ${outcome}${writer} for "${action}": ${reason.replace(/\s+/g, " ").trim()}. The write is on disk, uncommitted.\n`;
	try {
		const file = boardLogPath();
		mkdirSync(dirname(file), { recursive: true });
		appendFileSync(file, line);
	} catch {
		// Nowhere to write it. A failure is on stderr as well; a skip is lost.
	}
}
