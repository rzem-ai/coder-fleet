import { afterAll, describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createBoard } from "../src/board.ts";
import { createCard, parseCard, readCard, writeCard } from "../src/cards.ts";
import { boardsRoot } from "../src/paths.ts";
import { World } from "./fixtures.ts";

// Criterion 1: one directory per board under $XDG_CONFIG_HOME/boards or
// ~/.config/boards, holding cards, config, event log, locks, test-run logs,
// specs and run articles, and nothing else; each card one markdown file with
// YAML frontmatter.
const w = new World("storage");
afterAll(() => w.dispose());

describe("where boards live", () => {
	it("uses $XDG_CONFIG_HOME/boards when XDG_CONFIG_HOME is set", () => {
		expect(boardsRoot({ XDG_CONFIG_HOME: "/x/cfg", HOME: "/h" })).toBe("/x/cfg/boards");
	});

	it("uses ~/.config/boards when XDG_CONFIG_HOME is unset or relative", () => {
		expect(boardsRoot({ HOME: "/h" })).toBe("/h/.config/boards");
		expect(boardsRoot({ XDG_CONFIG_HOME: "rel/cfg", HOME: "/h" })).toBe("/h/.config/boards");
	});

	it("creates the board under ~/.config/boards when XDG_CONFIG_HOME is unset", () => {
		const repo = w.repo("home-repo", "git@example.com:o/home.git");
		const env = { ...w.env, XDG_CONFIG_HOME: undefined };
		const board = createBoard(repo, "HM", env);
		expect(board.paths.dir.startsWith(join(w.env.HOME ?? "", ".config", "boards") + "/")).toBe(true);
	});
});

describe("a board's directory", () => {
	const repo = w.repo("layout", "https://example.com/o/layout.git");
	const board = createBoard(repo, "XY", w.env);

	it("sits directly under the boards root and holds exactly the board's own files", () => {
		expect(board.paths.dir.startsWith(`${w.boardsRoot}/`)).toBe(true);
		expect(readdirSync(w.boardsRoot)).toContain(board.paths.dir.slice(w.boardsRoot.length + 1));
		expect(readdirSync(board.paths.dir).sort()).toEqual(
			["cards", "config.yml", "events.log", "ids.json", "locks", "runs", "specs", "test-runs"].sort(),
		);
	});

	it("holds no agent memory", () => {
		const all = Bun.spawnSync(["find", board.paths.dir]).stdout.toString();
		expect(all).not.toContain("agent-memory");
	});

	it("keeps each card as one markdown file with YAML frontmatter", () => {
		const { card } = createCard(board, { title: "Title: with a colon # and a hash", body: "Some *markdown*.\n" });
		expect(readdirSync(board.paths.cards)).toEqual([`${card.id}.md`]);
		const text = readFileSync(join(board.paths.cards, `${card.id}.md`), "utf8");
		expect(text.startsWith("---\nid: XY-1\n")).toBe(true);
		const parsed = parseCard(text);
		expect(parsed.card.title).toBe("Title: with a colon # and a hash");
		expect(parsed.body).toBe("Some *markdown*.\n");
		const yaml = /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] ?? "";
		expect((Bun.YAML.parse(yaml) as { id: string }).id).toBe("XY-1");
	});

	it("keeps fields it does not know across a rewrite", () => {
		const file = createCard(board, { title: "t", fields: { later: ["a", "b"] } });
		writeCard(board, { card: { ...file.card, title: "t2" }, body: "b\n" });
		const back = readCard(board, file.card.id);
		expect(back.card.later).toEqual(["a", "b"]);
		expect(back.card.title).toBe("t2");
		expect(back.body).toBe("b\n");
	});
});
