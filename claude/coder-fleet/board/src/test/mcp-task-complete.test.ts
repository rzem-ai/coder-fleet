import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { McpServer } from "../mcp/server.ts";
import { registerTaskTools } from "../mcp/tools/tasks/index.ts";
import { createUniqueTestDir, initializeFilesystemTestProject, safeCleanup } from "./test-utils.ts";

const getText = (content: unknown[] | undefined, index = 0): string => {
	const item = content?.[index] as { text?: string } | undefined;
	return item?.text ?? "";
};

let TEST_DIR: string;
let server: McpServer;

async function loadConfigOrThrow(mcpServer: McpServer) {
	const config = await mcpServer.filesystem.loadConfig();
	if (!config) {
		throw new Error("Failed to load config");
	}
	return config;
}

describe("MCP task_complete", () => {
	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("mcp-task-complete");
		server = new McpServer(TEST_DIR, "Test instructions");
		await server.filesystem.ensureBacklogStructure();

		await initializeFilesystemTestProject(server, "Test Project");

		const config = await loadConfigOrThrow(server);
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

	it("moves Done tasks to the completed folder", async () => {
		await server.testInterface.callTool({
			params: {
				name: "task_create",
				arguments: {
					title: "Done task",
					status: "Done",
				},
			},
		});

		const archiveAttempt = await server.testInterface.callTool({
			params: {
				name: "task_archive",
				arguments: { id: "task-1" },
			},
		});
		expect(archiveAttempt.isError).toBe(true);
		expect(getText(archiveAttempt.content)).toContain("task_complete");

		const complete = await server.testInterface.callTool({
			params: {
				name: "task_complete",
				arguments: { id: "task-1" },
			},
		});
		expect(complete.isError).toBeUndefined();
		expect(getText(complete.content)).toContain("Completed task TASK-1");

		const activeTask = await server.filesystem.loadTask("task-1");
		expect(activeTask).toBeNull();

		const completedFiles = await Array.fromAsync(
			new Bun.Glob("task-1*.md").scan({ cwd: server.filesystem.completedDir, followSymlinks: true }),
		);
		expect(completedFiles.length).toBe(1);
	});

	it("refuses to complete tasks that are not Done", async () => {
		await server.createTask(
			{
				id: "task-1",
				title: "Not done task",
				status: "Not Done",
				assignee: [],
				createdDate: "2025-06-08",
				labels: [],
				dependencies: [],
				rawContent: "Task is not ready for completion cleanup",
			},
			false,
		);

		const complete = await server.testInterface.callTool({
			params: {
				name: "task_complete",
				arguments: { id: "task-1" },
			},
		});
		expect(complete.isError).toBe(true);
		expect(getText(complete.content)).toContain("not Done");

		const activeTask = await server.filesystem.loadTask("task-1");
		expect(activeTask?.status).toBe("Not Done");

		const archive = await server.testInterface.callTool({
			params: {
				name: "task_archive",
				arguments: { id: "task-1" },
			},
		});
		expect(archive.isError).toBeUndefined();
		expect(await server.filesystem.loadTask("task-1")).toBeNull();
	});

	const call = (args: Record<string, unknown>) =>
		server.testInterface.callTool({ params: { name: "task_complete", arguments: args } });
	const make = (id: string, status: string) =>
		server.createTask(
			{
				id,
				title: `Card ${id}`,
				status,
				assignee: [],
				createdDate: "2025-06-08",
				labels: [],
				dependencies: [],
				rawContent: "",
			},
			false,
		);

	it("clears several Done cards given as ids", async () => {
		await make("task-1", "Done");
		await make("task-2", "Done");
		const result = await call({ ids: ["task-1", "task-2", "task-1"] });
		expect(result.isError).toBeUndefined();
		expect(getText(result.content)).toContain("Completed 2 tasks");
		expect(await server.filesystem.loadTask("task-1")).toBeNull();
		expect(await server.filesystem.loadTask("task-2")).toBeNull();
	});

	it("clears a card named twice in different case once, and reports success", async () => {
		await make("task-1", "Done");
		await make("task-2", "Done");
		const result = await call({ ids: ["task-1", "TASK-1", "task-2"] });
		expect(result.isError).toBeUndefined();
		expect(getText(result.content)).toContain("Completed 2 tasks");
	});

	it("moves none of the ids when any one is not Done", async () => {
		await make("task-1", "Done");
		await make("task-2", "Not Done");
		const result = await call({ ids: ["task-1", "task-2"] });
		expect(result.isError).toBe(true);
		expect(getText(result.content)).toContain("not Done");
		expect((await server.filesystem.loadTask("task-1"))?.status).toBe("Done");
	});

	it("takes exactly one of id and ids", async () => {
		await make("task-1", "Done");
		expect((await call({})).isError).toBe(true);
		expect((await call({ id: "task-1", ids: ["task-1"] })).isError).toBe(true);
		expect((await call({ ids: [] })).isError).toBe(true);
		expect(await server.filesystem.loadTask("task-1")).not.toBeNull();
	});
});
