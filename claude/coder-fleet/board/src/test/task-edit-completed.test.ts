import { afterEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_DIRECTORIES } from "../constants/index.ts";
import { Core } from "../core/backlog.ts";
import { McpServer } from "../mcp/server.ts";
import { registerTaskTools } from "../mcp/tools/tasks/index.ts";
import { BacklogServer } from "../server/index.ts";

// A card reaches .boards/completed/ only through an explicit completion. These tests pin what an
// edit may do to it afterwards: every field but status takes the edit in place, and a status change
// is refused with a message that says the card is completed.

const CLI = join(import.meta.dir, "..", "cli.ts");
const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function git(root: string, ...args: string[]): string {
	const proc = Bun.spawnSync(["git", "-C", root, ...args], { stdout: "pipe", stderr: "pipe" });
	if (proc.exitCode !== 0) throw new Error(proc.stderr.toString());
	return proc.stdout.toString();
}

function makeBoard(extraConfig: string[] = []): string {
	const root = mkdtempSync(join(tmpdir(), "board-completed-"));
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
			...extraConfig,
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

function completedDir(root: string): string {
	return join(root, DEFAULT_DIRECTORIES.BACKLOG, DEFAULT_DIRECTORIES.COMPLETED);
}

function tasksDir(root: string): string {
	return join(root, DEFAULT_DIRECTORIES.BACKLOG, DEFAULT_DIRECTORIES.TASKS);
}

function draftsDir(root: string): string {
	return join(root, DEFAULT_DIRECTORIES.BACKLOG, DEFAULT_DIRECTORIES.DRAFTS);
}

function filesIn(dir: string): string[] {
	return existsSync(dir) ? readdirSync(dir).filter((name) => name.endsWith(".md")) : [];
}

/** Create BD-1 as Done with one unchecked criterion and complete it. Returns the completed file's path. */
async function seedCompletedCard(root: string): Promise<string> {
	const core = new Core(root);
	const { task } = await core.createTaskFromInput({
		title: "Shipped work",
		status: "Done",
		acceptanceCriteria: [{ text: "First criterion", checked: false }],
	});
	expect(task.id).toBe("BD-1");
	expect(await core.completeTask(task.id)).toBe(true);
	const files = filesIn(completedDir(root));
	expect(files.length).toBe(1);
	expect(filesIn(tasksDir(root))).toEqual([]);
	return join(completedDir(root), files[0] as string);
}

function board(root: string, ...args: string[]) {
	const proc = Bun.spawnSync(["bun", CLI, ...args], {
		env: { ...process.env, CODER_FLEET_BOARD_ROOT: root },
		stdout: "pipe",
		stderr: "pipe",
	});
	return { code: proc.exitCode, out: proc.stdout.toString(), err: proc.stderr.toString() };
}

const textOf = (content: unknown[] | undefined): string =>
	((content?.[0] as { text?: string } | undefined)?.text ?? "") as string;

describe("editing a completed card through the core", () => {
	it("(a) takes a comment, a criterion tick and a label in place, keeping status Done", async () => {
		const root = makeBoard();
		const path = await seedCompletedCard(root);
		const core = new Core(root);

		await core.updateTaskFromInput("BD-1", {
			appendComments: [{ body: "Shipped and verified", author: "@lead" }],
			checkAcceptanceCriteria: [1],
			addLabels: ["outcome/shipped"],
		});

		const text = readFileSync(path, "utf8");
		expect(text).toContain("Shipped and verified");
		expect(text).toContain("[x] #1 First criterion");
		expect(text).toContain("outcome/shipped");
		const reread = await new Core(root).getTask("BD-1");
		expect(reread?.status).toBe("Done");
		expect(reread?.source).toBe("completed");
		expect(reread?.labels).toContain("outcome/shipped");
		expect(filesIn(tasksDir(root))).toEqual([]);
	});

	it("(b) refuses a status change to To Do and leaves the file untouched", async () => {
		const root = makeBoard();
		const path = await seedCompletedCard(root);
		const before = readFileSync(path, "utf8");

		const attempt = new Core(root).updateTaskFromInput("BD-1", { status: "To Do" });
		await expect(attempt).rejects.toThrow(/completed/);
		await expect(new Core(root).updateTaskFromInput("BD-1", { status: "To Do" })).rejects.toThrow(/status/);
		await expect(new Core(root).updateTaskFromInput("BD-1", { status: "To Do" })).rejects.toThrow(
			`BD-1 is completed (its file is in ${DEFAULT_DIRECTORIES.BACKLOG}/${DEFAULT_DIRECTORIES.COMPLETED}/), so its status cannot change.`,
		);

		expect(readFileSync(path, "utf8")).toBe(before);
		expect(filesIn(tasksDir(root))).toEqual([]);
	});

	it("(c) refuses a demotion to Draft and writes nothing under drafts/", async () => {
		const root = makeBoard();
		const path = await seedCompletedCard(root);
		const before = readFileSync(path, "utf8");

		await expect(new Core(root).updateTaskFromInput("BD-1", { status: "Draft" })).rejects.toThrow(
			/completed.*status|status.*completed/s,
		);
		await expect(new Core(root).editTaskOrDraft("BD-1", { status: "Draft" })).rejects.toThrow(
			/completed.*status|status.*completed/s,
		);

		expect(readFileSync(path, "utf8")).toBe(before);
		expect(filesIn(draftsDir(root))).toEqual([]);
		expect(filesIn(tasksDir(root))).toEqual([]);
	});

	it("(d) accepts the card's own status, in any case, alongside a comment", async () => {
		const root = makeBoard();
		const path = await seedCompletedCard(root);

		await new Core(root).updateTaskFromInput("BD-1", {
			status: "done",
			appendComments: [{ body: "Hook re-sent Done", author: "@hook" }],
		});

		const text = readFileSync(path, "utf8");
		expect(text).toContain("Hook re-sent Done");
		const reread = await new Core(root).getTask("BD-1");
		expect(reread?.status).toBe("Done");
		expect(reread?.source).toBe("completed");
	});

	it("(e) fires no status callback for an edit to a completed card", async () => {
		const marker = join(mkdtempSync(join(tmpdir(), "board-completed-marker-")), "fired");
		roots.push(join(marker, ".."));
		const root = makeBoard([`on_status_change: 'touch "${marker}"'`]);
		const core = new Core(root);

		// The callback is live: a real status change on an active card fires it.
		const { task: active } = await core.createTaskFromInput({ title: "Active control", status: "To Do" });
		await core.updateTaskFromInput(active.id, { status: "In Progress" });
		expect(existsSync(marker)).toBe(true);
		rmSync(marker);

		await seedCompletedCard2(root);
		await new Core(root).updateTaskFromInput("BD-2", {
			appendComments: [{ body: "After the fact", author: "@lead" }],
		});
		expect(existsSync(marker)).toBe(false);
	});

	it("(f) still reports a missing id as not found", async () => {
		const root = makeBoard();
		await expect(new Core(root).updateTaskFromInput("BD-999", { title: "x" })).rejects.toThrow(
			"Task not found: BD-999",
		);
	});
});

/** Same as seedCompletedCard, for a board that already holds BD-1 as an active card. */
async function seedCompletedCard2(root: string): Promise<void> {
	const core = new Core(root);
	const { task } = await core.createTaskFromInput({ title: "Second shipped", status: "Done" });
	expect(task.id).toBe("BD-2");
	expect(await core.completeTask(task.id)).toBe(true);
}

describe("editing a completed card through the CLI", () => {
	it("(g) exits 0 for a tick and a comment, and commits only the completed file", async () => {
		const root = makeBoard();
		const path = await seedCompletedCard(root);
		const before = readFileSync(path, "utf8");

		const r = board(root, "task", "edit", "BD-1", "--check-ac", "1", "--comment", "x", "--comment-author", "@t");

		expect(r.err).toBe("");
		expect(r.code).toBe(0);
		expect(readFileSync(path, "utf8")).not.toBe(before);
		const changed = git(root, "log", "-1", "--name-only", "--format=")
			.split("\n")
			.filter((line) => line.length > 0);
		expect(changed.length).toBe(1);
		expect(changed[0]).toStartWith(`${DEFAULT_DIRECTORIES.BACKLOG}/${DEFAULT_DIRECTORIES.COMPLETED}/`);
	});

	it("(h) exits non-zero for a status change and leaves the file untouched", async () => {
		const root = makeBoard();
		const path = await seedCompletedCard(root);
		const before = readFileSync(path, "utf8");

		const r = board(root, "task", "edit", "BD-1", "-s", "To Do");

		expect(r.code).not.toBe(0);
		expect(r.err).toContain("completed");
		expect(readFileSync(path, "utf8")).toBe(before);
	});

	it("(i) exits non-zero for a missing id", () => {
		const root = makeBoard();
		const r = board(root, "task", "edit", "BD-999", "--comment", "x", "--comment-author", "@t");
		expect(r.code).not.toBe(0);
		expect(r.err).toContain("no task BD-999");
	});
});

describe("editing a completed card through MCP task_edit", () => {
	const servers: McpServer[] = [];

	afterEach(async () => {
		for (const server of servers.splice(0)) await server.stop();
	});

	async function mcpFor(root: string): Promise<McpServer> {
		const server = new McpServer(root, "Test instructions");
		servers.push(server);
		const config = await server.filesystem.loadConfig();
		if (!config) throw new Error("Failed to load config");
		registerTaskTools(server, config);
		return server;
	}

	async function edit(server: McpServer, args: Record<string, unknown>) {
		return await server.testInterface.callTool({ params: { name: "task_edit", arguments: args } });
	}

	it("(j) appends a comment without an error", async () => {
		const root = makeBoard();
		const path = await seedCompletedCard(root);
		const server = await mcpFor(root);

		const result = await edit(server, { id: "BD-1", commentsAppend: ["From MCP"], commentAuthor: "@mcp" });

		expect(result.isError).toBeFalsy();
		expect(readFileSync(path, "utf8")).toContain("From MCP");
	});

	it("(k) returns an error naming the card as completed for a status change", async () => {
		const root = makeBoard();
		const path = await seedCompletedCard(root);
		const before = readFileSync(path, "utf8");
		const server = await mcpFor(root);

		const result = await edit(server, { id: "BD-1", status: "To Do" });

		expect(result.isError).toBe(true);
		expect(textOf(result.content as unknown[])).toContain("completed");
		expect(readFileSync(path, "utf8")).toBe(before);
	});

	it("(l) returns an error for a missing id", async () => {
		const root = makeBoard();
		const server = await mcpFor(root);

		const result = await edit(server, { id: "BD-999", commentsAppend: ["x"], commentAuthor: "@mcp" });

		expect(result.isError).toBe(true);
	});
});

describe("editing a completed card through the web PUT", () => {
	let server: BacklogServer | null = null;

	afterEach(async () => {
		await server?.stop();
		server = null;
	});

	async function put(root: string, body: Record<string, unknown>): Promise<Response> {
		server = new BacklogServer(root);
		await server.start(0, false);
		const port = server.getPort();
		return await fetch(`http://127.0.0.1:${port}/api/tasks/BD-1`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});
	}

	it("(m) returns 200 for a comment", async () => {
		const root = makeBoard();
		const path = await seedCompletedCard(root);

		const response = await put(root, { commentsAppend: ["From the web"], commentAuthor: "@web" });

		expect(response.status).toBe(200);
		expect(readFileSync(path, "utf8")).toContain("From the web");
	});

	it("(n) returns 400 with the completed message for a status change", async () => {
		const root = makeBoard();
		const path = await seedCompletedCard(root);
		const before = readFileSync(path, "utf8");

		const response = await put(root, { status: "To Do" });

		expect(response.status).toBe(400);
		const body = (await response.json()) as { error?: string };
		expect(body.error).toContain("completed");
		expect(readFileSync(path, "utf8")).toBe(before);
	});
});
