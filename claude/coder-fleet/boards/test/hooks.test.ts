import { afterAll, describe, expect, it } from "bun:test";
import { join } from "node:path";
import { addAction, tickAction } from "../src/actions.ts";
import { createBoard } from "../src/board.ts";
import { createCard, readCard } from "../src/cards.ts";
import { cardHistory, readEvents } from "../src/events.ts";
import { readFocus, setFocus } from "../src/focus.ts";
import { moveCard } from "../src/moves.ts";
import { World } from "./fixtures.ts";

// Group C, criteria 24 to 28 (card 7 to 11): focus binding and the hook-owned
// moves. Each test drives a hook's own script with the JSON Claude Code sends
// it, one per row of the README's hook-event table, and checks the column.
const w = new World("hooks");
afterAll(() => w.dispose());
const repo = w.repo("hk", "git@example.com:o/hk.git");
const board = createBoard(repo, "HK", w.env);
const HOOKS = join(import.meta.dir, "..", "src", "hooks");
const columnOf = (id: string) => readCard(board, id).card.column;
let sessions = 0;
let agents = 0;

function hook(name: string, input: Record<string, unknown>): string {
	const p = Bun.spawnSync(["bun", join(HOOKS, `${name}.ts`)], {
		cwd: repo,
		env: w.env as Record<string, string>,
		stdin: new TextEncoder().encode(JSON.stringify(input)),
		stdout: "pipe",
		stderr: "pipe",
	});
	expect({ code: p.exitCode, err: p.stderr.toString() }).toEqual({ code: 0, err: "" });
	return p.stdout.toString();
}

const start = (cwd: string, session: string, agent: string) => hook("subagent-start", { session_id: session, agent_id: agent, agent_type: "coder", cwd, hook_event_name: "SubagentStart" });
const stop = (cwd: string, session: string, agent: string, handoff: string) =>
	hook("subagent-stop", { session_id: session, agent_id: agent, agent_type: "coder", cwd, hook_event_name: "SubagentStop", last_assistant_message: handoff });

// A card in `column`, put there by the human in the web UI.
function cardIn(column: string): string {
	const { id } = createCard(board, { title: column }).card;
	if (column === "Draft") return id;
	moveCard(board, { card: id, to: "Backlog", source: "web" });
	if (column !== "Backlog") moveCard(board, { card: id, to: column, source: "web" });
	return id;
}

// Focuses the main checkout on the card and starts one agent there.
function startOn(id: string): { session: string; agent: string } {
	const session = `s${++sessions}`;
	const agent = `a${++agents}`;
	setFocus(repo, id, w.env);
	start(repo, session, agent);
	return { session, agent };
}

const handoff = (decisions: string) => `## Done\n- x\n\n## Not done\n- None\n\n## Unverified\n- None\n\n## Decisions needed\n${decisions}\n`;

describe("the hook-event table (11)", () => {
	it("SessionStart on startup, clear or resume clears the checkout's focus; on compact keeps it (7)", () => {
		const id = cardIn("Backlog");
		for (const source of ["startup", "clear", "resume", undefined]) {
			setFocus(repo, id, w.env);
			const out = hook("session-start", { session_id: "ss", cwd: repo, hook_event_name: "SessionStart", source });
			expect(readFocus(repo, w.env)).toBeNull();
			expect(out).toContain(`Board focus: ${id} was focused from an earlier session and has been cleared.`);
		}
		setFocus(repo, id, w.env);
		hook("session-start", { session_id: "ss", cwd: repo, hook_event_name: "SessionStart", source: "compact" });
		expect(readFocus(repo, w.env)).toBe(id);
		expect(columnOf(id)).toBe("Backlog");
	});

	it("PreToolUse on Agent with a Board-Item: line focuses the spawning checkout on that card (7)", () => {
		const id = cardIn("Backlog");
		hook("session-start", { session_id: "pre", cwd: repo, source: "startup" });
		hook("pre-agent", { session_id: "pre", cwd: repo, hook_event_name: "PreToolUse", tool_name: "Agent", tool_input: { prompt: `board-item: ${id.toLowerCase()}\nBuild it.` } });
		expect(readFocus(repo, w.env)).toBe(id);
		hook("pre-agent", { session_id: "pre", cwd: repo, tool_name: "Agent", tool_input: { prompt: "Board-Item: HK-999\n" } });
		expect(readFocus(repo, w.env)).toBe(id);
		expect(columnOf(id)).toBe("Backlog");
	});

	for (const from of ["Backlog", "Next"]) {
		it(`SubagentStart moves the bound card from ${from} to In Progress (8)`, () => {
			const id = cardIn(from);
			const { agent } = startOn(id);
			expect(columnOf(id)).toBe("In Progress");
			expect(cardHistory(board.paths, id).at(-1)).toMatchObject({ from, to: "In Progress", source: "hook", actor: agent });
		});
	}

	for (const from of ["Draft", "In Progress", "Done", "Released", "Blocked"]) {
		it(`SubagentStart moves nothing from ${from}, and the log says why (8)`, () => {
			const id = cardIn(from);
			const moves = cardHistory(board.paths, id).length;
			startOn(id);
			expect(columnOf(id)).toBe(from);
			expect(cardHistory(board.paths, id).length).toBe(moves);
			expect(readEvents(board.paths).at(-1)).toMatchObject({
				event: "move-skipped",
				card: id,
				column: from,
				reason: "an agent's start moves a card to In Progress only from Backlog or Next",
			});
		});
	}

	it("SubagentStart moves nothing from Blocked by Human while an action is unticked, and the log says why (10)", () => {
		const id = cardIn("In Progress");
		addAction(board, id, "Which?", "hook");
		startOn(id);
		expect(columnOf(id)).toBe("Blocked by Human");
		expect(readEvents(board.paths).at(-1)).toMatchObject({ event: "move-skipped", card: id, reason: "it has 1 Action(s) for Human still unticked" });
	});

	for (const from of ["Backlog", "Next", "In Progress", "Done"]) {
		it(`SubagentStart returns a card blocked from ${from} once every action is ticked, then starts it (10)`, () => {
			const id = cardIn(from);
			addAction(board, id, "One?", "mcp");
			addAction(board, id, "Two?", "mcp");
			tickAction(board, id, 0);
			tickAction(board, id, 1);
			expect(columnOf(id)).toBe("Blocked by Human");
			startOn(id);
			const tail = cardHistory(board.paths, id).map((e) => [e.from, e.to]).slice(-2);
			if (from === "Backlog" || from === "Next") {
				expect(tail).toEqual([["Blocked by Human", from], [from, "In Progress"]]);
				expect(columnOf(id)).toBe("In Progress");
			} else {
				expect(tail.at(-1)).toEqual(["Blocked by Human", from]);
				expect(columnOf(id)).toBe(from);
			}
		});
	}

	for (const from of ["Backlog", "In Progress", "Done"]) {
		it(`SubagentStop with a Blocker: line adds an unticked action with its text and moves the card from ${from} to Blocked by Human (9)`, () => {
			const id = cardIn(from);
			const session = `s${++sessions}`;
			const agent = `a${++agents}`;
			setFocus(repo, id, w.env);
			start(repo, session, agent);
			const was = columnOf(id);
			stop(repo, session, agent, handoff("- Blocker: Which TTL, 7 days or 30?\n- Propose item: Something else.\n- Blocker: And the region?"));
			const card = readCard(board, id).card;
			expect(card.column).toBe("Blocked by Human");
			expect(card.actions).toEqual([
				{ text: "Which TTL, 7 days or 30?", ticked: false },
				{ text: "And the region?", ticked: false },
			]);
			expect(cardHistory(board.paths, id).at(-1)).toMatchObject({ from: was, to: "Blocked by Human", source: "hook", actor: agent });
		});
	}

	it("SubagentStop with only a Propose item: line moves nothing (9)", () => {
		const id = cardIn("Backlog");
		const { session, agent } = startOn(id);
		stop(repo, session, agent, handoff("- Propose item: A follow-up."));
		expect(columnOf(id)).toBe("In Progress");
		expect(readCard(board, id).card.actions).toBeUndefined();
	});

	it("SubagentStop ignores a Blocker: line outside Decisions needed (9)", () => {
		const id = cardIn("Backlog");
		const { session, agent } = startOn(id);
		stop(repo, session, agent, "## Done\n- Blocker: not here?\n\n## Decisions needed\n- None\n");
		expect(columnOf(id)).toBe("In Progress");
	});
});

describe("focus binding (7)", () => {
	it("binds an agent to its spawning checkout's card for its whole run, wherever its own worktree is", () => {
		const id = cardIn("Backlog");
		const wt = w.worktree(repo, "agent-wt");
		const { session, agent } = startOn(id);
		// The agent's own hooks fire in its worktree, which has no focus of its own.
		expect(readFocus(wt, w.env)).toBeNull();
		stop(wt, session, agent, handoff("- Blocker: Ship it?"));
		expect(columnOf(id)).toBe("Blocked by Human");
	});

	it("keeps a resumed agent on the card it started on, whatever the focus says now", () => {
		const first = cardIn("Backlog");
		const other = cardIn("Backlog");
		const { session, agent } = startOn(first);
		setFocus(repo, other, w.env);
		start(repo, session, agent);
		expect(columnOf(other)).toBe("Backlog");
		stop(repo, session, agent, handoff("- Blocker: Still the first?"));
		expect(columnOf(first)).toBe("Blocked by Human");
		expect(columnOf(other)).toBe("Backlog");
	});

	it("moves only each checkout's own card when two checkouts are focused on different cards", () => {
		const a = cardIn("Backlog");
		const b = cardIn("Next");
		const wt = w.worktree(repo, "second-checkout");
		setFocus(repo, a, w.env);
		setFocus(wt, b, w.env);
		start(repo, "two", "on-a");
		expect([columnOf(a), columnOf(b)]).toEqual(["In Progress", "Next"]);
		start(wt, "two", "on-b");
		expect([columnOf(a), columnOf(b)]).toEqual(["In Progress", "In Progress"]);
		stop(wt, "two", "on-b", handoff("- Blocker: B only?"));
		expect([columnOf(a), columnOf(b)]).toEqual(["In Progress", "Blocked by Human"]);
	});

	it("binds and moves nothing when the checkout has no focus", () => {
		const id = cardIn("Backlog");
		hook("session-start", { session_id: "none", cwd: repo, source: "startup" });
		start(repo, "none", "unbound");
		stop(repo, "none", "unbound", handoff("- Blocker: Anyone?"));
		expect(columnOf(id)).toBe("Backlog");
	});
});
