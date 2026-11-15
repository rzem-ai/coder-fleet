import { afterAll, describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createBoard } from "../src/board.ts";
import { CARD_FIELDS, createCard, readCard, updateCard } from "../src/cards.ts";
import { COMMANDS } from "../src/cli.ts";
import { COLUMNS } from "../src/columns.ts";
import { MCP_TOOLS } from "../src/mcp.ts";
import { WEB_OPERATIONS } from "../src/web.ts";
import { World } from "./fixtures.ts";

// Criterion 67: none of the spec's non-goals is built. Each list below is read
// from the code that uses it, never copied: the MCP server serves only
// MCP_TOOLS, the CLI runs only COMMANDS, the API takes only WEB_OPERATIONS and
// the paths written in src/web.ts, a card write adds no field outside
// CARD_FIELDS, and the columns are the states a card can be in. A name fails when any part of it is a non-goal word, in any
// case, alone or with a plural or verb ending. No name needs an exception.
const NON_GOALS = ["milestone", "document", "attachment", "link", "claim", "submit", "oracle", "import", "export", "backup"];

const SRC = join(import.meta.dir, "..", "src");

// The parts of a name: split at anything but a letter or digit, and where a
// lower-case letter or digit meets a capital, then lower-cased.
function parts(name: string): string[] {
	return name
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter(Boolean);
}

// Each name with the non-goal one of its parts carries, if any.
function nonGoals(names: readonly string[]): string[] {
	return names.flatMap((name) => {
		const hit = NON_GOALS.find((word) => parts(name).some((p) => new RegExp(`^${word}(s|es|ed|ing|er|ers)?$`).test(p)));
		return hit ? [`${name} (${hit})`] : [];
	});
}

// The API's paths as src/web.ts writes them, in its route patterns and
// comments: /api and the words after it, a capture group or a <placeholder>
// standing for a value.
function apiPaths(): string[] {
	const text = readFileSync(join(SRC, "web.ts"), "utf8").replace(/\\/g, "");
	return [...text.matchAll(/\/api(?:\/(?:[A-Za-z-]+|\([^)]*\)|<[A-Za-z]+>))*/g)].map((m) => m[0].replace(/\([^)]*\)|<[A-Za-z]+>/g, ""));
}

describe("the scope guard", () => {
	it("matches a non-goal as a whole word or name part, and nothing else", () => {
		expect(nonGoals(["exportBoard", "card-links", "Milestone", "run-log", "history", "Blocked by Human", "dependencies", "unlinked", "imported"])).toEqual([
			"exportBoard (export)",
			"card-links (link)",
			"Milestone (milestone)",
			"imported (import)",
		]);
	});

	it("builds no CLI command for a non-goal", () => {
		expect(COMMANDS.length).toBeGreaterThan(0);
		expect(nonGoals(COMMANDS)).toEqual([]);
	});

	it("serves no web UI operation or API path for a non-goal", () => {
		expect(WEB_OPERATIONS.length).toBeGreaterThan(0);
		expect(apiPaths()).toContain("/api/board");
		expect(nonGoals([...WEB_OPERATIONS, ...apiPaths()])).toEqual([]);
	});

	it("writes no card frontmatter field or column for a non-goal", () => {
		expect(nonGoals(CARD_FIELDS)).toEqual([]);
		expect(nonGoals(COLUMNS)).toEqual([]);
	});

	it("serves no MCP tool for a non-goal", () => {
		expect(MCP_TOOLS.length).toBeGreaterThan(0);
		expect(nonGoals(MCP_TOOLS.map((t) => t.name))).toEqual([]);
	});
});

describe("card fields", () => {
	const w = new World("scope");
	afterAll(() => w.dispose());
	const board = createBoard(w.repo("scope", "https://example.com/o/scope.git"), "SC", w.env);

	it("refuses a write that adds a field outside CARD_FIELDS, and writes nothing", () => {
		const { id } = createCard(board, { title: "kept as it was" }).card;
		const before = readCard(board, id);
		expect(() => updateCard(board, id, (f) => ({ ...f, card: { ...f.card, milestone: "M1" } }))).toThrow(`Card ${id}: the board writes no field "milestone"`);
		expect(readCard(board, id)).toEqual(before);
	});
});
