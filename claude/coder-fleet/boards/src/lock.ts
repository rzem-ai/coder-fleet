import { closeSync, linkSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync, writeSync } from "node:fs";
import { basename, dirname, join } from "node:path";

// A lock is one file under the board's locks/ directory, created exclusively
// (wx), holding its holder's pid, the time it was taken and, where known, the
// session or agent. A writer that finds it held waits up to WAIT_MS and then
// fails naming the holder. A lock whose holder's process no longer runs, or
// which is older than STALE_MS, is broken and the writer proceeds.
export const WAIT_MS = 5_000;
export const STALE_MS = 30_000;
const POLL_MS = 10;

interface Holder {
	pid: number;
	time: string;
	actor?: string;
}

function alive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (e) {
		// EPERM: the process runs, as another user.
		return (e as NodeJS.ErrnoException).code === "EPERM";
	}
}

function readHolder(path: string): { text: string; holder?: Holder; mtime: number } | null {
	try {
		const text = readFileSync(path, "utf8");
		const mtime = statSync(path).mtimeMs;
		try {
			const h = JSON.parse(text) as Holder;
			if (typeof h.pid === "number" && typeof h.time === "string") return { text, holder: h, mtime };
		} catch {}
		// Empty or partial: its taker has created it and not yet written it.
		return { text, mtime };
	} catch (e) {
		if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
		throw e;
	}
}

function stale(seen: { holder?: Holder; mtime: number }, now: number): boolean {
	if (!seen.holder) return now - seen.mtime > STALE_MS;
	const taken = Date.parse(seen.holder.time);
	return !alive(seen.holder.pid) || Number.isNaN(taken) || now - taken > STALE_MS;
}

function holderText(holder?: Holder): string {
	if (!holder) return "a process that has not yet written its name";
	return `process ${holder.pid}${holder.actor ? ` (${holder.actor})` : ""}, since ${holder.time}`;
}

// Removes a stale lock, but only the one judged stale: a guard file taken
// exclusively stops two breakers from both removing it, where the second
// would remove the fresh lock the first one's writer has just taken.
function breakLock(path: string, seenText: string, now: number): void {
	const guard = `${path}.break`;
	try {
		writeFileSync(guard, String(process.pid), { flag: "wx" });
	} catch (e) {
		if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
		// A breaker that died mid-break leaves its guard; clear it once old.
		try {
			if (now - statSync(guard).mtimeMs > STALE_MS) unlinkSync(guard);
		} catch {}
		return;
	}
	try {
		const now2 = readHolder(path);
		if (now2 && now2.text === seenText) unlinkSync(path);
	} finally {
		unlinkSync(guard);
	}
}

// Runs `fn` holding the lock file at `path`. `what` names the thing locked in
// the error a writer gets when it gives up.
export function withLock<T>(path: string, what: string, actor: string | undefined, fn: () => T): T {
	const deadline = Date.now() + WAIT_MS;
	let mine: string;
	for (;;) {
		try {
			const fd = openSync(path, "wx");
			mine = JSON.stringify({ pid: process.pid, time: new Date().toISOString(), ...(actor ? { actor } : {}) });
			try {
				writeSync(fd, mine);
			} finally {
				closeSync(fd);
			}
			break;
		} catch (e) {
			if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
		}
		const now = Date.now();
		const seen = readHolder(path);
		if (!seen) continue;
		if (stale(seen, now)) {
			breakLock(path, seen.text, now);
			continue;
		}
		if (now >= deadline) {
			throw new Error(`${what} is locked by ${holderText(seen.holder)}; gave up after waiting ${WAIT_MS / 1000} seconds. Lock file: ${path}`);
		}
		Bun.sleepSync(POLL_MS);
	}
	try {
		return fn();
	} finally {
		// Only our own lock: one held past STALE_MS may have been broken and
		// taken by another writer since.
		if (readHolder(path)?.text === mine) unlinkSync(path);
	}
}

// Writes a file so a reader sees the old content or the new, never part of
// either: the text goes to a temporary file in the same directory, which is
// then renamed over the target. With `exclusive`, the target must not exist.
export function writeAtomic(path: string, text: string, exclusive = false): void {
	const tmp = join(dirname(path), `.${basename(path)}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`);
	writeFileSync(tmp, text, { flag: "wx" });
	try {
		if (exclusive) {
			// link fails if the target exists, and the target appears whole.
			linkSync(tmp, path);
			unlinkSync(tmp);
		} else {
			renameSync(tmp, path);
		}
	} catch (e) {
		try {
			unlinkSync(tmp);
		} catch {}
		throw e;
	}
}
