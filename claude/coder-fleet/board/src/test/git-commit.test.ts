import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BOARD_DIR } from "../board-root.ts";
import { Core } from "../core/backlog.ts";
import { FOCUS_FILE, writeFocus } from "../core/focus.ts";
import { resetCommitContext, setCommitContext } from "../git/commit-context.ts";
import { commitMessageArgs, formatCommitSubject, readCommittedItem, SUBJECT_LIMIT } from "../git/operations.ts";

// Every write the binary makes is committed, pathspec-limited to .boards, on
// the main checkout's current branch. The human's own staged work is never
// swept in, a locked index is retried, and three switches turn it off: the
// env var, an ignored .boards, and auto_commit not being true.

let tmp = "";
let repo = "";

function git(...args: string[]) {
	const p = Bun.spawnSync(["git", "-C", repo, ...args], { stdout: "pipe", stderr: "pipe" });
	if (p.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${p.stderr.toString()}`);
	return p.stdout.toString().trim();
}

function config(extra = "auto_commit: true\n") {
	writeFileSync(
		join(repo, BOARD_DIR, "config.yml"),
		`project_name: "t"\ntask_prefix: "BD"\nstatuses: ["To Do", "Doing", "Blocked", "Blocked by human", "Done"]\ndefault_status: "To Do"\n${extra}`,
	);
}

beforeEach(() => {
	tmp = mkdtempSync(join(tmpdir(), "git-commit-"));
	repo = join(tmp, "repo");
	mkdirSync(join(repo, BOARD_DIR, "tasks"), { recursive: true });
	git("init", "-q", "-b", "main");
	git("config", "user.email", "t@t");
	git("config", "user.name", "t");
	config();
	git("add", "-A");
	git("commit", "-q", "-m", "base");
	delete process.env.CODER_FLEET_BOARD_NO_COMMIT;
	resetCommitContext();
});

afterEach(() => {
	rmSync(tmp, { recursive: true, force: true });
	delete process.env.CODER_FLEET_BOARD_NO_COMMIT;
	resetCommitContext();
});

describe("formatCommitSubject", () => {
	it("is the imperative action, then the item's title, with no prefix", () => {
		const item = { id: "CF-176", title: "Remove Codex from the supported harnesses" };
		expect(formatCommitSubject("Create CF-176", [item])).toEqual({
			subject: "Create CF-176 - Remove Codex from the supported harnesses",
			itemLines: [],
		});
		expect(formatCommitSubject("Add milestone m-1")).toEqual({ subject: "Add milestone m-1", itemLines: [] });
	});

	it("cuts a title that would pass the limit, and gives it whole in the body", () => {
		const title = "Fold the nine multi-letter APFS case folds in the OpenCode credential lock";
		const { subject, itemLines } = formatCommitSubject("Move CF-167 to Blocked by human", [{ id: "CF-167", title }]);
		expect(subject.length).toBeLessThanOrEqual(SUBJECT_LIMIT);
		expect(subject.startsWith("Move CF-167 to Blocked by human - Fold the nine")).toBe(true);
		expect(subject.endsWith("...")).toBe(true);
		expect(itemLines).toEqual([`CF-167 - ${title}`]);
	});

	it("never cuts a title between the halves of a surrogate pair", () => {
		const action = "Move CF-167 to Blocked by human";
		const room = SUBJECT_LIMIT - action.length - " - ".length - "...".length;
		const title = `${"a".repeat(room - 1)}\u{1F600} and enough words after it to pass the limit`;
		const { subject } = formatCommitSubject(action, [{ id: "CF-167", title }]);
		expect(subject).toBe(`${action} - ${"a".repeat(room - 1)}...`);
	});

	it("lists several items in the body and keeps the action alone as the subject", () => {
		const items = [
			{ id: "CF-1", title: "One" },
			{ id: "CF-2", title: "Two" },
		];
		expect(formatCommitSubject("Clear 2 items from Done", items)).toEqual({
			subject: "Clear 2 items from Done",
			itemLines: ["CF-1 - One", "CF-2 - Two"],
		});
	});

	it("titles only an item the action names as a whole id", () => {
		expect(formatCommitSubject("Update CF-164.3", [{ id: "CF-164", title: "Parent" }]).subject).toBe("Update CF-164.3");
		expect(formatCommitSubject("Update CF-164", [{ id: "CF-16", title: "Other" }]).subject).toBe("Update CF-164");
		expect(formatCommitSubject("Update cf-16", [{ id: "CF-16", title: "Same" }]).subject).toBe("Update cf-16 - Same");
	});

	it("puts the writer in a trailer paragraph, never the subject, after the body", () => {
		expect(commitMessageArgs("Update BD-1", "SubagentStop")).toEqual([
			"-m",
			"Update BD-1",
			"-m",
			"Board-Writer: SubagentStop",
		]);
		expect(commitMessageArgs("Update BD-1")).toEqual(["-m", "Update BD-1"]);
		expect(
			commitMessageArgs("Move BD-1 to Blocked", "TaskCompleted", [{ id: "BD-1", title: "T" }], "Tests failed.\n"),
		).toEqual(["-m", "Move BD-1 to Blocked - T", "-m", "Tests failed.", "-m", "Board-Writer: TaskCompleted"]);
	});
});

describe("readCommittedItem", () => {
	it("reads the id and title, and nothing from a file without both", () => {
		expect(readCommittedItem("---\nid: CF-3\ntitle: 'Quoted: title'\n---\nbody")).toEqual({
			id: "CF-3",
			title: "Quoted: title",
		});
		expect(readCommittedItem("---\nstatuses: [To Do]\n---\n")).toBeNull();
		expect(readCommittedItem("---\nid: [unclosed\n---\n")).toBeNull();
	});
});

function writer(): string {
	return git("log", "-1", "--format=%(trailers:key=Board-Writer,valueonly)");
}

describe("the binary commits its writes", () => {
	it("commits a create with a subject naming the id", async () => {
		const core = new Core(repo);
		const { task } = await core.createTaskFromInput({ title: "First" });
		expect(git("log", "-1", "--format=%s")).toBe(`Create ${task.id} - First`);
		expect(writer()).toBe("");
		expect(git("status", "--porcelain")).toBe("");
	});

	it("commits a status move naming the status, with the writer as a trailer", async () => {
		const core = new Core(repo);
		const { task } = await core.createTaskFromInput({ title: "First" });
		setCommitContext({ by: "SubagentStop", note: `Move ${task.id} to Doing` });
		await core.updateTaskFromInput(task.id, { status: "Doing" });
		expect(git("log", "-1", "--format=%s")).toBe(`Move ${task.id} to Doing - First`);
		expect(writer()).toBe("SubagentStop");
	});

	it("names an edit's change with no note set, as the MCP server writes", async () => {
		const core = new Core(repo);
		const { task } = await core.createTaskFromInput({ title: "First" });
		await core.updateTaskFromInput(task.id, { appendComments: [{ body: "hello", author: "@x" }] });
		expect(git("log", "-1", "--format=%s")).toBe(`Add a comment to ${task.id} - First`);
		await core.updateTaskFromInput(task.id, { status: "Done" });
		expect(git("log", "-1", "--format=%s")).toBe(`Move ${task.id} to Done - First`);
	});

	it("names a restated status as no move, as the web UI's save sends it", async () => {
		const core = new Core(repo);
		const { task } = await core.createTaskFromInput({ title: "First" });
		await core.updateTaskFromInput(task.id, { status: "to do", description: "typo fixed" });
		expect(git("log", "-1", "--format=%s")).toBe(`Update the description on ${task.id} - First`);
		await core.updateTaskFromInput(task.id, {
			status: "To Do",
			appendComments: [{ body: "still here", author: "@x" }],
		});
		expect(git("log", "-1", "--format=%s")).toBe(`Add a comment to ${task.id} - First`);
	});

	it("puts a Blocked move's comment in the body, and a reason the caller set over it", async () => {
		const core = new Core(repo);
		const { task } = await core.createTaskFromInput({ title: "First" });
		await core.updateTaskFromInput(task.id, {
			status: "Blocked",
			appendComments: [{ body: "Tests failed.", author: "@x" }],
		});
		expect(git("log", "-1", "--format=%b")).toBe("Tests failed.");
		setCommitContext({ body: "The gate failed." });
		await core.updateTaskFromInput(task.id, {
			status: "Blocked by human",
			appendComments: [{ body: "Which key?", author: "@x" }],
		});
		expect(git("log", "-1", "--format=%b")).toBe("The gate failed.");
	});

	it("clears a Done card with its title, read from the moved file", async () => {
		const core = new Core(repo);
		const { task } = await core.createTaskFromInput({ title: "Finished work", status: "Done" });
		expect(await core.completeTask(task.id)).toBe(true);
		expect(git("log", "-1", "--format=%s")).toBe(`Clear ${task.id} from Done - Finished work`);
		expect(git("log", "-1", "--format=%b")).toBe("");
	});

	it("lists every card a several-card commit carries in the body", async () => {
		const core = new Core(repo);
		const { task: a } = await core.createTaskFromInput({ title: "Alpha", status: "Done" });
		const { task: b } = await core.createTaskFromInput({ title: "Beta", status: "Done" });
		await core.completeTask(a.id, false);
		await core.completeTask(b.id, false);
		await core.git.commitFiles("Clear 2 items from Done", [], null);
		expect(git("log", "-1", "--format=%s")).toBe("Clear 2 items from Done");
		expect(git("log", "-1", "--format=%b").split("\n")).toEqual([`${a.id} - Alpha`, `${b.id} - Beta`]);
	});

	it("leaves the human's staged work out of the commit", async () => {
		writeFileSync(join(repo, "notes.txt"), "mine\n");
		git("add", "notes.txt");
		const core = new Core(repo);
		await core.createTaskFromInput({ title: "First" });
		expect(git("diff", "--cached", "--name-only")).toBe("notes.txt");
		expect(git("show", "--stat", "--format=", "HEAD")).not.toContain("notes.txt");
	});

	it("never commits the focus file", async () => {
		const core = new Core(repo);
		const { task } = await core.createTaskFromInput({ title: "First" });
		writeFocus(repo, task.id);
		await core.updateTaskFromInput(task.id, { title: "First, retitled" });
		expect(git("show", "--stat", "--format=", "HEAD")).not.toContain(FOCUS_FILE);
		expect(git("status", "--porcelain")).toContain(`?? ${BOARD_DIR}/${FOCUS_FILE}`);
	});

	// What /init produces: templates/board.gitignore ignores .focus. An exclude
	// pathspec naming an ignored file makes `git add` exit 1, so the add must
	// not carry one.
	it("commits when the focus file exists and .boards/.gitignore ignores it", async () => {
		writeFileSync(join(repo, BOARD_DIR, ".gitignore"), `${FOCUS_FILE}\n`);
		git("add", "-A");
		git("commit", "-q", "-m", "init");
		const core = new Core(repo);
		const { task } = await core.createTaskFromInput({ title: "First" });
		writeFocus(repo, task.id);
		await core.updateTaskFromInput(task.id, { title: "First, retitled" });
		expect(git("log", "-1", "--format=%s")).toContain(task.id);
		expect(git("show", "--stat", "--format=", "HEAD")).not.toContain(FOCUS_FILE);
		expect(git("status", "--porcelain")).toBe("");
	});

	it("leaves nothing of .boards staged when the add fails after staging", async () => {
		const core = new Core(repo);
		const { task } = await core.createTaskFromInput({ title: "First" });
		// A git on PATH whose add stages as usual and then exits 1, as the
		// ignored-exclude failure did.
		const bin = join(tmp, "bin");
		mkdirSync(bin);
		const realGit = Bun.which("git");
		writeFileSync(
			join(bin, "git"),
			`#!/bin/sh\n"${realGit}" "$@"; s=$?\nfor a in "$@"; do [ "$a" = add ] && exit 1; done\nexit $s\n`,
			{ mode: 0o755 },
		);
		const path = process.env.PATH;
		const logged = spyOn(console, "error").mockImplementation(() => {});
		process.env.PATH = `${bin}:${path}`;
		try {
			await core.updateTaskFromInput(task.id, { title: "First, retitled" });
		} finally {
			process.env.PATH = path;
			logged.mockRestore();
		}
		expect(git("log", "-1", "--format=%s")).toBe(`Create ${task.id} - First`);
		expect(git("diff", "--cached", "--name-only", "--", BOARD_DIR)).toBe("");
		expect(git("status", "--porcelain")).toContain(BOARD_DIR);
	});

	it("skips the commit when CODER_FLEET_BOARD_NO_COMMIT=1 and leaves the file", async () => {
		process.env.CODER_FLEET_BOARD_NO_COMMIT = "1";
		const core = new Core(repo);
		await core.createTaskFromInput({ title: "First" });
		expect(git("log", "-1", "--format=%s")).toBe("base");
		expect(git("status", "--porcelain")).toContain(BOARD_DIR);
	});

	it("skips the commit when .boards is ignored", async () => {
		writeFileSync(join(repo, ".gitignore"), `${BOARD_DIR}/\n`);
		git("add", ".gitignore");
		git("commit", "-q", "-m", "ignore");
		git("rm", "-r", "-q", "--cached", BOARD_DIR);
		git("commit", "-q", "-m", "untrack");
		const core = new Core(repo);
		await core.createTaskFromInput({ title: "First" });
		expect(git("log", "-1", "--format=%s")).toBe("untrack");
	});

	it("skips the commit when auto_commit is not true", async () => {
		config("");
		git("commit", "-q", "-a", "-m", "config");
		const core = new Core(repo);
		await core.createTaskFromInput({ title: "First" });
		expect(git("log", "-1", "--format=%s")).toBe("config");
	});

	it("retries a locked index and lands once the lock clears", async () => {
		const lock = join(repo, ".git", "index.lock");
		writeFileSync(lock, "");
		setTimeout(() => rmSync(lock, { force: true }), 400);
		const core = new Core(repo);
		const { task } = await core.createTaskFromInput({ title: "First" });
		expect(git("log", "-1", "--format=%s")).toBe(`Create ${task.id} - First`);
	});

	it("logs and keeps the file when the commit cannot be made at all", async () => {
		const lock = join(repo, ".git", "index.lock");
		writeFileSync(lock, "");
		const errors = spyOn(console, "error").mockImplementation(() => {});
		try {
			const core = new Core(repo);
			const { task } = await core.createTaskFromInput({ title: "First" });
			rmSync(lock, { force: true });
			expect(git("log", "-1", "--format=%s")).toBe("base");
			expect((await core.getTask(task.id))?.title).toBe("First");
		} finally {
			errors.mockRestore();
		}
	});

	it("commits from a board nested below the repository root", async () => {
		const sub = join(repo, "sub");
		mkdirSync(join(sub, BOARD_DIR, "tasks"), { recursive: true });
		writeFileSync(
			join(sub, BOARD_DIR, "config.yml"),
			`project_name: "t"\ntask_prefix: "BD"\nstatuses: ["To Do", "Doing", "Blocked", "Blocked by human", "Done"]\ndefault_status: "To Do"\nauto_commit: true\n`,
		);
		git("add", "-A");
		git("commit", "-q", "-m", "sub base");
		const core = new Core(sub);
		const { task } = await core.createTaskFromInput({ title: "Nested" });
		expect(git("log", "-1", "--format=%s")).toBe(`Create ${task.id} - Nested`);
		expect(git("show", "--stat", "--format=", "HEAD")).toContain(`sub/${BOARD_DIR}/tasks`);
	});

	it("commits when git's answer to rev-parse --show-toplevel arrives empty", async () => {
		// Under load Bun.spawnSync now and then hands back exit 0 with stdout lost
		// (CF-163: 6 in 12000 calls at load 49). A git on PATH that answers the
		// toplevel query that way stands in for it, so the commit must not depend
		// on that answer's text.
		const realGit = Bun.which("git");
		if (!realGit) throw new Error("no git on PATH");
		const bin = join(tmp, "bin");
		mkdirSync(bin);
		writeFileSync(
			join(bin, "git"),
			`#!/bin/sh\nfor a in "$@"; do [ "$a" = "--show-toplevel" ] && exit 0; done\nexec "${realGit}" "$@"\n`,
			{ mode: 0o755 },
		);
		const savedPath = process.env.PATH;
		process.env.PATH = `${bin}:${savedPath}`;
		try {
			const { task } = await new Core(repo).createTaskFromInput({ title: "First" });
			expect(git("log", "-1", "--format=%s")).toBe(`Create ${task.id} - First`);
			expect(git("status", "--porcelain")).toBe("");
		} finally {
			process.env.PATH = savedPath;
		}
	});

	it("does not commit or log when a rewrite changes nothing", async () => {
		const core = new Core(repo);
		const { task } = await core.createTaskFromInput({ title: "First" });
		const beforeLog = git("log", "--oneline");
		const errors = spyOn(console, "error").mockImplementation(() => {});
		try {
			const loaded = await core.getTask(task.id);
			if (!loaded) throw new Error("task missing");
			// A bulk rewrite writes every task back unconditionally, so the same task
			// with nothing changed reaches the git layer with an identical file: the
			// exact no-op write findings 1 covers (a status set to what it already
			// is short-circuits before ever reaching git, so this exercises the real
			// path instead).
			await core.updateTasksBulk([loaded], undefined, true);
			expect(git("log", "--oneline")).toBe(beforeLog);
			expect(git("status", "--porcelain")).toBe("");
			expect(errors).not.toHaveBeenCalled();
		} finally {
			errors.mockRestore();
		}
	});

	it("keeps the writer across commits when by is set once, MCP-style", async () => {
		setCommitContext({ by: "mcp" });
		const core = new Core(repo);
		const { task: first } = await core.createTaskFromInput({ title: "First" });
		expect(git("log", "-1", "--format=%s")).toBe(`Create ${first.id} - First`);
		expect(writer()).toBe("mcp");
		const { task: second } = await core.createTaskFromInput({ title: "Second" });
		expect(git("log", "-1", "--format=%s")).toBe(`Create ${second.id} - Second`);
		expect(writer()).toBe("mcp");
	});

	it("does not leak one write's note into the next", async () => {
		setCommitContext({ by: "mcp" });
		const core = new Core(repo);
		const { task } = await core.createTaskFromInput({ title: "First" });
		setCommitContext({ note: `Move ${task.id} to Doing` });
		await core.updateTaskFromInput(task.id, { status: "Doing" });
		expect(git("log", "-1", "--format=%s")).toBe(`Move ${task.id} to Doing - First`);
		await core.updateTaskFromInput(task.id, { title: "First, retitled" });
		expect(git("log", "-1", "--format=%s")).toBe(`Rename ${task.id} - First, retitled`);
		expect(writer()).toBe("mcp");
	});

	it("leaves .boards unstaged when a commit fails mid-merge", async () => {
		writeFileSync(join(repo, "conflict.txt"), "main\n");
		git("add", "conflict.txt");
		git("commit", "-q", "-m", "add conflict.txt on main");
		git("checkout", "-q", "-b", "other");
		writeFileSync(join(repo, "conflict.txt"), "other\n");
		git("commit", "-q", "-a", "-m", "other change");
		git("checkout", "-q", "main");
		writeFileSync(join(repo, "conflict.txt"), "main change\n");
		git("commit", "-q", "-a", "-m", "main change");
		const merge = Bun.spawnSync(["git", "-C", repo, "merge", "other"], { stdout: "pipe", stderr: "pipe" });
		expect(merge.exitCode).not.toBe(0);
		expect(git("status", "--porcelain")).toContain("UU conflict.txt");

		const errors = spyOn(console, "error").mockImplementation(() => {});
		try {
			const core = new Core(repo);
			await core.createTaskFromInput({ title: "Mid merge" });
			expect(git("diff", "--cached", "--name-only")).not.toContain(BOARD_DIR);
		} finally {
			errors.mockRestore();
		}
	});
});
