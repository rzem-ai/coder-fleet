import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { McpServer } from "../mcp/server.ts";
import { registerTaskTools } from "../mcp/tools/tasks/index.ts";
import type { JsonSchema } from "../mcp/validation/validators.ts";
import { createUniqueTestDir, initializeFilesystemTestProject, safeCleanup } from "./test-utils.ts";

// CF-25 through MCP task_edit, the lead's way in: actionsAdd appends and moves no column wherever the
// card is, actionsCheck and actionsUncheck tick by number, a status move out of Blocked by human
// clears, actionsClear clears with a reason, and task_view shows the section first.

const COLUMNS = ["To Do", "In Progress", "Blocked", "Blocked by human", "Done"];

const getText = (content: unknown[] | undefined): string =>
	((content?.[0] as { text?: string } | undefined)?.text ?? "") as string;

let TEST_DIR: string;
let server: McpServer;

describe("MCP task_edit and the Actions for Human", () => {
	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("mcp-actions-for-human");
		server = new McpServer(TEST_DIR, "Test instructions");
		await server.filesystem.ensureBacklogStructure();
		await initializeFilesystemTestProject(server, "Test Project");
		const loaded = await server.filesystem.loadConfig();
		if (!loaded) throw new Error("Failed to load config");
		await server.filesystem.saveConfig({ ...loaded, statuses: COLUMNS, defaultStatus: "To Do" });
		const config = await server.filesystem.loadConfig();
		if (!config) throw new Error("Failed to reload config");
		registerTaskTools(server, config);
		created = 0;
	});

	afterEach(async () => {
		await server.stop();
		await safeCleanup(TEST_DIR);
	});

	async function call(name: string, args: Record<string, unknown>) {
		return await server.testInterface.callTool({ params: { name, arguments: args } });
	}

	async function ok(name: string, args: Record<string, unknown>): Promise<string> {
		const result = await call(name, args);
		expect(getText(result.content as unknown[])).not.toContain("Validation failed");
		expect(result.isError).toBeFalsy();
		return getText(result.content as unknown[]);
	}

	async function editSchema(): Promise<JsonSchema | undefined> {
		const tools = await server.testInterface.listTools();
		return tools.tools.find((tool) => tool.name === "task_edit")?.inputSchema as JsonSchema | undefined;
	}

	let created = 0;
	async function card(status: string): Promise<string> {
		await ok("task_create", { title: `Card in ${status}`, status });
		created += 1;
		return `TASK-${created}`;
	}

	async function statusOf(id: string): Promise<string> {
		const line = (await ok("task_view", { id })).split("\n").find((candidate) => candidate.startsWith("Status: "));
		return COLUMNS.find((column) => line?.endsWith(` ${column}`)) ?? `unrecognised: ${line}`;
	}

	async function actionsOf(id: string) {
		const task = await server.getTask(id);
		return (task as { actionsForHumanItems?: Array<{ index: number; text: string; checked: boolean }> } | null)
			?.actionsForHumanItems;
	}

	it("schema-has-actions-fields: task_edit lists actionsAdd, actionsCheck, actionsUncheck and actionsClear", async () => {
		const properties = (await editSchema())?.properties ?? {};
		const add = properties.actionsAdd as JsonSchema | undefined;
		expect(add?.type).toBe("array");
		expect((add?.items as JsonSchema | undefined)?.type).toBe("string");
		expect((add?.items as JsonSchema | undefined)?.maxLength).toBe(500);
		expect(add?.maxItems).toBe(20);
		for (const name of ["actionsCheck", "actionsUncheck"]) {
			const field = properties[name] as JsonSchema | undefined;
			expect(field?.type).toBe("array");
			expect((field?.items as JsonSchema | undefined)?.type).toBe("number");
			expect((field?.items as JsonSchema | undefined)?.minimum).toBe(1);
		}
		const clear = properties.actionsClear as JsonSchema | undefined;
		expect(clear?.type).toBe("string");
		expect(clear?.minLength).toBe(1);
		expect(clear?.maxLength).toBe(1000);
		for (const name of ["actionsAdd", "actionsCheck", "actionsUncheck", "actionsClear"]) {
			expect((properties[name] as JsonSchema | undefined)?.description).toContain("moves no column");
		}
	});

	it("schema-status-no-default: task_edit still lists no status default", async () => {
		const status = (await editSchema())?.properties?.status;
		expect(status).toBeDefined();
		expect(status && "default" in status).toBe(false);
	});

	it("mcp-add-appends-in-queue: an add on a queued card appends and leaves it in Blocked by human", async () => {
		const id = await card("Blocked by human");
		await ok("task_edit", { id, actionsAdd: ["Which key?"] });
		expect(await statusOf(id)).toBe("Blocked by human");
		await ok("task_edit", { id, actionsAdd: ["Pick one"] });
		expect(await statusOf(id)).toBe("Blocked by human");
		expect(await actionsOf(id)).toEqual([
			{ index: 1, text: "Which key?", checked: false },
			{ index: 2, text: "[not a question] Pick one", checked: false },
		]);
	});

	it("mcp-add-appends-outside: an add on a card outside the queue appends and moves nothing", async () => {
		const id = await card("In Progress");
		expect(await statusOf(id)).toBe("In Progress");
		await ok("task_edit", { id, actionsAdd: ["Which key?"] });
		await ok("task_edit", { id, actionsAdd: ["Pick one?"] });
		expect(await statusOf(id)).toBe("In Progress");
		expect((await actionsOf(id))?.map((item) => item.index)).toEqual([1, 2]);
	});

	it("mcp-check-uncheck: actionsCheck and actionsUncheck tick by number and move nothing", async () => {
		const id = await card("Blocked by human");
		await ok("task_edit", { id, actionsAdd: ["First?", "Second?"] });
		await ok("task_edit", { id, actionsCheck: [2] });
		expect((await actionsOf(id))?.map((item) => item.checked)).toEqual([false, true]);
		await ok("task_edit", { id, actionsUncheck: [2] });
		expect((await actionsOf(id))?.map((item) => item.checked)).toEqual([false, false]);
		expect(await statusOf(id)).toBe("Blocked by human");
	});

	it("mcp-status-out-of-queue-clears: a status move out of Blocked by human clears and archives", async () => {
		const id = await card("Blocked by human");
		await ok("task_edit", { id, actionsAdd: ["Which key?"] });
		const text = await ok("task_edit", { id, status: "In Progress" });
		expect(text).not.toContain("Actions for Human:");
		expect(text).toContain(`Actions for Human cleared: ${id} moved from Blocked by human to In Progress.`);
		expect(await actionsOf(id)).toEqual([]);
	});

	it("mcp-clear: actionsClear empties the section with the reason and keeps the column", async () => {
		const id = await card("Blocked by human");
		await ok("task_edit", { id, actionsAdd: ["Which key?"] });
		await ok("task_edit", { id, actionsClear: "Mis-bound blocker", commentAuthor: "@lead" });
		expect(await statusOf(id)).toBe("Blocked by human");
		expect(await actionsOf(id)).toEqual([]);
		const task = await server.getTask(id);
		expect(task?.comments?.map((comment) => comment.body)).toEqual([
			"Actions for Human cleared by @lead, moving no column: Mis-bound blocker\n\n- #1 (open) Which key?",
		]);
	});

	it("mcp-task-view-renders-first: task_view shows the numbered actions before Status and Description", async () => {
		const id = await card("Blocked by human");
		await ok("task_edit", { id, actionsAdd: ["Which key?", "Pick one"] });
		await ok("task_edit", { id, actionsCheck: [1] });
		const text = await ok("task_view", { id });
		expect(text).toContain("Actions for Human:\n" + "-".repeat(50) + "\n- [x] #1 Which key?\n- [ ] #2 [not a question] Pick one\n");
		expect(text.indexOf("Actions for Human:")).toBeLessThan(text.indexOf("Status: "));
		expect(text.indexOf("Actions for Human:")).toBeLessThan(text.indexOf("Description:"));
	});
});
