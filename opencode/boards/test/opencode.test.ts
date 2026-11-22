import { afterAll, expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createBoard } from "../src/board.ts";
import { createCard, readCard } from "../src/cards.ts";
import { addItem, tickItem } from "../src/checklists.ts";
import { moveCard } from "../src/moves.ts";
import { lifecycle } from "../src/opencode.ts";
import { configRead } from "../src/fleet/config.ts";
import { handoffErrors } from "../src/handoff.ts";
import { World } from "./fixtures.ts";

const w = new World("opencode");
afterAll(() => w.dispose());
const repo = w.repo("native", "git@example.com:o/native.git");
const board = createBoard(repo, "OC", w.env);
const handoff = "## Done\n- Built.\n\n## Not done\n- None\n\n## Unverified\n- None\n\n## Decisions needed\n- None\n";
const input = { cwd: repo, parentID: "parent", sessionID: "child", agent: "coder" };

test("the native parser agrees with every canonical handoff fixture", () => {
	const fixtures = join(import.meta.dir, "..", "..", "..", "claude", "evals", "fixtures", "handoff-cases");
	const rows = readFileSync(join(fixtures, "expected.tsv"), "utf8").split("\n").filter((line) => line && !line.startsWith("#"));
	for (const row of rows) {
		const [name, expected] = row.split("\t");
		const errors = handoffErrors(readFileSync(join(fixtures, `${name}.txt`), "utf8"));
		expect(errors.length === 0 ? "valid" : "invalid", name).toBe(expected);
	}
});

test("native child ids bind once and a resume never follows a new focus", () => {
	const first = createCard(board, { title: "first" }).card.id;
	const second = createCard(board, { title: "second" }).card.id;
	moveCard(board, { card: first, to: "Backlog", source: "cli" });
	expect(lifecycle("start", { ...input, prompt: `Board-Item: ${first}` }, w.env).card).toBe(first);
	expect(readCard(board, first).card.column).toBe("In Progress");
	expect(lifecycle("start", { ...input, prompt: `Board-Item: ${second}` }, w.env).card).toBe(first);
});

test("malformed handoffs never reach the card gate or add blockers", () => {
	expect(lifecycle("finish", { ...input, text: "- Blocker: Can this ship?" }, w.env).valid).toBe(false);
});

test("a conforming blocker reaches the human queue", () => {
	const stop = { ...input, messageID: "final-message", text: handoff.replace("## Decisions needed\n- None", "## Decisions needed\n- Blocker: Which deployment target?") };
	const result = lifecycle("finish", stop, w.env);
	expect(lifecycle("finish", stop, w.env)).toEqual(result);
	expect(result.valid).toBe(true);
	const card = readCard(board, result.card as string).card;
	expect(card.column).toBe("Blocked by Human");
	expect(card.actions).toHaveLength(1);
});

test("configuration is native and needs no Python shim", () => {
	mkdirSync(join(repo, ".opencode"), { recursive: true });
	writeFileSync(join(repo, ".opencode", "coder-fleet.json"), JSON.stringify({ disabledAgents: ["researcher"], phase: "harden" }));
	const config = configRead(repo);
	expect(config.FLEET_CONFIG_STATE).toBe("ok");
	expect(config.FLEET_CONFIG_PHASE).toBe("harden");
	expect(() => lifecycle("check", { ...input, agent: "researcher" }, w.env)).toThrow("disabled");
	const linked = w.worktree(repo, "native-config-worktree");
	mkdirSync(join(linked, ".opencode"), { recursive: true });
	writeFileSync(join(linked, ".opencode", "coder-fleet.json"), JSON.stringify({ disabledAgents: ["scout"] }));
	expect(() => lifecycle("check", { ...input, cwd: linked, agent: "researcher" }, w.env)).toThrow("disabled");
	expect(() => lifecycle("check", { ...input, cwd: linked, agent: "scout" }, w.env)).not.toThrow();
	writeFileSync(join(repo, ".opencode", "coder-fleet.json"), JSON.stringify({ disabledAgents: ["lead"] }));
	expect(lifecycle("check", input, w.env).warning).toContain("cannot be disabled");
});

test("native completion runs the card gate without ticking anything", () => {
	const id = createCard(board, { title: "gate" }).card.id;
	addItem(board, id, "criteria", "The test passes");
	moveCard(board, { card: id, to: "Backlog", source: "cli" });
	lifecycle("complete", { ...input, card: id }, w.env);
	expect(readCard(board, id).card.column).toBe("Backlog");
	expect(readCard(board, id).card.criteria?.[0]?.ticked).toBe(false);
	tickItem(board, id, "criteria", 0);
	lifecycle("complete", { ...input, card: id }, w.env);
	expect(readCard(board, id).card.column).toBe("Done");
});

test("handoff validation still runs without a board", () => {
	const cwd = w.repo("no-board", "git@example.com:o/none.git");
	expect(lifecycle("finish", { ...input, cwd, text: "broken" }, w.env).valid).toBe(false);
	expect(lifecycle("finish", { ...input, cwd, text: handoff }, w.env).valid).toBe(true);
});
