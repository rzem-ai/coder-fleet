import { afterEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_DIRECTORIES } from "../constants/index.ts";
import { Core } from "../core/backlog.ts";
import { McpServer } from "../mcp/server.ts";
import { registerTaskTools } from "../mcp/tools/tasks/index.ts";
import { BacklogServer } from "../server/index.ts";
import { retry } from "./test-utils.ts";

// CF-24.3 (CF-24 criteria 6 and 7): with `require_acceptance_criteria: true` in the board config,
// creating an item with no acceptance criteria is refused on every create path - the core, the
// CLI, MCP task_create (as a tool error) and the web endpoint - with a message naming the key.
// Drafts are refused too (OQ5). With the key absent or false, creation is unchanged.

const KEY = "require_acceptance_criteria";
const CLI = join(import.meta.dir, "..", "cli.ts");

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** A scratch board, no git, auto-commit off; `requirement` is the key's line, or nothing for absent. */
function makeBoard(requirement?: "true" | "false"): string {
	const root = mkdtempSync(join(tmpdir(), "board-require-ac-"));
	roots.push(root);
	mkdirSync(join(root, DEFAULT_DIRECTORIES.BACKLOG, "tasks"), { recursive: true });
	mkdirSync(join(root, DEFAULT_DIRECTORIES.BACKLOG, "drafts"), { recursive: true });
	writeFileSync(
		join(root, DEFAULT_DIRECTORIES.BACKLOG, "config.yml"),
		[
			'project_name: "test"',
			'task_prefix: "BD"',
			'statuses: ["To Do", "In Progress", "Blocked", "Blocked by human", "Done"]',
			'default_status: "To Do"',
			"auto_commit: false",
			...(requirement ? [`${KEY}: ${requirement}`] : []),
			"",
		].join("\n"),
	);
	return root;
}

async function itemFiles(root: string): Promise<string[]> {
	const tasks = await readdir(join(root, DEFAULT_DIRECTORIES.BACKLOG, "tasks"));
	const drafts = await readdir(join(root, DEFAULT_DIRECTORIES.BACKLOG, "drafts"));
	return [...tasks, ...drafts];
}

const CRITERION = [{ text: "Something is proven", checked: false }];

describe("the require_acceptance_criteria config key", () => {
	it("parses true and false, and is undefined when absent", async () => {
		expect((await new Core(makeBoard("true")).filesystem.loadConfig())?.requireAcceptanceCriteria).toBe(true);
		expect((await new Core(makeBoard("false")).filesystem.loadConfig())?.requireAcceptanceCriteria).toBe(false);
		expect((await new Core(makeBoard()).filesystem.loadConfig())?.requireAcceptanceCriteria).toBeUndefined();
	});

	it("survives a config save and reload", async () => {
		for (const value of [true, false]) {
			const root = makeBoard(value ? "true" : "false");
			const core = new Core(root);
			const config = await core.filesystem.loadConfig();
			if (!config) throw new Error("config did not load");
			await core.filesystem.saveConfig(config);
			const written = readFileSync(join(root, DEFAULT_DIRECTORIES.BACKLOG, "config.yml"), "utf8");
			expect(written).toContain(`${KEY}: ${value}`);
			expect((await new Core(root).filesystem.loadConfig())?.requireAcceptanceCriteria).toBe(value);
		}
	});
});

describe("Core.createTaskFromInput with the key on", () => {
	it("refuses an item with no criteria, names the key, and writes nothing", async () => {
		const root = makeBoard("true");
		const core = new Core(root);
		await expect(core.createTaskFromInput({ title: "No criteria" })).rejects.toThrow(KEY);
		await expect(core.createTaskFromInput({ title: "Empty list", acceptanceCriteria: [] })).rejects.toThrow(KEY);
		await expect(
			core.createTaskFromInput({ title: "Blank only", acceptanceCriteria: [{ text: "   ", checked: false }] }),
		).rejects.toThrow(KEY);
		expect(await itemFiles(root)).toEqual([]);
	});

	it("refuses a Draft with no criteria too (OQ5)", async () => {
		const root = makeBoard("true");
		await expect(new Core(root).createTaskFromInput({ title: "A draft", status: "Draft" })).rejects.toThrow(KEY);
		expect(await itemFiles(root)).toEqual([]);
	});

	it("creates an item that carries a criterion", async () => {
		const core = new Core(makeBoard("true"));
		const { task } = await core.createTaskFromInput({ title: "With criteria", acceptanceCriteria: CRITERION });
		expect((await core.filesystem.loadTask(task.id))?.acceptanceCriteriaItems?.map((c) => c.text)).toEqual([
			"Something is proven",
		]);
	});
});

describe("Core.createTaskFromInput with the key absent or off", () => {
	for (const requirement of [undefined, "false"] as const) {
		it(`creates an item with no criteria when the key is ${requirement ?? "absent"}`, async () => {
			const core = new Core(makeBoard(requirement));
			const { task } = await core.createTaskFromInput({ title: "No criteria" });
			expect(await core.filesystem.loadTask(task.id)).not.toBeNull();
			const draft = await core.createTaskFromInput({ title: "A draft", status: "Draft" });
			expect(draft.task.status).toBe("Draft");
		});
	}
});

function board(root: string, ...args: string[]) {
	const proc = Bun.spawnSync(["bun", CLI, ...args], {
		env: { ...process.env, CODER_FLEET_BOARD_ROOT: root },
		stdout: "pipe",
		stderr: "pipe",
	});
	return { code: proc.exitCode, out: proc.stdout.toString(), err: proc.stderr.toString() };
}

describe("board task create (CLI)", () => {
	it("refuses with a message naming the key and exits non-zero when the key is on", async () => {
		const root = makeBoard("true");
		const r = board(root, "task", "create", "No criteria");
		expect(r.code).not.toBe(0);
		expect(r.err).toContain(KEY);
		expect(await itemFiles(root)).toEqual([]);
	});

	it("creates with --ac when the key is on", () => {
		const r = board(makeBoard("true"), "task", "create", "With criteria", "--ac", "Something is proven");
		expect(r.code).toBe(0);
		expect(r.out).toContain("Created BD-1");
	});

	it("creates with no criteria when the key is off", () => {
		expect(board(makeBoard("false"), "task", "create", "No criteria").code).toBe(0);
	});
});

const textOf = (content: unknown): string => ((content as Array<{ text?: string }>)?.[0]?.text ?? "") as string;

describe("MCP task_create", () => {
	let server: McpServer | null = null;

	afterEach(async () => {
		await server?.stop();
		server = null;
	});

	async function mcpOn(root: string): Promise<McpServer> {
		server = new McpServer(root, "Test instructions");
		const config = await server.filesystem.loadConfig();
		if (!config) throw new Error("config did not load");
		registerTaskTools(server, config);
		return server;
	}

	async function create(root: string, args: Record<string, unknown>) {
		const mcp = await mcpOn(root);
		return await mcp.testInterface.callTool({ params: { name: "task_create", arguments: args } });
	}

	it("returns a tool error naming the key, not a crash, when the key is on", async () => {
		const root = makeBoard("true");
		const result = await create(root, { title: "No criteria" });
		expect(result.isError).toBe(true);
		expect(textOf(result.content)).toContain(KEY);
		expect(await itemFiles(root)).toEqual([]);
	});

	it("refuses a Draft over MCP too", async () => {
		const result = await create(makeBoard("true"), { title: "A draft", status: "Draft" });
		expect(result.isError).toBe(true);
		expect(textOf(result.content)).toContain(KEY);
	});

	it("creates when acceptanceCriteria carries a criterion, as the lead files cards", async () => {
		const result = await create(makeBoard("true"), {
			title: "With criteria",
			acceptanceCriteria: ["Something is proven"],
		});
		expect(result.isError).toBeFalsy();
	});

	it("creates with no criteria when the key is absent", async () => {
		const result = await create(makeBoard(), { title: "No criteria" });
		expect(result.isError).toBeFalsy();
	});
});

describe("POST /api/tasks (web UI)", () => {
	let server: BacklogServer | null = null;

	afterEach(async () => {
		await server?.stop();
		server = null;
	});

	async function post(root: string, body: unknown): Promise<Response> {
		server = new BacklogServer(root);
		await server.start(0, false);
		const port = server.getPort() ?? 0;
		await retry(async () => {
			await fetch(`http://127.0.0.1:${port}/api/tasks`);
		});
		return await fetch(`http://127.0.0.1:${port}/api/tasks`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});
	}

	it("returns 400 with the message naming the key when the key is on", async () => {
		const root = makeBoard("true");
		const response = await post(root, { title: "No criteria" });
		expect(response.status).toBe(400);
		expect(((await response.json()) as { error: string }).error).toContain(KEY);
		expect(await itemFiles(root)).toEqual([]);
	});

	it("creates with acceptanceCriteriaItems when the key is on", async () => {
		const response = await post(makeBoard("true"), {
			title: "With criteria",
			acceptanceCriteriaItems: [{ text: "Something is proven", checked: false }],
		});
		expect(response.status).toBe(201);
	});

	it("creates with no criteria when the key is off", async () => {
		const response = await post(makeBoard("false"), { title: "No criteria" });
		expect(response.status).toBe(201);
	});
});
