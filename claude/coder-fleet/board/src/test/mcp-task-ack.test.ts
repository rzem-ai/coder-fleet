import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { McpServer } from "../mcp/server.ts";
import { registerTaskTools } from "../mcp/tools/tasks/index.ts";
import { formatTaskEditAcknowledgement } from "../mcp/utils/task-response.ts";
import type { Task } from "../types/index.ts";
import { createUniqueTestDir, initializeFilesystemTestProject, safeCleanup } from "./test-utils.ts";

// CF-146: task_edit and task_create answer with a short acknowledgement rather than the whole card.
// The lead appends dozens of comments a session, and each used to echo a card of up to 67 KB back
// into its context. task_view is the one tool that still returns the card.

const COLUMNS = ["To Do", "In Progress", "Blocked", "Blocked by human", "Done"];
const ACK_LIMIT = 500;

const getText = (content: unknown[] | undefined): string =>
	((content?.[0] as { text?: string } | undefined)?.text ?? "") as string;

let TEST_DIR: string;
let server: McpServer;

describe("MCP task_edit and task_create acknowledgements", () => {
	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("mcp-task-ack");
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
		await server.stop();
		await safeCleanup(TEST_DIR);
	});

	async function ok(name: string, args: Record<string, unknown>): Promise<string> {
		const result = await server.testInterface.callTool({ params: { name, arguments: args } });
		const text = getText(result.content as unknown[]);
		expect(text).not.toContain("Validation failed");
		expect(result.isError).toBeFalsy();
		return text;
	}

	/**
	 * A card big enough that echoing it would be obvious, about 60 KB like the lead's long cards. The
	 * MCP schema caps a description at 10,000 characters, so the bulk goes in through the core as
	 * implementation notes, where a real card's bulk is its comments.
	 */
	async function longCard(): Promise<void> {
		await ok("task_create", {
			title: "A long card",
			description: "Long description line. ".repeat(400),
			acceptanceCriteria: ["First criterion", "Second criterion"],
		});
		await server.editTaskOrDraft("TASK-1", { implementationNotes: "Long notes line. ".repeat(3000) });
	}

	it("task_create returns the id, the title and the file path, and nothing of the card", async () => {
		const text = await ok("task_create", {
			title: "Short acknowledgements",
			description: "A description the acknowledgement must not echo.",
			acceptanceCriteria: ["A criterion it must not echo either"],
		});
		const task = await server.getTask("TASK-1");
		expect(task?.filePath).toBeTruthy();
		expect(text).toBe(`Created task TASK-1: Short acknowledgements\nFile: ${task?.filePath}`);
		expect(existsSync(task?.filePath ?? "")).toBe(true);
	});

	it("task_create acknowledges a draft the same way", async () => {
		const text = await ok("task_create", { title: "A draft card", status: "Draft" });
		const draft = await server.filesystem.loadDraft("DRAFT-1");
		expect(draft?.filePath).toBeTruthy();
		expect(text).toBe(`Created task DRAFT-1: A draft card\nFile: ${draft?.filePath}`);
	});

	it("task_edit appending a comment to a 60 KB card returns the id, the field and the comment number, under 500 characters", async () => {
		await longCard();
		const first = await ok("task_edit", { id: "TASK-1", commentsAppend: ["First note"], commentAuthor: "lead" });
		expect(first).toBe("Updated task TASK-1.\nChanged: comments.\nAppended comment #1.");
		const second = await ok("task_edit", {
			id: "TASK-1",
			commentsAppend: ["Second note", "Third note"],
			commentAuthor: "lead",
		});
		expect(second).toBe("Updated task TASK-1.\nChanged: comments.\nAppended comments #2-#3.");
		expect(second.length).toBeLessThan(ACK_LIMIT);
	});

	it("task_edit names only the fields whose value changed, and the actions it appended", async () => {
		await longCard();
		const text = await ok("task_edit", {
			id: "TASK-1",
			title: "A renamed card",
			status: "To Do",
			labels: ["board"],
			acceptanceCriteriaCheck: [1],
			actionsAdd: ["Answer the question", "Approve the release"],
			commentsAppend: ["A note"],
		});
		expect(text).toBe(
			"Updated task TASK-1.\nChanged: title, labels, acceptanceCriteria, comments, actionsForHuman.\nAppended comment #1.\nAppended actions #1-#2.",
		);
		expect(text.length).toBeLessThan(ACK_LIMIT);
	});

	it("task_edit that changes nothing says so", async () => {
		await ok("task_create", { title: "Unchanged", status: "In Progress" });
		const text = await ok("task_edit", { id: "TASK-1", status: "In Progress" });
		expect(text).toBe("Updated task TASK-1.\nChanged: nothing.");
	});

	it("task_edit on a completed card and on a draft returns the same acknowledgement", async () => {
		await ok("task_create", { title: "Finished", status: "Done" });
		await ok("task_complete", { id: "TASK-1" });
		const completed = await ok("task_edit", { id: "TASK-1", commentsAppend: ["After the fact"] });
		expect(completed).toBe("Updated task TASK-1.\nChanged: comments.\nAppended comment #1.");

		await ok("task_create", { title: "Drafted", status: "Draft" });
		const draft = await ok("task_edit", { id: "DRAFT-1", priority: "high" });
		expect(draft).toBe("Updated task DRAFT-1.\nChanged: priority.");
	});

	it("task_view still returns the whole card", async () => {
		await longCard();
		await ok("task_edit", { id: "TASK-1", commentsAppend: ["A note"] });
		const text = await ok("task_view", { id: "TASK-1" });
		expect(text).toContain("Long description line.");
		expect(text).toContain("First criterion");
		expect(text).toContain("A note");
		expect(text.length).toBeGreaterThan(50_000);
	});
});

describe("formatTaskEditAcknowledgement", () => {
	const base: Task = {
		id: "TASK-1",
		title: "Card",
		status: "To Do",
		assignee: [],
		createdDate: "2026-10-06 00:00",
		labels: [],
		dependencies: [],
	};

	it("stays under 500 characters when every field changes and many comments, actions and cleanups land", () => {
		const after: Task = {
			...base,
			title: "Renamed",
			status: "Draft",
			assignee: ["someone"],
			dueDate: "2026-12-01",
			labels: ["a"],
			milestone: "m-1",
			dependencies: ["TASK-2"],
			references: ["r"],
			documentation: ["d"],
			modifiedFiles: ["f"],
			description: "d",
			implementationPlan: "p",
			implementationNotes: "n",
			finalSummary: "s",
			priority: "high",
			type: "bug",
			project: "web",
			ordinal: 5,
			acceptanceCriteriaItems: [{ index: 1, text: "c", checked: false }],
			definitionOfDoneItems: [{ index: 1, text: "c", checked: false }],
			actionsForHumanItems: Array.from({ length: 20 }, (_, i) => ({ index: i + 1, text: "a", checked: false })),
			comments: Array.from({ length: 50 }, (_, i) => ({ index: i + 1, body: "c", createdDate: "x" })),
		};
		const cleaned = Array.from({ length: 200 }, (_, i) => `TASK-${1000 + i}`);
		const text = formatTaskEditAcknowledgement(base, after, cleaned);
		expect(text.length).toBeLessThan(ACK_LIMIT);
		expect(text).toContain("Appended comments #1-#50.");
		expect(text).toContain("Appended actions #1-#20.");
		expect(text).toContain("Removed references to TASK-1 from 200 tasks.");
	});

	it("keeps the dependency cleanup line upstream printed when it is short", () => {
		const text = formatTaskEditAcknowledgement(base, { ...base, status: "Draft" }, ["TASK-2"]);
		expect(text).toBe("Updated task TASK-1.\nChanged: status.\nRemoved references to TASK-1 from TASK-2.");
	});
});
