// The flush: the state branch's board and memory changes, landed on the
// default branch as one commit and pushed (CF-183.3).
//
// Between releases every board write commits on the state branch, in the
// state worktree (state-worktree.ts), and nothing reaches the default branch.
// After a release tag is pushed, the flush builds one commit on the remote's
// default branch tip that carries every change the state branch made under
// FLUSH_PATHS since its base, pushes it as a fast-forward, and resets the state
// branch to it, so the next flush carries only what came after.
//
// How the commit is built: a three-way at file level, never a patch. The base
// is the merge base of the state branch and the fetched tip, or the state
// commit the last flush recorded when the state branch was not reset onto it.
// A path the state branch changed since the base takes the state branch's
// version; every other path keeps the tip's, so a product change, or a memory
// note or card edit that rode a feature pull request, is kept rather than
// reverted. Built in a scratch index, so no checkout is touched to make it.
//
// What it never does: force-push, rewrite or merge into the default branch, or
// touch a tag. A push the remote rejects because its tip moved is a race: it
// fetches again and rebuilds on the new tip, up to FLUSH_ATTEMPTS times.
//
// Concurrency: the fetch, build and push run under `flush.lock`, one flush at
// a time, and board commits go on meanwhile. Restarting the state branch runs
// under `board.lock`, which every board commit takes (git/operations.ts): it
// reads the state branch's head, carries every board commit made since the
// flush read its tip onto the flush commit, and resets, so none is lost or
// flushed twice. That step is local and takes milliseconds, so the board
// lock is never held across the push and its pre-push hooks. A write on disk
// that has not committed yet survives too: `reset --keep` keeps local changes,
// and refuses rather than overwrite one.
//
// The main checkout's `.boards/` holds copies the move left there. Once the
// flush has landed, a copy whose bytes match the flush commit's is cleared, so
// pulling the default branch puts the same bytes back; anything else is
// reported and left where it is. Then a main checkout with the default branch
// out and no uncommitted change is fast-forwarded to the flush commit.
import { existsSync, rmSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import {
	acquireLock,
	commonDirOf,
	ensureStateWorktree,
	LockTimeout,
	STATE_BRANCH,
	stateWorktreeOf,
	touchLock,
} from "./state-worktree.ts";

/** What a flush carries: the board, and every agent's memory once it lives on the state branch. */
export const FLUSH_PATHS = [".boards", join(".claude", "agent-memory")];
/** The subject of a flush made with no tag. */
export const FLUSH_SUBJECT_UNTAGGED = "Board and memory flush";
/** The lock every board commit takes, and the flush takes to restart the state branch. */
export const BOARD_LOCK = "board.lock";
/**
 * How long a board commit waits for it. Each holder keeps it for milliseconds,
 * and this stays under SubagentStart's 20 s hook timeout, so a commit that
 * cannot get it fails with a logged reason rather than being killed.
 */
export const BOARD_LOCK_WAIT_MS = 15_000;
/** One flush at a time; held across the push, and never by a board commit. */
export const FLUSH_LOCK = "flush.lock";
const FLUSH_LOCK_WAIT_MS = 60_000;
/** Where the state branch's tip before each flush is kept, under the flush commit's id. Never pushed. */
export const FLUSHED_REFS = "refs/coder-fleet/flushed";
/** Pushes tried before a flush that keeps losing the race gives up. */
export const FLUSH_ATTEMPTS = 5;

const FOCUS_EXCLUDE = ":(exclude).boards/.focus";
const NO_BLOB = "0000000000000000000000000000000000000000";

export function flushSubject(tag?: string): string {
	return tag ? `Board and memory at ${tag}` : FLUSH_SUBJECT_UNTAGGED;
}

export interface FlushResult {
	/** The flush commit, or null when there was nothing to flush. */
	commit: string | null;
	subject: string;
	/** The default branch, as `<remote>/<branch>`. */
	target: string;
	/** Pushes it took. */
	attempts: number;
	/** Why the state branch was not reset to the flush commit, when it was not. */
	rebaseError?: string;
	/** Main-checkout leftovers cleared because they match the flush. */
	cleared: string[];
	/** Main-checkout leftovers that differ from the flush, left in place. */
	kept: string[];
	/** Whether the main checkout was fast-forwarded to the flush, and why not. */
	mainCheckout?: string;
}

export interface FlushOptions {
	tag?: string;
	by?: string;
	remote?: string;
	attempts?: number;
	lockWaitMs?: number;
}

interface Run {
	code: number;
	out: string;
	err: string;
}

function git(cwd: string, args: string[], opts: { env?: Record<string, string>; input?: string } = {}): Run {
	const p = Bun.spawnSync(["git", "-C", cwd, ...args], {
		stdout: "pipe",
		stderr: "pipe",
		stdin: opts.input === undefined ? "ignore" : new TextEncoder().encode(opts.input),
		env: { ...process.env, ...opts.env },
	});
	return { code: p.exitCode, out: p.stdout.toString().replace(/\n$/, ""), err: p.stderr.toString().trim() };
}

function must(cwd: string, args: string[], opts: { env?: Record<string, string>; input?: string } = {}): string {
	const r = git(cwd, args, opts);
	if (r.code !== 0) throw new Error(`git ${args.join(" ")}: ${r.err || r.out || `exit ${r.code}`}`);
	return r.out.trim();
}

/** The remote's default branch: its HEAD as last recorded, else as the remote says now. */
function defaultBranch(main: string, remote: string): string {
	const sym = git(main, ["symbolic-ref", "-q", `refs/remotes/${remote}/HEAD`]);
	if (sym.code === 0 && sym.out) return sym.out.trim().replace(`refs/remotes/${remote}/`, "");
	const ls = git(main, ["ls-remote", "--symref", remote, "HEAD"]);
	const m = ls.out.match(/^ref: refs\/heads\/(\S+)\tHEAD$/m);
	if (ls.code === 0 && m?.[1]) return m[1];
	throw new Error(
		`cannot tell ${remote}'s default branch: ${ls.err || "it names none"}; run git remote set-head ${remote} --auto`,
	);
}

function fetchTip(main: string, remote: string, branch: string): string {
	must(main, ["fetch", "-q", "--no-tags", remote, `+refs/heads/${branch}:refs/remotes/${remote}/${branch}`]);
	return must(main, ["rev-parse", "--verify", `refs/remotes/${remote}/${branch}^{commit}`]);
}

/** The tree of `tip` with every FLUSH_PATHS path the state branch changed since `base` set to the state branch's version. */
function buildTree(main: string, common: string, base: string, tip: string, stateTip: string): string {
	const index = join(common, "coder-fleet", `flush-index-${process.pid}`);
	const env = { GIT_INDEX_FILE: index };
	try {
		must(main, ["read-tree", tip], { env });
		const diff = must(main, [
			"diff",
			"--name-status",
			"--no-renames",
			"-z",
			base,
			stateTip,
			"--",
			...FLUSH_PATHS,
			FOCUS_EXCLUDE,
		]);
		const fields = diff.split("\0").filter((f) => f.length > 0);
		if (fields.length > 0) {
			const listed = new Map<string, string>();
			for (const line of must(main, ["ls-tree", "-r", "-z", stateTip, "--", ...FLUSH_PATHS]).split("\0")) {
				const tab = line.indexOf("\t");
				if (tab < 0) continue;
				const [mode, , sha] = line.slice(0, tab).split(" ");
				listed.set(line.slice(tab + 1), `${mode} ${sha}`);
			}
			let input = "";
			for (let i = 0; i + 1 < fields.length; i += 2) {
				const path = fields[i + 1] as string;
				input += `${listed.get(path) ?? `0 ${NO_BLOB}`}\t${path}\0`;
			}
			must(main, ["update-index", "-z", "--index-info"], { env, input });
		}
		return must(main, ["write-tree"], { env });
	} finally {
		rmSync(index, { force: true });
		rmSync(`${index}.lock`, { force: true });
	}
}

/** The flush commit's blob at `path`, or null when it has none. */
function blobAt(main: string, commit: string, path: string): string | null {
	const r = git(main, ["rev-parse", "-q", "--verify", `${commit}:${path}`]);
	return r.code === 0 && r.out ? r.out.trim() : null;
}

/** Clears main-checkout leftovers under .boards whose bytes, or absence, match `commit`; returns what it cleared and kept. */
function clearLeftovers(main: string, commit: string): { cleared: string[]; kept: string[] } {
	const cleared: string[] = [];
	const kept: string[] = [];
	const status = git(main, ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--", ".boards", FOCUS_EXCLUDE]);
	if (status.code !== 0) return { cleared, kept };
	const fields = status.out.split("\0").filter((f) => f.length > 0);
	for (let i = 0; i < fields.length; i++) {
		const entry = fields[i] as string;
		const xy = entry.slice(0, 2);
		const path = entry.slice(3);
		// A rename's second field is its old path, which stays as HEAD has it.
		if (xy.includes("R") || xy.includes("C")) i++;
		const file = join(main, path);
		const disk = existsSync(file) ? git(main, ["hash-object", "--", path]).out.trim() : null;
		if (disk !== blobAt(main, commit, path)) {
			kept.push(path);
			continue;
		}
		if (blobAt(main, "HEAD", path) !== null) must(main, ["checkout", "-q", "HEAD", "--", path]);
		else {
			git(main, ["rm", "-q", "--cached", "--ignore-unmatch", "--", path]);
			if (existsSync(file)) unlinkSync(file);
		}
		cleared.push(path);
	}
	return { cleared, kept };
}

/**
 * Where the changes to carry start: the merge base of the state branch and the
 * tip, or, when the newest flush on the tip names a state commit that is an
 * ancestor of the state branch and newer than that merge base, that commit. The
 * second is a flush the state branch was not reset onto: its changes are on the
 * tip already, and carrying them again from the older merge base would undo
 * whatever reached the default branch since, such as a pull request's card edit.
 */
function changesSince(main: string, stateTip: string, tip: string): { from: string; mergeBase: string } {
	const mergeBase = must(main, ["merge-base", stateTip, tip]);
	const flush = git(main, [
		"log",
		"--first-parent",
		"-1",
		"--format=%B",
		"-E",
		"--all-match",
		"--grep=^Board and memory (at |flush$)",
		`--grep=^From ${STATE_BRANCH} at [0-9a-f]+\\.$`,
		tip,
	]);
	const recorded = flush.out.match(new RegExp(`^From ${STATE_BRANCH} at ([0-9a-f]{40})\\.$`, "m"))?.[1];
	if (
		recorded &&
		git(main, ["cat-file", "-e", `${recorded}^{commit}`]).code === 0 &&
		git(main, ["merge-base", "--is-ancestor", recorded, stateTip]).code === 0 &&
		git(main, ["merge-base", "--is-ancestor", mergeBase, recorded]).code === 0
	) {
		return { from: recorded, mergeBase };
	}
	return { from: mergeBase, mergeBase };
}

/** Paths outside FLUSH_PATHS that differ between `from` and `to`, or "". */
function outsideFlushPaths(main: string, from: string, to: string): string {
	return must(main, ["diff", "--name-only", from, to, "--", ".", ...FLUSH_PATHS.map((p) => `:(exclude)${p}`)]);
}

/**
 * Starts the state branch again from `commit`, carrying across every board
 * commit made on it since `stateTip`, each with its own message and author, so
 * a write made while the flush pushed is neither lost nor flushed twice. Held
 * under the board lock, which every board commit takes, from reading the state
 * branch's head to the reset; it is local and quick, so a board commit waits
 * for it only briefly. Returns why it did not, or null.
 */
function restartState(
	main: string,
	common: string,
	state: string,
	mergeBase: string,
	stateTip: string,
	commit: string,
	lockWaitMs: number,
): string | null {
	const other = outsideFlushPaths(main, mergeBase, stateTip);
	if (other) {
		return `${STATE_BRANCH} carries changes outside ${FLUSH_PATHS.join(" and ")} (${other.split("\n")[0]}), so it was left at ${stateTip.slice(0, 7)}`;
	}
	let release: () => void;
	try {
		release = acquireLock(common, lockWaitMs, BOARD_LOCK, "committing to the board");
	} catch (error) {
		return error instanceof Error ? error.message : String(error);
	}
	try {
		if (git(state, ["symbolic-ref", "-q", "HEAD"]).out.trim() !== `refs/heads/${STATE_BRANCH}`) {
			return `${state} does not have ${STATE_BRANCH} out, so it was left as it is`;
		}
		const head = must(state, ["rev-parse", "--verify", "HEAD"]);
		if (git(main, ["merge-base", "--is-ancestor", stateTip, head]).code !== 0) {
			return `${STATE_BRANCH} was rewritten during the flush, from ${stateTip.slice(0, 7)} to ${head.slice(0, 7)}, so it was left there`;
		}
		let onto = commit;
		const since = must(main, ["rev-list", "--reverse", "--parents", `${stateTip}..${head}`]);
		for (const line of since ? since.split("\n") : []) {
			const [sha, ...parents] = line.split(" ") as [string, ...string[]];
			if (parents.length !== 1 || outsideFlushPaths(main, parents[0] as string, sha)) {
				return `${STATE_BRANCH} gained ${sha.slice(0, 7)} during the flush, which is not a board commit, so it was left at ${head.slice(0, 7)}`;
			}
			const tree = buildTree(main, common, parents[0] as string, onto, sha);
			const [name, email, date] = must(main, ["log", "-1", "--format=%an%x00%ae%x00%ad", "--date=raw", sha]).split("\0");
			const message = git(main, ["log", "-1", "--format=%B", sha]).out;
			onto = must(main, ["commit-tree", tree, "-p", onto, "-F", "-"], {
				input: message,
				env: { GIT_AUTHOR_NAME: name ?? "", GIT_AUTHOR_EMAIL: email ?? "", GIT_AUTHOR_DATE: date ?? "" },
			});
		}
		// The reset leaves each write's own commit on no branch; this local ref
		// keeps it, so `git log --glob=refs/coder-fleet/flushed/*` is still an
		// item's history and gc never drops it.
		must(main, ["update-ref", `${FLUSHED_REFS}/${commit}`, head]);
		const reset = git(state, ["reset", "-q", "--keep", onto]);
		if (reset.code !== 0) {
			return `${state} could not move to ${onto.slice(0, 7)} without overwriting an uncommitted board write (${reset.err}), so ${STATE_BRANCH} was left at ${head.slice(0, 7)}`;
		}
		return null;
	} finally {
		release();
	}
}

/** Fast-forwards the main checkout to `commit` when it has `branch` out and is clean; says what it did. */
function fastForwardMain(main: string, branch: string, commit: string): string {
	const short = commit.slice(0, 7);
	const head = git(main, ["symbolic-ref", "-q", "--short", "HEAD"]).out.trim();
	if (head !== branch) {
		return `${main} not fast-forwarded: it has ${head || "a detached HEAD"} out, not ${branch}; pull ${branch} there to see the flushed board`;
	}
	if (git(main, ["status", "--porcelain", "--untracked-files=no"]).out.trim()) {
		return `${main} not fast-forwarded: it has uncommitted changes; pull ${branch} once they are dealt with`;
	}
	const merge = git(main, ["merge", "-q", "--ff-only", commit]);
	if (merge.code !== 0) return `${main} not fast-forwarded: ${merge.err || `exit ${merge.code}`}; pull ${branch} by hand`;
	return `fast-forwarded ${branch} in ${main} to ${short}`;
}

/**
 * Lands the state branch's changes since the last flush on the default branch
 * of the repository whose main checkout is `main`, as one commit, and pushes
 * it. Throws, having pushed nothing, when the board has not moved, the tag is
 * not on the remote, another flush holds on or the race is lost every attempt.
 */
export function flushState(main: string, options: FlushOptions = {}): FlushResult {
	const remote = options.remote ?? "origin";
	const subject = flushSubject(options.tag);
	const home = ensureStateWorktree(main);
	if (!home.moved) throw new Error(`the board has not moved to its state worktree, so there is nothing to flush: ${home.reason}`);
	const state = stateWorktreeOf(main);
	if (git(main, ["remote", "get-url", remote]).code !== 0) throw new Error(`no remote ${remote} to flush to`);
	if (options.tag) {
		const ls = git(main, ["ls-remote", "--tags", remote, `refs/tags/${options.tag}`]);
		if (ls.code !== 0 || !ls.out.trim()) {
			throw new Error(`tag ${options.tag} is not on ${remote}; push the release tag first, then flush`);
		}
	}
	const branch = defaultBranch(main, remote);
	const target = `${remote}/${branch}`;
	const common = commonDirOf(main);
	const lockWaitMs = options.lockWaitMs ?? BOARD_LOCK_WAIT_MS;
	// One flush at a time. Board commits never wait on this lock: the push,
	// which runs the repository's pre-push hooks and can take as long as they
	// do, happens under it alone.
	let release: () => void;
	try {
		release = acquireLock(common, FLUSH_LOCK_WAIT_MS, FLUSH_LOCK, "flushing the board");
	} catch (error) {
		if (error instanceof LockTimeout) throw new Error(`flush not started: ${error.message}`);
		throw error;
	}
	try {
		const stateTip = must(main, ["rev-parse", "--verify", `refs/heads/${STATE_BRANCH}^{commit}`]);
		const attempts = options.attempts ?? FLUSH_ATTEMPTS;
		let commit = "";
		let mergeBase = "";
		let pushes = 0;
		let tip = fetchTip(main, remote, branch);
		touchLock(common, FLUSH_LOCK);
		for (let attempt = 1; ; attempt++) {
			const since = changesSince(main, stateTip, tip);
			mergeBase = since.mergeBase;
			const tree = buildTree(main, common, since.from, tip, stateTip);
			if (tree === must(main, ["rev-parse", `${tip}^{tree}`])) {
				return { commit: null, subject, target, attempts: pushes, cleared: [], kept: [] };
			}
			const message = ["-m", subject, "-m", `From ${STATE_BRANCH} at ${stateTip}.`];
			message.push("-m", `Board-Writer: ${options.by?.trim() || "flush"}`);
			commit = must(main, ["commit-tree", tree, "-p", tip, ...message]);
			const push = git(main, ["push", "-q", remote, `${commit}:refs/heads/${branch}`]);
			pushes++;
			touchLock(common, FLUSH_LOCK);
			if (push.code === 0) {
				must(main, ["update-ref", `refs/remotes/${remote}/${branch}`, commit]);
				break;
			}
			const moved = fetchTip(main, remote, branch);
			touchLock(common, FLUSH_LOCK);
			if (moved === tip) throw new Error(`push to ${target} failed: ${push.err || `exit ${push.code}`}`);
			if (attempt >= attempts) {
				throw new Error(
					`${target} moved during each of ${attempts} pushes, so nothing was flushed; flush again once it is quiet`,
				);
			}
			tip = moved;
		}
		const result: FlushResult = { commit, subject, target, attempts: pushes, cleared: [], kept: [] };
		const why = restartState(main, common, state, mergeBase, stateTip, commit, lockWaitMs);
		if (why) result.rebaseError = why;
		const leftovers = clearLeftovers(main, commit);
		result.cleared = leftovers.cleared;
		result.kept = leftovers.kept;
		result.mainCheckout = fastForwardMain(main, branch, commit);
		return result;
	} finally {
		release();
	}
}
