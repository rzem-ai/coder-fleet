import { afterAll, describe, expect, it } from "bun:test";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createBoard } from "../src/board.ts";
import { createCard, listCards, parseCard, readCard, writeCard } from "../src/cards.ts";
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
		expect(board.paths.dir).toBe(join(w.env.HOME ?? "", ".config", "boards", "HM"));
	});
});

describe("a board's directory", () => {
	const repo = w.repo("layout", "https://example.com/o/layout.git");
	const board = createBoard(repo, "XY", w.env);

	it("sits directly under the boards root, named by its prefix, and holds exactly the board's own files", () => {
		expect(board.paths.dir).toBe(join(w.boardsRoot, "XY"));
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

	it("keeps a title that looks like another YAML type a string, through write and read", () => {
		for (const title of ["123", "true", "null", "1.5", "yes", "no", "~", "0x1F", "1e3", "2026-11-14"]) {
			const file = createCard(board, { title });
			expect(readCard(board, file.card.id).card.title).toBe(title);
			writeCard(board, readCard(board, file.card.id));
			expect(readCard(board, file.card.id).card.title).toBe(title);
		}
	});
});

describe("listing cards", () => {
	const repo = w.repo("listing", "https://example.com/o/listing.git");
	const board = createBoard(repo, "LS", w.env);

	it("skips a card whose frontmatter will not parse, with a warning, and lists the rest", () => {
		createCard(board, { title: "good one" });
		const bad = createCard(board, { title: "turns bad" }).card.id;
		createCard(board, { title: "good two" });
		writeFileSync(join(board.paths.cards, `${bad}.md`), "---\ntitle: [unclosed\n---\n");
		const warnings: string[] = [];
		expect(listCards(board, (m) => warnings.push(m)).map((c) => c.card.title)).toEqual(["good one", "good two"]);
		expect(warnings.length).toBe(1);
		expect(warnings[0]).toContain(bad);
		const r = w.cli(repo, ["list"]);
		expect(r.code).toBe(0);
		expect(r.out).toBe("LS-1\tgood one\nLS-3\tgood two\n");
		expect(r.err).toContain(bad);
	});
});
