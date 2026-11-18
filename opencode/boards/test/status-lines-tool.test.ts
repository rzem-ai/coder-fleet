import { afterAll, describe, expect, it } from "bun:test";
import { addAction } from "../src/actions.ts";
import { createBoard } from "../src/board.ts";
import { createCard } from "../src/cards.ts";
import { setFocus } from "../src/focus.ts";
import { moveCard } from "../src/moves.ts";
import { webStatePaths, writeWebState } from "../src/web.ts";
import { World } from "./fixtures.ts";

// CF-27: `boards fleet status-lines`, what the lines under the prompt read of
// the board, as one line of JSON.
const w = new World("status-lines-tool");
afterAll(() => w.dispose());

const facts = (cwd: string) => {
	const r = w.cli(cwd, ["fleet", "status-lines"]);
	expect({ code: r.code, err: r.err }).toEqual({ code: 0, err: "" });
	expect(r.out.endsWith("}\n")).toBe(true);
	expect(r.out.trim().includes("\n")).toBe(false);
	return JSON.parse(r.out) as unknown;
};

describe("boards fleet status-lines", () => {
	it("answers board: false in a repo with no board", () => {
		const repo = w.repo("none");
		expect(facts(repo)).toEqual({ board: false, next: null, blockedByHuman: 0, focus: null, web: null });
	});

	it("gives the card to take next, the count blocked by human, the focus, and the web UI's address while it runs", () => {
		const repo = w.repo("some");
		const board = createBoard(repo, "ST", w.env);
		const waiting = createCard(board, { title: "waits on the human" }).card.id;
		moveCard(board, { card: waiting, to: "Backlog", source: "web" });
		addAction(board, waiting, "answer this", "web");
		const next = createCard(board, { title: "next" }).card.id;
		moveCard(board, { card: next, to: "Backlog", source: "web" });
		expect(facts(repo)).toEqual({ board: true, next, blockedByHuman: 1, focus: null, web: null });

		setFocus(repo, waiting, w.env);
		const { state } = webStatePaths("ST", w.env);
		// A server whose process is alive (this one) is running; one that is not is not.
		writeWebState(state, { pid: process.pid, port: 41234, holders: [process.pid] });
		expect(facts(repo)).toEqual({ board: true, next, blockedByHuman: 1, focus: waiting, web: "http://127.0.0.1:41234/" });
		writeWebState(state, { pid: 2 ** 22 + 7, port: 41234, holders: [] });
		expect((facts(repo) as { web: unknown }).web).toBeNull();
	});
});
