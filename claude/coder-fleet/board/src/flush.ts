// The flush: one line, and a push of the state branch (CF-201).
//
// The board and every agent's memory live on the state branch,
// `coder-fleet/state`, and never on the default branch, in any project and on
// any clone: the human's order was "always, no choice". So `board flush` lands
// nothing. It says so in one line and pushes the state branch, which the board
// binary and the memory hook already push after every commit, so the flush is
// a way to push by hand and to see where a project stands.
//
// A project whose default branch still tracks `.boards/` or the fleet's memory
// has not been migrated: the line says so, names `/coder-fleet:init` as the
// way to migrate it, and still lands nothing. Whether this clone's
// info/exclude lists the board plays no part, since only the clone that ran
// /init has that file and the migration commit reaches every clone.
//
// Removed with the landing (CF-183.3, CF-188, CF-188.1, CF-198): building a
// flush commit on the fetched default-branch tip, its push and the race
// retries, the skips for auto_commit off and for paths the tip ignores, the
// carry and HELD_REF, restarting the state branch and the refs under
// refs/coder-fleet/flushed, clearing main-checkout leftovers and
// fast-forwarding the main checkout. Refs a flush wrote before stay where they
// are and keep an item's history reachable.
import { ensureStateWorktree, pushNow, STATE_BRANCH } from "./state-worktree.ts";

export interface FlushResult {
	/** The one line the flush prints. */
	line: string;
	/** Whether the default branch's tip still tracks the board or the fleet's memory. */
	notMigrated: boolean;
}

export interface FlushOptions {
	/** Accepted and unused: no flush commit is made, so none is named. */
	tag?: string;
	/** Accepted and unused, for the same reason. */
	by?: string;
}

function git(cwd: string, args: string[]): { code: number; out: string } {
	const p = Bun.spawnSync(["git", "-C", cwd, ...args], { stdout: "pipe", stderr: "pipe", env: process.env });
	return { code: p.exitCode, out: p.stdout.toString().trim() };
}

/** The default branch's name and tip: origin/HEAD's branch, as origin last had it, else as it is here; else main, master. */
export function defaultTip(main: string): { name: string; commit: string } | null {
	const sym = git(main, ["symbolic-ref", "-q", "refs/remotes/origin/HEAD"]);
	const named = sym.code === 0 ? sym.out.replace(/^refs\/remotes\/origin\//, "") : "";
	const names = named ? [named] : ["main", "master"];
	for (const name of names) {
		for (const ref of [`refs/remotes/origin/${name}`, `refs/heads/${name}`]) {
			const r = git(main, ["rev-parse", "--verify", "-q", `${ref}^{commit}`]);
			if (r.code === 0 && r.out) return { name, commit: r.out };
		}
	}
	return null;
}

/** True when `commit` tracks anything under .boards or a fleet agent's memory directory. */
export function tracksFleetFiles(main: string, commit: string): boolean {
	if (git(main, ["ls-tree", "--name-only", commit, "--", ".boards"]).out) return true;
	const memory = git(main, ["ls-tree", "--name-only", commit, "--", ".claude/agent-memory/"]).out;
	return memory.split("\n").some((p) => p.startsWith(".claude/agent-memory/coder-fleet-"));
}

/**
 * Says where the board and memory are, and pushes the state branch, bounded
 * by the push script's own timeout. Throws when the board has not moved to its
 * state worktree, since then there is no state branch to push.
 */
export function flushState(main: string, _options: FlushOptions = {}): FlushResult {
	const home = ensureStateWorktree(main);
	if (!home.moved)
		throw new Error(
			`the board has not moved to its state worktree, so there is no ${STATE_BRANCH} to push: ${home.reason}`,
		);
	const tip = defaultTip(main);
	const name = tip?.name ?? "the default branch";
	const notMigrated = tip !== null && tracksFleetFiles(main, tip.commit);
	const pushed = pushNow(main);
	const line = notMigrated
		? `nothing lands on ${name}: ${name} still tracks the board or the fleet's memory, so this project is not migrated yet; run /coder-fleet:init to migrate it, and the board and memory stay on ${STATE_BRANCH} meanwhile; ${pushed}`
		: `nothing lands on ${name}: the board and memory live on ${STATE_BRANCH} alone; ${pushed}`;
	return { line, notMigrated };
}
