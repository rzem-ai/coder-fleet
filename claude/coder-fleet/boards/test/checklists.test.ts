import { afterAll, describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { createBoard } from "../src/board.ts";
import { cardPath, createCard, readCard } from "../src/cards.ts";
import { checklist, tickItem } from "../src/checklists.ts";
import { readConfig, writeConfig } from "../src/config.ts";
import { dependenciesDone } from "../src/dependencies.ts";
import { startWork } from "../src/hook-moves.ts";
import { MoveRefused, moveCard } from "../src/moves.ts";
import { World } from "./fixtures.ts";

// Group E, criteria 39 to 43 (card 1 to 5): Actions for Human, the
// acceptance criteria and Definition of Done checklists counted from 0, the
// board's live defaults, sub-issues and dependencies, and the filter for
// cards whose dependencies are all finished.
const w = new World("checklists");
afterAll(() => w.dispose());
const repo = w.repo("lists", "git@example.com:o/lists.git");
const board = createBoard(repo, "CL", w.env);
const cli = (...args: string[]) => w.cli(repo, args);
const columnOf = (id: string) => readCard(board, id).card.column;

function cardIn(column: string, title = column): string {
	const { id } = createCard(board, { title }).card;
	moveCard(board, { card: id, to: "Backlog", source: "web" });
	if (column !== "Backlog") moveCard(board, { card: id, to: column, source: "web" });
	return id;
}

function setDefaults(criteria: string[], dod: string[]): void {
	writeConfig(board.paths, { ...readConfig(board.paths), defaults: { criteria, dod } });
}

function ok(...args: string[]): string {
	const r = cli(...args);
	expect(r).toMatchObject({ code: 0, err: "" });
	return r.out;
}

describe("Actions for Human (1)", () => {
	it("are numbered from 0; adding one through the CLI moves the card to Blocked by Human, and only the web UI takes it out while one is unticked", () => {
		const id = cardIn("In Progress");
		expect(ok("add", "actions", id, "Which", "colour?")).toBe(`Added Action for Human 0 to ${id}; it is in Blocked by Human.\n`);
		expect(ok("add", "actions", id, "Which size?")).toContain("Action for Human 1");
		expect(columnOf(id)).toBe("Blocked by Human");
		ok("tick", "actions", id, "1");
		expect(readCard(board, id).card.actions).toEqual([
			{ text: "Which colour?", ticked: false },
			{ text: "Which size?", ticked: true },
		]);
		expect(ok("show", id)).toContain("Actions for Human:\n0 [ ] Which colour?\n1 [x] Which size?\n");
		for (const source of ["hook", "mcp", "cli"] as const) {
			expect(() => moveCard(board, { card: id, to: "In Progress", source })).toThrow(MoveRefused);
		}
		expect(cli("move", id, "In Progress").code).toBe(1);
		expect(columnOf(id)).toBe("Blocked by Human");
		moveCard(board, { card: id, to: "In Progress", source: "web" });
		expect(columnOf(id)).toBe("In Progress");
	});

	it("can be ticked but not removed", () => {
		const id = cardIn("In Progress");
		ok("add", "actions", id, "Yes?");
		const r = cli("remove", "actions", id, "0");
		expect(r.code).toBe(1);
		expect(readCard(board, id).card.actions).toEqual([{ text: "Yes?", ticked: false }]);
	});
});

describe("the acceptance criteria and Definition of Done checklists (2)", () => {
	it("count from 0, the same in the card file and the CLI, and tick or remove each item on its own by that number", () => {
		const id = cardIn("In Progress");
		for (const t of ["zero", "one", "two"]) ok("add", "criteria", id, t);
		expect(ok("add", "dod", id, "suite passes")).toBe(`Added Definition of Done item 0 to ${id}.\n`);
		ok("tick", "criteria", id, "1");
		ok("tick", "dod", id, "0");
		const file = Bun.YAML.parse(/^---\n([\s\S]*?)\n---/.exec(readFileSync(cardPath(board, id), "utf8"))?.[1] ?? "") as Record<string, unknown>;
		expect(file.criteria).toEqual([
			{ text: "zero", ticked: false },
			{ text: "one", ticked: true },
			{ text: "two", ticked: false },
		]);
		expect(file.dod).toEqual([{ text: "suite passes", ticked: true }]);
		const shown = ok("show", id);
		expect(shown).toContain("Acceptance criteria:\n0 [ ] zero\n1 [x] one\n2 [ ] two\n");
		expect(shown).toContain("Definition of Done:\n0 [x] suite passes\n");
		ok("remove", "criteria", id, "0");
		expect(ok("show", id)).toContain("Acceptance criteria:\n0 [x] one\n1 [ ] two\n");
		expect(columnOf(id)).toBe("In Progress");
	});

	it("refuse a number past the end, naming how many there are", () => {
		const id = cardIn("Backlog");
		ok("add", "criteria", id, "only");
		const r = cli("tick", "criteria", id, "1");
		expect(r.code).toBe(1);
		expect(r.err).toContain("it has 1, numbered from 0");
		expect(cli("tick", "criteria", id, "-1").code).toBe(1);
	});
});

describe("the board's defaults (3)", () => {
	it("are read live, after the card's own items; a tick on one is kept by its text, so an edited or added default shows unticked", () => {
		setDefaults(["docs updated"], ["suite passes", "reviewed"]);
		const id = cardIn("In Progress");
		ok("add", "dod", id, "own item");
		expect(ok("show", id)).toContain("Definition of Done:\n0 [ ] own item\n1 [ ] suite passes (board default)\n2 [ ] reviewed (board default)\n");
		ok("tick", "dod", id, "2");
		ok("tick", "criteria", id, "0");
		expect(readCard(board, id).card.defaultsTicked).toEqual({ dod: ["reviewed"], criteria: ["docs updated"] });
		expect(cli("remove", "dod", id, "1").code).toBe(1);
		setDefaults(["docs updated", "added later"], ["suite passes", "reviewed by two"]);
		const card = readCard(board, id).card;
		expect(checklist(board, card, "dod").map((i) => [i.text, i.ticked])).toEqual([
			["own item", false],
			["suite passes", false],
			["reviewed by two", false],
		]);
		expect(checklist(board, card, "criteria").map((i) => [i.text, i.ticked])).toEqual([
			["docs updated", true],
			["added later", false],
		]);
	});

	it("never move a card in Done or Released when they change", () => {
		setDefaults([], ["one"]);
		const done = cardIn("Done");
		const released = cardIn("Released");
		for (const id of [done, released]) tickItem(board, id, "dod", 0);
		setDefaults(["new"], ["one", "two"]);
		for (const id of [done, released]) startWork(board, id, "agent");
		expect(columnOf(done)).toBe("Done");
		expect(columnOf(released)).toBe("Released");
	});
});

describe("sub-issues and dependencies (4, 5)", () => {
	it("a sub-issue has a dotted id under its parent, and a card lists the cards it depends on", () => {
		const parent = cardIn("Backlog", "parent");
		const sub = ok("new", "child", "--parent", parent).trim();
		expect(sub).toBe(`${parent}.1`);
		expect(readCard(board, sub).card.parent).toBe(parent);
		const other = cardIn("Backlog", "other");
		expect(ok("depend", sub, other)).toBe(`${sub} depends on ${other}.\n`);
		expect(readCard(board, sub).card.dependencies).toEqual([other]);
		expect(ok("show", sub)).toContain(`parent: ${parent}\ndepends on: ${other}\n`);
		expect(cli("depend", sub, sub).code).toBe(1);
		expect(cli("depend", sub, "CL-999").code).toBe(1);
		ok("undepend", sub, other);
		expect(readCard(board, sub).card.dependencies).toEqual([]);
	});

	it("the filter returns exactly the cards whose dependencies are all in Done or Released", () => {
		const fw = new World("deps-filter");
		try {
			const r = fw.repo("f", "git@example.com:o/f.git");
			const b = createBoard(r, "DF", fw.env);
			const make = (column: string) => {
				const { id } = createCard(b, { title: column }).card;
				moveCard(b, { card: id, to: "Backlog", source: "web" });
				if (column !== "Backlog") moveCard(b, { card: id, to: column, source: "web" });
				return id;
			};
			const done = make("Done");
			const released = make("Released");
			const progress = make("In Progress");
			const deleted = make("Backlog");
			const run = (...a: string[]) => fw.cli(r, a);
			const free = make("Backlog");
			const onFinished = make("Backlog");
			run("depend", onFinished, done);
			run("depend", onFinished, released);
			const onOpen = make("Backlog");
			run("depend", onOpen, done);
			run("depend", onOpen, progress);
			const onGone = make("Backlog");
			run("depend", onGone, deleted);
			run("delete", deleted);
			const want = [done, released, progress, free, onFinished];
			expect(dependenciesDone(b).map((c) => c.id)).toEqual(want);
			const out = run("list", "--ready");
			expect(out.code).toBe(0);
			expect(out.out.split("\n").filter(Boolean).map((l) => l.split("\t")[0])).toEqual(want);
			expect(want).not.toContain(onOpen);
			expect(want).not.toContain(onGone);
		} finally {
			fw.dispose();
		}
	});
});
