import { afterAll, describe, expect, it } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createBoard } from "../src/board.ts";
import { createCard, deleteCard, idPattern, readCard } from "../src/cards.ts";
import { World } from "./fixtures.ts";

// Criterion 8: PREFIX-n ids, dotted sub-issues, no number ever reused.
const w = new World("ids");
afterAll(() => w.dispose());
const board = createBoard(w.repo("ids", "git@example.com:o/ids.git"), "XY", w.env);
const make = (parent?: string) => createCard(board, { title: "t", parent }).card.id;

describe("card ids", () => {
	it("are the prefix, a dash and a number, counting from 1", () => {
		expect([make(), make(), make()]).toEqual(["XY-1", "XY-2", "XY-3"]);
		expect(idPattern("XY").test("XY-12")).toBe(true);
		for (const bad of ["XY-0", "XY-01", "xy-1", "XY1", "XY-1.", "XY-1.0"]) expect(idPattern("XY").test(bad)).toBe(false);
	});

	it("give sub-issues dotted ids under their parent, which the card records", () => {
		expect([make("XY-2"), make("XY-2"), make("XY-1"), make("XY-2.1")]).toEqual(["XY-2.1", "XY-2.2", "XY-1.1", "XY-2.1.1"]);
		expect(readCard(board, "XY-2.2").card.parent).toBe("XY-2");
	});

	it("refuse a sub-issue under a card that does not exist", () => {
		expect(() => make("XY-99")).toThrow("No card XY-99");
	});

	it("never hand out a deleted card's number again", () => {
		deleteCard(board, "XY-3", "cli");
		expect(make()).toBe("XY-4");
		deleteCard(board, "XY-2.2", "cli");
		expect(make("XY-2")).toBe("XY-2.3");
	});

	it("never hand out a number held by a card file the counter does not know", () => {
		writeFileSync(join(board.paths.cards, "XY-9.md"), "---\nid: XY-9\ntitle: by hand\n---\n");
		expect(make()).toBe("XY-10");
	});
});
