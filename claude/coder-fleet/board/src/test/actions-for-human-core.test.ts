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

const COLUMNS = ["To Do", "In Progress", "Blocked", "Blocked by human", "Done"];

function makeBoard(statuses: string[] = COLUMNS): string {
	const root = mkdtempSync(join(tmpdir(), "board-actions-"));
	roots.push(root);
	mkdirSync(join(root, DEFAULT_DIRECTORIES.BACKLOG));
	writeFileSync(
		join(root, DEFAULT_DIRECTORIES.BACKLOG, "config.yml"),
		[
			'project_name: "test"',
			'task_prefix: "BD"',
			`statuses: ${JSON.stringify(statuses)}`,
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
		const draftPath = join(
			dirOf(root, DEFAULT_DIRECTORIES.DRAFTS),
			filesIn(dirOf(root, DEFAULT_DIRECTORIES.DRAFTS))[0] as string,
		);
		const before = readFileSync(draftPath, "utf8");
		await expect(
			new Core(root).editTaskOrDraft(task.id, { addActionsForHuman: ["Which key?"] } as TaskUpdateInput),
		).rejects.toThrow(/draft/i);
		expect(readFileSync(draftPath, "utf8")).toBe(before);
	});
});

// Fix round 1: the findings of the review and the refutation of Run A.

/** Replaces the first action line of a card's file by hand and commits it, as a human edit would. */
function handEditFirstAction(root: string, path: string, line: string): void {
	const text = readFileSync(path, "utf8");
	const next = text.replace(/^- \[[ x]\] #1 .*$/m, line);
	if (next === text) throw new Error("no action line to replace");
	writeFileSync(path, next);
	git(root, "add", "-A");
	git(root, "commit", "-q", "-m", "hand edit");
}

/** Puts a directory where the card's file would land, so the rename into that folder fails. */
function blockDestination(dir: string, filename: string): void {
	mkdirSync(join(dir, filename), { recursive: true });
	writeFileSync(join(dir, filename, "keep"), "x");
}

describe("a tick and a move out of the queue in one call", () => {
	it("tick-with-leave: the tick lands first, so the archive records it and the move succeeds", async () => {
		const root = makeBoard();
		const id = await seed(root, "Blocked by human", ["Which key?", "Pick one?"]);
		const commitsBefore = commitCount(root);
		await edit(new Core(root), id, { status: "In Progress", checkActionsForHuman: [1] });
		expect(commitCount(root)).toBe(commitsBefore + 1);
		const after = await reread(root, id);
		expect(after.status).toBe("In Progress");
		expect(actionsOf(after)).toEqual([]);
		expect(boardComments(after).map((c) => c.body)).toEqual([
			`Actions for Human cleared: ${id} moved from Blocked by human to In Progress.\n\n- #1 (ticked) Which key?\n- #2 (open) Pick one?`,
		]);
	});

	it("untick-with-leave: an untick in the same call as the move is archived as open", async () => {
		const root = makeBoard();
		const id = await seed(root, "Blocked by human", ["Which key?"]);
		await edit(new Core(root), id, { checkActionsForHuman: [1] });
		await edit(new Core(root), id, { status: "Done", uncheckActionsForHuman: [1] });
		const after = await reread(root, id);
		expect(after.status).toBe("Done");
		expect(boardComments(after).map((c) => c.body)).toEqual([
			`Actions for Human cleared: ${id} moved from Blocked by human to Done.\n\n- #1 (open) Which key?`,
		]);
	});

	it("tick-add-and-leave: the tick archives with the old actions and the add stays on the card", async () => {
		const root = makeBoard();
		const id = await seed(root, "Blocked by human", ["Old ask?"]);
		await edit(new Core(root), id, {
			status: "In Progress",
			checkActionsForHuman: [1],
			addActionsForHuman: ["New ask?"],
		});
		const after = await reread(root, id);
		expect(actionsOf(after)).toEqual([{ index: 1, text: "New ask?", checked: false }]);
		expect(boardComments(after).map((c) => c.body)).toEqual([
			`Actions for Human cleared: ${id} moved from Blocked by human to In Progress.\n\n- #1 (ticked) Old ask?`,
		]);
	});

	it("clear-with-tick-and-move: a clear alongside a tick is still refused when the call also moves the card", async () => {
		const root = makeBoard();
		const id = await seed(root, "Blocked by human", ["Which key?"]);
		const before = readFileSync((await reread(root, id)).filePath as string, "utf8");
		await expect(
			edit(new Core(root), id, {
				status: "In Progress",
				checkActionsForHuman: [1],
				clearActionsForHuman: { reason: "Void", author: "@lead" },
			}),
		).rejects.toThrow(/clear/i);
		const after = await reread(root, id);
		expect(after.status).toBe("Blocked by human");
		expect(readFileSync(after.filePath as string, "utf8")).toBe(before);
	});
});

describe("archiving a card", () => {
	it("archive-clears-before-move: a card archived from Blocked by human archives its actions in the same commit", async () => {
		const root = makeBoard();
		const id = await seed(root, "Blocked by human", ["Which key?"]);
		await edit(new Core(root), id, { checkActionsForHuman: [1] });
		const commitsBefore = commitCount(root);
		const result = await new Core(root).archiveTask(id);
		expect(result.success).toBe(true);
		expect(commitCount(root)).toBe(commitsBefore + 1);
		const archived = filesIn(dirOf(root, DEFAULT_DIRECTORIES.ARCHIVE_TASKS));
		expect(archived.length).toBe(1);
		const text = readFileSync(join(dirOf(root, DEFAULT_DIRECTORIES.ARCHIVE_TASKS), archived[0] as string), "utf8");
		expect(text).not.toContain("ACTIONS:");
		const task = parseTask(text);
		expect(actionsOf(task)).toEqual([]);
		expect(boardComments(task).map((c) => c.body)).toEqual([
			`Actions for Human cleared: ${id} moved from Blocked by human to archive.\n\n- #1 (ticked) Which key?`,
		]);
		expect(git(root, "status", "--porcelain")).toBe("");
	});

	it("archive-settles-the-file-on-disk: a write that lands after the archive loaded its copy is kept, not overwritten", async () => {
		const root = makeBoard();
		const id = await seed(root, "Blocked by human", ["Which key?"]);
		const stale = await reread(root, id);
		await edit(new Core(root), id, { addActionsForHuman: ["Second ask?"] });
		const core = new Core(root);
		(core as unknown as { loadTaskForMutation: () => Promise<Task> }).loadTaskForMutation = async () => stale;
		expect((await core.archiveTask(id)).success).toBe(true);
		const archived = filesIn(dirOf(root, DEFAULT_DIRECTORIES.ARCHIVE_TASKS));
		const task = parseTask(readFileSync(join(dirOf(root, DEFAULT_DIRECTORIES.ARCHIVE_TASKS), archived[0] as string), "utf8"));
		expect(actionsOf(task)).toEqual([]);
		expect(boardComments(task).map((c) => c.body)).toEqual([
			`Actions for Human cleared: ${id} moved from Blocked by human to archive.\n\n- #1 (open) Which key?\n- #2 (open) Second ask?`,
		]);
	});

	it("complete-settles-the-file-on-disk: a write that lands after completion loaded its copy is kept, not overwritten", async () => {
		const root = makeBoard();
		const id = await seed(root, "Done", ["Late ask?"]);
		const stale = await reread(root, id);
		await edit(new Core(root), id, { addActionsForHuman: ["Later ask?"] });
		const core = new Core(root);
		(core as unknown as { loadTaskForMutation: () => Promise<Task> }).loadTaskForMutation = async () => stale;
		expect(await core.completeTask(id)).toBe(true);
		const completed = filesIn(dirOf(root, DEFAULT_DIRECTORIES.COMPLETED));
		const task = parseTask(readFileSync(join(dirOf(root, DEFAULT_DIRECTORIES.COMPLETED), completed[0] as string), "utf8"));
		expect(actionsOf(task)).toEqual([]);
		expect(boardComments(task).map((c) => c.body)).toEqual([
			`Actions for Human cleared: ${id} moved from Done to completed.\n\n- #1 (open) Late ask?\n- #2 (open) Later ask?`,
		]);
	});

	it("tick-on-same-call-add-refused: a tick naming an ask added in the same call is refused, and the file is unchanged", async () => {
		const root = makeBoard();
		const id = await seed(root, "Blocked by human", ["Which key?"]);
		const path = (await reread(root, id)).filePath as string;
		const before = readFileSync(path, "utf8");
		await expect(edit(new Core(root), id, { addActionsForHuman: ["New ask?"], checkActionsForHuman: [2] })).rejects.toThrow();
		expect(readFileSync(path, "utf8")).toBe(before);
	});

	it("archive-move-fails-leaves-card: a failed archive move leaves the active file exactly as it was", async () => {
		const root = makeBoard();
		const id = await seed(root, "Blocked by human", ["Which key?"]);
		const path = (await reread(root, id)).filePath as string;
		const before = readFileSync(path, "utf8");
		blockDestination(dirOf(root, DEFAULT_DIRECTORIES.ARCHIVE_TASKS), basename(path));
		const result = await new Core(root).archiveTask(id);
		expect(result.success).toBe(false);
		expect(readFileSync(path, "utf8")).toBe(before);
		expect(actionsOf(await reread(root, id)).length).toBe(1);
		expect(git(root, "status", "--porcelain", "--", path)).toBe("");
	});
});

describe("completing a card whose move fails", () => {
	it("complete-move-fails-leaves-card: the active file is restored and the failure reported", async () => {
		const root = makeBoard();
		const id = await seed(root, "Done", ["Late ask?"]);
		const path = (await reread(root, id)).filePath as string;
		const before = readFileSync(path, "utf8");
		const commitsBefore = commitCount(root);
		blockDestination(dirOf(root, DEFAULT_DIRECTORIES.COMPLETED), basename(path));
		const core = new Core(root);
		expect(await core.completeTask(id)).toBe(false);
		expect(readFileSync(path, "utf8")).toBe(before);
		expect(git(root, "status", "--porcelain", "--", path)).toBe("");
		expect(commitCount(root)).toBe(commitsBefore);
		expect(actionsOf((await core.getTask(id)) as Task)).toEqual([{ index: 1, text: "Late ask?", checked: false }]);
		expect(boardComments((await core.getTask(id)) as Task)).toEqual([]);
	});
});

describe("an archived line that carries a marker", () => {
	it("archive-reescapes-markers: a hand-edited action holding <!-- still archives when the card leaves the queue", async () => {
		const root = makeBoard();
		const id = await seed(root, "Blocked by human", ["Placeholder?"]);
		const path = (await reread(root, id)).filePath as string;
		handEditFirstAction(root, path, "- [ ] #1 see <!-- COMMENTS:BEGIN -->");
		expect(actionsOf(await reread(root, id)).map((item) => item.text)).toEqual(["see <!-- COMMENTS:BEGIN -->"]);

		await edit(new Core(root), id, { status: "In Progress" });
		const after = await reread(root, id);
		expect(after.status).toBe("In Progress");
		expect(actionsOf(after)).toEqual([]);
		expect(boardComments(after).map((c) => c.body)).toEqual([
			`Actions for Human cleared: ${id} moved from Blocked by human to In Progress.\n\n- #1 (open) see &lt;!-- COMMENTS:BEGIN -->`,
		]);
		const file = readFileSync(after.filePath as string, "utf8");
		expect(file.match(/<!--/g)?.length).toBe(file.match(/^<!-- [A-Z:_]+ -->$/gm)?.length);
	});
});

describe("the configured columns", () => {
	for (const queue of ["Blocked By Human", "BlockedBy  human"]) {
		it(`status-spelling: a queue column spelled "${queue}" still clears when a card leaves it`, async () => {
			const root = makeBoard(["To Do", "In Progress", queue, "Done"]);
			const id = await seed(root, queue, ["Which key?"]);
			expect((await reread(root, id)).status).toBe(queue);
			await edit(new Core(root), id, { status: "In Progress" });
			const after = await reread(root, id);
			expect(after.status).toBe("In Progress");
			expect(actionsOf(after)).toEqual([]);
			expect(boardComments(after).map((c) => c.body)).toEqual([
				`Actions for Human cleared: ${id} moved from ${queue} to In Progress.\n\n- #1 (open) Which key?`,
			]);
		});
	}

	it("terminal-not-done: entering a last column called Shipped clears, and Done means nothing there", async () => {
		const root = makeBoard(["To Do", "In Progress", "Done", "Blocked by human", "Shipped"]);
		const id = await seed(root, "In Progress", ["Which key?"]);
		await edit(new Core(root), id, { status: "Done" });
		let after = await reread(root, id);
		expect(after.status).toBe("Done");
		expect(actionsOf(after).length).toBe(1);
		expect(boardComments(after)).toEqual([]);

		await edit(new Core(root), id, { status: "Shipped" });
		after = await reread(root, id);
		expect(after.status).toBe("Shipped");
		expect(actionsOf(after)).toEqual([]);
		expect(boardComments(after).map((c) => c.body)).toEqual([
			`Actions for Human cleared: ${id} moved from Done to Shipped.\n\n- #1 (open) Which key?`,
		]);
	});
});

describe("promoting a draft that carries actions", () => {
	it("promote-to-terminal-clears: a draft with a hand-written section promoted straight to Done archives it", async () => {
		const root = makeBoard();
		mkdirSync(dirOf(root, DEFAULT_DIRECTORIES.DRAFTS), { recursive: true });
		const { task } = await new Core(root).createTaskFromInput({ title: "A draft", status: "Draft" });
		const draftsDir = dirOf(root, DEFAULT_DIRECTORIES.DRAFTS);
		const draftPath = join(draftsDir, filesIn(draftsDir)[0] as string);
		writeFileSync(
			draftPath,
			readFileSync(draftPath, "utf8").replace(
				/\n---\n\n/,
				"\n---\n\n## Actions for Human\n<!-- ACTIONS:BEGIN -->\n- [x] #1 Written by hand?\n<!-- ACTIONS:END -->\n\n",
			),
		);
		git(root, "add", "-A");
		git(root, "commit", "-q", "-m", "hand edit");
		expect(actionsOf(parseTask(readFileSync(draftPath, "utf8"))).length).toBe(1);

		const { task: promoted } = await new Core(root).editTaskOrDraft(task.id, { status: "Done" });
		expect(promoted.status).toBe("Done");
		expect(filesIn(draftsDir)).toEqual([]);
		const after = await reread(root, promoted.id);
		expect(actionsOf(after)).toEqual([]);
		expect(readFileSync(after.filePath as string, "utf8")).not.toContain("ACTIONS:");
		expect(boardComments(after).map((c) => c.body)).toEqual([
			`Actions for Human cleared: ${promoted.id} moved from Draft to Done.\n\n- #1 (ticked) Written by hand?`,
		]);
	});
});

describe("the clear's author", () => {
	it("clear-author-one-line: an author with a newline is flattened to one line in the headline", async () => {
		const root = makeBoard();
		const id = await seed(root, "Blocked by human", ["Which key?"]);
		await edit(new Core(root), id, { clearActionsForHuman: { reason: "Void", author: " @lead\n  of\tCF-25 " } });
		expect(boardComments(await reread(root, id)).map((c) => c.body)).toEqual([
			"Actions for Human cleared by @lead of CF-25, moving no column: Void\n\n- #1 (open) Which key?",
		]);
	});

	it("clear-author-escaped: an author holding a board marker is escaped like the reason, and the clear goes through", async () => {
		const root = makeBoard();
		const id = await seed(root, "Blocked by human", ["Which key?"]);
		await edit(new Core(root), id, { clearActionsForHuman: { reason: "Void", author: "@lead <!-- COMMENTS:BEGIN -->" } });
		const task = await reread(root, id);
		expect(task.actionsForHumanItems ?? []).toEqual([]);
		expect(boardComments(task).map((c) => c.body)).toEqual([
			"Actions for Human cleared by @lead &lt;!-- COMMENTS:BEGIN -->, moving no column: Void\n\n- #1 (open) Which key?",
		]);
	});
});
