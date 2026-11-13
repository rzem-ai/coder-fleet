import { afterAll, describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { NoBoardError, openBoard, requireBoard } from "../src/board.ts";
import { resolveBoard } from "../src/resolve.ts";
import { World } from "./fixtures.ts";

// Criterion 7: the CLI creates a board and asks for its prefix; an agent in a
// repo with no board is told to ask the human for one.
const w = new World("create");
afterAll(() => w.dispose());

describe("creating a board through the CLI", () => {
	it("asks for the id prefix and creates the board with it", () => {
		const repo = w.repo("made", "git@example.com:o/made.git");
		const r = w.cli(repo, ["init"], "xy\n");
		expect(r.code).toBe(0);
		expect(r.out).toContain("Id prefix for this board");
		expect(r.out).toContain("prefix XY");
		expect(openBoard(repo, w.env)?.config.prefix).toBe("XY");
	});

	it("refuses a prefix that is not a letter then letters or digits, and creates nothing", () => {
		const repo = w.repo("bad-prefix", "git@example.com:o/bad.git");
		for (const bad of ["1X\n", "X-Y\n", "\n", "", "ABCDEFGHIJK\n"]) {
			const r = w.cli(repo, ["init"], bad);
			expect(r.code).toBe(1);
		}
		expect(existsSync(resolveBoard(repo, w.env)?.paths.dir ?? "")).toBe(false);
	});

	it("refuses a second board for the same repo", () => {
		const repo = w.repo("twice", "git@example.com:o/twice.git");
		expect(w.cli(repo, ["init"], "TW\n").code).toBe(0);
		const r = w.cli(repo, ["init"], "TX\n");
		expect(r.code).toBe(1);
		expect(r.err).toContain("already has a board, prefix TW");
		expect(openBoard(repo, w.env)?.config.prefix).toBe("TW");
	});
});

describe("a repo with no board", () => {
	const repo = w.repo("none", "git@example.com:o/none.git");

	it("tells an agent to ask the human to create one", () => {
		expect(() => requireBoard(repo, w.env)).toThrow(NoBoardError);
		expect(() => requireBoard(repo, w.env)).toThrow("Ask the human to create one");
		for (const args of [["new", "x"], ["list"], ["delete", "XY-1"]]) {
			const r = w.cli(repo, args);
			expect(r.code).toBe(1);
			expect(r.err).toContain("Ask the human to create one");
		}
	});

	it("creates nothing when an operation finds no board", () => {
		w.cli(repo, ["new", "x"]);
		expect(existsSync(w.boardsRoot) ? Bun.spawnSync(["find", w.boardsRoot, "-path", `*none*`]).stdout.toString() : "").toBe("");
	});
});
