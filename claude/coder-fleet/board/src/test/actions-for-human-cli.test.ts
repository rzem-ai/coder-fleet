import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_DIRECTORIES } from "../constants/index.ts";

// CF-25 through the CLI: `task edit` adds, ticks, unticks and clears actions, a status move out of
// Blocked by human clears them, the plain view shows them first and the JSON view carries them as
// `actionsForHuman`, and each write's commit subject says what it did.

const CLI = join(import.meta.dir, "..", "cli.ts");
const roots: string[] = [];
const NO_COMMIT_ENV = "CODER_FLEET_BOARD_NO_COMMIT";
let savedNoCommit: string | undefined;

beforeEach(() => {
	savedNoCommit = process.env[NO_COMMIT_ENV];
	delete process.env[NO_COMMIT_ENV];
});

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
	if (savedNoCommit === undefined) delete process.env[NO_COMMIT_ENV];
	else process.env[NO_COMMIT_ENV] = savedNoCommit;
});

function git(root: string, ...args: string[]): string {
	const proc = Bun.spawnSync(["git", "-C", root, ...args], { stdout: "pipe", stderr: "pipe" });
	if (proc.exitCode !== 0) throw new Error(proc.stderr.toString());
	return proc.stdout.toString();
}

function makeBoard(): string {
	const root = mkdtempSync(join(tmpdir(), "board-actions-cli-"));
	roots.push(root);
	mkdirSync(join(root, DEFAULT_DIRECTORIES.BACKLOG));
	writeFileSync(
		join(root, DEFAULT_DIRECTORIES.BACKLOG, "config.yml"),
		[
			'project_name: "test"',
			'task_prefix: "BD"',
			'statuses: ["To Do", "In Progress", "Blocked", "Blocked by human", "Done"]',
			'default_status: "To Do"',
			"auto_commit: true",
			"check_active_branches: false",
			"",
		].join("\n"),
	);
	git(root, "init", "-q", "-b", "main");
	git(root, "config", "user.email", "t@t");
	git(root, "config", "user.name", "t");
	git(root, "add", "-A");
	git(root, "commit", "-q", "-m", "base");
	return root;
}

function board(root: string, ...args: string[]) {
	const proc = Bun.spawnSync(["bun", CLI, ...args], {
		env: { ...process.env, CODER_FLEET_BOARD_ROOT: root },
		stdout: "pipe",
		stderr: "pipe",
	});
	return { code: proc.exitCode, out: proc.stdout.toString(), err: proc.stderr.toString() };
}

function ok(root: string, ...args: string[]): string {
	const r = board(root, ...args);
	expect(r.err).toBe("");
	expect(r.code).toBe(0);
	return r.out;
}

type ViewJson = {
	task: {
		status: string;
		actionsForHuman?: Array<{ index: number; text: string; checked: boolean }>;
		comments: Array<{ body: string; author: string | null }>;
	};
};

function view(root: string, id = "BD-1"): ViewJson["task"] {
	return (JSON.parse(ok(root, "task", "view", id, "--json")) as ViewJson).task;
}

function create(root: string, status: string): void {
	ok(root, "task", "create", `Card in ${status}`, "-s", status);
}

const subject = (root: string) => git(root, "log", "-1", "--format=%s").trim();
const body = (root: string) => git(root, "log", "-1", "--format=%b").trim();
const commitCount = (root: string) => Number(git(root, "rev-list", "--count", "HEAD").trim());

describe("task edit and the Actions for Human", () => {
	it("cli-action-flag: --action adds each ask, flags the one that is not a question, and moves nothing", () => {
		const root = makeBoard();
		create(root, "Blocked by human");
		ok(root, "task", "edit", "BD-1", "--action", "Pick one", "--action", "Which key?");
		const task = view(root);
		expect(task.status).toBe("Blocked by human");
		expect(task.actionsForHuman).toEqual([
			{ index: 1, text: "[not a question] Pick one", checked: false },
			{ index: 2, text: "Which key?", checked: false },
		]);
	});

	it("cli-action-leading-dash: --action=<text> takes an ask that starts with a dash", () => {
		const root = makeBoard();
		create(root, "Blocked by human");
		ok(root, "task", "edit", "BD-1", "--action=-v or -q?", "--action=--force?");
		expect(view(root).actionsForHuman?.map((item) => item.text)).toEqual(["-v or -q?", "--force?"]);
	});

	it("cli-check-uncheck: --check-action and --uncheck-action touch only the named action", () => {
		const root = makeBoard();
		create(root, "Blocked by human");
		ok(root, "task", "edit", "BD-1", "--action", "First?", "--action", "Second?", "--action", "Third?");
		ok(root, "task", "edit", "BD-1", "--check-action", "2", "--check-action", "3");
		expect(view(root).actionsForHuman?.map((item) => item.checked)).toEqual([false, true, true]);
		ok(root, "task", "edit", "BD-1", "--uncheck-action", "3");
		const task = view(root);
		expect(task.actionsForHuman?.map((item) => item.checked)).toEqual([false, true, false]);
		expect(task.status).toBe("Blocked by human");
	});

	it("cli-status-out-of-queue-clears: -s out of Blocked by human clears and archives", () => {
		const root = makeBoard();
		create(root, "Blocked by human");
		ok(root, "task", "edit", "BD-1", "--action", "Which key?");
		ok(root, "task", "edit", "BD-1", "-s", "In Progress");
		const task = view(root);
		expect(task.status).toBe("In Progress");
		expect(task.actionsForHuman).toEqual([]);
		expect(task.comments.filter((c) => c.author === "@board").map((c) => c.body)).toEqual([
			"Actions for Human cleared: BD-1 moved from Blocked by human to In Progress.\n\n- #1 (open) Which key?",
		]);
	});

	it("cli-clear-actions: --clear-actions <reason> clears with the reason and moves nothing", () => {
		const root = makeBoard();
		create(root, "Blocked by human");
		ok(root, "task", "edit", "BD-1", "--action", "Which key?");
		ok(root, "task", "edit", "BD-1", "--clear-actions", "Mis-bound blocker");
		const task = view(root);
		expect(task.status).toBe("Blocked by human");
		expect(task.actionsForHuman).toEqual([]);
		expect(task.comments.filter((c) => c.author === "@board").map((c) => c.body)).toEqual([
			"Actions for Human cleared by @lead, moving no column: Mis-bound blocker\n\n- #1 (open) Which key?",
		]);
	});

	it("cli-plain-renders-first: the plain view shows the numbered actions before Status and Description", () => {
		const root = makeBoard();
		create(root, "Blocked by human");
		ok(root, "task", "edit", "BD-1", "--action", "Which key?", "--action", "Pick one");
		ok(root, "task", "edit", "BD-1", "--check-action", "2");
		const out = ok(root, "task", "view", "BD-1", "--plain");
		const lines = out.split("\n");
		const heading = lines.indexOf("Actions for Human:");
		expect(heading).toBeGreaterThan(-1);
		expect(lines[heading - 1]).toBe("");
		expect(lines[heading - 2]).toBe("=".repeat(50));
		expect(lines[heading + 1]).toBe("-".repeat(50));
		expect(lines[heading + 2]).toBe("- [ ] #1 Which key?");
		expect(lines[heading + 3]).toBe("- [x] #2 [not a question] Pick one");
		expect(lines[heading + 4]).toBe("");
		expect(lines[heading + 5]?.startsWith("Status: ")).toBe(true);
		expect(out.indexOf("Actions for Human:")).toBeLessThan(out.indexOf("Description:"));
	});

	it("cli-plain-renders-nothing-when-empty: no actions, no section", () => {
		const root = makeBoard();
		create(root, "Blocked by human");
		const out = ok(root, "task", "view", "BD-1", "--plain");
		expect(out).not.toContain("Actions for Human");
		const lines = out.split("\n");
		expect(lines[lines.indexOf("=".repeat(50)) + 2]?.startsWith("Status: ")).toBe(true);
	});

	it("cli-json-actions: the JSON view carries actionsForHuman, empty or not", () => {
		const root = makeBoard();
		create(root, "Blocked by human");
		expect(view(root).actionsForHuman).toEqual([]);
		ok(root, "task", "edit", "BD-1", "--action", "Which key?", "--action", "Pick one");
		ok(root, "task", "edit", "BD-1", "--check-action", "1");
		expect(view(root).actionsForHuman).toEqual([
			{ index: 1, text: "Which key?", checked: true },
			{ index: 2, text: "[not a question] Pick one", checked: false },
		]);
	});

	it("cli-commit-subjects: each actions write says what it did, and a move keeps its own subject", () => {
		const root = makeBoard();
		create(root, "Blocked by human");

		let count = commitCount(root);
		ok(root, "task", "edit", "BD-1", "--action", "Which key?", "--by", "SubagentStop");
		expect(commitCount(root)).toBe(count + 1);
		expect(subject(root)).toBe("Add 1 action for the human to BD-1 on the board");
		expect(body(root)).toBe("Board-Writer: SubagentStop");

		ok(root, "task", "edit", "BD-1", "--action", "Second?", "--action", "Third?");
		expect(subject(root)).toBe("Add 2 actions for the human to BD-1 on the board");

		ok(root, "task", "edit", "BD-1", "--check-action", "1");
		expect(subject(root)).toBe("Tick action 1 on BD-1 on the board");

		ok(root, "task", "edit", "BD-1", "--uncheck-action", "1");
		expect(subject(root)).toBe("Untick action 1 on BD-1 on the board");

		ok(root, "task", "edit", "BD-1", "--clear-actions", "Void");
		expect(subject(root)).toBe("Clear the Actions for Human on BD-1 on the board");

		ok(root, "task", "edit", "BD-1", "--action", "Fourth?");
		count = commitCount(root);
		ok(root, "task", "edit", "BD-1", "-s", "In Progress");
		expect(commitCount(root)).toBe(count + 1);
		expect(subject(root)).toBe("Move BD-1 to In Progress on the board");
	});
});
