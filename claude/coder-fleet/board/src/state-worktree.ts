// The state worktree: where the live board is, and why it is there.
//
// A board write is a commit. Made in the main checkout it landed on whatever
// branch was out there, so a project's history filled with board commits
// (CF-183). The live board is instead the `.boards/` of a linked worktree on a
// branch of its own, at `<main checkout>/.claude/worktrees/coder-fleet-state`,
// on `coder-fleet/state`. Every checkout of the repository finds it the same
// way, from `git rev-parse --git-common-dir`, so the main checkout, an agent
// worktree and the state worktree itself all answer the same board. The main
// checkout's own `.boards/` stays as it was at the move and changes only when
// the state branch is flushed onto the default branch (CF-183.3).
//
// Nothing here is pushed. A fresh clone, or a second machine, has no state
// branch: its first board use makes one from the default branch, whose
// `.boards/` is the board as last flushed.
//
// The move is a data write, so it is made to be safe rather than quick:
//   - one process at a time, under a lock in the common git dir;
//   - built on a branch named `coder-fleet/state-migrating`, and renamed to
//     `coder-fleet/state` only once the copy is verified and committed, so the
//     rename is the commit point and a killed process leaves something the
//     next one recognises and cleans up;
//   - the main checkout is read and never written: nothing committed there,
//     nothing reverted, its uncommitted board changes left where they are;
//   - an existing state branch is re-attached, never overwritten from the main
//     checkout's copy, which is older than it;
//   - a failure removes only what this process made, records the reason in a
//     marker every later process honours, so all of them keep using the main
//     checkout's board rather than some moving and some not, and logs it to
//     hooks.log. `board state` clears the marker and tries again.
import {
	cpSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { logBoardNote } from "./git/board-log.ts";

/** The branch the state worktree has out. Nobody types it by accident. */
export const STATE_BRANCH = "coder-fleet/state";
/** The branch a move in progress is built on; renamed to STATE_BRANCH as its last step. */
export const MIGRATING_BRANCH = "coder-fleet/state-migrating";
/** Where the state worktree is, relative to the main checkout. */
export const STATE_WORKTREE = join(".claude", "worktrees", "coder-fleet-state");
/** The subject of the move's one commit on the state branch. */
export const MIGRATION_SUBJECT = "Move the board to the state worktree";

const BOARD = ".boards";
const LOCK_WAIT_MS = 30_000;
const LOCK_STALE_MS = 120_000;

export interface BoardHome {
	/** The directory that contains the live `.boards/`. */
	root: string;
	/** True when that is the state worktree. */
	moved: boolean;
	/** Why it is not, when it is not. */
	reason?: string;
}

function git(cwd: string, args: string[]): { code: number; out: string; err: string } {
	const p = Bun.spawnSync(["git", "-C", cwd, ...args], { stdout: "pipe", stderr: "pipe", env: process.env });
	return { code: p.exitCode, out: p.stdout.toString().trim(), err: p.stderr.toString().trim() };
}

function must(cwd: string, args: string[]): string {
	const r = git(cwd, args);
	if (r.code !== 0) throw new Error(`git ${args.join(" ")}: ${r.err || r.out || `exit ${r.code}`}`);
	return r.out;
}

function isDirectory(path: string): boolean {
	try {
		return statSync(path).isDirectory();
	} catch {
		return false;
	}
}

function real(path: string): string {
	try {
		return realpathSync(path);
	} catch {
		return resolve(path);
	}
}

function refExists(main: string, ref: string): boolean {
	return git(main, ["rev-parse", "--verify", "-q", `${ref}^{commit}`]).code === 0;
}

export function stateWorktreeOf(main: string): string {
	return join(main, STATE_WORKTREE);
}

function commonDirOf(main: string): string {
	const out = must(main, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
	return isAbsolute(out) ? out : resolve(main, out);
}

/** The file whose presence says the move failed and must not be retried unasked. */
export function migrationFailedMarker(main: string): string {
	return join(commonDirOf(main), "coder-fleet", "state-migration-failed");
}

/**
 * True when `state` is a worktree with STATE_BRANCH out and a `.boards/` in
 * it. Read from the filesystem alone, so the common case costs no git call:
 * the `.git` file names the worktree's git dir, whose HEAD names the branch.
 */
export function stateReady(state: string): boolean {
	try {
		const dotgit = join(state, ".git");
		if (!statSync(dotgit).isFile()) return false;
		const line = readFileSync(dotgit, "utf8").trim();
		if (!line.startsWith("gitdir:")) return false;
		const gitdir = resolve(state, line.slice("gitdir:".length).trim());
		const head = readFileSync(join(gitdir, "HEAD"), "utf8").trim();
		return head === `ref: refs/heads/${STATE_BRANCH}` && isDirectory(join(state, BOARD));
	} catch {
		return false;
	}
}

/** The default branch's commit: origin/HEAD's branch, local first, then main, master, and HEAD. */
function defaultBase(main: string): string | null {
	const candidates: string[] = [];
	const sym = git(main, ["symbolic-ref", "-q", "refs/remotes/origin/HEAD"]);
	const name = sym.code === 0 ? sym.out.replace(/^refs\/remotes\/origin\//, "") : "";
	if (name) candidates.push(`refs/heads/${name}`, `refs/remotes/origin/${name}`);
	candidates.push("refs/heads/main", "refs/heads/master", "HEAD");
	for (const ref of candidates) {
		const r = git(main, ["rev-parse", "--verify", "-q", `${ref}^{commit}`]);
		if (r.code === 0 && r.out) return r.out;
	}
	return null;
}

function acquireLock(common: string): () => void {
	const dir = join(common, "coder-fleet");
	mkdirSync(dir, { recursive: true });
	const lock = join(dir, "state.lock");
	const deadline = Date.now() + LOCK_WAIT_MS;
	for (;;) {
		try {
			mkdirSync(lock);
			writeFileSync(join(lock, "pid"), `${process.pid}\n`);
			return () => rmSync(lock, { recursive: true, force: true });
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
		}
		if (lockIsStale(lock)) {
			rmSync(lock, { recursive: true, force: true });
			continue;
		}
		if (Date.now() > deadline) {
			throw new Error(
				`another process is moving the board to the state worktree (lock ${lock}); try again once it finishes`,
			);
		}
		Bun.sleepSync(50);
	}
}

function lockIsStale(lock: string): boolean {
	let age = 0;
	try {
		age = Date.now() - statSync(lock).mtimeMs;
	} catch {
		return false;
	}
	let pid = Number.NaN;
	try {
		pid = Number.parseInt(readFileSync(join(lock, "pid"), "utf8"), 10);
	} catch {
		// Between the mkdir and the pid write, or a holder killed in that gap.
		return age > 5_000;
	}
	if (!Number.isFinite(pid)) return age > 5_000;
	try {
		process.kill(pid, 0);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ESRCH") return true;
	}
	return age > LOCK_STALE_MS;
}

/** Every file under `dir` as relative path to bytes, symlinks as their target. */
function snapshot(dir: string): Map<string, string> {
	const out = new Map<string, string>();
	const walk = (d: string) => {
		for (const entry of readdirSync(d, { withFileTypes: true })) {
			const p = join(d, entry.name);
			if (entry.isDirectory()) walk(p);
			else if (entry.isSymbolicLink()) out.set(relative(dir, p), `symlink:${readFileSync(p, "latin1")}`);
			else out.set(relative(dir, p), readFileSync(p).toString("base64"));
		}
	};
	walk(dir);
	return out;
}

function sameTree(a: string, b: string): string | null {
	const left = snapshot(a);
	const right = snapshot(b);
	for (const [path, bytes] of left) {
		if (!right.has(path)) return `${path} is missing from the copy`;
		if (right.get(path) !== bytes) return `${path} differs in the copy`;
	}
	for (const path of right.keys()) if (!left.has(path)) return `${path} is in the copy and not the original`;
	return null;
}

/**
 * The worktree registered at `state`, if any: its branch, or "" when detached.
 * Undefined when nothing is registered there.
 */
function registeredAt(main: string, state: string): string | undefined {
	const listing = must(main, ["worktree", "list", "--porcelain"]);
	const want = real(state);
	let path = "";
	for (const line of `${listing}\n`.split("\n")) {
		if (line.startsWith("worktree ")) path = line.slice("worktree ".length);
		else if (line.startsWith("branch ") && real(path) === want) return line.slice("branch refs/heads/".length);
		else if (line === "detached" && real(path) === want) return "";
	}
	return undefined;
}

/** Keeps the state worktree out of the main checkout's status, without a commit. */
function excludeFromMain(main: string, common: string): void {
	const probe = `${STATE_WORKTREE.split("\\").join("/")}/.boards`;
	if (git(main, ["check-ignore", "-q", "--no-index", probe]).code === 0) return;
	const file = join(common, "info", "exclude");
	mkdirSync(dirname(file), { recursive: true });
	const before = existsSync(file) ? readFileSync(file, "utf8") : "";
	const line = `/${STATE_WORKTREE.split("\\").join("/")}/`;
	const sep = before.length > 0 && !before.endsWith("\n") ? "\n" : "";
	writeFileSync(file, `${before}${sep}# the board's state worktree (coder-fleet)\n${line}\n`);
}

/** True when the state worktree's config turns board commits on, read the way board-git-check.sh reads it. */
function commitsOn(state: string): boolean {
	if (process.env.CODER_FLEET_BOARD_NO_COMMIT === "1") return false;
	let text = "";
	try {
		text = readFileSync(join(state, BOARD, "config.yml"), "utf8");
	} catch {
		return false;
	}
	const m = text.match(/^auto_commit:\s*(.*)$/m);
	const value = (m?.[1] ?? "").replace(/["'\s\r]/g, "").toLowerCase();
	return value === "true" && git(state, ["check-ignore", "-q", BOARD]).code !== 0;
}

/** The move's one commit: everything under .boards but the focus file. */
function commitMove(state: string): void {
	if (!commitsOn(state)) return;
	const focus = `${BOARD}/.focus`;
	const exclude = `:(exclude)${focus}`;
	must(state, ["add", "--", BOARD]);
	git(state, ["reset", "-q", "--", focus]);
	if (git(state, ["diff", "--cached", "--quiet", "--", BOARD, exclude]).code === 0) return;
	must(state, ["commit", "-q", "-m", MIGRATION_SUBJECT, "-m", "Board-Writer: board", "--", BOARD, exclude]);
}

/** Removes what an earlier, killed move left behind. Throws when the path holds anything else. */
function clearLeftovers(main: string, state: string): void {
	git(main, ["worktree", "prune"]);
	const branch = registeredAt(main, state);
	if (branch === MIGRATING_BRANCH) {
		must(main, ["worktree", "remove", "--force", state]);
	} else if (branch !== undefined && branch !== STATE_BRANCH) {
		throw new Error(
			`${state} is a worktree on ${branch || "a detached HEAD"}, not the board's state worktree; move it, then run board state`,
		);
	}
	if (refExists(main, `refs/heads/${MIGRATING_BRANCH}`)) must(main, ["branch", "-D", MIGRATING_BRANCH]);
	const occupied = existsSync(state) && !(isDirectory(state) && readdirSync(state).length === 0);
	if (occupied && registeredAt(main, state) === undefined) {
		throw new Error(`${state} exists and is not the board's state worktree; move it away, then run board state`);
	}
}

function migrate(main: string, common: string, state: string): void {
	excludeFromMain(main, common);
	clearLeftovers(main, state);
	const mainBoard = join(main, BOARD);
	if (registeredAt(main, state) === STATE_BRANCH) {
		// Registered on the state branch but not ready: its .boards is gone.
		if (!isDirectory(mainBoard)) throw new Error(`${state} has no ${BOARD}/ and neither does ${main}`);
		cpSync(mainBoard, join(state, BOARD), { recursive: true, verbatimSymlinks: true });
		return;
	}
	mkdirSync(dirname(state), { recursive: true });
	if (refExists(main, `refs/heads/${STATE_BRANCH}`)) {
		// A state branch whose worktree was removed. It is newer than the main
		// checkout's copy, so it is checked out as it is.
		must(main, ["worktree", "add", "-q", state, STATE_BRANCH]);
		if (!isDirectory(join(state, BOARD)) && isDirectory(mainBoard)) {
			// A gitignored board is never on any branch; the main checkout's copy is the only one left.
			cpSync(mainBoard, join(state, BOARD), { recursive: true, verbatimSymlinks: true });
		}
		return;
	}
	const base = defaultBase(main);
	if (!base) throw new Error("the repository has no commit to base the state branch on");
	let created = false;
	try {
		must(main, ["worktree", "add", "-q", "--no-track", "-b", MIGRATING_BRANCH, state, base]);
		created = true;
		rmSync(join(state, BOARD), { recursive: true, force: true });
		cpSync(mainBoard, join(state, BOARD), { recursive: true, verbatimSymlinks: true });
		const differs = sameTree(mainBoard, join(state, BOARD));
		if (differs) throw new Error(`the copy of ${mainBoard} did not verify: ${differs}`);
		commitMove(state);
		must(state, ["branch", "-m", MIGRATING_BRANCH, STATE_BRANCH]);
		if (!stateReady(state)) throw new Error(`${state} is not ready after the move`);
	} catch (error) {
		if (created) git(main, ["worktree", "remove", "--force", state]);
		if (refExists(main, `refs/heads/${MIGRATING_BRANCH}`)) git(main, ["branch", "-D", MIGRATING_BRANCH]);
		throw error;
	}
}

function noBoard(main: string): Error {
	return new Error(`no board here: ${main} has no ${BOARD}/ directory (run /init in that repository to create one)`);
}

/**
 * Where the live board of the repository whose main checkout is `main` is,
 * making the state worktree first when there is none. `retry` clears a
 * recorded failure and tries again; without it a recorded failure answers the
 * main checkout at once. Throws "no board here" when there is no board at all.
 */
export function ensureStateWorktree(main: string, options: { retry?: boolean } = {}): BoardHome {
	const state = stateWorktreeOf(main);
	if (stateReady(state)) return { root: state, moved: true };
	const common = commonDirOf(main);
	const marker = join(common, "coder-fleet", "state-migration-failed");
	const fallback = (reason: string): BoardHome => {
		if (!isDirectory(join(main, BOARD))) throw noBoard(main);
		return { root: main, moved: false, reason };
	};
	const recorded = () => (existsSync(marker) ? readFileSync(marker, "utf8").trim() : null);
	if (options.retry) rmSync(marker, { force: true });
	else {
		const reason = recorded();
		if (reason !== null) return fallback(reason);
	}
	const hasBranch = refExists(main, `refs/heads/${STATE_BRANCH}`);
	if (!isDirectory(join(main, BOARD)) && !hasBranch) throw noBoard(main);
	if (!hasBranch && defaultBase(main) === null) {
		// A repository with no commit yet, as /init leaves a new one. Not a
		// failure: the first board use after the first commit makes the move.
		return fallback("the repository has no commit yet, so the board stays in the main checkout until there is one");
	}
	const release = acquireLock(common);
	try {
		if (stateReady(state)) return { root: state, moved: true };
		const reason = recorded();
		if (reason !== null) return fallback(reason);
		try {
			migrate(main, common, state);
		} catch (error) {
			const why = error instanceof Error ? error.message : String(error);
			mkdirSync(dirname(marker), { recursive: true });
			writeFileSync(marker, `${why}\n`);
			logBoardNote(
				`board migration failed: ${why}. The board stays at ${join(main, BOARD)}, readable and writable as before. Fix the cause, then run board state to try again; until then no process retries.`,
			);
			return fallback(why);
		}
		rmSync(marker, { force: true });
		logBoardNote(
			`moved the board from ${join(main, BOARD)} to ${join(state, BOARD)} on ${STATE_BRANCH}; board writes commit there from now on`,
		);
		return { root: state, moved: true };
	} finally {
		release();
	}
}

/**
 * True when `root` is a checkout of a repository whose board has moved to its
 * state worktree, and is not that worktree: a process that resolved its root
 * before the move. Such a process must not commit its write where it is.
 */
export function boardMovedFrom(root: string, main: string | null): string | null {
	if (main === null) return null;
	const state = stateWorktreeOf(main);
	if (real(root) === real(state)) return null;
	return stateReady(state) ? state : null;
}
