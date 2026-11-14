import { afterAll, describe, expect, it } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createBoard } from "../src/board.ts";
import { createCard, readCard } from "../src/cards.ts";
import { addItem, tickItem } from "../src/checklists.ts";
import { COLUMNS } from "../src/columns.ts";
import { readEvents } from "../src/events.ts";
import { setFocus } from "../src/focus.ts";
import { MoveRefused, moveCard } from "../src/moves.ts";
import { World } from "./fixtures.ts";

// Group D, the card gate and Released as the final column: CF-207 criteria
// 29 and 38 (card criteria 1 and 10). The hooks are driven through their own
// entry points with the JSON Claude Code sends them.
const w = new World("gates");
afterAll(() => w.dispose());
const repo = w.repo("gt", "git@example.com:o/gt.git");
const board = createBoard(repo, "GT", w.env);
const HOOKS = join(import.meta.dir, "..", "src", "hooks");
const columnOf = (id: string) => readCard(board, id).card.column;
let n = 0;

function hook(name: string, input: Record<string, unknown>): void {
	const p = Bun.spawnSync(["bun", join(HOOKS, `${name}.ts`)], {
		cwd: repo,
		env: { ...w.env, CLAUDE_PROJECT_DIR: repo } as Record<string, string>,
		stdin: new TextEncoder().encode(JSON.stringify(input)),
		stdout: "pipe",
		stderr: "pipe",
	});
	expect({ code: p.exitCode, err: p.stderr.toString(), out: p.stdout.toString() }).toEqual({ code: 0, err: "", out: "" });
}

// A card in `column`, put there by the human in the web UI, with one own
// criterion and one own Definition of Done item, ticked when asked.
function cardIn(column: string, ticked = true): string {
	const { id } = createCard(board, { title: `${column} ${++n}` }).card;
	addItem(board, id, "criteria", "it works");
	addItem(board, id, "dod", "it is tested");
	if (ticked) {
		tickItem(board, id, "criteria", 0);
		tickItem(board, id, "dod", 0);
	}
	if (column === "Draft") return id;
	moveCard(board, { card: id, to: "Backlog", source: "web" });
	if (column !== "Backlog") moveCard(board, { card: id, to: column, source: "web" });
	return id;
}

// Starts an agent of `type` bound to the card, then stops it with a handoff
// that has no Blocker line.
function agentRun(id: string, type: string): void {
	const session = `s${++n}`;
	const agent = `a${n}`;
	setFocus(repo, id, w.env);
	hook("subagent-start", { session_id: session, agent_id: agent, agent_type: type, cwd: repo, hook_event_name: "SubagentStart" });
	const handoff = "## Done\n- x\n\n## Not done\n- None\n\n## Unverified\n- None\n\n## Decisions needed\n- None\n";
	hook("subagent-stop", { session_id: session, agent_id: agent, agent_type: type, cwd: repo, hook_event_name: "SubagentStop", last_assistant_message: handoff });
}

function taskDone(subject: string): void {
	hook("task-completed", { session_id: "lead", cwd: repo, hook_event_name: "TaskCompleted", task_id: "1", task_subject: subject });
}

const lastSkip = (id: string) => readEvents(board.paths).filter((e) => e.event === "move-skipped" && e.card === id).at(-1);

function setDefaults(defaults: Record<string, string[]>): void {
	const text = readFileSync(board.paths.config, "utf8").replace(/\ndefaults:[\s\S]*$/, "\n");
	writeFileSync(board.paths.config, `${text}${Bun.YAML.stringify({ defaults }, null, 2)}`);
}

describe("the card gate (29)", () => {
	it("moves a fully ticked card into Done when a coder or a scripter bound to it stops", () => {
		for (const type of ["coder", "scripter", "coder-fleet:coder", "coder-fleet:scripter"]) {
			const id = cardIn("Backlog");
			agentRun(id, type);
			expect([type, columnOf(id)]).toEqual([type, "Done"]);
			expect(readCard(board, id).card.lastEvent).toMatchObject({ from: "In Progress", to: "Done", source: "hook" });
		}
	});

	it("never moves a card into Done when any other agent stops", () => {
		for (const type of ["reviewer", "scout", "tech-writer", "coder-fleet:reviewer", "general-purpose", "coders"]) {
			const id = cardIn("Backlog");
			agentRun(id, type);
			expect([type, columnOf(id)]).toEqual([type, "In Progress"]);
		}
	});

	it("moves a fully ticked card into Done when a task whose subject carries [board:<id>] completes", () => {
		const id = cardIn("In Progress");
		taskDone(`Build the thing [board:${id}]`);
		expect(columnOf(id)).toBe("Done");
		const other = cardIn("In Progress");
		taskDone(`Build the thing, no marker, ${other}`);
		expect(columnOf(other)).toBe("In Progress");
	});

	it("holds a card with an unticked item, and the refusal names each unticked item", () => {
		const id = cardIn("Backlog", false);
		tickItem(board, id, "dod", 0);
		agentRun(id, "coder");
		expect(columnOf(id)).toBe("In Progress");
		expect(String(lastSkip(id)?.reason)).toContain(`1 item(s) unticked: Acceptance criteria 0 "it works"`);
		taskDone(`[board:${id}] finish`);
		expect(columnOf(id)).toBe("In Progress");
		expect(() => moveCard(board, { card: id, to: "Done", source: "hook" })).toThrow(`Acceptance criteria 0 "it works"`);
	});

	it("reads the board's live defaults, so an unticked default holds the card (card comment 5)", () => {
		const id = cardIn("In Progress");
		setDefaults({ criteria: ["The docs say what changed"], dod: ["The suite passes"] });
		try {
			taskDone(`[board:${id}]`);
			expect(columnOf(id)).toBe("In Progress");
			const reason = String(lastSkip(id)?.reason);
			expect(reason).toContain(`Acceptance criteria 1 "The docs say what changed"`);
			expect(reason).toContain(`Definition of Done 1 "The suite passes"`);
			tickItem(board, id, "criteria", 1);
			tickItem(board, id, "dod", 1);
			taskDone(`[board:${id}]`);
			expect(columnOf(id)).toBe("Done");
		} finally {
			setDefaults({});
		}
	});

	it("leaves a card outside Backlog, Next and In Progress where it is, and says why", () => {
		for (const column of ["Draft", "Blocked", "Blocked by Human", "Released"]) {
			const id = cardIn(column);
			taskDone(`[board:${id}]`);
			expect([column, columnOf(id)]).toEqual([column, column]);
			expect([column, lastSkip(id)?.to]).toEqual([column, "Done"]);
		}
	});

	it("refuses every route into Done but the web UI while an item is unticked", () => {
		for (const source of ["hook", "mcp", "cli"] as const) {
			for (const from of COLUMNS.filter((c) => c !== "Done" && c !== "Draft" && c !== "Released")) {
				const id = cardIn(from, false);
				expect(() => moveCard(board, { card: id, to: "Done", source })).toThrow(MoveRefused);
				expect(columnOf(id)).toBe(from);
			}
		}
	});

	it("lets the human override it in the web UI, logging the card gate as bypassed only when an item is unticked (23)", () => {
		const open = cardIn("In Progress", false);
		expect(moveCard(board, { card: open, to: "Done", source: "web" }).gate).toBe("card");
		const ticked = cardIn("In Progress");
		expect(moveCard(board, { card: ticked, to: "Done", source: "web" }).gate).toBeUndefined();
	});
});

describe("Released, the final column (38)", () => {
	it("lets no hook, MCP tool or CLI command move a card out of it", () => {
		for (const source of ["hook", "mcp", "cli"] as const) {
			for (const to of COLUMNS.filter((c) => c !== "Released")) {
				const id = cardIn("Released");
				expect(() => moveCard(board, { card: id, to, source })).toThrow(MoveRefused);
				expect(columnOf(id)).toBe("Released");
			}
		}
	});

	it("lets the human move a card out of it in the web UI", () => {
		const id = cardIn("Released");
		moveCard(board, { card: id, to: "In Progress", source: "web" });
		expect(columnOf(id)).toBe("In Progress");
	});

	it("is entered by a hook only from Done", () => {
		for (const from of COLUMNS.filter((c) => c !== "Released" && c !== "Done" && c !== "Draft")) {
			const id = cardIn(from);
			expect(() => moveCard(board, { card: id, to: "Released", source: "hook" })).toThrow("only from Done");
		}
		const id = cardIn("Done");
		moveCard(board, { card: id, to: "Released", source: "hook" });
		expect(columnOf(id)).toBe("Released");
	});
});
