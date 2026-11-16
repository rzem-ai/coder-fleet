import { afterAll, describe, expect, it } from "bun:test";
import { join } from "node:path";
import { addAction, tickAction } from "../src/actions.ts";
import { createBoard } from "../src/board.ts";
import { createCard, readCard, updateCard } from "../src/cards.ts";
import { COLUMNS } from "../src/columns.ts";
import { cardHistory, readEvents, type Source } from "../src/events.ts";
import { MoveRefused, moveCard, nextQueue, orderNext, takeNext } from "../src/moves.ts";
import { World } from "./fixtures.ts";

// Group C, criteria 17 to 23 (card 1 to 6 and 12): the eight columns, the
// column rules for each source, Next's order, and the one move function.
const w = new World("columns");
afterAll(() => w.dispose());
const repo = w.repo("cols", "git@example.com:o/cols.git");
const board = createBoard(repo, "CO", w.env);
const SOURCES: Source[] = ["hook", "mcp", "cli", "web"];
const columnOf = (id: string) => readCard(board, id).card.column;

// A card put in `column` by the human in the web UI.
function cardIn(column: string, title = column): string {
	const { id } = createCard(board, { title }).card;
	moveCard(board, { card: id, to: "Backlog", source: "web" });
	if (column !== "Backlog") moveCard(board, { card: id, to: column, source: "web" });
	return id;
}

function refused(id: string, to: string, source: Source): string {
	const before = readCard(board, id).card;
	const lines = readEvents(board.paths).length;
	let message = "";
	try {
		moveCard(board, { card: id, to, source });
	} catch (e) {
		expect(e).toBeInstanceOf(MoveRefused);
		message = (e as Error).message;
	}
	expect(message).not.toBe("");
	expect(readCard(board, id).card).toEqual(before);
	expect(readEvents(board.paths).length).toBe(lines);
	return message;
}

describe("the columns", () => {
	it("are exactly eight, in order (1)", () => {
		expect(COLUMNS).toEqual(["Draft", "Backlog", "Next", "In Progress", "Done", "Released", "Blocked", "Blocked by Human"]);
	});

	it("start every card in Draft, whatever its fields say (2)", () => {
		expect(createCard(board, { title: "filed", fields: { column: "Done" } }).card.column).toBe("Draft");
		const r = w.cli(repo, ["new", "from the cli"]);
		expect(r.code).toBe(0);
		expect(columnOf(r.out.trim())).toBe("Draft");
	});
});

describe("Draft", () => {
	it("is left for Backlog by any source (2)", () => {
		for (const source of SOURCES) {
			const { id } = createCard(board, { title: source }).card;
			moveCard(board, { card: id, to: "Backlog", source });
			expect(columnOf(id)).toBe("Backlog");
		}
		const id = createCard(board, { title: "cli" }).card.id;
		expect(w.cli(repo, ["move", id, "Backlog"])).toMatchObject({ code: 0, err: "" });
		expect(columnOf(id)).toBe("Backlog");
	});

	it("is never left for any other column, from any source, the web UI included (2)", () => {
		const { id } = createCard(board, { title: "stuck" }).card;
		for (const source of SOURCES) {
			for (const to of COLUMNS.filter((c) => c !== "Backlog" && c !== "Draft")) {
				expect(refused(id, to, source)).toContain("leaves Draft only for Backlog");
			}
		}
	});
});

describe("the MCP tools and the CLI", () => {
	it("cannot fill Next: refused, saying why, and the card stays where it was (3)", () => {
		const id = cardIn("Backlog");
		for (const source of ["mcp", "cli"] as const) expect(refused(id, "Next", source)).toContain("only the human fills Next");
		const r = w.cli(repo, ["move", id, "Next"]);
		expect(r.code).toBe(1);
		expect(r.err).toContain("only the human fills Next, in the web UI");
		expect(columnOf(id)).toBe("Backlog");
	});

	it("set no column except Draft to Backlog (5)", () => {
		for (const from of COLUMNS.filter((c) => c !== "Draft")) {
			const id = cardIn(from);
			for (const to of COLUMNS.filter((c) => c !== from)) {
				for (const source of ["mcp", "cli"] as const) refused(id, to, source);
			}
		}
	});

	it("tick an Action for Human that leaves another unticked without moving a column (5)", () => {
		const id = cardIn("In Progress");
		addAction(board, id, "Which colour?", "mcp");
		addAction(board, id, "Which size?", "mcp");
		expect(columnOf(id)).toBe("Blocked by Human");
		const moves = cardHistory(board.paths, id).length;
		expect(tickAction(board, id, 0, "mcp").column).toBe("Blocked by Human");
		expect(readCard(board, id).card.actions).toEqual([
			{ text: "Which colour?", ticked: true },
			{ text: "Which size?", ticked: false },
		]);
		expect(columnOf(id)).toBe("Blocked by Human");
		expect(cardHistory(board.paths, id).length).toBe(moves);
	});
});

// CF-25: the tick that leaves no unticked action on a card in Blocked by Human
// returns it, in the same call, to the column it was blocked from.
describe("the last tick of an Action for Human", () => {
	for (const [from, source] of [["Backlog", "cli"], ["Next", "mcp"], ["In Progress", "web"]] as const) {
		it(`returns a card blocked from ${from} to ${from}, as ${source}, and shows its column`, () => {
			const id = cardIn(from);
			addAction(board, id, "One?", "hook");
			addAction(board, id, "Two?", "hook");
			expect(tickAction(board, id, 1, source).column).toBe("Blocked by Human");
			expect(tickAction(board, id, 0, source).column).toBe(from);
			expect(columnOf(id)).toBe(from);
			expect(cardHistory(board.paths, id).at(-1)).toMatchObject({ source, from: "Blocked by Human", to: from });
		});
	}

	it("returns a card to Backlog when the trail says nothing of where it was blocked from", () => {
		const { id } = createCard(board, { title: "parked without a trail" }).card;
		updateCard(board, id, (f) => ({ ...f, card: { ...f.card, column: "Blocked by Human", actions: [{ text: "Which?", ticked: false }] } }), { columnMove: true });
		expect(tickAction(board, id, 0, "mcp").column).toBe("Backlog");
		expect(cardHistory(board.paths, id).map((e) => [e.from, e.to])).toEqual([["Blocked by Human", "Backlog"]]);
	});

	it("moves nothing for a card outside Blocked by Human, or for an action already ticked", () => {
		const draft = createCard(board, { title: "a Blocker raised in Draft" }).card.id;
		addAction(board, draft, "Which?", "hook");
		expect(tickAction(board, draft, 0, "mcp").column).toBe("Draft");
		expect(cardHistory(board.paths, draft)).toEqual([]);

		const id = cardIn("Backlog", "ticked before CF-25");
		addAction(board, id, "Which?", "hook");
		updateCard(board, id, (f) => ({ ...f, card: { ...f.card, actions: [{ text: "Which?", ticked: true }] } }));
		const moves = cardHistory(board.paths, id).length;
		expect(tickAction(board, id, 0, "mcp").column).toBe("Blocked by Human");
		expect(cardHistory(board.paths, id).length).toBe(moves);
	});

	it("keeps the tick when the return is refused, and the log says why", () => {
		const id = cardIn("Done");
		addAction(board, id, "Ship it?", "hook");
		updateCard(board, id, (f) => ({ ...f, card: { ...f.card, criteria: [{ text: "It works", ticked: false }] } }));
		expect(tickAction(board, id, 0, "mcp").column).toBe("Blocked by Human");
		expect(readCard(board, id).card.actions).toEqual([{ text: "Ship it?", ticked: true }]);
		expect(readEvents(board.paths).at(-1)).toMatchObject({ event: "move-skipped", source: "mcp", card: id, to: "Done", reason: expect.stringContaining("the card gate holds it") });
	});

	it("is held by the card gate on a return to Done even when the web UI ticks it", () => {
		const id = cardIn("Done", "ticked in the web UI");
		addAction(board, id, "Ship it?", "hook");
		updateCard(board, id, (f) => ({ ...f, card: { ...f.card, criteria: [{ text: "It works", ticked: false }] } }));
		expect(tickAction(board, id, 0, "web").column).toBe("Blocked by Human");
		expect(readEvents(board.paths).at(-1)).toMatchObject({ event: "move-skipped", source: "web", card: id, to: "Done", reason: expect.stringContaining("the card gate holds it") });
	});

	it("never returns a card to Released", () => {
		const id = cardIn("Released");
		moveCard(board, { card: id, to: "Blocked by Human", source: "web" });
		updateCard(board, id, (f) => ({ ...f, card: { ...f.card, actions: [{ text: "Undo the release?", ticked: false }] } }));
		expect(tickAction(board, id, 0, "web").column).toBe("Blocked by Human");
		expect(readEvents(board.paths).at(-1)).toMatchObject({ event: "move-skipped", card: id, to: "Released", reason: expect.stringContaining("never returns a card to Released") });
	});

	it("is the only MCP or CLI move out of Blocked by Human; a plain move from there is still refused", () => {
		const id = cardIn("Next");
		addAction(board, id, "One?", "hook");
		updateCard(board, id, (f) => ({ ...f, card: { ...f.card, actions: [{ text: "One?", ticked: true }] } }));
		for (const source of ["mcp", "cli"] as const) {
			expect(refused(id, "Next", source)).toContain("only the human fills Next");
			expect(refused(id, "Backlog", source)).toContain("move a card only from Draft to Backlog");
		}
	});

	it("goes through the CLI's tick, which prints the card's column", () => {
		const id = cardIn("Backlog", "ticked from the CLI");
		addAction(board, id, "Which?", "hook");
		const r = w.cli(repo, ["tick", "actions", id, "0"]);
		expect(r.code).toBe(0);
		expect(r.out.trim()).toBe(`Ticked Action for Human 0 on ${id}; it is in Backlog.`);
		expect(cardHistory(board.paths, id).at(-1)).toMatchObject({ source: "cli", from: "Blocked by Human", to: "Backlog" });
	});
});

describe("the web UI", () => {
	it("fills Next, which a hook may not: a hook only returns a card there that was blocked from Next (3)", () => {
		const id = cardIn("Backlog");
		expect(refused(id, "Next", "hook")).toContain("only the human fills Next");
		moveCard(board, { card: id, to: "Blocked", source: "hook" });
		expect(refused(id, "Next", "hook")).toContain("only the human fills Next");
		moveCard(board, { card: id, to: "Backlog", source: "hook" });
		moveCard(board, { card: id, to: "Next", source: "web" });
		expect(columnOf(id)).toBe("Next");
		moveCard(board, { card: id, to: "Blocked", source: "hook" });
		moveCard(board, { card: id, to: "Next", source: "hook" });
		expect(columnOf(id)).toBe("Next");
	});

	it("moves any card out of any column but Draft to any column, naming the gate it bypassed (6)", () => {
		for (const from of COLUMNS.filter((c) => c !== "Draft")) {
			for (const to of COLUMNS.filter((c) => c !== from)) {
				const id = cardIn(from, `${from} to ${to}`);
				if (from === "Blocked by Human") addAction(board, id, "open", "web");
				const ev = moveCard(board, { card: id, to, source: "web" });
				expect(columnOf(id)).toBe(to);
				// These cards carry no checklist items, so a move into Done passes the
				// card gate and bypasses nothing; every web move into Released bypasses
				// the test gate.
				const gate = to === "Released" ? "test" : undefined;
				expect(ev.gate).toBe(gate);
				expect(cardHistory(board.paths, id).at(-1)?.gate).toBe(gate);
			}
		}
	});
});

describe("a hook", () => {
	it("takes a card out of Blocked by Human only once every action is ticked (10)", () => {
		const id = cardIn("In Progress");
		addAction(board, id, "One?", "hook");
		addAction(board, id, "Two?", "hook");
		tickAction(board, id, 1, "mcp");
		expect(refused(id, "In Progress", "hook")).toContain("1 Action(s) for Human still unticked");
		updateCard(board, id, (f) => ({ ...f, card: { ...f.card, actions: [{ text: "One?", ticked: true }, { text: "Two?", ticked: true }] } }));
		moveCard(board, { card: id, to: "In Progress", source: "hook" });
		expect(columnOf(id)).toBe("In Progress");
	});
});

describe("Next", () => {
	it("is ordered by the human in the web UI, and an agent asking for work gets its top card (4)", () => {
		const nw = new World("next-order");
		try {
			const r = nw.repo("q", "git@example.com:o/q.git");
			const b = createBoard(r, "QU", nw.env);
			const mk = (to: string) => {
				const { id } = createCard(b, { title: to }).card;
				moveCard(b, { card: id, to: "Backlog", source: "web" });
				if (to !== "Backlog") moveCard(b, { card: id, to, source: "web" });
				return id;
			};
			const backlog = mk("Backlog");
			expect(takeNext(b)?.id).toBe(backlog);
			const [a, c, d] = [mk("Next"), mk("Next"), mk("Next")];
			expect(nextQueue(b).map((x) => x.id)).toEqual([a, c, d]);
			orderNext(b, [d, a, c], "web");
			expect(nextQueue(b).map((x) => x.id)).toEqual([d, a, c]);
			expect(takeNext(b)?.id).toBe(d);
			const out = nw.cli(r, ["next"]);
			expect(out.code).toBe(0);
			expect(out.out.split("\t")[0]).toBe(d);
			// A card coming into Next joins the bottom.
			const e = mk("Next");
			expect(nextQueue(b).map((x) => x.id)).toEqual([d, a, c, e]);
			for (const source of ["hook", "mcp", "cli"] as const) {
				expect(() => orderNext(b, [a, c, d, e], source)).toThrow("Only the human orders Next");
			}
			expect(() => orderNext(b, [a, c], "web")).toThrow("names every card in it once");
			expect(nextQueue(b).map((x) => x.id)).toEqual([d, a, c, e]);
			// A card waiting on the human is never given, even at the top: the
			// human put it back in Next with its action still open.
			addAction(b, d, "Which one?", "web");
			moveCard(b, { card: d, to: "Next", source: "web" });
			orderNext(b, [d, a, c, e], "web");
			expect(takeNext(b)?.id).toBe(a);
			for (const id of [a, c, e]) moveCard(b, { card: id, to: "Done", source: "web" });
			expect(takeNext(b)?.id).toBe(backlog);
			addAction(b, backlog, "And this?", "web");
			moveCard(b, { card: backlog, to: "Backlog", source: "web" });
			expect(takeNext(b)).toBeNull();
		} finally {
			nw.dispose();
		}
	});
});

describe("the one move function", () => {
	it("refuses a column name outside the eight, and takes from from the card (12)", () => {
		const id = cardIn("Backlog");
		expect(refused(id, "To Do", "web")).toContain(`"To Do" is not a column`);
		expect(refused(id, "backlog", "web")).toContain("not a column");
		moveCard(board, { card: id, to: "Next", source: "web", from: "Done" } as Parameters<typeof moveCard>[1]);
		expect(cardHistory(board.paths, id).at(-1)).toMatchObject({ from: "Backlog", to: "Next" });
	});

	it("is the only way to change a column: any other write that would is refused (12)", () => {
		const id = cardIn("Backlog");
		expect(() => updateCard(board, id, (f) => ({ ...f, card: { ...f.card, column: "Done" } }))).toThrow("changes only through a move");
		expect(columnOf(id)).toBe("Backlog");
	});

	it("holds the card's lock from read to write, so racing movers never log a column the card was not in (12)", async () => {
		const id = cardIn("Backlog", "raced");
		const worker = join(import.meta.dir, "worker.ts");
		const procs = [0, 1, 2].map((n) =>
			Bun.spawn(["bun", worker, repo, "shuffle", id, "40", String(n)], { env: w.env as Record<string, string>, stdout: "pipe", stderr: "pipe" }),
		);
		const codes = await Promise.all(procs.map((p) => p.exited));
		const errs = await Promise.all(procs.map((p) => new Response(p.stderr).text()));
		expect({ codes, errs }).toEqual({ codes: [0, 0, 0], errs: ["", "", ""] });
		const moves = cardHistory(board.paths, id);
		expect(moves.length).toBeGreaterThan(40);
		for (let i = 1; i < moves.length; i++) expect(moves[i]?.from).toBe(moves[i - 1]?.to as string);
		expect(columnOf(id)).toBe(moves.at(-1)?.to);
	}, 60_000);
});
