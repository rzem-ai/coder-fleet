import { spawn } from "node:child_process";
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { type Board, boardAt } from "./board.ts";
import { cardExists, idPattern, readCard } from "./cards.ts";
import { addComment } from "./comments.ts";
import { appendEvent, type LoggedEvent, readEvents } from "./events.ts";
import { alive, withLock } from "./lock.ts";
import { MoveRefused, moveCard, returnFromBlock } from "./moves.ts";
import { type Env, privateStateDir } from "./paths.ts";

// The test gate. A release names its cards on one line of its annotated tag's
// message, `Cards: XY-1, XY-2`. Once the tag is on the origin remote, the
// project's test command, set as `test:` in the board's config.yml, runs
// against the tagged commit, and when it passes the named cards in Done move
// to Released. A failed run moves them to Blocked with the run's output as a
// comment. A card named but not in Done stays where it is, and the release's
// result says so; a card in Blocked returns to the column it was blocked from
// when a later release naming it passes.
//
// Everything a release does is in the event trail:
//   release-started   a tag claimed: its name, tag object, commit, cards, and
//                     the run it waits on (`run`), if any
//   test-run-started  a run's process started, with its pid and log
//   test-run          a run's result, `passed` or `failed`, for its commit
//   release-finished  what the release moved and what stayed, and why
// A tag is processed once: its tag object in a release-started line marks it.
// A run's id is its release's id, and its log is test-runs/<id>.log.

// Repository variables a hook may inherit from git. The run's git commands
// and its test command must never see them, or they would act on another
// repository than the one named.
const REPO_VARS = ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES", "GIT_COMMON_DIR", "GIT_NAMESPACE", "GIT_PREFIX"];

export function cleanEnv(env: Env): Record<string, string> {
	const out: Record<string, string> = {};
	for (const [k, v] of Object.entries(env)) if (v !== undefined && !REPO_VARS.includes(k)) out[k] = v;
	return out;
}

function git(cwd: string, env: Env, args: string[], opts: { input?: string; timeout?: number } = {}): { ok: boolean; out: Buffer; err: string } {
	const p = Bun.spawnSync(["git", "-C", cwd, ...args], {
		env: { ...cleanEnv(env), GIT_TERMINAL_PROMPT: "0" },
		stdin: opts.input === undefined ? "ignore" : new TextEncoder().encode(opts.input),
		stdout: "pipe",
		stderr: "pipe",
		...(opts.timeout ? { timeout: opts.timeout } : {}),
	});
	return { ok: p.exitCode === 0, out: p.stdout, err: p.stderr.toString().trim() };
}

// The card ids on a message's `Cards:` line, upper-cased, or null when it has
// no such line.
export function cardsLine(message: string): string[] | null {
	const m = /^Cards:[ \t]*(.*?)[ \t]*$/m.exec(message.replace(/\r/g, ""));
	if (!m) return null;
	return (m[1] ?? "")
		.split(",")
		.map((s) => s.trim().toUpperCase())
		.filter(Boolean);
}

// The project's test command, from config.yml now, so an edit counts at once.
export function testCommand(board: Board): string | null {
	const cfg = Bun.YAML.parse(readFileSync(board.paths.config, "utf8")) as Record<string, unknown> | null;
	const t = cfg?.test;
	return typeof t === "string" && t.trim() ? t : null;
}

export function logPath(board: Board, release: string): string {
	return join(board.paths.testRuns, `${release}.log`);
}

// Where a run's temporary worktree is cut: under the user's private state
// directory (privateStateDir in src/paths.ts, 0700, refused when it is a
// symlink or another user's), never in a shared temporary directory another
// user could plant first, and never in the repo or its .claude/worktrees.
export function runDir(board: Board, release: string, env: Env = process.env): string {
	const runs = join(privateStateDir(env), "runs");
	mkdirSync(runs, { recursive: true, mode: 0o700 });
	return join(runs, `${board.config.prefix}-${release}`);
}

// The local base branch: the branch origin's HEAD names, else main, else
// master. Null when the repo has none of them.
function baseBranch(cwd: string, env: Env): string | null {
	const head = git(cwd, env, ["symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"]).out.toString().trim();
	const names = [head.startsWith("refs/remotes/origin/") ? head.slice("refs/remotes/origin/".length) : "", "main", "master"].filter(Boolean);
	return names.find((b) => git(cwd, env, ["rev-parse", "--verify", "--quiet", `refs/heads/${b}`]).ok) ?? null;
}

function onBase(cwd: string, env: Env, commit: string, base: string): boolean {
	return git(cwd, env, ["merge-base", "--is-ancestor", commit, `refs/heads/${base}`]).ok;
}

function releasesLock(board: Board): string {
	return join(board.paths.locks, "releases.lock");
}

function newReleaseId(): string {
	const t = new Date().toISOString().replace(/[-:]/g, "").replace(/\..*$/, "");
	return `${t}-${Math.random().toString(36).slice(2, 6)}`;
}

interface PushedTag {
	tag: string;
	object: string; // the tag object, or the commit for a lightweight tag
	commit: string; // the commit it names
}

// The annotated tags this repository holds, with the commit each names.
function localTags(cwd: string, env: Env): PushedTag[] {
	const r = git(cwd, env, ["for-each-ref", "refs/tags", "--format=%(objectname)%09%(objecttype)%09%(*objectname)%09%(refname:strip=2)"]);
	if (!r.ok) return [];
	return r.out
		.toString()
		.split("\n")
		.map((l) => l.split("\t"))
		.filter(([object, type, commit, tag]) => object && type === "tag" && commit && tag)
		.map(([object, , commit, tag]) => ({ tag: tag as string, object: object as string, commit: commit as string }));
}

// The objects origin's tags point at, by asking it with `git ls-remote
// --tags`. Null when there is no origin or it cannot be reached.
function remoteTagObjects(cwd: string, env: Env): Set<string> | null {
	const r = git(cwd, env, ["ls-remote", "--tags", "origin"], { timeout: 15_000 });
	if (!r.ok) return null;
	return new Set(
		r.out
			.toString()
			.split("\n")
			.map((l) => l.split("\t")[0] ?? "")
			.filter(Boolean),
	);
}

// The messages of the annotated tags among `objects`, by tag object.
function tagMessages(cwd: string, env: Env, objects: string[]): Map<string, string> {
	const out = new Map<string, string>();
	if (!objects.length) return out;
	const r = git(cwd, env, ["cat-file", "--batch"], { input: `${objects.join("\n")}\n` });
	if (!r.ok) return out;
	const buf = r.out;
	let at = 0;
	while (at < buf.length) {
		const nl = buf.indexOf(10, at);
		if (nl < 0) break;
		const [sha, type, size] = buf.subarray(at, nl).toString().split(" ");
		at = nl + 1;
		if (type === "missing" || !sha || !size) continue;
		const body = buf.subarray(at, at + Number(size)).toString();
		at += Number(size) + 1;
		if (type !== "tag") continue;
		const blank = body.indexOf("\n\n");
		out.set(sha, blank < 0 ? "" : body.slice(blank + 2));
	}
	return out;
}

function commonDir(cwd: string, env: Env): string | null {
	const r = git(cwd, env, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
	return r.ok ? r.out.toString().trim() || null : null;
}

type ReleaseEvent = LoggedEvent & { release: string; tag: string; tagObject: string; commit: string; gitDir: string; cards: string[]; run?: string };

function releases(board: Board): { started: ReleaseEvent[]; finished: Set<string>; events: LoggedEvent[] } {
	const events = readEvents(board.paths);
	return {
		events,
		started: events.filter((e): e is ReleaseEvent => e.event === "release-started"),
		finished: new Set(events.filter((e) => e.event === "release-finished").map((e) => String(e.release))),
	};
}

function runResult(events: LoggedEvent[], run: string): LoggedEvent | undefined {
	return events.filter((e) => e.event === "test-run" && e.run === run).at(-1);
}

// A green run recorded for the commit, or null.
function greenRun(events: LoggedEvent[], commit: string): string | null {
	const hit = events.filter((e) => e.event === "test-run" && e.commit === commit && e.result === "passed").at(-1);
	return hit ? String(hit.run) : null;
}

// Starts the run's process, detached from this one: it outlives the hook
// and the session, and writes its own result. Returns its pid.
function spawnRunner(board: Board, release: string, env: Env): number {
	const child = spawn(process.execPath, [join(import.meta.dir, "test-runner.ts"), board.paths.dir, release], {
		detached: true,
		stdio: "ignore",
		env: cleanEnv(env),
	});
	child.on("error", () => {});
	child.unref();
	return child.pid ?? 0;
}

function startRun(board: Board, rel: ReleaseEvent, env: Env, restart: boolean, actor?: string): void {
	const log = logPath(board, rel.release);
	if (restart) appendFileSync(log, `\n--- ${new Date().toISOString()}: the run's process had gone without a result, so it starts again\n`);
	const pid = spawnRunner(board, rel.release, env);
	appendEvent(board.paths, { event: "test-run-started", source: "hook", run: rel.release, release: rel.release, commit: rel.commit, pid, log, ...(restart ? { restart: true } : {}), ...(actor ? { actor } : {}) });
}

function list(ids: string[]): string {
	return ids.join(", ");
}

// Applies a release's result to its cards and records it. The caller holds the
// releases lock. Returns the release's result in a sentence or two.
function finishRelease(board: Board, rel: ReleaseEvent, passed: boolean, output: string, actor?: string): string {
	const released: string[] = [];
	const blocked: string[] = [];
	const returned: string[] = [];
	const stayed: Record<string, string> = {};
	for (const id of rel.cards) {
		let exists = false;
		try {
			exists = cardExists(board, id);
		} catch {}
		if (!exists) {
			stayed[id] = "it is not a card on this board";
			continue;
		}
		try {
			let column = readCard(board, id).card.column;
			if (passed && column === "Blocked") {
				returnFromBlock(board, id, "hook", actor);
				returned.push(id);
				column = readCard(board, id).card.column;
			}
			if (column !== "Done") {
				stayed[id] = `it is in ${String(column)}, not Done, so it stays there`;
				continue;
			}
			if (passed) {
				moveCard(board, { card: id, to: "Released", source: "hook", actor });
				released.push(id);
			} else {
				moveCard(board, { card: id, to: "Blocked", source: "hook", actor });
				addComment(board, id, `Release ${rel.tag} failed its test run on ${rel.commit}, so this card moved to Blocked. The run's output:\n\n\`\`\`\n${output}\n\`\`\``, "board", actor);
				blocked.push(id);
			}
		} catch (e) {
			if (!(e instanceof MoveRefused)) throw e;
			stayed[id] = e.message;
		}
	}
	const result = rel.run ? (passed ? "passed" : "failed") : "nothing to move";
	appendEvent(board.paths, { event: "release-finished", source: "hook", release: rel.release, tag: rel.tag, commit: rel.commit, result, released, blocked, returned, stayed, ...(actor ? { actor } : {}) });
	const parts = [`Release ${rel.tag} (${rel.commit.slice(0, 12)})`];
	if (!rel.run) parts.push("names no card in Done or Blocked, so it runs no tests and moves nothing.");
	else parts.push(passed ? "passed its test gate." : "failed its test gate.");
	if (released.length) parts.push(`Moved to Released: ${list(released)}.`);
	if (blocked.length) parts.push(`Moved to Blocked, with the run's output as a comment: ${list(blocked)}.`);
	for (const [id, why] of Object.entries(stayed)) parts.push(`${id} stays: ${why}.`);
	return parts.join(" ");
}

// Claims a pushed tag and starts its test gate, under the board-wide releases
// lock so two hooks never claim the same tag. Returns what it did, or null
// when another hook had already claimed it.
function startRelease(board: Board, t: PushedTag & { cards: string[]; gitDir: string }, env: Env, actor?: string): string | null {
	return withLock(releasesLock(board), `The releases of ${board.config.prefix}`, actor, () => {
		const { started, events } = releases(board);
		if (started.some((e) => e.tagObject === t.object)) return null;
		const columns = t.cards.map((id) => {
			try {
				return cardExists(board, id) ? readCard(board, id).card.column : null;
			} catch {
				return null;
			}
		});
		const movable = columns.some((c) => c === "Done" || c === "Blocked");
		const green = greenRun(events, t.commit);
		const command = testCommand(board);
		if (movable && !green && !command) {
			// Not claimed, so the next session start tries again once it is set.
			return `Release ${t.tag} names ${list(t.cards)}, but this board has no test command, so its test gate cannot run. The human sets one as \`test:\` in ${board.paths.config}; the next session start runs it.`;
		}
		const release = newReleaseId();
		const run = movable ? (green ?? release) : undefined;
		const rel = appendEvent(board.paths, {
			event: "release-started",
			source: "hook",
			release,
			tag: t.tag,
			tagObject: t.object,
			commit: t.commit,
			gitDir: t.gitDir,
			cards: t.cards,
			...(run ? { run } : {}),
			...(actor ? { actor } : {}),
		}) as ReleaseEvent;
		if (!run) return finishRelease(board, rel, false, "", actor);
		if (green) return finishRelease(board, rel, true, "", actor);
		startRun(board, rel, env, false, actor);
		const stays = t.cards.filter((_, i) => columns[i] !== "Done" && columns[i] !== "Blocked");
		return [
			`Release ${t.tag}: the test gate is running \`${command}\` in the background against ${t.commit.slice(0, 12)}, for ${list(t.cards)}.`,
			`Its log is ${logPath(board, release)}, or \`runs\` and \`run-log ${release}\` in the board's CLI.`,
			stays.length ? `${list(stays)} ${stays.length > 1 ? "are" : "is"} not in Done, so ${stays.length > 1 ? "they stay" : "it stays"} where ${stays.length > 1 ? "they are" : "it is"}.` : "",
		]
			.filter(Boolean)
			.join(" ");
	});
}

// After a push in a session, and at every session start: starts the test gate
// for each annotated tag this repository holds that carries a `Cards:` line,
// that no release has claimed yet, and that origin holds too, asked with
// `git ls-remote --tags`. Origin is asked only when there is such a tag here,
// so a start with nothing to release never reaches the network. Only ids that
// match this board's id pattern are read from a `Cards:` line; anything else
// on it is dropped before it reaches the trail or the session.
//
// With `onBaseOnly`, as at session start, a tag whose commit is not on the
// local base branch starts nothing: a tag fetched from the remote never makes
// the board run code nobody pulled. It is not claimed, so a later start runs
// it once its commit is on the base branch. A push made in the session tags
// the session's own commit, so it skips this check. Returns a line for the
// session's context per release.
export function releaseCatchUp(board: Board, cwd: string, env: Env = process.env, actor?: string, onBaseOnly = false): string[] {
	const gitDir = commonDir(cwd, env);
	if (!gitDir) return [];
	const claimed = new Set(releases(board).started.map((e) => e.tagObject));
	const fresh = localTags(cwd, env).filter((t) => !claimed.has(t.object));
	const messages = tagMessages(cwd, env, fresh.map((t) => t.object));
	const id = idPattern(board.config.prefix);
	const named = fresh.flatMap((t) => {
		const cards = (cardsLine(messages.get(t.object) ?? "") ?? []).filter((c) => id.test(c));
		return cards.length ? [{ ...t, cards, gitDir }] : [];
	});
	if (!named.length) return [];
	const pushed = remoteTagObjects(cwd, env);
	if (!pushed) return [];
	const base = onBaseOnly ? baseBranch(cwd, env) : null;
	const lines: string[] = [];
	for (const t of named.filter((n) => pushed.has(n.object))) {
		if (onBaseOnly && (!base || !onBase(cwd, env, t.commit, base))) {
			lines.push(`Release ${t.tag} names ${list(t.cards)}, but its commit ${t.commit.slice(0, 12)} is not on the local ${base ?? "base"} branch, so its test gate has not started. It starts at a later session start once that commit is on ${base ?? "the base branch"}.`);
			continue;
		}
		const line = startRelease(board, t, env, actor);
		if (line) lines.push(line);
	}
	return lines;
}

// At every session start: a release still waiting on its run, whose process
// has gone without a result, gets its run started again. Returns a line per
// restart.
export function restartVanishedRuns(board: Board, env: Env = process.env, actor?: string): string[] {
	return withLock(releasesLock(board), `The releases of ${board.config.prefix}`, actor, () => {
		const { started, finished, events } = releases(board);
		const lines: string[] = [];
		for (const rel of started) {
			if (rel.run !== rel.release || finished.has(rel.release)) continue;
			const last = events.filter((e) => e.event === "test-run-started" && e.run === rel.release).at(-1);
			if (last && typeof last.pid === "number" && last.pid > 0 && alive(last.pid)) continue;
			startRun(board, rel, env, true, actor);
			lines.push(`Release ${rel.tag}'s test run had stopped without a result, so it was started again; its log is ${logPath(board, rel.release)}.`);
		}
		return lines;
	});
}

function removeWorktree(gitDir: string, dir: string, env: Env): void {
	git(gitDir, env, ["worktree", "remove", "--force", dir]);
	rmSync(dir, { recursive: true, force: true });
}

function tail(text: string, lines: number): string {
	const all = text.trimEnd().split("\n");
	return (all.length > lines ? ["...", ...all.slice(-lines)] : all).join("\n");
}

// The background run itself, in its own process (src/test-runner.ts): cuts a
// temporary worktree at the tagged commit, runs the test command there with
// its output going to the log, records the result, removes the worktree and
// applies the result to the release's cards. A run whose result is already
// recorded only applies it.
export async function runRelease(boardDir: string, release: string, env: Env = process.env): Promise<void> {
	const board = boardAt(boardDir);
	const rel = releases(board).started.find((e) => e.release === release && e.run === release);
	if (!rel) throw new Error(`No release ${release} waiting on a run on ${board.config.prefix}`);
	const log = logPath(board, release);
	mkdirSync(board.paths.testRuns, { recursive: true });
	let result = runResult(readEvents(board.paths), release);
	if (!result) {
		const command = testCommand(board);
		const dir = runDir(board, release, env);
		let exit = -1;
		appendFileSync(log, `Release ${rel.tag}, commit ${rel.commit}, cards ${list(rel.cards)}\nStarted ${new Date().toISOString()} in ${dir}: ${command ?? "(no test command)"}\n\n`);
		try {
			if (!command) throw new Error(`no test command is set as \`test:\` in ${board.paths.config}`);
			removeWorktree(rel.gitDir, dir, env);
			mkdirSync(join(dir, ".."), { recursive: true });
			const add = git(rel.gitDir, env, ["worktree", "add", "--force", "--detach", dir, rel.commit]);
			if (!add.ok) throw new Error(`could not check out ${rel.commit} in a temporary worktree: ${add.err}`);
			const fd = openSync(log, "a");
			try {
				const p = Bun.spawn(["sh", "-c", command], { cwd: dir, env: cleanEnv(env), stdin: "ignore", stdout: fd, stderr: fd });
				exit = await p.exited;
			} finally {
				closeSync(fd);
			}
		} catch (e) {
			appendFileSync(log, `\nThe run could not finish: ${(e as Error).message}\n`);
		} finally {
			removeWorktree(rel.gitDir, dir, env);
		}
		appendFileSync(log, `\nFinished ${new Date().toISOString()}: exit ${exit}, ${exit === 0 ? "passed" : "failed"}\n`);
		result = appendEvent(board.paths, { event: "test-run", source: "hook", run: release, release, commit: rel.commit, result: exit === 0 ? "passed" : "failed", exit });
	}
	const passed = result.result === "passed";
	const output = existsSync(log) ? tail(readFileSync(log, "utf8"), 200) : "";
	withLock(releasesLock(board), `The releases of ${board.config.prefix}`, undefined, () => {
		if (!releases(board).finished.has(release)) finishRelease(board, rel, passed, output);
	});
}

// A `git push` anywhere in a shell command: a simple command holding a `git`
// word with a `push` word after it.
export function isGitPush(command: string): boolean {
	return command.split(/[;&|\n]/).some((seg) => /(?:^|[\s/])git(?:\s.*)?\spush(?:\s|$)/.test(seg));
}

// What the CLI shows of the board's test runs, oldest first.
export interface RunInfo {
	release: string;
	tag: string;
	commit: string;
	state: "running" | "passed" | "failed" | "stopped";
	log: string;
}

export function testRuns(board: Board): RunInfo[] {
	const { started, events } = releases(board);
	return started
		.filter((rel) => rel.run === rel.release)
		.map((rel) => {
			const result = runResult(events, rel.release);
			const last = events.filter((e) => e.event === "test-run-started" && e.run === rel.release).at(-1);
			const running = last && typeof last.pid === "number" && last.pid > 0 && alive(last.pid);
			const state = result ? (result.result === "passed" ? "passed" : "failed") : running ? "running" : "stopped";
			return { release: rel.release, tag: rel.tag, commit: rel.commit, state, log: logPath(board, rel.release) };
		});
}
