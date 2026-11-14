import { afterAll, describe, expect, it } from "bun:test";
import { mkdirSync, readFileSync, renameSync, rmdirSync } from "node:fs";
import { createBoard } from "../src/board.ts";
import { createCard, deleteCard, readCard } from "../src/cards.ts";
import { addItem } from "../src/checklists.ts";
import { cardHistory, readEvents } from "../src/events.ts";
import { moveCard } from "../src/moves.ts";
import { World } from "./fixtures.ts";

// Group F, criteria 44 to 47: the event trail.
const w = new World("events");
afterAll(() => w.dispose());
const repo = w.repo("ev", "git@example.com:o/ev.git");
const board = createBoard(repo, "EV", w.env);
const lastLineFor = (id: string) => readEvents(board.paths).filter((e) => e.card === id).at(-1);

describe("the event trail", () => {
	it("appends one line per move with time, card, columns, source, actor and any gate bypassed (44)", () => {
		for (const source of ["hook", "mcp", "cli", "web"] as const) {
			const { card } = createCard(board, { title: `mover ${source}` });
			const before = readEvents(board.paths).length;
			moveCard(board, { card: card.id, to: "Backlog", source, actor: "session-1" });
			const after = readEvents(board.paths);
			expect(after.length).toBe(before + 1);
			expect(after.at(-1)).toEqual({
				time: expect.stringMatching(/^\d{4}-\d\d-\d\dT/),
				event: "card-moved",
				source,
				card: card.id,
				from: "Draft",
				to: "Backlog",
				actor: "session-1",
			});
		}
		const { card } = createCard(board, { title: "gated" });
		moveCard(board, { card: card.id, to: "Backlog", source: "hook" });
		addItem(board, card.id, "criteria", "not yet");
		moveCard(board, { card: card.id, to: "Done", source: "web", actor: "human" });
		expect(readEvents(board.paths).at(-1)).toMatchObject({ from: "Backlog", to: "Done", source: "web", gate: "card" });
		moveCard(board, { card: card.id, to: "Blocked", source: "hook" });
		const last = readEvents(board.paths).at(-1);
		expect(last).not.toHaveProperty("actor");
		expect(last).not.toHaveProperty("gate");
	});

	it("leaves the card carrying its column and last event, matching the log's last line for it (45)", () => {
		const { card } = createCard(board, { title: "matched" });
		moveCard(board, { card: card.id, to: "Backlog", source: "web", actor: "human" });
		moveCard(board, { card: card.id, to: "Next", source: "web", actor: "human" });
		moveCard(board, { card: card.id, to: "In Progress", source: "hook", actor: "coder" });
		const now = readCard(board, card.id).card;
		expect(now.column).toBe("In Progress");
		expect(now.lastEvent).toEqual(lastLineFor(card.id));
		expect(now.lastEvent).toMatchObject({ source: "hook" });
	});

	it("writes the card before the log, so a failed append leaves the card moved and the log without the line (16)", () => {
		const { card } = createCard(board, { title: "crash" });
		const before = readFileSync(board.paths.events, "utf8");
		// A directory where the log should be makes the append fail.
		renameSync(board.paths.events, `${board.paths.events}.kept`);
		mkdirSync(board.paths.events);
		try {
			expect(() => moveCard(board, { card: card.id, to: "Backlog", source: "cli" })).toThrow();
		} finally {
			rmdirSync(board.paths.events);
			renameSync(`${board.paths.events}.kept`, board.paths.events);
		}
		expect(readCard(board, card.id).card).toMatchObject({ column: "Backlog", lastEvent: { to: "Backlog", source: "cli" } });
		expect(readFileSync(board.paths.events, "utf8")).toBe(before);
	});

	it("only ever appends: every earlier byte of the log survives later moves and deletions (46)", () => {
		const { card } = createCard(board, { title: "kept" });
		moveCard(board, { card: card.id, to: "Backlog", source: "web" });
		const before = readFileSync(board.paths.events, "utf8");
		moveCard(board, { card: card.id, to: "Blocked", source: "hook" });
		deleteCard(board, card.id, "cli");
		const after = readFileSync(board.paths.events, "utf8");
		expect(after.startsWith(before)).toBe(true);
		expect(after.length).toBeGreaterThan(before.length);
	});

	it("reads a card's move history oldest first through the library and the CLI (47)", () => {
		const a = createCard(board, { title: "history" }).card.id;
		const b = createCard(board, { title: "other" }).card.id;
		moveCard(board, { card: a, to: "Backlog", source: "cli", actor: "human" });
		moveCard(board, { card: b, to: "Backlog", source: "web" });
		moveCard(board, { card: a, to: "Next", source: "web", actor: "human" });
		moveCard(board, { card: a, to: "In Progress", source: "hook", actor: "coder" });
		moveCard(board, { card: a, to: "Released", source: "web", actor: "human" });
		expect(cardHistory(board.paths, a).map((e) => [e.from, e.to])).toEqual([
			["Draft", "Backlog"],
			["Backlog", "Next"],
			["Next", "In Progress"],
			["In Progress", "Released"],
		]);
		const r = w.cli(repo, ["history", a]);
		expect(r.code).toBe(0);
		const rows = r.out.trimEnd().split("\n").map((l) => l.split("\t").slice(1));
		expect(rows).toEqual([
			["Draft -> Backlog", "cli", "human"],
			["Backlog -> Next", "web", "human"],
			["Next -> In Progress", "hook", "coder"],
			["In Progress -> Released", "web", "human", "bypassed the test gate"],
		]);
	});
});
