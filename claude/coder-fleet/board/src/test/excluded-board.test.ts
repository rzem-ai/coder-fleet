import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { BOARD_DIR } from "../board-root.ts";
import { STATE_BRANCH, stateWorktreeOf } from "../state-worktree.ts";

// CF-201: a project keeps the board, the fleet's memory, its installed rules,
// its config and its specs out of its own history with the common git dir's
// info/exclude, as /init writes it through scripts/fleet-exclude.py. Nothing
// under .boards/ is tracked on the default branch, so every board file is
// untracked and excluded in each checkout, and the state branch is the only
// place the board is committed. These run real repositories: the main
// checkout, its state worktree, an agent worktree and a bare remote.

const CLI = join(import.meta.dir, "..", "cli.ts");
const EXCLUDE_SCRIPT = join(import.meta.dir, "..", "..", "..", "scripts", "fleet-exclude.py");
const MEMORY = join(".claude", "agent-memory", "coder-fleet-coder", "MEMORY.md");
let tmp = "";
let repo = "";
let remote = "";
let agent = "";
let state = "";

function run(cmd: string[], cwd: string, env: Record<string, string | undefined> = process.env) {
	const p = Bun.spawnSync(cmd, { cwd, env, stdout: "pipe", stderr: "pipe" });
	return { code: p.exitCode, out: p.stdout.toString(), err: p.stderr.toString() };
}

function git(dir: string, ...args: string[]): string {
	const r = run(["git", "-C", dir, ...args], dir);
	if (r.code !== 0) throw new Error(`git ${args.join(" ")}: ${r.err}`);
	return r.out.trim();
}

/** The CLI as a hook or the lead runs it: no root override, no push script, the board found from cwd. */
function board(cwd: string, ...args: string[]) {
	const env = { ...process.env };
	delete env.CODER_FLEET_BOARD_ROOT;
	delete env.CODER_FLEET_STATE_PUSH_SCRIPT;
	return run(["bun", CLI, ...args], cwd, env);
}

function task(id: string, title: string, status = "To Do"): string {
	return `---\nid: ${id}\ntitle: ${title}\nstatus: ${status}\nassignee: []\ncreated_date: '2026-11-08 00:00'\nlabels: []\ndependencies: []\n---\n\n## Description\n\n${title}\n`;
}

/** The files the state branch's tip carries under a path. */
function onState(path: string): string[] {
	return git(repo, "ls-tree", "-r", "--name-only", STATE_BRANCH, "--", path).split("\n").filter(Boolean);
}

beforeEach(() => {
	tmp = realpathSync(mkdtempSync(join(tmpdir(), "excluded-board-")));
	repo = join(tmp, "repo");
	remote = join(tmp, "remote.git");
	mkdirSync(repo, { recursive: true });
	writeFileSync(join(repo, "README.md"), "product\n");
	git(tmp, "init", "-q", "--bare", "-b", "main", remote);
	git(repo, "init", "-q", "-b", "main");
	git(repo, "config", "user.email", "test@example.com");
	git(repo, "config", "user.name", "Test User");
	git(repo, "add", "-A");
	git(repo, "commit", "-q", "-m", "base");
	git(repo, "remote", "add", "origin", remote);
	git(repo, "push", "-q", "-u", "origin", "main");
	git(repo, "remote", "set-head", "origin", "main");
	const excluded = run(["python3", "-I", EXCLUDE_SCRIPT, "write"], repo);
	if (excluded.code !== 0) throw new Error(`fleet-exclude.py write: ${excluded.out}${excluded.err}`);
	// The board /init makes, after the exclude: untracked from the start.
	mkdirSync(join(repo, BOARD_DIR, "tasks"), { recursive: true });
	writeFileSync(
		join(repo, BOARD_DIR, "config.yml"),
		'project_name: "t"\ntask_prefix: "BD"\nstatuses: ["To Do", "In Progress", "Blocked", "Blocked by human", "Done"]\ndefault_status: "To Do"\nauto_commit: true\n',
	);
	writeFileSync(join(repo, BOARD_DIR, ".gitignore"), ".focus\n");
	writeFileSync(join(repo, BOARD_DIR, "tasks", "bd-1 - One.md"), task("BD-1", "One"));
	writeFileSync(join(repo, BOARD_DIR, "tasks", "bd-2 - Two.md"), task("BD-2", "Two"));
	mkdirSync(join(repo, MEMORY, ".."), { recursive: true });
	writeFileSync(join(repo, MEMORY), "- a note from before the move\n");
	agent = join(repo, ".claude", "worktrees", "agent-x");
	git(repo, "worktree", "add", "-q", agent, "-b", "agent-x");
	// The agent worktree is kept out of the main checkout's status on its own, as state-worktree.test.ts does.
	writeFileSync(join(repo, ".git", "info", "exclude"), "/.claude/worktrees/agent-x/\n", { flag: "a" });
	state = stateWorktreeOf(repo);
	const log = process.env.BOARD_LOG_FILE;
	if (log && existsSync(log)) unlinkSync(log);
});

afterEach(() => rmSync(tmp, { recursive: true, force: true }));

describe("an excluded board", () => {
	it("is untracked and out of the main checkout's status before the move", () => {
		expect(git(repo, "status", "--porcelain", "--untracked-files=all")).toBe("");
		expect(git(repo, "ls-files", "--", BOARD_DIR)).toBe("");
	});

	it("moves onto the state branch with every card, its config and the memory, and main gains no commit", () => {
		const r = board(repo, "state");
		expect(r.code).toBe(0);
		expect(onState(BOARD_DIR)).toEqual([
			".boards/.gitignore",
			".boards/config.yml",
			".boards/tasks/bd-1 - One.md",
			".boards/tasks/bd-2 - Two.md",
		]);
		expect(onState(".claude/agent-memory")).toEqual([MEMORY]);
		expect(git(repo, "log", "--format=%s", "main")).toBe("base");
		expect(git(state, "status", "--porcelain", "--untracked-files=all")).toBe("");
		// The main checkout's copy stays on disk.
		expect(existsSync(join(repo, BOARD_DIR, "tasks", "bd-1 - One.md"))).toBe(true);
	});

	it("commits a new card and an edit made from an agent worktree on the state branch, and nowhere else", () => {
		expect(board(repo, "state").code).toBe(0);
		const mainBefore = git(repo, "rev-parse", "main");
		const agentBefore = git(repo, "rev-parse", "agent-x");
		const created = board(agent, "task", "create", "Three", "--by", "lead");
		expect(created.code).toBe(0);
		expect(created.err).not.toContain("commit failed");
		const edited = board(agent, "task", "edit", "BD-1", "-s", "In Progress", "--by", "SubagentStart");
		expect(edited.code).toBe(0);
		expect(onState(join(BOARD_DIR, "tasks"))).toContain(".boards/tasks/bd-3 - Three.md");
		expect(git(repo, "show", `${STATE_BRANCH}:.boards/tasks/bd-1 - One.md`)).toContain("status: In Progress");
		expect(git(state, "status", "--porcelain", "--untracked-files=all")).toBe("");
		expect(git(repo, "rev-parse", "main")).toBe(mainBefore);
		expect(git(repo, "rev-parse", "agent-x")).toBe(agentBefore);
		const log = process.env.BOARD_LOG_FILE ?? "";
		expect(existsSync(log) ? readFileSync(log, "utf8") : "").not.toContain("is gitignored");
	});

	it("is never committed on main while the move cannot be made", () => {
		mkdirSync(join(repo, ".git", "coder-fleet"), { recursive: true });
		writeFileSync(join(repo, ".git", "coder-fleet", "state-migration-failed"), "a move that failed\n");
		const mainBefore = git(repo, "rev-parse", "main");
		const created = board(repo, "task", "create", "Three", "--by", "lead");
		expect(created.code).toBe(0);
		expect(existsSync(join(repo, BOARD_DIR, "tasks", "bd-3 - Three.md"))).toBe(true);
		expect(git(repo, "rev-parse", "main")).toBe(mainBefore);
		expect(git(repo, "ls-files", "--", BOARD_DIR)).toBe("");
	});

	it("moves with a memory directory that holds no file yet", () => {
		rmSync(join(repo, MEMORY));
		const r = board(repo, "state");
		expect(r.code).toBe(0);
		expect(onState(BOARD_DIR)).toContain(".boards/config.yml");
		expect(onState(".claude/agent-memory")).toEqual([]);
	});

	it("is excluded the same way in the main checkout, an agent worktree and the state worktree", () => {
		expect(board(repo, "state").code).toBe(0);
		const exclude = realpathSync(join(repo, ".git", "info", "exclude"));
		for (const checkout of [repo, agent, state]) {
			for (const path of [".boards/x", ".claude/agent-memory/coder-fleet-coder/x", "docs/specs/x.md", "docs/runs/x.md"]) {
				const r = run(["git", "-C", checkout, "check-ignore", "-v", "--no-index", "--", path], checkout);
				expect(r.code).toBe(0);
				const source = r.out.split(":")[0] as string;
				expect(realpathSync(resolve(checkout, source))).toBe(exclude);
			}
		}
	});
});

describe("the flush in an excluded project", () => {
	it("lands nothing on the default branch, says so in one line, and loses no board or memory file", () => {
		expect(board(repo, "state").code).toBe(0);
		expect(board(repo, "task", "create", "Three", "--by", "lead").code).toBe(0);
		git(repo, "tag", "-a", "v1.0.0", "-m", "v1.0.0: the release", "main");
		git(repo, "push", "-q", "origin", "v1.0.0");
		const originBefore = git(remote, "rev-parse", "refs/heads/main");
		const mainBefore = git(repo, "rev-parse", "main");
		const stateBefore = git(repo, "rev-parse", STATE_BRANCH);
		const filesBefore = onState(".");

		const r = board(repo, "flush", "--tag", "v1.0.0", "--by", "lead");

		expect(r.code).toBe(0);
		const lines = r.out.trim().split("\n");
		expect(lines).toHaveLength(1);
		expect(lines[0]).toContain("nothing lands on main");
		expect(git(remote, "rev-parse", "refs/heads/main")).toBe(originBefore);
		expect(git(repo, "rev-parse", "main")).toBe(mainBefore);
		expect(git(repo, "rev-parse", STATE_BRANCH)).toBe(stateBefore);
		expect(onState(".")).toEqual(filesBefore);
		expect(existsSync(join(state, BOARD_DIR, "tasks", "bd-3 - Three.md"))).toBe(true);
		expect(existsSync(join(state, MEMORY))).toBe(true);
		expect(git(state, "status", "--porcelain", "--untracked-files=all")).toBe("");
	});
});

describe("a fresh clone", () => {
	it("gets the board and the memory back from the pushed state branch on its first board use", () => {
		expect(board(repo, "state").code).toBe(0);
		expect(board(repo, "task", "create", "Three", "--by", "lead").code).toBe(0);
		git(repo, "push", "-q", "origin", `${STATE_BRANCH}:refs/heads/${STATE_BRANCH}`);
		const clone = join(tmp, "clone");
		git(tmp, "clone", "-q", remote, clone);
		expect(existsSync(join(clone, BOARD_DIR))).toBe(false);

		const listed = board(clone, "task", "list", "--plain");

		expect(listed.code).toBe(0);
		expect(listed.out).toContain("Three");
		const cloneState = stateWorktreeOf(clone);
		expect(git(clone, "symbolic-ref", "--short", "HEAD")).toBe("main");
		expect(git(cloneState, "symbolic-ref", "--short", "HEAD")).toBe(STATE_BRANCH);
		expect(git(clone, "rev-parse", STATE_BRANCH)).toBe(git(repo, "rev-parse", STATE_BRANCH));
		expect(readFileSync(join(cloneState, MEMORY), "utf8")).toBe("- a note from before the move\n");
	});
});
