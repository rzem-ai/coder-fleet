import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BOARD_DIR } from "../board-root.ts";
import { STATE_BRANCH, stateWorktreeOf } from "../state-worktree.ts";

// The flush never lands the board or memory on the default branch, in any
// project and on any clone (CF-201): the state branch is their home, and the
// flush prints one line and pushes it. Whether a clone's info/exclude lists
// the board plays no part, since only the clone that ran /init has one. These
// run real repositories: a main checkout, a bare remote and a second clone.

const CLI = join(import.meta.dir, "..", "cli.ts");
const EXCLUDE_SCRIPT = join(import.meta.dir, "..", "..", "..", "scripts", "fleet-exclude.py");
let tmp = "";
let repo = "";
let remote = "";

function run(cmd: string[], cwd: string, env: Record<string, string | undefined> = process.env) {
	const p = Bun.spawnSync(cmd, { cwd, env, stdout: "pipe", stderr: "pipe" });
	return { code: p.exitCode, out: p.stdout.toString(), err: p.stderr.toString() };
}

function git(dir: string, ...args: string[]): string {
	const r = run(["git", "-C", dir, ...args], dir);
	if (r.code !== 0) throw new Error(`git ${args.join(" ")}: ${r.err}`);
	return r.out.trim();
}

/** The CLI as the lead or a human runs it: no root override, no push script, the board found from cwd. */
function board(cwd: string, ...args: string[]) {
	const env = { ...process.env };
	delete env.CODER_FLEET_BOARD_ROOT;
	delete env.CODER_FLEET_STATE_PUSH_SCRIPT;
	return run(["bun", CLI, ...args], cwd, env);
}

function task(id: string, title: string, status = "To Do"): string {
	return `---\nid: ${id}\ntitle: ${title}\nstatus: ${status}\nassignee: []\ncreated_date: '2026-11-08 00:00'\nlabels: []\ndependencies: []\n---\n\n## Description\n\n${title}\n`;
}

/** The files a branch's tip carries under .boards. */
function cards(dir: string, ref: string): string[] {
	return git(dir, "ls-tree", "-r", "--name-only", ref, "--", BOARD_DIR).split("\n").filter(Boolean);
}

const originMain = () => git(remote, "rev-parse", "refs/heads/main");

function migrate(dir: string): void {
	const r = run(["python3", "-I", EXCLUDE_SCRIPT, "migrate"], dir);
	if (r.code !== 0) throw new Error(`fleet-exclude.py migrate: ${r.out}${r.err}`);
}

function clone(name: string): string {
	const dir = join(tmp, name);
	git(tmp, "clone", "-q", remote, dir);
	git(dir, "config", "user.email", "test@example.com");
	git(dir, "config", "user.name", "Test User");
	return dir;
}

beforeEach(() => {
	tmp = realpathSync(mkdtempSync(join(tmpdir(), "flush-")));
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
	git(repo, "config", "user.email", "test@example.com");
	git(repo, "config", "user.name", "Test User");
	git(repo, "add", "-A");
	git(repo, "commit", "-q", "-m", "base, with the board tracked as before CF-201");
	git(repo, "remote", "add", "origin", remote);
	git(repo, "push", "-q", "-u", "origin", "main");
	git(repo, "remote", "set-head", "origin", "main");
	const log = process.env.BOARD_LOG_FILE;
	if (log && existsSync(log)) unlinkSync(log);
});

afterEach(() => rmSync(tmp, { recursive: true, force: true }));

describe("the flush", () => {
	it("lands nothing on the default branch from a clone with no exclude file, and keeps every card on the state branch", () => {
		migrate(repo);
		git(repo, "push", "-q", "origin", "main");
		expect(board(repo, "state").code).toBe(0);
		expect(board(repo, "task", "create", "Three", "--by", "lead").code).toBe(0);
		git(repo, "push", "-q", "origin", `${STATE_BRANCH}:refs/heads/${STATE_BRANCH}`);
		const other = clone("other");
		expect(board(other, "task", "list", "--plain").code).toBe(0);
		rmSync(join(other, ".git", "info", "exclude"), { force: true });
		expect(board(other, "task", "create", "Four", "--by", "lead").code).toBe(0);
		const before = cards(other, STATE_BRANCH);
		const mainBefore = originMain();

		const r = board(other, "flush", "--tag", "v1.0.0", "--by", "lead");

		expect(r.code).toBe(0);
		expect(r.out.trim().split("\n")).toHaveLength(1);
		expect(r.out).toContain("nothing lands on main");
		expect(originMain()).toBe(mainBefore);
		expect(git(other, "rev-parse", "main")).toBe(mainBefore);
		expect(cards(other, STATE_BRANCH)).toEqual(before);
		expect(before).toContain(".boards/tasks/bd-1 - One.md");
		expect(before).toContain(".boards/tasks/bd-4 - Four.md");
	});

	it("lands nothing after pulling a migration commit, and keeps every card on the state branch", () => {
		const other = clone("other");
		expect(board(other, "state").code).toBe(0);
		expect(board(other, "task", "create", "Three", "--by", "lead").code).toBe(0);
		migrate(repo);
		git(repo, "push", "-q", "origin", "main");
		git(other, "pull", "-q", "--ff-only", "origin", "main");
		const before = cards(other, STATE_BRANCH);
		const mainBefore = originMain();

		const r = board(other, "flush", "--by", "lead");

		expect(r.code).toBe(0);
		expect(r.out.trim().split("\n")).toHaveLength(1);
		expect(originMain()).toBe(mainBefore);
		expect(cards(other, STATE_BRANCH)).toEqual(before);
		expect(before).toEqual([
			".boards/.gitignore",
			".boards/config.yml",
			".boards/tasks/bd-1 - One.md",
			".boards/tasks/bd-2 - Two.md",
			".boards/tasks/bd-3 - Three.md",
		]);
		expect(existsSync(join(stateWorktreeOf(other), BOARD_DIR, "tasks", "bd-1 - One.md"))).toBe(true);
	});

	it("says in one fixed line that a project not yet migrated still tracks the board, names /coder-fleet:init, and lands nothing", () => {
		expect(board(repo, "state").code).toBe(0);
		expect(board(repo, "task", "create", "Three", "--by", "lead").code).toBe(0);
		const mainBefore = originMain();
		const stateBefore = git(repo, "rev-parse", STATE_BRANCH);

		const r = board(repo, "flush", "--tag", "v1.0.0", "--by", "lead");

		expect(r.code).toBe(0);
		const lines = r.out.trim().split("\n");
		expect(lines).toHaveLength(1);
		expect(lines[0]).toContain("main still tracks the board or the fleet's memory");
		expect(lines[0]).toContain("/coder-fleet:init");
		expect(originMain()).toBe(mainBefore);
		expect(git(repo, "rev-parse", "main")).toBe(mainBefore);
		expect(git(repo, "rev-parse", STATE_BRANCH)).toBe(stateBefore);
	});
});
