import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	statSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { BOARD_DIR, resolveBoardRoot } from "../board-root.ts";
import { Core } from "../core/backlog.ts";
import {
	ensureStateWorktree,
	MIGRATING_BRANCH,
	MIGRATION_SUBJECT,
	migrationFailedMarker,
	STATE_BRANCH,
	STATE_WORKTREE,
	stateWorktreeOf,
} from "../state-worktree.ts";

// The live board is the state worktree's .boards, on a branch of its own, so a
// board write never commits on the default branch or a feature branch. These
// tests run real repositories with real linked worktrees: the main checkout, a
// bare remote it has pushed to, and an agent worktree cut the way the harness
// cuts one.

const CLI = join(import.meta.dir, "..", "cli.ts");
let tmp = "";
let repo = "";
let remote = "";
let agent = "";

function git(dir: string, ...args: string[]): string {
	const p = Bun.spawnSync(["git", "-C", dir, ...args], { env: process.env, stdout: "pipe", stderr: "pipe" });
	if (p.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${p.stderr.toString()}`);
	return p.stdout.toString().trim();
}

function gitOk(dir: string, ...args: string[]): boolean {
	return Bun.spawnSync(["git", "-C", dir, ...args], { env: process.env, stdout: "pipe", stderr: "pipe" }).exitCode === 0;
}

/** The CLI as a hook runs it: no root override, the board found from cwd. */
function board(cwd: string, ...args: string[]) {
	const env = { ...process.env };
	delete env.CODER_FLEET_BOARD_ROOT;
	const p = Bun.spawnSync(["bun", CLI, ...args], { cwd, env, stdout: "pipe", stderr: "pipe" });
	return { code: p.exitCode, out: p.stdout.toString(), err: p.stderr.toString() };
}

function task(id: string, title: string, status = "To Do"): string {
	return `---\nid: ${id}\ntitle: ${title}\nstatus: ${status}\nassignee: []\ncreated_date: '2026-11-08 00:00'\nlabels: []\ndependencies: []\n---\n\n## Description\n\n${title}\n`;
}

/** Every file under a directory, relative path to bytes. */
function snapshot(dir: string): Map<string, string> {
	const out = new Map<string, string>();
	const walk = (d: string) => {
		for (const name of readdirSync(d)) {
			const p = join(d, name);
			if (statSync(p).isDirectory()) walk(p);
			else out.set(relative(dir, p), readFileSync(p, "utf8"));
		}
	};
	if (existsSync(dir)) walk(dir);
	return out;
}

function logText(): string {
	const file = process.env.BOARD_LOG_FILE ?? "";
	return file && existsSync(file) ? readFileSync(file, "utf8") : "";
}

beforeEach(() => {
	tmp = mkdtempSync(join(tmpdir(), "state-worktree-"));
	repo = join(tmp, "repo");
	remote = join(tmp, "remote.git");
	mkdirSync(join(repo, BOARD_DIR, "tasks"), { recursive: true });
	writeFileSync(
		join(repo, BOARD_DIR, "config.yml"),
		'project_name: "t"\ntask_prefix: "BD"\nstatuses: ["To Do", "In Progress", "Blocked", "Blocked by human", "Done"]\ndefault_status: "To Do"\nauto_commit: true\n',
	);
	writeFileSync(join(repo, BOARD_DIR, ".gitignore"), ".focus\n");
	writeFileSync(join(repo, BOARD_DIR, "tasks", "bd-1 - One.md"), task("BD-1", "One"));
	writeFileSync(join(repo, BOARD_DIR, "tasks", "bd-2 - Two.md"), task("BD-2", "Two"));
	writeFileSync(join(repo, "README.md"), "product\n");
	git(tmp, "init", "-q", "--bare", "-b", "main", remote);
	git(repo, "init", "-q", "-b", "main");
	git(repo, "add", "-A");
	git(repo, "commit", "-q", "-m", "base");
	git(repo, "remote", "add", "origin", remote);
	git(repo, "push", "-q", "-u", "origin", "main");
	git(repo, "remote", "set-head", "origin", "main");
	agent = join(repo, ".claude", "worktrees", "agent-x");
	git(repo, "worktree", "add", "-q", agent, "-b", "agent-x");
	// The agent worktree is ignored on its own, so a status that changes says the state worktree is not.
	writeFileSync(join(repo, ".git", "info", "exclude"), "/.claude/worktrees/agent-x/\n");
	const log = process.env.BOARD_LOG_FILE;
	if (log && existsSync(log)) unlinkSync(log);
});

afterEach(() => rmSync(tmp, { recursive: true, force: true }));

describe("resolving the live board", () => {
	it("answers the state worktree from the main checkout, the state worktree and an agent worktree", () => {
		const state = stateWorktreeOf(repo);
		expect(state).toBe(join(repo, STATE_WORKTREE));
		expect(resolveBoardRoot({}, repo)).toBe(state);
		expect(resolveBoardRoot({}, agent)).toBe(state);
		expect(resolveBoardRoot({}, state)).toBe(state);
		expect(resolveBoardRoot({}, join(state, BOARD_DIR, "tasks"))).toBe(state);
		expect(git(state, "symbolic-ref", "--short", "HEAD")).toBe(STATE_BRANCH);
	});

	it("keeps the state worktree out of the main checkout's status without a commit", () => {
		resolveBoardRoot({}, repo);
		expect(git(repo, "status", "--porcelain")).toBe("");
		expect(git(repo, "log", "--format=%s", "main")).toBe("base");
	});

	it("lets the environment variable win over the state worktree", () => {
		expect(resolveBoardRoot({ CODER_FLEET_BOARD_ROOT: repo }, agent)).toBe(repo);
		expect(existsSync(stateWorktreeOf(repo))).toBe(false);
	});
});

describe("board writes", () => {
	it("commit on the state branch from an agent worktree, never on main or the agent's branch", () => {
		const mainBefore = git(repo, "rev-parse", "main");
		const agentBefore = git(repo, "rev-parse", "agent-x");
		const r = board(agent, "task", "edit", "BD-1", "-s", "In Progress", "--by", "SubagentStart");
		expect(r.code).toBe(0);
		const state = stateWorktreeOf(repo);
		expect(git(state, "log", "-1", "--format=%s", STATE_BRANCH)).toBe("Move BD-1 to In Progress - One");
		expect(git(repo, "rev-parse", "main")).toBe(mainBefore);
		expect(git(repo, "rev-parse", "agent-x")).toBe(agentBefore);
		expect(git(agent, "status", "--porcelain")).toBe("");
		expect(git(repo, "status", "--porcelain")).toBe("");
		expect(readFileSync(join(state, BOARD_DIR, "tasks", "bd-1 - One.md"), "utf8")).toContain("status: In Progress");
		expect(readFileSync(join(repo, BOARD_DIR, "tasks", "bd-1 - One.md"), "utf8")).toContain("status: To Do");
	});

	it("commit on the state branch from the main checkout while it has a feature branch out", () => {
		git(repo, "checkout", "-q", "-b", "feature");
		const r = board(repo, "task", "create", "Three", "--by", "lead");
		expect(r.code).toBe(0);
		expect(git(repo, "rev-parse", "feature")).toBe(git(repo, "rev-parse", "main"));
		expect(git(stateWorktreeOf(repo), "log", "-1", "--format=%s")).toBe("Create BD-3 - Three");
	});

	it("are read back by every checkout, focus included", () => {
		expect(board(agent, "task", "create", "Three").code).toBe(0);
		expect(board(repo, "focus", "BD-3").code).toBe(0);
		expect(board(agent, "focus", "--show").out.trim()).toBe("BD-3");
		const fromState = JSON.parse(board(stateWorktreeOf(repo), "task", "view", "BD-3", "--json").out);
		expect(fromState.task.title).toBe("Three");
		expect(git(stateWorktreeOf(repo), "status", "--porcelain")).toBe("");
	});

	it("print the live board's root and path through board root and board state", () => {
		const state = realpathSync(resolveBoardRoot({}, repo));
		expect(board(agent, "root").out.trim()).toBe(state);
		expect(board(repo, "state").out.trim()).toBe(state);
	});
});

describe("the first migration", () => {
	it("carries uncommitted and unpushed board changes into the state branch and leaves the main checkout as it was", () => {
		// Unpushed: a board commit on local main that origin does not have.
		writeFileSync(join(repo, BOARD_DIR, "tasks", "bd-2 - Two.md"), task("BD-2", "Two", "Done"));
		git(repo, "commit", "-q", "-am", "Move BD-2 to Done - Two");
		// Uncommitted: an edit, a new untracked card, a deletion, and the focus.
		writeFileSync(join(repo, BOARD_DIR, "tasks", "bd-1 - One.md"), task("BD-1", "One", "Blocked"));
		writeFileSync(join(repo, BOARD_DIR, "tasks", "bd-4 - Four.md"), task("BD-4", "Four"));
		mkdirSync(join(repo, BOARD_DIR, "docs"), { recursive: true });
		writeFileSync(join(repo, BOARD_DIR, "docs", "doc-1 - Note.md"), "---\nid: doc-1\ntitle: Note\n---\nnote\n");
		writeFileSync(join(repo, BOARD_DIR, ".focus"), "BD-1\n");
		git(repo, "rm", "-q", "--cached", "README.md");
		const before = snapshot(join(repo, BOARD_DIR));
		const mainHead = git(repo, "rev-parse", "HEAD");
		const mainStatus = git(repo, "status", "--porcelain");

		const state = resolveBoardRoot({}, agent);

		expect(state).toBe(stateWorktreeOf(repo));
		expect(snapshot(join(state, BOARD_DIR))).toEqual(before);
		expect(git(state, "status", "--porcelain")).toBe("");
		expect(git(state, "show", `${STATE_BRANCH}:.boards/tasks/bd-1 - One.md`)).toContain("status: Blocked");
		expect(git(state, "show", `${STATE_BRANCH}:.boards/tasks/bd-2 - Two.md`)).toContain("status: Done");
		expect(git(state, "show", `${STATE_BRANCH}:.boards/tasks/bd-4 - Four.md`)).toContain("title: Four");
		// Based on the default branch, so the state branch carries no product change of its own.
		expect(git(state, "diff", "--name-only", "main", STATE_BRANCH, "--", ".", ":(exclude).boards")).toBe("");
		expect(git(state, "log", "-1", "--format=%s", STATE_BRANCH)).toBe("Move the board to the state worktree");
		// The main checkout is exactly as it was: nothing committed, nothing reverted.
		expect(git(repo, "rev-parse", "HEAD")).toBe(mainHead);
		expect(git(repo, "status", "--porcelain")).toBe(mainStatus);
		expect(snapshot(join(repo, BOARD_DIR))).toEqual(before);
		expect(logText()).toContain("moved the board");
	});

	it("is made once when two processes race for it", async () => {
		// An uncommitted change, so the move has a commit to make and two moves would show as two.
		writeFileSync(join(repo, BOARD_DIR, "tasks", "bd-1 - One.md"), task("BD-1", "One", "Blocked"));
		const procs = [0, 1, 2].map(() =>
			Bun.spawn(["bun", CLI, "root"], {
				cwd: agent,
				env: { ...process.env, CODER_FLEET_BOARD_ROOT: "" },
				stdout: "pipe",
				stderr: "pipe",
			}),
		);
		const outs = await Promise.all(
			procs.map(async (p) => [await p.exited, (await new Response(p.stdout).text()).trim()]),
		);
		for (const [code, out] of outs) {
			expect(code).toBe(0);
			expect(out).toBe(join(realpathSync(repo), STATE_WORKTREE));
		}
		const subjects = git(stateWorktreeOf(repo), "log", "--format=%s", STATE_BRANCH).split("\n");
		expect(subjects.filter((s) => s === MIGRATION_SUBJECT)).toHaveLength(1);
		expect(subjects).toEqual([MIGRATION_SUBJECT, "base"]);
		expect(gitOk(repo, "rev-parse", "--verify", "-q", `refs/heads/${MIGRATING_BRANCH}`)).toBe(false);
	});

	it("re-attaches an existing state branch instead of copying the stale main board over it", () => {
		const state = resolveBoardRoot({}, repo);
		expect(board(repo, "task", "edit", "BD-1", "-s", "Done").code).toBe(0);
		git(repo, "worktree", "remove", "--force", state);
		const again = resolveBoardRoot({}, agent);
		expect(again).toBe(state);
		expect(readFileSync(join(state, BOARD_DIR, "tasks", "bd-1 - One.md"), "utf8")).toContain("status: Done");
	});

	it("cleans up a migration a killed process left half done, and finishes it", () => {
		const state = stateWorktreeOf(repo);
		git(repo, "worktree", "add", "-q", "-b", MIGRATING_BRANCH, state, "main");
		rmSync(join(state, BOARD_DIR), { recursive: true, force: true });
		writeFileSync(join(repo, BOARD_DIR, "tasks", "bd-5 - Five.md"), task("BD-5", "Five"));
		expect(resolveBoardRoot({}, repo)).toBe(state);
		expect(existsSync(join(state, BOARD_DIR, "tasks", "bd-5 - Five.md"))).toBe(true);
		expect(gitOk(repo, "rev-parse", "--verify", "-q", `refs/heads/${MIGRATING_BRANCH}`)).toBe(false);
	});

	it("creates the state worktree in a project whose main checkout has a feature branch out, based on the default branch", () => {
		git(repo, "checkout", "-q", "-b", "feature");
		writeFileSync(join(repo, "feature.txt"), "product work\n");
		git(repo, "add", "feature.txt");
		git(repo, "commit", "-q", "-m", "feature work");
		const state = resolveBoardRoot({}, repo);
		expect(existsSync(join(state, "feature.txt"))).toBe(false);
		expect(git(state, "merge-base", "--is-ancestor", "main", STATE_BRANCH)).toBe("");
	});
});

describe("a migration that fails", () => {
	it("leaves the board readable and writable in the main checkout and logs why", async () => {
		// Something that is not the fleet's worktree sits where the state worktree goes.
		const state = stateWorktreeOf(repo);
		mkdirSync(state, { recursive: true });
		writeFileSync(join(state, "notes.txt"), "the human's own file\n");

		expect(resolveBoardRoot({}, agent)).toBe(repo);
		expect(logText()).toContain("board migration failed");
		expect(logText()).toContain(state);
		expect(readFileSync(join(state, "notes.txt"), "utf8")).toBe("the human's own file\n");
		expect(existsSync(migrationFailedMarker(repo))).toBe(true);
		expect(gitOk(repo, "rev-parse", "--verify", "-q", `refs/heads/${STATE_BRANCH}`)).toBe(false);
		expect(gitOk(repo, "rev-parse", "--verify", "-q", `refs/heads/${MIGRATING_BRANCH}`)).toBe(false);

		// Readable and writable where it was, the way it was before this change.
		const r = board(agent, "task", "edit", "BD-1", "-s", "In Progress");
		expect(r.code).toBe(0);
		expect(readFileSync(join(repo, BOARD_DIR, "tasks", "bd-1 - One.md"), "utf8")).toContain("status: In Progress");
		const core = new Core(repo);
		expect((await core.getTask("BD-1"))?.status).toBe("In Progress");

		// Sticky: the next resolution does not try again, so every process agrees.
		const lines = logText()
			.split("\n")
			.filter((l) => l.includes("board migration failed")).length;
		expect(resolveBoardRoot({}, repo)).toBe(repo);
		expect(
			logText()
				.split("\n")
				.filter((l) => l.includes("board migration failed")).length,
		).toBe(lines);

		// Once the obstacle is gone, board state retries on purpose.
		rmSync(state, { recursive: true, force: true });
		expect(board(repo, "state").code).toBe(0);
		expect(resolveBoardRoot({}, repo)).toBe(state);
		expect(readFileSync(join(state, BOARD_DIR, "tasks", "bd-1 - One.md"), "utf8")).toContain("status: In Progress");
		expect(existsSync(migrationFailedMarker(repo))).toBe(false);
	});

	it("waits out a lock held too long by falling back to the main checkout, without recording a failure", () => {
		// A live holder (this process), so the lock is not stale and the wait runs out.
		const lock = join(
			git(repo, "rev-parse", "--path-format=absolute", "--git-common-dir"),
			"coder-fleet",
			"state.lock",
		);
		mkdirSync(lock, { recursive: true });
		writeFileSync(join(lock, "pid"), `${process.pid}\n`);

		const home = ensureStateWorktree(repo, { lockWaitMs: 200 });
		expect(home.root).toBe(repo);
		expect(home.moved).toBe(false);
		expect(home.reason).toContain("another process is moving the board");
		expect(existsSync(migrationFailedMarker(repo))).toBe(false);
		expect(existsSync(stateWorktreeOf(repo))).toBe(false);
		expect(logText()).not.toContain("board migration failed");

		// Not sticky: once the holder lets go, the next resolution makes the move.
		rmSync(lock, { recursive: true, force: true });
		expect(ensureStateWorktree(repo).moved).toBe(true);
	});

	it("is reported by board state with a non-zero exit", () => {
		const state = stateWorktreeOf(repo);
		mkdirSync(state, { recursive: true });
		writeFileSync(join(state, "notes.txt"), "x\n");
		const r = board(repo, "state");
		expect(r.code).not.toBe(0);
		expect(r.err).toContain(state);
	});
});

describe("a process rooted in the main checkout after the board moved", () => {
	it("does not commit its write on the main checkout's branch, and logs why", async () => {
		const core = new Core(repo);
		ensureStateWorktree(repo);
		const mainHead = git(repo, "rev-parse", "HEAD");
		await core.updateTaskFromInput("BD-1", { status: "Done" });
		expect(git(repo, "rev-parse", "HEAD")).toBe(mainHead);
		expect(logText()).toContain("the board moved to");
	});
});
