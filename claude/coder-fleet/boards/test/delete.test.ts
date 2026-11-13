import { afterAll, describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { createBoard } from "../src/board.ts";
import { cardPath, createCard, deleteCard } from "../src/cards.ts";
import { readEvents } from "../src/events.ts";
import { World } from "./fixtures.ts";

// Criterion 9: any interface deletes a card; the file goes and the event log
// keeps a line for it.
const w = new World("delete");
afterAll(() => w.dispose());
const repo = w.repo("del", "git@example.com:o/del.git");
const board = createBoard(repo, "DL", w.env);
const deletions = () => readEvents(board.paths).filter((e) => e.event === "card-deleted");

describe("deleting a card", () => {
	it("through the CLI removes its file and logs the deletion", () => {
		const { card } = createCard(board, { title: "doomed" });
		const r = w.cli(repo, ["delete", card.id]);
		expect(r.code).toBe(0);
		expect(existsSync(cardPath(board, card.id))).toBe(false);
		expect(deletions()).toEqual([expect.objectContaining({ card: card.id, title: "doomed", source: "cli", time: expect.any(String) })]);
	});

	it("through any other interface logs that interface and the actor", () => {
		for (const source of ["mcp", "web", "hook"] as const) {
			const { card } = createCard(board, { title: source });
			deleteCard(board, card.id, source, "session-1");
			expect(existsSync(cardPath(board, card.id))).toBe(false);
			expect(deletions().at(-1)).toMatchObject({ card: card.id, source, actor: "session-1" });
		}
	});

	it("of a card that does not exist fails and logs nothing", () => {
		const before = readEvents(board.paths).length;
		const r = w.cli(repo, ["delete", "DL-77"]);
		expect(r.code).toBe(1);
		expect(r.err).toContain("No card DL-77");
		expect(readEvents(board.paths).length).toBe(before);
	});

	it("keeps every earlier log line as it was", () => {
		const before = readEvents(board.paths);
		deleteCard(board, createCard(board, { title: "last" }).card.id, "cli");
		expect(readEvents(board.paths).slice(0, before.length)).toEqual(before);
	});
});
