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
	mkdtempSync,
	readdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	statSync,
	utimesSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
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

/** The lock every board commit and memory commit takes, and board state --from. */
export const BOARD_LOCK = "board.lock";
/**
 * How long a board commit waits for it. Each holder keeps it for milliseconds,
 * and this stays under SubagentStart's 20 s hook timeout, so a commit that
 * cannot get it fails with a logged reason rather than being killed.
 */
export const BOARD_LOCK_WAIT_MS = 15_000;

const BOARD = ".boards";
/** The agents' memory, which lives on the state branch beside the board (CF-183.2). */
const MEMORY = join(".claude", "agent-memory");
const LOCK_WAIT_MS = 30_000;
const LOCK_STALE_MS = 120_000;
/**
 * How long a lock with no readable pid may stand before it counts as stale:
 * the gap between a holder's mkdir and its pid write, or a holder killed in it.
 */
const LOCK_PID_GRACE_MS = 5_000;

/** The move lock was held past the wait. Not a failed move: nothing is recorded, and the next use tries again. */
export class LockTimeout extends Error {}

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

export function commonDirOf(main: string): string {
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

/**
 * The remote the main checkout fetches its default branch from, as
 * hooks/main-fast-forward.sh and hooks/state-push.sh resolve it: origin, or
 * the only remote when there is one. Null otherwise.
 */
export function fetchRemoteOf(main: string): string | null {
	const listed = git(main, ["remote"]);
	const remotes = listed.code === 0 ? listed.out.split("\n").filter(Boolean) : [];
	if (remotes.includes("origin")) return "origin";
	return remotes.length === 1 ? (remotes[0] as string) : null;
}

/**
 * The state branch as the fetch remote last had it, from a clone or a fetch,
 * and that remote's name. Never another remote's: a board is text agents read
 * as cards and comments, so it is taken only from where the default branch
 * comes from. Null when that remote has none.
 */
export function remoteStateRef(main: string): { remote: string; ref: string } | null {
	const remote = fetchRemoteOf(main);
	if (!remote) return null;
	const ref = `refs/remotes/${remote}/${STATE_BRANCH}`;
	return refExists(main, ref) ? { remote, ref } : null;
}

/**
 * Fast-forwards the local state branch to `remote`'s copy, as last fetched,
 * the one way a branch that already exists here takes another machine's board
 * (`board state --from <remote>`); nothing does it unasked. Refuses a copy
 * that is not a fast-forward, and moves the state worktree with the branch.
 * Returns what it did; throws when it refuses.
 */
export function restoreStateFrom(main: string, remote: string): string {
	if (!/^[A-Za-z0-9._-]+$/.test(remote) || remote.startsWith("-")) throw new Error(`${remote} is not a remote name`);
	const ref = `refs/remotes/${remote}/${STATE_BRANCH}`;
	if (!refExists(main, ref)) {
		throw new Error(`${remote} has no ${STATE_BRANCH} as last fetched; run git fetch ${remote} ${STATE_BRANCH} first`);
	}
	const theirs = must(main, ["rev-parse", "--verify", `${ref}^{commit}`]);
	const local = `refs/heads/${STATE_BRANCH}`;
	if (!refExists(main, local)) {
		must(main, ["branch", "--no-track", STATE_BRANCH, theirs]);
		logBoardNote(`adopted ${STATE_BRANCH} from ${remote} at ${theirs.slice(0, 7)}, asked for with board state --from`);
		return `adopted ${STATE_BRANCH} from ${remote} at ${theirs.slice(0, 7)}`;
	}
	const common = commonDirOf(main);
	const release = acquireLock(common, BOARD_LOCK_WAIT_MS, BOARD_LOCK, "committing to the board");
	try {
		const ours = must(main, ["rev-parse", "--verify", `${local}^{commit}`]);
		if (ours === theirs) return `${STATE_BRANCH} is already at ${remote}'s ${theirs.slice(0, 7)}`;
		if (git(main, ["merge-base", "--is-ancestor", ours, theirs]).code !== 0) {
			throw new Error(
				`${remote}'s ${STATE_BRANCH} at ${theirs.slice(0, 7)} is not a fast-forward of the local ${ours.slice(0, 7)}, which has board or memory commits it lacks; nothing moved. Reconcile the two by hand`,
			);
		}
		const state = stateWorktreeOf(main);
		if (stateReady(state)) {
			const r = git(state, ["merge", "-q", "--ff-only", theirs]);
			if (r.code !== 0)
				throw new Error(`${state} could not be fast-forwarded: ${r.err || `exit ${r.code}`}; nothing moved`);
		} else {
			must(main, ["update-ref", "-m", `board state --from ${remote}`, local, theirs, ours]);
		}
		logBoardNote(
			`fast-forwarded ${STATE_BRANCH} from ${remote}, ${ours.slice(0, 7)} to ${theirs.slice(0, 7)}, asked for with board state --from`,
		);
		return `fast-forwarded ${STATE_BRANCH} from ${remote}, ${ours.slice(0, 7)} to ${theirs.slice(0, 7)}`;
	} finally {
		release();
	}
}

/** The environment variable board.sh sets to scripts/fleet-exclude.py. */
export const EXCLUDE_SCRIPT_ENV = "CODER_FLEET_EXCLUDE_SCRIPT";

/**
 * A clone that adopts the state branch writes the exclude entries /init
 * writes, through scripts/fleet-exclude.py's `write`, so its main-checkout
 * copies of the fleet's memory are never untracked and unexcluded there. Only
 * the entries: nothing is untracked and nothing is committed. When the default
 * branch still tracks those paths the script refuses, writes nothing, and the
 * reason is logged. Never fails the adoption.
 */
function writeExcludeAfterAdoption(main: string): void {
	const fromEnv = process.env[EXCLUDE_SCRIPT_ENV]?.trim();
	const script = fromEnv || join(import.meta.dir, "..", "..", "scripts", "fleet-exclude.py");
	if (!existsSync(script)) {
		logBoardNote(`wrote no exclude in ${main} after adopting ${STATE_BRANCH}: no fleet-exclude.py at ${script}`);
		return;
	}
	const p = Bun.spawnSync(["python3", "-I", script, "write"], {
		cwd: main,
		stdout: "pipe",
		stderr: "pipe",
		env: process.env,
	});
	const said = `${p.stdout.toString()}${p.stderr.toString()}`.trim().split("\n")[0] ?? "";
	if (p.exitCode === 0) logBoardNote(`wrote the exclude entries in ${main} after adopting ${STATE_BRANCH}`);
	else logBoardNote(`wrote no exclude in ${main} after adopting ${STATE_BRANCH}: ${said || `exit ${p.exitCode}`}`);
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

/**
 * A lock directory under `<common>/coder-fleet/`, held by this process until
 * the returned release runs. `name` is `state.lock` for the move and
 * `board.lock` for board commits and the flush. Throws LockTimeout, saying
 * what `holder` is doing, when it stays held past `waitMs`. The holder of a
 * long hold refreshes it with `touchLock`, or after LOCK_STALE_MS it counts
 * as stale even with its pid alive.
 */
export function acquireLock(
	common: string,
	waitMs: number,
	name = "state.lock",
	holder = "moving the board to the state worktree",
): () => void {
	const dir = join(common, "coder-fleet");
	mkdirSync(dir, { recursive: true });
	const lock = join(dir, name);
	const deadline = Date.now() + waitMs;
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
			throw new LockTimeout(`another process is ${holder} (lock ${lock}); try again once it finishes`);
		}
		Bun.sleepSync(50);
	}
}

/** Keeps a held lock young, so a long hold is not taken for a stale one. */
export function touchLock(common: string, name: string): void {
	const now = new Date();
	try {
		utimesSync(join(common, "coder-fleet", name), now, now);
	} catch {
		// Gone already: nothing to keep young.
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
		return age > LOCK_PID_GRACE_MS;
	}
	if (!Number.isFinite(pid)) return age > LOCK_PID_GRACE_MS;
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

/** True when the board config under `dir` says `auto_commit: true`, read the way board-git-check.sh reads it. */
export function autoCommitOn(dir: string): boolean {
	let text = "";
	try {
		text = readFileSync(join(dir, BOARD, "config.yml"), "utf8");
	} catch {
		return false;
	}
	const m = text.match(/^auto_commit:\s*(.*)$/m);
	return (m?.[1] ?? "").replace(/["'\s\r]/g, "").toLowerCase() === "true";
}

/**
 * True when a board commit from the checkout at `cwd` must leave `path` alone
 * because it is ignored: by a `.gitignore` or the human's global excludes file
 * in any checkout, or by the common git dir's info/exclude in any checkout but
 * the state worktree. A project keeps the board and the fleet's memory out of
 * its own history through info/exclude (CF-201, scripts/fleet-exclude.py),
 * which every checkout shares; on the state branch that is no reason to stop
 * committing them, and anywhere else it is exactly the reason.
 */
export function ignoredHere(cwd: string, path: string): boolean {
	const p = Bun.spawnSync(["git", "-C", cwd, "check-ignore", "-v", "-z", "--stdin"], {
		stdin: new TextEncoder().encode(`${path}\0`),
		stdout: "pipe",
		stderr: "pipe",
		env: process.env,
	});
	if (p.exitCode !== 0) return false;
	const source = p.stdout.toString().split("\0")[0] ?? "";
	if (!source) return true;
	const top = git(cwd, ["rev-parse", "--show-toplevel"]).out || cwd;
	const common = commonDirOf(cwd);
	if (real(resolve(top, source)) !== real(join(common, "info", "exclude"))) return true;
	// By path, so the move's own commit, made before its branch is renamed, counts too.
	return real(top) !== real(join(dirname(common), STATE_WORKTREE));
}

/** The human's global excludes file, when there is one, as git finds it. */
function globalExcludes(cwd: string): string | null {
	const set = git(cwd, ["config", "--path", "--get", "core.excludesFile"]).out;
	const home = process.env.HOME ?? "";
	const xdg = process.env.XDG_CONFIG_HOME || (home ? join(home, ".config") : "");
	const file = set || (xdg ? join(xdg, "git", "ignore") : "");
	return file && existsSync(file) ? file : null;
}

/**
 * Stages every change under `dir` in the checkout at `cwd` as `git add -- dir`
 * would, except that the common git dir's info/exclude is not read: tracked
 * files modified or deleted, and every untracked file a `.gitignore` or the
 * global excludes file does not ignore. In a project that excludes the board
 * (CF-201) every new card is excluded in the state worktree too, and a plain
 * add refuses it. Returns git's answer for the add, or exit 0 when there was
 * nothing to stage.
 */
export function stageUnexcluded(cwd: string, dir: string): { code: number; err: string } {
	const args = ["ls-files", "-z", "-m", "-d", "-o", "--exclude-per-directory=.gitignore"];
	const global = globalExcludes(cwd);
	if (global) args.push(`--exclude-from=${global}`);
	// Every other line of info/exclude still counts, so a personal pattern
	// there (an editor's swap file, .DS_Store) keeps its file off the state
	// branch; only the fleet's own entry for `dir` is left out.
	const scratch = mkdtempSync(join(tmpdir(), "board-exclude-"));
	try {
		const own = join(commonDirOf(cwd), "info", "exclude");
		if (existsSync(own)) {
			const fleet = new Set([dir, `/${dir}`, `${dir}/`, `/${dir}/`]);
			const kept = readFileSync(own, "utf8")
				.split(/\r?\n/)
				.filter((line) => !fleet.has(line.trim()));
			writeFileSync(join(scratch, "exclude"), `${kept.join("\n")}\n`);
			args.push(`--exclude-from=${join(scratch, "exclude")}`);
		}
		return stageListed(cwd, args, dir);
	} finally {
		rmSync(scratch, { recursive: true, force: true });
	}
}

function stageListed(cwd: string, args: string[], dir: string): { code: number; err: string } {
	const listed = Bun.spawnSync(["git", "-C", cwd, ...args, "--", dir], {
		stdout: "pipe",
		stderr: "pipe",
		env: process.env,
	});
	if (listed.exitCode !== 0) return { code: listed.exitCode, err: listed.stderr.toString().trim() };
	const paths = listed.stdout.toString();
	if (!paths.replace(/\0/g, "")) return { code: 0, err: "" };
	const add = Bun.spawnSync(["git", "-C", cwd, "add", "-A", "-f", "--pathspec-from-file=-", "--pathspec-file-nul"], {
		stdin: new TextEncoder().encode(paths),
		stdout: "pipe",
		stderr: "pipe",
		env: process.env,
	});
	return { code: add.exitCode, err: add.stderr.toString().trim() };
}

/** The environment variable board.sh sets to hooks/state-push.sh, which pushes the state branch (CF-201). */
export const PUSH_SCRIPT_ENV = "CODER_FLEET_STATE_PUSH_SCRIPT";

/**
 * Starts a push of the state branch in the background and returns at once:
 * the script detaches before it touches the network, logs what happened and
 * never fails anything. Nothing when board.sh named no script, as when the
 * board runs from source in a test.
 */
export function schedulePush(cwd: string): void {
	const script = process.env[PUSH_SCRIPT_ENV]?.trim();
	if (!script || !existsSync(script)) return;
	Bun.spawnSync(["bash", script, cwd], { stdin: "ignore", stdout: "ignore", stderr: "ignore", env: process.env });
}

/** Pushes the state branch now, bounded by the script's own timeout, and returns its one line. */
export function pushNow(cwd: string): string {
	const script = process.env[PUSH_SCRIPT_ENV]?.trim();
	if (!script || !existsSync(script)) return `${STATE_BRANCH} was not pushed: ${PUSH_SCRIPT_ENV} names no push script`;
	const p = Bun.spawnSync(["bash", script, "--wait", cwd], {
		stdin: "ignore",
		stdout: "pipe",
		stderr: "ignore",
		env: process.env,
	});
	return p.stdout.toString().trim().split("\n").pop() || `${STATE_BRANCH} was not pushed: the push script said nothing`;
}

/** True when the state worktree's config turns board commits on and nothing but the fleet's own exclude ignores the board there. */
function commitsOn(state: string): boolean {
	if (process.env.CODER_FLEET_BOARD_NO_COMMIT === "1") return false;
	return autoCommitOn(state) && !ignoredHere(state, BOARD);
}

/** The move's one commit: everything under .boards but the focus file, and the agents' memory. */
function commitMove(state: string): void {
	if (!commitsOn(state)) return;
	const focus = `${BOARD}/.focus`;
	const exclude = `:(exclude)${focus}`;
	const paths = [BOARD];
	const staged = stageUnexcluded(state, BOARD);
	if (staged.code !== 0) throw new Error(`git add -- ${BOARD}: ${staged.err || `exit ${staged.code}`}`);
	if (isDirectory(join(state, MEMORY))) {
		// Forced: the agents' memory is excluded from every checkout's status (CF-183.2).
		must(state, ["add", "-f", "--", MEMORY]);
		// A memory directory with no file in it yet, as a fresh /init leaves one,
		// stages nothing, and a commit naming a path git does not know fails.
		if (git(state, ["ls-files", "--", MEMORY]).out) paths.push(MEMORY);
	}
	git(state, ["reset", "-q", "--", focus]);
	if (git(state, ["diff", "--cached", "--quiet", "--", ...paths, exclude]).code === 0) return;
	must(state, ["commit", "-q", "-m", MIGRATION_SUBJECT, "-m", "Board-Writer: board", "--", ...paths, exclude]);
}

/**
 * Copies the main checkout's agent memory over the state worktree's, uncommitted
 * changes included, and checks every file arrived. Nothing is deleted: a note
 * the main checkout lacks stays as the default branch has it.
 */
function carryMemory(main: string, state: string): void {
	const from = join(main, MEMORY);
	if (!isDirectory(from)) return;
	const to = join(state, MEMORY);
	// force is spelled out: on Linux, Bun 1.3.14, which builds the released
	// binaries, leaves an existing file in place under verbatimSymlinks without it.
	cpSync(from, to, { recursive: true, verbatimSymlinks: true, force: true });
	const copy = snapshot(to);
	for (const [path, bytes] of snapshot(from)) {
		if (copy.get(path) !== bytes) throw new Error(`the copy of ${join(from, path)} did not verify`);
	}
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
	const fetched = refExists(main, `refs/heads/${STATE_BRANCH}`) ? null : remoteStateRef(main);
	if (fetched) {
		// A clone of a project whose state branch was pushed (CF-201): the board
		// and the memory are on that branch alone, so it is made the local one,
		// from the fetch remote only. A local branch is never replaced from here.
		const at = must(main, ["rev-parse", "--verify", `${fetched.ref}^{commit}`]);
		must(main, ["branch", "--no-track", STATE_BRANCH, at]);
		logBoardNote(
			`adopted ${STATE_BRANCH} from ${fetched.remote} at ${at.slice(0, 7)}, the remote the default branch is fetched from`,
		);
		writeExcludeAfterAdoption(main);
	}
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
		carryMemory(main, state);
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
 * main checkout at once. A move lock another process holds past `lockWaitMs`
 * also answers the main checkout, recording nothing, so the next use tries
 * again. Throws "no board here" when there is no board at all.
 */
export function ensureStateWorktree(main: string, options: { retry?: boolean; lockWaitMs?: number } = {}): BoardHome {
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
	const hasBranch = refExists(main, `refs/heads/${STATE_BRANCH}`) || remoteStateRef(main) !== null;
	if (!isDirectory(join(main, BOARD)) && !hasBranch) throw noBoard(main);
	if (!hasBranch && defaultBase(main) === null) {
		// A repository with no commit yet, as /init leaves a new one. Not a
		// failure: the first board use after the first commit makes the move.
		return fallback("the repository has no commit yet, so the board stays in the main checkout until there is one");
	}
	let release: () => void;
	try {
		release = acquireLock(common, options.lockWaitMs ?? LOCK_WAIT_MS);
	} catch (error) {
		if (!(error instanceof LockTimeout)) throw error;
		// Not a failed move, so no marker: the holder is still moving, and the
		// next board use finds its result or takes the lock itself.
		logBoardNote(
			`board migration not attempted: ${error.message}. This process uses the board at ${join(main, BOARD)}; the next board use tries again.`,
		);
		return fallback(error.message);
	}
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
		schedulePush(main);
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
