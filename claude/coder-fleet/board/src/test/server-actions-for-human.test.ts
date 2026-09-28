import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { Core } from "../core/backlog.ts";
import { BacklogServer } from "../server/index.ts";
import type { AcceptanceCriterion, Task, TaskUpdateInput } from "../types/index.ts";
import { createUniqueTestDir, retry, safeCleanup } from "./test-utils.ts";

// CF-25 through the web server: the PUT that the modal's status change and checkboxes use, and the
// drag and batch-move endpoints that skip the edit path. Every way out of Blocked by human clears
// and archives; a tick changes one action.

let TEST_DIR: string;
let server: BacklogServer | null = null;
let port = 0;

const actionsOf = (task: Task | null): AcceptanceCriterion[] =>
	(task as (Task & { actionsForHumanItems?: AcceptanceCriterion[] }) | null)?.actionsForHumanItems ?? [];

async function send(method: string, path: string, body: unknown): Promise<Response> {
	return await fetch(`http://127.0.0.1:${port}${path}`, {
		method,
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
}

async function reread(id: string): Promise<Task | null> {
	return await new Core(TEST_DIR).getTask(id);
}

/** Seeds the card on disk, then starts the server, so the server reads the seeded file. */
async function seed(status: string, actions: string[]): Promise<string> {
	const core = new Core(TEST_DIR);
	const { task } = await core.createTaskFromInput({ title: `Card in ${status}`, status });
	await core.updateTaskFromInput(task.id, { addActionsForHuman: actions } as TaskUpdateInput);
	server = new BacklogServer(TEST_DIR);
	await server.start(0, false);
	port = server.getPort() ?? 0;
	await retry(async () => {
		await fetch(`http://127.0.0.1:${port}/api/tasks`);
	});
	return task.id;
}

const archiveOf = (task: Task | null) =>
	(task?.comments ?? []).filter((comment) => comment.author === "@board").map((comment) => comment.body);

describe("the web server and the Actions for Human", () => {
	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("server-actions-for-human");
		await mkdir(TEST_DIR, { recursive: true });
		const core = new Core(TEST_DIR);
		await core.filesystem.ensureBacklogStructure();
		await core.filesystem.saveConfig({
			projectName: "Server Actions",
			statuses: ["To Do", "In Progress", "Blocked", "Blocked by human", "Done"],
			labels: [],
			milestones: [],
			dateFormat: "YYYY-MM-DD",
			remoteOperations: false,
		});
	});

	afterEach(async () => {
		await server?.stop();
		server = null;
		await safeCleanup(TEST_DIR);
	});

	it("put-status-out-of-queue-clears: a PUT moving the card out of Blocked by human clears and archives", async () => {
		const id = await seed("Blocked by human", ["Which key?"]);
		const response = await send("PUT", `/api/tasks/${id}`, { status: "In Progress" });
		expect(response.status).toBe(200);
		const after = await reread(id);
		expect(after?.status).toBe("In Progress");
		expect(actionsOf(after)).toEqual([]);
		expect(archiveOf(after)).toEqual([
			`Actions for Human cleared: ${id} moved from Blocked by human to In Progress.\n\n- #1 (open) Which key?`,
		]);
	});

	it("put-actions-check: actionsCheck and actionsUncheck tick one action and move nothing", async () => {
		const id = await seed("Blocked by human", ["First?", "Second?"]);
		expect((await send("PUT", `/api/tasks/${id}`, { actionsCheck: [2] })).status).toBe(200);
		let after = await reread(id);
		expect(after?.status).toBe("Blocked by human");
		expect(actionsOf(after).map((item) => item.checked)).toEqual([false, true]);
		expect((await send("PUT", `/api/tasks/${id}`, { actionsUncheck: [2] })).status).toBe(200);
		after = await reread(id);
		expect(actionsOf(after).map((item) => item.checked)).toEqual([false, false]);
	});

	it("put-actions-check-refuses-non-numbers: a value that is not a number is a 400 naming it, and nothing changes", async () => {
		const id = await seed("Blocked by human", ["First?", "Second?"]);
		for (const [field, value] of [
			["actionsCheck", "1"],
			["actionsUncheck", "2"],
			["actionsCheck", null],
		] as const) {
			const response = await send("PUT", `/api/tasks/${id}`, { [field]: [value] });
			expect(response.status).toBe(400);
			const { error } = (await response.json()) as { error: string };
			expect(error).toContain(field);
			expect(error).toContain(JSON.stringify(value));
		}
		const after = await reread(id);
		expect(actionsOf(after).map((item) => item.checked)).toEqual([false, false]);
	});

	it("put-tick-and-leave: a PUT that ticks and moves out of the queue records the tick in the archive", async () => {
		const id = await seed("Blocked by human", ["Which key?"]);
		const response = await send("PUT", `/api/tasks/${id}`, { status: "In Progress", actionsCheck: [1] });
		expect(response.status).toBe(200);
		const after = await reread(id);
		expect(after?.status).toBe("In Progress");
		expect(archiveOf(after)).toEqual([
			`Actions for Human cleared: ${id} moved from Blocked by human to In Progress.\n\n- #1 (ticked) Which key?`,
		]);
	});

	it("reorder-out-of-queue-clears: a drag into another column clears and archives", async () => {
		const id = await seed("Blocked by human", ["Which key?"]);
		const response = await send("POST", "/api/tasks/reorder", {
			taskId: id,
			targetStatus: "In Progress",
			orderedTaskIds: [id],
		});
		expect(response.status).toBe(200);
		const after = await reread(id);
		expect(after?.status).toBe("In Progress");
		expect(actionsOf(after)).toEqual([]);
		expect(archiveOf(after).length).toBe(1);
	});

	it("move-out-of-queue-clears: a batch move out of the queue clears and archives", async () => {
		const id = await seed("Blocked by human", ["Which key?"]);
		const response = await send("POST", "/api/tasks/move", { taskIds: [id], targetStatus: "Done" });
		expect(response.status).toBe(200);
		const after = await reread(id);
		expect(after?.status).toBe("Done");
		expect(actionsOf(after)).toEqual([]);
		expect(archiveOf(after)).toEqual([
			`Actions for Human cleared: ${id} moved from Blocked by human to Done.\n\n- #1 (open) Which key?`,
		]);
	});
});
