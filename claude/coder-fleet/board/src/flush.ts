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
// What it leaves out (CF-188): every .boards change while the live board's
// auto_commit is not true, and every path the tip's .gitignore files ignore,
// the board and memory judged apart. Those stay on the state branch, in one
// commit on the flush commit, so the next flush judges them again. So does
// every file under FLUSH_PATHS the tip ignores and lacks, changed or not, so a
// default branch that untracked memory or the board deletes none of it from
// the state branch (CF-198). When the
// state branch cannot restart on that commit, HELD_REF keeps it instead, and
// the next flush judges its paths again too (CF-188.1).
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
// reported and left where it is. Its `.claude/agent-memory/` is cleared the
// same way, ignored files included because the memory hook excludes them, but
// all or nothing and only with the default branch out: a note there is an
// agent's live copy, so one that differs from the flush clears none and stops
// the fast-forward, which would overwrite an ignored file without asking.
// Then a main checkout with the default branch out and no uncommitted change is
// fast-forwarded to the flush commit.
import { existsSync, lstatSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	acquireLock,
	autoCommitOn,
	commonDirOf,
	ensureStateWorktree,
	LockTimeout,
	pushNow,
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
/**
 * The carry commit of a flush whose restart failed, so the state branch never
 * got it: its paths are what that flush held back, which the next flush judges
 * again whatever its start. Local, never pushed; gone once a restart succeeds.
 */
export const HELD_REF = "refs/coder-fleet/held";
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
	/** Changes left on the state branch rather than landed: the board with auto_commit off, and paths the default branch ignores. */
	skipped: FlushSkip[];
	/** The commit the state branch restarted from, when it is not the flush commit: one on it that keeps the skipped changes. */
	stateStart?: string;
	/** Set in a project that excludes the board (CF-201): the one line saying nothing landed, and what the push of the state branch did. */
	excluded?: string;
}

/**
 * True when the common git dir's info/exclude lists the board, as
 * scripts/fleet-exclude.py writes it for /init (CF-201). Such a project keeps
 * the board and the memory out of its own history: the state branch is their
 * home, and a flush lands nothing on the default branch.
 */
export function boardExcluded(main: string): boolean {
	let text = "";
	try {
		text = readFileSync(join(commonDirOf(main), "info", "exclude"), "utf8");
	} catch {
		return false;
	}
	return text.split(/\r?\n/).some((line) => line.trim() === "/.boards/" || line.trim() === ".boards/");
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

/**
 * The paths among `paths` that the `.gitignore` files on `tip` ignore. Matched
 * by git itself: every `.gitignore` on `tip` in a directory above one of the
 * paths is written into an empty scratch repository, and `check-ignore
 * --no-index` asks it. The main checkout's working copy, its info/exclude
 * (where the memory hook excludes memory in every checkout) and the global
 * excludes file play no part; the rules are the default branch's as they stand.
 */
function ignoredAt(main: string, common: string, tip: string, paths: string[]): Set<string> {
	const ignored = new Set<string>();
	if (paths.length === 0) return ignored;
	const dirs = new Set<string>([""]);
	for (const path of paths) {
		const parts = path.split("/");
		for (let i = 1; i < parts.length; i++) dirs.add(`${parts.slice(0, i).join("/")}/`);
	}
	const candidates = [...dirs].map((d) => `${d}.gitignore`);
	const listed = must(main, ["ls-tree", "-z", tip, "--", ...candidates]);
	const scratch = join(common, "coder-fleet", `flush-ignore-${process.pid}`);
	rmSync(scratch, { recursive: true, force: true });
	try {
		mkdirSync(scratch, { recursive: true });
		const env = { GIT_DIR: join(scratch, ".git"), GIT_WORK_TREE: scratch };
		must(scratch, ["init", "-q", "--template="], { env });
		for (const line of listed.split("\0")) {
			const tab = line.indexOf("\t");
			if (tab < 0) continue;
			const [mode, type, sha] = line.slice(0, tab).split(" ");
			// A symlinked .gitignore is not read by git from a working tree either.
			if (type !== "blob" || mode === "120000") continue;
			const file = join(scratch, line.slice(tab + 1));
			mkdirSync(join(file, ".."), { recursive: true });
			const blob = git(main, ["cat-file", "blob", sha as string]);
			if (blob.code !== 0) throw new Error(`git cat-file blob ${sha}: ${blob.err || `exit ${blob.code}`}`);
			writeFileSync(file, `${blob.out}\n`);
		}
		const r = git(
			scratch,
			["-c", `core.excludesFile=${join(scratch, "no-excludes")}`, "check-ignore", "--no-index", "-z", "--stdin"],
			{ env, input: `${paths.join("\0")}\0` },
		);
		if (r.code > 1) throw new Error(`git check-ignore against ${tip.slice(0, 7)}: ${r.err || `exit ${r.code}`}`);
		for (const path of r.out.split("\0")) if (path) ignored.add(path);
		return ignored;
	} finally {
		rmSync(scratch, { recursive: true, force: true });
	}
}

/** Changes a flush left on the state branch rather than land, and why. */
export interface FlushSkip {
	/** The FLUSH_PATHS root the paths are under, with `/` separators. */
	root: string;
	reason: string;
	paths: string[];
}

export const SKIP_BOARD_OFF = "auto_commit is not true in the live board's config";
export const SKIP_IGNORED = "the default branch's .gitignore ignores them";

/** What of `paths` the flush onto `tip` must not land: the board when auto_commit is off, and anything the tip ignores, each root judged apart. */
function skipsFor(main: string, common: string, tip: string, paths: string[], boardOn: boolean): FlushSkip[] {
	const roots = FLUSH_PATHS.map((p) => p.split("\\").join("/"));
	const board = roots[0] as string;
	const off = boardOn ? [] : paths.filter((p) => p.startsWith(`${board}/`));
	const ignored = ignoredAt(
		main,
		common,
		tip,
		paths.filter((p) => !off.includes(p)),
	);
	const skips: FlushSkip[] = [];
	if (off.length > 0) skips.push({ root: board, reason: SKIP_BOARD_OFF, paths: off });
	for (const root of roots) {
		const hit = paths.filter((p) => p.startsWith(`${root}/`) && ignored.has(p));
		if (hit.length > 0) skips.push({ root, reason: SKIP_IGNORED, paths: hit });
	}
	return skips;
}

/** What the carry at HELD_REF put back on its flush commit, or nothing when there is none. */
function heldBefore(main: string): string[] {
	const r = git(main, ["diff", "--name-only", "--no-renames", "-z", `${HELD_REF}^`, HELD_REF, "--", ...FLUSH_PATHS]);
	return r.code === 0 ? r.out.split("\0").filter((p) => p.length > 0) : [];
}

/**
 * The tree of `tip` with every FLUSH_PATHS path the state branch changed since
 * `base`, and every path in `also` the state branch has otherwise than `tip`,
 * set to the state branch's version, less whatever `skip` holds back.
 */
function buildTree(
	main: string,
	common: string,
	base: string,
	tip: string,
	stateTip: string,
	skip?: (paths: string[]) => FlushSkip[],
	also: string[] = [],
): { tree: string; skipped: FlushSkip[] } {
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
		let fields = diff.split("\0").filter((f) => f.length > 0);
		const changed: string[] = [];
		for (let i = 0; i + 1 < fields.length; i += 2) changed.push(fields[i + 1] as string);
		if (also.length > 0) {
			const differs = new Set(
				must(main, ["diff", "--name-only", "--no-renames", "-z", tip, stateTip, "--", ...FLUSH_PATHS]).split("\0"),
			);
			const seen = new Set(changed);
			for (const path of also) {
				if (seen.has(path) || !differs.has(path)) continue;
				seen.add(path);
				changed.push(path);
				fields.push("M", path);
			}
		}
		const skipped = skip && changed.length > 0 ? skip(changed) : [];
		if (skipped.length > 0) {
			const held = new Set(skipped.flatMap((s) => s.paths));
			const kept: string[] = [];
			for (let i = 0; i + 1 < fields.length; i += 2) {
				if (!held.has(fields[i + 1] as string)) kept.push(fields[i] as string, fields[i + 1] as string);
			}
			fields = kept;
		}
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
		return { tree: must(main, ["write-tree"], { env }), skipped };
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

/**
 * Clears main-checkout leftovers under .boards whose bytes, or absence, match
 * `commit`; returns what it cleared and kept. A path in `held` the flush left
 * out is neither: the state branch keeps it, and `commit` has the tip's copy.
 */
function clearLeftovers(main: string, commit: string, held: Set<string>): { cleared: string[]; kept: string[] } {
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
		if (held.has(path)) continue;
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
 * The main checkout's agent memory, as clearLeftovers treats .boards, with two
 * differences that come from the memory hook (hooks/memory-state.sh). Its
 * untracked notes are excluded through info/exclude, so they are listed with
 * the ignored files; and a note there is the agent's live copy until its stop
 * hook puts it back, so nothing is cleared unless every leftover matches the
 * flush and the main checkout has the default branch out, where the
 * fast-forward puts the same bytes straight back. One that differs is
 * reported, and clears nothing. A note in `held` the flush left out is left
 * out here too: the state branch keeps it, and the pull never touches it.
 */
function clearMemoryLeftovers(
	main: string,
	commit: string,
	branch: string,
	held: Set<string>,
): { cleared: string[]; kept: string[] } {
	const memory = FLUSH_PATHS[1] as string;
	const none = { cleared: [], kept: [] };
	if (git(main, ["symbolic-ref", "-q", "--short", "HEAD"]).out.trim() !== branch) return none;
	const status = git(main, [
		"status",
		"--porcelain=v1",
		"-z",
		"--untracked-files=all",
		"--ignored=traditional",
		"--",
		memory,
	]);
	if (status.code !== 0) return none;
	const paths: string[] = [];
	const fields = status.out.split("\0").filter((f) => f.length > 0);
	for (let i = 0; i < fields.length; i++) {
		const entry = fields[i] as string;
		const xy = entry.slice(0, 2);
		if (xy.includes("R") || xy.includes("C")) i++;
		const path = entry.slice(3);
		// A tracked note deleted here is the human's deletion, which the memory
		// hook never carries. It is no leftover to clear or compare: git itself
		// counts it an uncommitted change, and a pull would not overwrite it.
		if (xy.includes("D")) continue;
		if (!path.endsWith(".memory-tmp") && !held.has(path)) paths.push(path);
	}
	const kept: string[] = [];
	for (const path of paths) {
		const file = join(main, path);
		const link = existsSync(file) && lstatSync(file).isSymbolicLink();
		const disk = existsSync(file) ? git(main, ["hash-object", "--", path]).out.trim() : null;
		if (link || disk !== blobAt(main, commit, path)) kept.push(path);
	}
	if (kept.length > 0) return { cleared: [], kept };
	for (const path of paths) {
		const file = join(main, path);
		if (blobAt(main, "HEAD", path) !== null) must(main, ["checkout", "-q", "HEAD", "--", path]);
		else {
			git(main, ["rm", "-q", "--cached", "--ignore-unmatch", "--", path]);
			if (existsSync(file)) unlinkSync(file);
		}
	}
	return { cleared: paths, kept };
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
 * for it only briefly. `start` is `commit`, or the commit on it that keeps
 * what the flush skipped. Returns why it did not, or null.
 */
function restartState(
	main: string,
	common: string,
	state: string,
	mergeBase: string,
	stateTip: string,
	commit: string,
	start: string,
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
		let onto = start;
		const since = must(main, ["rev-list", "--reverse", "--parents", `${stateTip}..${head}`]);
		for (const line of since ? since.split("\n") : []) {
			const [sha, ...parents] = line.split(" ") as [string, ...string[]];
			if (parents.length !== 1 || outsideFlushPaths(main, parents[0] as string, sha)) {
				return `${STATE_BRANCH} gained ${sha.slice(0, 7)} during the flush, which is not a board commit, so it was left at ${head.slice(0, 7)}`;
			}
			const { tree } = buildTree(main, common, parents[0] as string, onto, sha);
			const [name, email, date] = must(main, ["log", "-1", "--format=%an%x00%ae%x00%ad", "--date=raw", sha]).split(
				"\0",
			);
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
function fastForwardMain(main: string, branch: string, commit: string, memoryKept: string[] = []): string {
	const short = commit.slice(0, 7);
	const head = git(main, ["symbolic-ref", "-q", "--short", "HEAD"]).out.trim();
	if (head !== branch) {
		return `${main} not fast-forwarded: it has ${head || "a detached HEAD"} out, not ${branch}; pull ${branch} there to see the flushed board`;
	}
	// An excluded memory note is an ignored file, which a merge overwrites
	// without asking, so one the flush does not match stops the fast-forward.
	if (memoryKept.length > 0) {
		return `${main} not fast-forwarded: agent memory there differs from the flush (${memoryKept[0]}), and a pull would overwrite it; carry it to the state branch or set it aside, then pull ${branch}`;
	}
	if (git(main, ["status", "--porcelain", "--untracked-files=no"]).out.trim()) {
		return `${main} not fast-forwarded: it has uncommitted changes; pull ${branch} once they are dealt with`;
	}
	const merge = git(main, ["merge", "-q", "--ff-only", commit]);
	if (merge.code !== 0)
		return `${main} not fast-forwarded: ${merge.err || `exit ${merge.code}`}; pull ${branch} by hand`;
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
	if (!home.moved)
		throw new Error(`the board has not moved to its state worktree, so there is nothing to flush: ${home.reason}`);
	const state = stateWorktreeOf(main);
	if (boardExcluded(main)) {
		let target = "the default branch";
		try {
			target = defaultBranch(main, remote);
		} catch {
			// No remote, or none that names its default: the line says the default branch.
		}
		const excluded = `nothing lands on ${target}: this project keeps the board and memory out of its history (info/exclude), so they stay on ${STATE_BRANCH}; ${pushNow(main)}`;
		return { commit: null, subject, target, attempts: 0, cleared: [], kept: [], skipped: [], excluded };
	}
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
		// Read once: the live board's config, which a board write never commits past.
		const boardOn = autoCommitOn(state);
		const before = heldBefore(main);
		let commit = "";
		let mergeBase = "";
		let from = "";
		let skipped: FlushSkip[] = [];
		let pushes = 0;
		let tip = fetchTip(main, remote, branch);
		touchLock(common, FLUSH_LOCK);
		for (let attempt = 1; ; attempt++) {
			const since = changesSince(main, stateTip, tip);
			mergeBase = since.mergeBase;
			from = since.from;
			const onTip = tip;
			const built = buildTree(
				main,
				common,
				from,
				tip,
				stateTip,
				(paths) => skipsFor(main, common, onTip, paths, boardOn),
				before,
			);
			const tree = built.tree;
			skipped = built.skipped;
			if (tree === must(main, ["rev-parse", `${tip}^{tree}`])) {
				return { commit: null, subject, target, attempts: pushes, cleared: [], kept: [], skipped };
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
		const result: FlushResult = { commit, subject, target, attempts: pushes, cleared: [], kept: [], skipped };
		// What the flush skipped stays on the state branch, in one commit on the
		// flush commit, so the next flush judges it again rather than losing it.
		// So does every file the state branch has that the flush commit lacks
		// because the tip ignores it and untracked it (CF-198): the tip's absence
		// of a path it ignores is no deletion, and the state branch is its only home.
		const untracked = [
			...ignoredAt(
				main,
				common,
				tip,
				must(main, [
					"diff",
					"--name-only",
					"--no-renames",
					"--diff-filter=A",
					"-z",
					commit,
					stateTip,
					"--",
					...FLUSH_PATHS,
					FOCUS_EXCLUDE,
				])
					.split("\0")
					.filter((p) => p.length > 0),
			),
		];
		let start = commit;
		if (skipped.length > 0 || untracked.length > 0) {
			const whole = buildTree(main, common, from, tip, stateTip, undefined, [...before, ...untracked]).tree;
			if (whole !== must(main, ["rev-parse", `${commit}^{tree}`])) {
				start = must(main, [
					"commit-tree",
					whole,
					"-p",
					commit,
					"-m",
					"Keep what the flush did not land",
					"-m",
					"Board-Writer: flush",
				]);
			}
		}
		const why = restartState(main, common, state, mergeBase, stateTip, commit, start, lockWaitMs);
		if (why) result.rebaseError = why;
		else if (start !== commit) result.stateStart = start;
		// The flush commit records stateTip as the next start, which is right
		// once the state branch holds the carry. When the restart failed it does
		// not, so the carry is kept where the next flush finds it.
		if (why && start !== commit) must(main, ["update-ref", HELD_REF, start]);
		else git(main, ["update-ref", "-d", HELD_REF]);
		const held = new Set(skipped.flatMap((s) => s.paths));
		const leftovers = clearLeftovers(main, commit, held);
		const memory = clearMemoryLeftovers(main, commit, branch, held);
		result.cleared = [...leftovers.cleared, ...memory.cleared];
		result.kept = [...leftovers.kept, ...memory.kept];
		result.mainCheckout = fastForwardMain(main, branch, commit, memory.kept);
		return result;
	} finally {
		release();
	}
}
