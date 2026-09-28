import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { McpServer } from "../mcp/server.ts";
import { registerTaskTools } from "../mcp/tools/tasks/index.ts";
import type { JsonSchema } from "../mcp/validation/validators.ts";
import { createUniqueTestDir, initializeFilesystemTestProject, safeCleanup } from "./test-utils.ts";

// task_edit must not advertise a status default. The server never applies one, but a client that
// fills schema defaults, or a model that reads one as the value to send, would move every edited
// card to the first column. These tests edit a card in each column without naming a status.

const COLUMNS = ["To Do", "In Progress", "Blocked", "Blocked by human", "Done"];

const getText = (content: unknown[] | undefined, index = 0): string => {
	const item = content?.[index] as { text?: string } | undefined;
	return item?.text ?? "";
};

/**
 * A model of a client that fills schema defaults (ajv's useDefaults, or a model taking the listed
 * default as the value to send): every top-level property absent from the arguments gets its default.
 */
function fillSchemaDefaults(
	inputSchema: JsonSchema | undefined,
	args: Record<string, unknown>,
): Record<string, unknown> {
	const filled = { ...args };
	for (const [key, property] of Object.entries(inputSchema?.properties ?? {})) {
		if (filled[key] === undefined && property && "default" in property && property.default !== undefined) {
			filled[key] = property.default;
		}
	}
	return filled;
}

let TEST_DIR: string;
let server: McpServer;

describe("MCP task_edit leaves the status alone when none is named", () => {
	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("mcp-task-edit-status");
		server = new McpServer(TEST_DIR, "Test instructions");
		await server.filesystem.ensureBacklogStructure();
		await initializeFilesystemTestProject(server, "Test Project");

		const loaded = await server.filesystem.loadConfig();
		if (!loaded) throw new Error("Failed to load config");
		await server.filesystem.saveConfig({ ...loaded, statuses: COLUMNS, defaultStatus: "To Do" });
		const config = await server.filesystem.loadConfig();
		if (!config) throw new Error("Failed to reload config");
		registerTaskTools(server, config);
	});

	afterEach(async () => {
		const stopResult = await Promise.allSettled([server.stop()]);
		const cleanupResult = await Promise.allSettled([safeCleanup(TEST_DIR)]);
		const errors = [...stopResult, ...cleanupResult]
			.filter((result): result is PromiseRejectedResult => result.status === "rejected")
			.map((result) => result.reason);
		if (errors.length === 1) throw errors[0];
		if (errors.length > 1) throw new AggregateError(errors, "MCP server and fixture cleanup both failed");
	});

	async function call(name: string, args: Record<string, unknown>) {
		return await server.testInterface.callTool({ params: { name, arguments: args } });
	}

	async function listedSchema(name: string): Promise<JsonSchema | undefined> {
		const tools = await server.testInterface.listTools();
		return tools.tools.find((tool) => tool.name === name)?.inputSchema as JsonSchema | undefined;
	}

	/** One card per column, plus a second Done card completed into completed/. Returns id -> status. */
	async function seedCards(): Promise<{ cards: Array<{ id: string; status: string }>; completedId: string }> {
		const cards: Array<{ id: string; status: string }> = [];
		for (const status of COLUMNS) {
			const created = await call("task_create", { title: `Card in ${status}`, status });
			expect(created.isError).toBeFalsy();
			cards.push({ id: `TASK-${cards.length + 1}`, status });
		}
		const done = await call("task_create", { title: "Completed card", status: "Done" });
		expect(done.isError).toBeFalsy();
		const completedId = `TASK-${cards.length + 1}`;
		const complete = await call("task_complete", { id: completedId });
		expect(complete.isError).toBeFalsy();
		cards.push({ id: completedId, status: "Done" });
		return { cards, completedId };
	}

	async function statusShownFor(id: string): Promise<string> {
		const view = await call("task_view", { id });
		expect(view.isError).toBeFalsy();
		const line = getText(view.content as unknown[])
			.split("\n")
			.find((candidate) => candidate.startsWith("Status: "));
		const status = COLUMNS.find((column) => line?.endsWith(` ${column}`));
		return status ?? `unrecognised: ${line}`;
	}

	async function assertCompletedStaysCompleted(completedId: string): Promise<void> {
		const prefix = completedId.toLowerCase();
		const completed = await Array.fromAsync(
			new Bun.Glob(`${prefix} *.md`).scan({ cwd: server.filesystem.completedDir, followSymlinks: true }),
		);
		expect(completed.length).toBe(1);
		const active = await Array.fromAsync(
			new Bun.Glob(`${prefix} *.md`).scan({ cwd: server.filesystem.tasksDir, followSymlinks: true }),
		);
		expect(active).toEqual([]);
	}

	it("(a) lists no status default on task_edit, and keeps task_create's", async () => {
		const editStatus = (await listedSchema("task_edit"))?.properties?.status;
		const createStatus = (await listedSchema("task_create"))?.properties?.status;

		expect(editStatus).toBeDefined();
		expect(editStatus && "default" in editStatus).toBe(false);
		expect(editStatus?.description).toContain("Omit to leave the status unchanged");
		expect(createStatus?.default).toBe("To Do");
	});

	it("(b) keeps every card's status when the server edits without one", async () => {
		const { cards, completedId } = await seedCards();

		for (const card of cards) {
			const result = await call("task_edit", {
				id: card.id,
				commentsAppend: [`Comment on ${card.id}`],
				commentAuthor: "@test",
			});
			expect(result.isError).toBeFalsy();
			expect({ id: card.id, status: await statusShownFor(card.id) }).toEqual(card);
		}
		await assertCompletedStaysCompleted(completedId);
	});

	it("(c) keeps every card's status when a client fills the listed defaults first", async () => {
		const { cards, completedId } = await seedCards();
		const schema = await listedSchema("task_edit");

		// The edit must also succeed: on a completed card a filled-in status is refused, which keeps the
		// status but loses the comment the client meant to add.
		const outcomes: Array<{ id: string; status: string; refused: boolean }> = [];
		for (const card of cards) {
			const args = fillSchemaDefaults(schema, {
				id: card.id,
				commentsAppend: [`Filled comment on ${card.id}`],
				commentAuthor: "@client",
			});
			const result = await call("task_edit", args);
			outcomes.push({ id: card.id, status: await statusShownFor(card.id), refused: result.isError === true });
		}

		expect(outcomes).toEqual(cards.map((card) => ({ ...card, refused: false })));
		await assertCompletedStaysCompleted(completedId);
	});
});
