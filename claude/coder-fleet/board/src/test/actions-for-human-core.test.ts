import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { DEFAULT_DIRECTORIES } from "../constants/index.ts";
import { Core } from "../core/backlog.ts";
import { parseTask } from "../markdown/parser.ts";
import type { AcceptanceCriterion, Task, TaskComment, TaskUpdateInput } from "../types/index.ts";

// CF-25: the binary owns the Actions for Human rules. An add appends, flags an ask that is not a
// question and never moves a column; a tick touches one action; any status change out of Blocked by
// human, or into Done from elsewhere, clears the section and archives it as one @board comment in
// the same write; the lead's clear archives with a reason and moves nothing.

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

type ActionsInput = TaskUpdateInput & {
	addActionsForHuman?: string[];
	checkActionsForHuman?: number[];
	uncheckActionsForHuman?: number[];
	clearActionsForHuman?: { reason: string; author?: string };
};

function git(root: string, ...args: string[]): string {
	const proc = Bun.spawnSync(["git", "-C", root, ...args], { stdout: "pipe", stderr: "pipe" });
	if (proc.exitCode !== 0) throw new Error(proc.stderr.toString());
	return proc.stdout.toString();
}

function makeBoard(): string {
	const root = mkdtempSync(join(tmpdir(), "board-actions-"));
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

const dirOf = (root: string, name: string) => join(root, DEFAULT_DIRECTORIES.BACKLOG, name);
const filesIn = (dir: string) => (existsSync(dir) ? readdirSync(dir).filter((name) => name.endsWith(".md")) : []);
const commitCount = (root: string) => Number(git(root, "rev-list", "--count", "HEAD").trim());

const edit = (core: Core, id: string, input: ActionsInput) => core.updateTaskFromInput(id, input as TaskUpdateInput);

async function reread(root: string, id: string): Promise<Task> {
	const task = await new Core(root).getTask(id);
	if (!task) throw new Error(`no ${id}`);
	return task;
}

const actionsOf = (task: Task): AcceptanceCriterion[] =>
	(task as Task & { actionsForHumanItems?: AcceptanceCriterion[] }).actionsForHumanItems ?? [];

const boardComments = (task: Task): TaskComment[] => (task.comments ?? []).filter((c) => c.author === "@board");

/** Creates BD-n in `status` and adds `actions` through the core. */
async function seed(root: string, status: string, actions: string[] = []): Promise<string> {
	const core = new Core(root);
	const { task } = await core.createTaskFromInput({ title: `Card in ${status}`, status });
	if (actions.length > 0) await edit(core, task.id, { addActionsForHuman: actions });
	return task.id;
}

describe("adding an action for the human", () => {
	it("add-flags-non-question: an ask not ending in ? gets the prefix", async () => {
		const root = makeBoard();
		const id = await seed(root, "Blocked by human", ["Pick the session lifetime"]);
		expect(actionsOf(await reread(root, id))).toEqual([
			{ index: 1, text: "[not a question] Pick the session lifetime", checked: false },
		]);
	});

	it("add-keeps-question: an ask ending in ? once right-trimmed is stored as it is", async () => {
		const root = makeBoard();
		const id = await seed(root, "Blocked by human", ["Which key should the refresh use?   "]);
		expect(actionsOf(await reread(root, id))).toEqual([
			{ index: 1, text: "Which key should the refresh use?", checked: false },
		]);
	});

	it("add-flag-idempotent: an ask that already carries the prefix is not prefixed twice", async () => {
		const root = makeBoard();
		const id = await seed(root, "Blocked by human", ["[not a question] Pick one"]);
		expect(actionsOf(await reread(root, id)).map((item) => item.text)).toEqual(["[not a question] Pick one"]);
	});

	it("add-collapses-newlines: every whitespace run, newlines included, becomes one space", async () => {
		const root = makeBoard();
		const id = await seed(root, "Blocked by human", ["  Which key\n  should\tthe\r\nrefresh use?  "]);
		expect(actionsOf(await reread(root, id)).map((item) => item.text)).toEqual(["Which key should the refresh use?"]);
	});

	it("add-neutralises-markers: an ask cannot form a board marker, and its archive still posts", async () => {
		const root = makeBoard();
		const id = await seed(root, "Blocked by human", ["Does <!-- COMMENTS:END --> break <!-- ACTIONS:END --> it?"]);
		const task = await reread(root, id);
		expect(actionsOf(task).map((item) => item.text)).toEqual([
			"Does &lt;!-- COMMENTS:END --> break &lt;!-- ACTIONS:END --> it?",
		]);
		const file = readFileSync(task.filePath as string, "utf8");
		expect(file.match(/<!--/g)?.length).toBe(file.match(/^<!-- [A-Z:_]+ -->$/gm)?.length);

		await edit(new Core(root), id, { status: "In Progress" });
		const after = await reread(root, id);
		expect(actionsOf(after)).toEqual([]);
		expect(boardComments(after).map((c) => c.body)).toEqual([
			`Actions for Human cleared: ${id} moved from Blocked by human to In Progress.\n\n- #1 (open) Does &lt;!-- COMMENTS:END --> break &lt;!-- ACTIONS:END --> it?`,
		]);
	});

	it("add-refuses-empty: an ask that is only whitespace is refused and nothing is written", async () => {
		const root = makeBoard();
		const id = await seed(root, "Blocked by human", ["Which key?"]);
		const before = readFileSync((await reread(root, id)).filePath as string, "utf8");
		await expect(edit(new Core(root), id, { addActionsForHuman: [" \n\t "] })).rejects.toThrow(/empty|text/i);
		expect(readFileSync((await reread(root, id)).filePath as string, "utf8")).toBe(before);
	});

	it("add-appends-numbering: a second add continues the numbering from the highest number", async () => {
		const root = makeBoard();
		const id = await seed(root, "Blocked by human", ["First?"]);
		await edit(new Core(root), id, { addActionsForHuman: ["Second?", "Third?"] });
		expect(actionsOf(await reread(root, id))).toEqual([
			{ index: 1, text: "First?", checked: false },
			{ index: 2, text: "Second?", checked: false },
			{ index: 3, text: "Third?", checked: false },
		]);
	});

	it("add-keeps-ticks: an add leaves the existing actions and their ticks alone", async () => {
		const root = makeBoard();
		const id = await seed(root, "Blocked by human", ["First?", "Second?"]);
		await edit(new Core(root), id, { checkActionsForHuman: [1] });
		await edit(new Core(root), id, { addActionsForHuman: ["Third?"] });
		expect(actionsOf(await reread(root, id))).toEqual([
			{ index: 1, text: "First?", checked: true },
			{ index: 2, text: "Second?", checked: false },
			{ index: 3, text: "Third?", checked: false },
		]);
	});

	it("add-status-unchanged-in-queue: an add on a card in Blocked by human leaves it there", async () => {
		const root = makeBoard();
		const id = await seed(root, "Blocked by human");
		expect((await reread(root, id)).status).toBe("Blocked by human");
		await edit(new Core(root), id, { addActionsForHuman: ["Which key?"] });
		const after = await reread(root, id);
		expect(after.status).toBe("Blocked by human");
		expect(actionsOf(after).length).toBe(1);
	});

	it("add-status-unchanged-outside: an add on a card outside the queue moves nothing", async () => {
		const root = makeBoard();
		const id = await seed(root, "In Progress");
		expect((await reread(root, id)).status).toBe("In Progress");
		await edit(new Core(root), id, { addActionsForHuman: ["Which key?"] });
		const after = await reread(root, id);
		expect(after.status).toBe("In Progress");
		expect(actionsOf(after).length).toBe(1);
	});
});

describe("ticking an action", () => {
	it("tick-one-only: a tick changes the named action and nothing else", async () => {
		const root = makeBoard();
		const id = await seed(root, "Blocked by human", ["First?", "Second?", "Third?"]);
		await edit(new Core(root), id, { checkActionsForHuman: [2] });
		const after = await reread(root, id);
		expect(after.status).toBe("Blocked by human");
		expect(actionsOf(after).map((item) => item.checked)).toEqual([false, true, false]);
	});

	it("untick: an untick clears only the named tick", async () => {
		const root = makeBoard();
		const id = await seed(root, "Blocked by human", ["First?", "Second?"]);
		await edit(new Core(root), id, { checkActionsForHuman: [1, 2] });
		await edit(new Core(root), id, { uncheckActionsForHuman: [1] });
		expect(actionsOf(await reread(root, id)).map((item) => item.checked)).toEqual([false, true]);
	});

	it("ticked-stays: a ticked action stays in the section, shown ticked", async () => {
		const root = makeBoard();
		const id = await seed(root, "Blocked by human", ["First?"]);
		await edit(new Core(root), id, { checkActionsForHuman: [1] });
		const after = await reread(root, id);
		expect(actionsOf(after)).toEqual([{ index: 1, text: "First?", checked: true }]);
		expect(readFileSync(after.filePath as string, "utf8")).toContain("- [x] #1 First?");
	});

	it("tick-missing-number-errors: a number that does not exist is an error listing those that do", async () => {
		const root = makeBoard();
		const id = await seed(root, "Blocked by human", ["First?", "Second?"]);
		await expect(edit(new Core(root), id, { checkActionsForHuman: [5] })).rejects.toThrow(/#5.*#1-#2/s);
		await expect(edit(new Core(root), id, { uncheckActionsForHuman: [9] })).rejects.toThrow(/#9/);
	});
});

describe("leaving Blocked by human", () => {
	it("leave-queue-clears-and-archives: the move empties the section and archives every action in the same commit", async () => {
		const root = makeBoard();
		const id = await seed(root, "Blocked by human", ["Which key?", "Pick one"]);
		await edit(new Core(root), id, { checkActionsForHuman: [1] });
		const commitsBefore = commitCount(root);

		await edit(new Core(root), id, { status: "In Progress" });

		expect(commitCount(root)).toBe(commitsBefore + 1);
		const after = await reread(root, id);
		expect(after.status).toBe("In Progress");
		expect(actionsOf(after)).toEqual([]);
		const file = readFileSync(after.filePath as string, "utf8");
		expect(file).not.toContain("## Actions for Human");
		expect(file).not.toContain("ACTIONS:");
		expect(boardComments(after).map((c) => c.body)).toEqual([
			`Actions for Human cleared: ${id} moved from Blocked by human to In Progress.\n\n- #1 (ticked) Which key?\n- #2 (open) [not a question] Pick one`,
		]);
		// The comment and the move are one commit: HEAD's parent has the section, HEAD has the archive.
		const relativePath = `${DEFAULT_DIRECTORIES.BACKLOG}/${DEFAULT_DIRECTORIES.TASKS}/${basename(after.filePath as string)}`;
		expect(git(root, "show", `HEAD:${relativePath}`)).toBe(file);
		const previous = git(root, "show", `HEAD^:${relativePath}`);
		expect(previous).toContain("## Actions for Human");
		expect(previous).not.toContain("Actions for Human cleared");
	});

	it("stay-in-queue-untouched: a status write that stays in Blocked by human clears nothing", async () => {
		const root = makeBoard();
		const id = await seed(root, "Blocked by human", ["Which key?", "Pick one?"]);
		await edit(new Core(root), id, {
			status: "blocked by human",
			appendComments: [{ body: "Still waiting", author: "@lead" }],
		});
		const after = await reread(root, id);
		expect(after.status).toBe("Blocked by human");
		expect(actionsOf(after).length).toBe(2);
		expect(boardComments(after)).toEqual([]);
	});

	it("queue-to-done-one-archive: Blocked by human to Done archives once", async () => {
		const root = makeBoard();
		const id = await seed(root, "Blocked by human", ["Which key?"]);
		await edit(new Core(root), id, { status: "Done" });
		const after = await reread(root, id);
		expect(actionsOf(after)).toEqual([]);
		expect(boardComments(after).map((c) => c.body)).toEqual([
			`Actions for Human cleared: ${id} moved from Blocked by human to Done.\n\n- #1 (open) Which key?`,
		]);
	});

	it("an add in the same call as a move out of the queue is kept, and only the earlier actions archive", async () => {
		const root = makeBoard();
		const id = await seed(root, "Blocked by human", ["Old ask?"]);
		await edit(new Core(root), id, { status: "In Progress", addActionsForHuman: ["New ask?"] });
		const after = await reread(root, id);
		expect(actionsOf(after)).toEqual([{ index: 1, text: "New ask?", checked: false }]);
		expect(boardComments(after).map((c) => c.body)).toEqual([
			`Actions for Human cleared: ${id} moved from Blocked by human to In Progress.\n\n- #1 (open) Old ask?`,
		]);
	});
});

describe("entering Done from outside the queue", () => {
	it("enter-done-clears: In Progress to Done clears and archives in one write and one commit", async () => {
		const root = makeBoard();
		const id = await seed(root, "In Progress", ["Which key?"]);
		const commitsBefore = commitCount(root);
		await edit(new Core(root), id, { status: "Done" });
		expect(commitCount(root)).toBe(commitsBefore + 1);
		const after = await reread(root, id);
		expect(after.status).toBe("Done");
		expect(actionsOf(after)).toEqual([]);
		expect(boardComments(after).map((c) => c.body)).toEqual([
			`Actions for Human cleared: ${id} moved from In Progress to Done.\n\n- #1 (open) Which key?`,
		]);
	});

	it("other-moves-untouched: To Do to In Progress, and In Progress to Blocked, leave the section alone", async () => {
		const root = makeBoard();
		const id = await seed(root, "To Do", ["Which key?", "Pick one"]);
		const before = actionsOf(await reread(root, id));

		await edit(new Core(root), id, { status: "In Progress" });
		let after = await reread(root, id);
		expect(after.status).toBe("In Progress");
		expect(actionsOf(after)).toEqual(before);
		expect(boardComments(after)).toEqual([]);

		await edit(new Core(root), id, { status: "Blocked" });
		after = await reread(root, id);
		expect(after.status).toBe("Blocked");
		expect(actionsOf(after)).toEqual(before);
		expect(boardComments(after)).toEqual([]);
	});
});

describe("the lead's clear", () => {
	it("lead-clear-archives-with-reason: the clear empties the section and archives with the reason", async () => {
		const root = makeBoard();
		const id = await seed(root, "Blocked by human", ["Which key?", "Pick one"]);
		await edit(new Core(root), id, {
			clearActionsForHuman: { reason: "Mis-bound blocker from\nanother card", author: "@lead" },
		});
		const after = await reread(root, id);
		expect(actionsOf(after)).toEqual([]);
		expect(boardComments(after).map((c) => c.body)).toEqual([
			"Actions for Human cleared by @lead, moving no column: Mis-bound blocker from another card\n\n- #1 (open) Which key?\n- #2 (open) [not a question] Pick one",
		]);
	});

	it("lead-clear-status-unchanged: the clear moves no column, in or out of the queue", async () => {
		const root = makeBoard();
		const queued = await seed(root, "Blocked by human", ["Which key?"]);
		const outside = await seed(root, "In Progress", ["Which key?"]);
		for (const [id, status] of [
			[queued, "Blocked by human"],
			[outside, "In Progress"],
		] as const) {
			expect((await reread(root, id)).status).toBe(status);
			await edit(new Core(root), id, { clearActionsForHuman: { reason: "Void", author: "@lead" } });
			const after = await reread(root, id);
			expect(after.status).toBe(status);
			expect(actionsOf(after)).toEqual([]);
			expect(boardComments(after).length).toBe(1);
		}
	});

	it("clear-needs-reason: a clear without a reason is refused and nothing is written", async () => {
		const root = makeBoard();
		const id = await seed(root, "Blocked by human", ["Which key?"]);
		await expect(edit(new Core(root), id, { clearActionsForHuman: { reason: "  \n " } })).rejects.toThrow(/reason/i);
		expect(actionsOf(await reread(root, id)).length).toBe(1);
	});

	it("clear-alone-in-call: a clear alongside an add, a tick or an untick is refused", async () => {
		const root = makeBoard();
		const id = await seed(root, "Blocked by human", ["Which key?"]);
		const clear = { reason: "Void", author: "@lead" };
		await expect(edit(new Core(root), id, { clearActionsForHuman: clear, addActionsForHuman: ["x?"] })).rejects.toThrow(
			/clear/i,
		);
		await expect(edit(new Core(root), id, { clearActionsForHuman: clear, checkActionsForHuman: [1] })).rejects.toThrow(
			/clear/i,
		);
		await expect(
			edit(new Core(root), id, { clearActionsForHuman: clear, uncheckActionsForHuman: [1] }),
		).rejects.toThrow(/clear/i);
		expect(actionsOf(await reread(root, id)).length).toBe(1);
	});
});

describe("board moves that skip the edit path", () => {
	it("drag-out-of-queue-clears: a reorder into another column clears and archives", async () => {
		const root = makeBoard();
		const id = await seed(root, "Blocked by human", ["Which key?"]);
		await new Core(root).reorderTask({ taskId: id, targetStatus: "In Progress", orderedTaskIds: [id] });
		const after = await reread(root, id);
		expect(after.status).toBe("In Progress");
		expect(actionsOf(after)).toEqual([]);
		expect(boardComments(after).map((c) => c.body)).toEqual([
			`Actions for Human cleared: ${id} moved from Blocked by human to In Progress.\n\n- #1 (open) Which key?`,
		]);
	});

	it("a reorder inside Blocked by human clears nothing", async () => {
		const root = makeBoard();
		const first = await seed(root, "Blocked by human", ["Which key?"]);
		const second = await seed(root, "Blocked by human", ["Pick one?"]);
		await new Core(root).reorderTask({
			taskId: first,
			targetStatus: "Blocked by human",
			orderedTaskIds: [second, first],
		});
		expect(actionsOf(await reread(root, first)).length).toBe(1);
		expect(actionsOf(await reread(root, second)).length).toBe(1);
	});

	it("batch-move-out-of-queue-clears: a batch move out of the queue clears and archives each card", async () => {
		const root = makeBoard();
		const first = await seed(root, "Blocked by human", ["Which key?"]);
		const second = await seed(root, "Blocked by human", ["Pick one?"]);
		await new Core(root).moveTasksToStatus({ taskIds: [first, second], targetStatus: "To Do" });
		for (const id of [first, second]) {
			const after = await reread(root, id);
			expect(after.status).toBe("To Do");
			expect(actionsOf(after)).toEqual([]);
			expect(boardComments(after).length).toBe(1);
			expect(boardComments(after)[0]?.body).toContain(`${id} moved from Blocked by human to To Do.`);
		}
	});

	it("demote-out-of-queue-clears: demoting a queued card archives its actions into the draft", async () => {
		const root = makeBoard();
		const id = await seed(root, "Blocked by human", ["Which key?"]);
		const result = await new Core(root).demoteTask(id);
		expect(result.success).toBe(true);
		const drafts = filesIn(dirOf(root, DEFAULT_DIRECTORIES.DRAFTS));
		expect(drafts.length).toBe(1);
		const draft = parseTask(readFileSync(join(dirOf(root, DEFAULT_DIRECTORIES.DRAFTS), drafts[0] as string), "utf8"));
		expect(actionsOf(draft)).toEqual([]);
		expect(boardComments(draft).map((c) => c.body)).toEqual([
			`Actions for Human cleared: ${id} moved from Blocked by human to Draft.\n\n- #1 (open) Which key?`,
		]);
	});

	it("demote-out-of-queue-clears: an edit to status Draft clears the same way", async () => {
		const root = makeBoard();
		const id = await seed(root, "Blocked by human", ["Which key?"]);
		await new Core(root).editTaskOrDraft(id, { status: "Draft" });
		const drafts = filesIn(dirOf(root, DEFAULT_DIRECTORIES.DRAFTS));
		expect(drafts.length).toBe(1);
		const draft = parseTask(readFileSync(join(dirOf(root, DEFAULT_DIRECTORIES.DRAFTS), drafts[0] as string), "utf8"));
		expect(actionsOf(draft)).toEqual([]);
		expect(boardComments(draft).length).toBe(1);
	});

	it("complete-clears-before-move: an action on an active Done card is archived before the file moves", async () => {
		const root = makeBoard();
		const id = await seed(root, "Done", ["Late ask?"]);
		expect(actionsOf(await reread(root, id)).length).toBe(1);
		const commitsBefore = commitCount(root);
		expect(await new Core(root).completeTask(id)).toBe(true);
		expect(commitCount(root)).toBe(commitsBefore + 1);
		const completed = filesIn(dirOf(root, DEFAULT_DIRECTORIES.COMPLETED));
		expect(completed.length).toBe(1);
		const text = readFileSync(join(dirOf(root, DEFAULT_DIRECTORIES.COMPLETED), completed[0] as string), "utf8");
		const task = parseTask(text);
		expect(actionsOf(task)).toEqual([]);
		expect(text).not.toContain("ACTIONS:");
		expect(boardComments(task).map((c) => c.body)).toEqual([
			`Actions for Human cleared: ${id} moved from Done to completed.\n\n- #1 (open) Late ask?`,
		]);
	});
});

describe("completed cards and drafts", () => {
	/** A Done card completed with an actions section written into its file by hand. */
	async function completedWithActions(root: string): Promise<string> {
		const id = await seed(root, "Done");
		expect(await new Core(root).completeTask(id)).toBe(true);
		const name = filesIn(dirOf(root, DEFAULT_DIRECTORIES.COMPLETED))[0] as string;
		const path = join(dirOf(root, DEFAULT_DIRECTORIES.COMPLETED), name);
		const text = readFileSync(path, "utf8");
		writeFileSync(
			path,
			text.replace(
				/\n---\n\n/,
				"\n---\n\n## Actions for Human\n<!-- ACTIONS:BEGIN -->\n- [ ] #1 Left over?\n<!-- ACTIONS:END -->\n\n",
			),
		);
		git(root, "add", "-A");
		git(root, "commit", "-q", "-m", "hand edit");
		return path;
	}

	it("add-refused-on-completed: an add on a card in the completed folder is refused loudly", async () => {
		const root = makeBoard();
		const path = await completedWithActions(root);
		const before = readFileSync(path, "utf8");
		await expect(edit(new Core(root), "BD-1", { addActionsForHuman: ["New ask?"] })).rejects.toThrow(/completed/);
		expect(readFileSync(path, "utf8")).toBe(before);
	});

	it("tick-allowed-on-completed: tick, untick and clear still work on a completed card", async () => {
		const root = makeBoard();
		const path = await completedWithActions(root);
		await edit(new Core(root), "BD-1", { checkActionsForHuman: [1] });
		expect(readFileSync(path, "utf8")).toContain("- [x] #1 Left over?");
		await edit(new Core(root), "BD-1", { uncheckActionsForHuman: [1] });
		expect(readFileSync(path, "utf8")).toContain("- [ ] #1 Left over?");
		await edit(new Core(root), "BD-1", { clearActionsForHuman: { reason: "Shipped", author: "@lead" } });
		const text = readFileSync(path, "utf8");
		expect(text).not.toContain("ACTIONS:");
		expect(text).toContain("Actions for Human cleared by @lead, moving no column: Shipped");
	});

	it("add-refused-on-draft: an add on a draft is refused, since a draft is on no column", async () => {
		const root = makeBoard();
		mkdirSync(dirOf(root, DEFAULT_DIRECTORIES.DRAFTS), { recursive: true });
		const { task } = await new Core(root).createTaskFromInput({ title: "A draft", status: "Draft" });
		const draftPath = join(dirOf(root, DEFAULT_DIRECTORIES.DRAFTS), filesIn(dirOf(root, DEFAULT_DIRECTORIES.DRAFTS))[0] as string);
		const before = readFileSync(draftPath, "utf8");
		await expect(
			new Core(root).editTaskOrDraft(task.id, { addActionsForHuman: ["Which key?"] } as TaskUpdateInput),
		).rejects.toThrow(/draft/i);
		expect(readFileSync(draftPath, "utf8")).toBe(before);
	});
});
