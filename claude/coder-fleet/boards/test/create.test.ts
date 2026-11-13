import { afterAll, describe, expect, it } from "bun:test";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createBoard, NoBoardError, openBoard, requireBoard } from "../src/board.ts";
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
		expect(resolveBoard(repo, w.env)?.found).toBeNull();
		expect(existsSync(w.boardsRoot) ? readdirSync(w.boardsRoot).filter((d) => d !== "XY") : []).toEqual([]);
	});

	it("refuses a prefix another repo's board holds, so two repos never share a board", () => {
		const other = w.repo("same-name", "git@example.com:other/made.git");
		const r = w.cli(other, ["init"], "XY\n");
		expect(r.code).toBe(1);
		expect(r.err).toContain("The prefix XY is taken");
		expect(r.err).toContain("example.com/o/made");
		expect(openBoard(other, w.env)).toBeNull();
		expect(w.cli(other, ["init"], "XZ\n").code).toBe(0);
		expect(openBoard(other, w.env)?.paths.dir).toBe(join(w.boardsRoot, "XZ"));
	});

	it("never changes a prefix: a board whose config names another prefix than its directory is not found", () => {
		const repo = w.repo("fixed", "git@example.com:o/fixed.git");
		const board = createBoard(repo, "FX", w.env);
		writeFileSync(board.paths.config, readFileSync(board.paths.config, "utf8").replace("prefix: FX", "prefix: FY"));
		expect(openBoard(repo, w.env)).toBeNull();
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

	it("tells an agent to ask the human to create one, naming a command that exists", () => {
		expect(() => requireBoard(repo, w.env)).toThrow(NoBoardError);
		expect(() => requireBoard(repo, w.env)).toThrow("Ask the human to create one");
		const cli = join(import.meta.dir, "..", "src", "cli.ts");
		expect(() => requireBoard(repo, w.env)).toThrow(`\`bun ${cli} init\``);
		expect(existsSync(cli)).toBe(true);
		for (const args of [["new", "x"], ["list"], ["delete", "XY-1"]]) {
			const r = w.cli(repo, args);
			expect(r.code).toBe(1);
			expect(r.err).toContain("Ask the human to create one");
		}
	});

	it("creates nothing when an operation finds no board", () => {
		const list = () => (existsSync(w.boardsRoot) ? Bun.spawnSync(["find", w.boardsRoot]).stdout.toString() : "");
		const before = list();
		w.cli(repo, ["new", "x"]);
		w.cli(repo, ["where"]);
		expect(list()).toBe(before);
	});
});
