import { afterAll, describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createBoard } from "../src/board.ts";
import { cardPath, readCard } from "../src/cards.ts";
import { readEvents } from "../src/events.ts";
import { readFocus } from "../src/focus.ts";
import { callTool, MCP_TOOLS } from "../src/mcp.ts";
import { moveCard } from "../src/moves.ts";
import { readWebState, webStatePaths } from "../src/web.ts";
import { World } from "./fixtures.ts";

// CF-1.1, spec criterion 49: the MCP tools over the board's functions. They
// pass on only the arguments each names, so a caller's extra fields never
// reach a card, and the only column move a tool makes is Draft to Backlog,
// besides the move into Blocked by Human that adding an action makes.
const w = new World("mcp");
const env = { ...w.env, XDG_STATE_HOME: join(w.root, "state") };
const repo = w.repo("mcp", "https://example.com/o/mcp.git");
const board = createBoard(repo, "MC", env);
const holder = Bun.spawn(["sleep", "60"]);
const ctx = { cwd: repo, env, holder: holder.pid };
afterAll(() => {
	const s = readWebState(webStatePaths("MC", env).state);
	if (s) process.kill(s.pid);
	holder.kill();
	w.dispose();
});

function call(name: string, args: Record<string, unknown> = {}): string {
	const r = callTool(name, args, ctx);
	if (r.isError) throw new Error(r.content[0]?.text);
	return r.content[0]?.text ?? "";
}

function refused(name: string, args: Record<string, unknown>): string {
	const r = callTool(name, args, ctx);
	expect(r.isError).toBe(true);
	return r.content[0]?.text ?? "";
}

const columnOf = (id: string) => readCard(board, id).card.column;

describe("the MCP tools", () => {
	it("file a card with only its title, parent and description, whatever else the caller sends", () => {
		const extra = { column: "Done", rank: 1, fields: { column: "Next", milestone: "M1" }, milestone: "M1", criteria: [{ text: "x", ticked: true }], id: "MC-99" };
		const parent = JSON.parse(call("card_file", { title: "Parent", ...extra }));
		expect(parent).toMatchObject({ id: "MC-1", column: "Draft", criteria: [], dod: [] });
		const child = JSON.parse(call("card_file", { title: "Child", parent: "MC-1", body: "Why", ...extra }));
		expect(child).toMatchObject({ id: "MC-1.1", parent: "MC-1", column: "Draft", body: "Why\n" });
		for (const id of ["MC-1", "MC-1.1"]) {
			expect(Object.keys(readCard(board, id).card).sort()).toEqual(["column", "created", "id", "title", "updated", ...(id === "MC-1.1" ? ["parent"] : [])].sort());
		}
		expect(readFileSync(cardPath(board, "MC-1"), "utf8")).not.toContain("M1");
	});

	it("move a card only out of Draft into Backlog, and never by a tick", () => {
		expect(JSON.parse(call("card_to_backlog", { id: "MC-1" })).column).toBe("Backlog");
		expect(refused("card_to_backlog", { id: "MC-1" })).toContain("Backlog");
		moveCard(board, { card: "MC-1", to: "In Progress", source: "web" });
		refused("card_to_backlog", { id: "MC-1" });
		expect(columnOf("MC-1")).toBe("In Progress");

		call("card_add", { id: "MC-1", list: "criteria", text: "It works" });
		call("card_add", { id: "MC-1", list: "dod", text: "Docs" });
		call("card_tick", { id: "MC-1", list: "criteria", n: 0 });
		call("card_tick", { id: "MC-1", list: "dod", n: 0 });
		expect(columnOf("MC-1")).toBe("In Progress");
		call("card_untick", { id: "MC-1", list: "dod", n: 0 });
		call("card_edit_item", { id: "MC-1", list: "criteria", n: 0, text: "It still works" });
		call("card_add", { id: "MC-1", list: "dod", text: "Gone soon" });
		call("card_remove_item", { id: "MC-1", list: "dod", n: 1 });
		expect(JSON.parse(call("card_read", { id: "MC-1" }))).toMatchObject({
			column: "In Progress",
			criteria: [{ n: 0, text: "It still works", ticked: true }],
			dod: [{ n: 0, text: "Docs", ticked: false }],
		});

		// Adding an Action for Human is the one other move; ticking it moves nothing.
		call("card_add", { id: "MC-1", list: "actions", text: "Pick a name" });
		expect(columnOf("MC-1")).toBe("Blocked by Human");
		call("card_tick", { id: "MC-1", list: "actions", n: 0 });
		expect(columnOf("MC-1")).toBe("Blocked by Human");

		const sources = readEvents(board.paths)
			.filter((e) => e.event === "card-moved" && e.source === "mcp")
			.map((e) => `${e.from} -> ${e.to}`);
		expect(sources).toEqual(["Draft -> Backlog", "In Progress -> Blocked by Human"]);
	});

	it("read, list, filter, edit, comment, depend and focus through the board's functions", () => {
		call("card_edit", { id: "MC-1.1", title: "Child, renamed", column: "Next" });
		call("card_comment", { id: "MC-1.1", text: "Noted" });
		call("card_depend", { id: "MC-1.1", on: "MC-1" });
		expect(JSON.parse(call("card_read", { id: "MC-1.1" }))).toMatchObject({ title: "Child, renamed", column: "Draft", dependencies: ["MC-1"], comments: [{ by: "agent", text: "Noted" }] });
		expect(JSON.parse(call("card_list", { parent: "MC-1" })).map((c: { id: string }) => c.id)).toEqual(["MC-1.1"]);
		expect(JSON.parse(call("card_list", { column: "Blocked by Human" })).map((c: { id: string }) => c.id)).toEqual(["MC-1"]);
		expect(JSON.parse(call("card_list", { ready: true })).map((c: { id: string }) => c.id)).toEqual(["MC-1"]);
		call("card_undepend", { id: "MC-1.1", on: "MC-1" });
		expect(JSON.parse(call("card_list", { ready: true })).map((c: { id: string }) => c.id)).toEqual(["MC-1", "MC-1.1"]);
		expect(refused("card_list", { column: "Someday" })).toContain("not a column");
		expect(call("card_next")).toContain("Nothing to take");

		call("card_focus", { id: "MC-1.1" });
		expect(readFocus(repo, env)).toBe("MC-1.1");
		expect(refused("card_focus", { id: "MC-404" })).toContain("No card MC-404");
		expect(call("card_focus")).toBe("Cleared the focus on MC-1.1.");
		expect(readFocus(repo, env)).toBeNull();
	});

	it("start the web UI for the session that started the MCP server", () => {
		expect(call("board_web")).toMatch(/^Started the board's web UI: http:\/\/127\.0\.0\.1:\d+\/$/);
		expect(call("board_web")).toMatch(/^The board's web UI is running: /);
		expect(readWebState(webStatePaths("MC", env).state)?.holders).toEqual([holder.pid]);
	});

	it("name every tool it serves", () => {
		expect(refused("card_move", { id: "MC-1", to: "Next" })).toBe("No tool card_move");
		expect(MCP_TOOLS.map((t) => t.name)).toEqual([
			"card_file",
			"card_read",
			"card_list",
			"card_next",
			"card_edit",
			"card_to_backlog",
			"card_add",
			"card_tick",
			"card_untick",
			"card_edit_item",
			"card_remove_item",
			"card_comment",
			"card_depend",
			"card_undepend",
			"card_focus",
			"board_web",
		]);
	});
});
