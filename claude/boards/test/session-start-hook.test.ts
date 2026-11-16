import { afterAll, describe, expect, it } from "bun:test";
import { chmodSync } from "node:fs";
import { join } from "node:path";
import { createBoard } from "../src/board.ts";
import { addAction } from "../src/actions.ts";
import { createCard, readCard, updateCard } from "../src/cards.ts";
import { readEvents } from "../src/events.ts";
import { setFocus } from "../src/focus.ts";
import { moveCard } from "../src/moves.ts";
import { stateRoot } from "../src/paths.ts";
import { World } from "./fixtures.ts";

// Criteria 64 to 66: the SessionStart hook reminds the agent to check the
// board first and to reconcile it before stopping, at startup and again after
// compaction, in the spec's words; no Stop hook exists to hold up a stop.
const HOOK = join(import.meta.dir, "..", "src", "hooks", "session-start.ts");
const w = new World("session-start-hook");
afterAll(() => w.dispose());

function hook(cwd: string, source: string, sessionId: string): string {
	const input = { session_id: sessionId, cwd, hook_event_name: "SessionStart", source };
	const p = Bun.spawnSync(["bun", HOOK], {
		cwd,
		env: w.env as Record<string, string>,
		stdin: new TextEncoder().encode(JSON.stringify(input)),
		stdout: "pipe",
		stderr: "pipe",
	});
	expect(p.exitCode).toBe(0);
	expect(p.stderr.toString()).toBe("");
	return p.stdout.toString();
}

const REMINDERS =
	"This repo has a board. Before starting work, check it: take the top card in Next, or the card this checkout is bound to.\n" +
	"Before you stop, reconcile the board: tick what you finished, comment on what you didn't, and raise a `Blocker:` line for anything only the human can decide.";
// CF-1.5: the context names the board's directory, where specs and run articles live.
const withDir = (dir: string) => `${REMINDERS}\nThe board's directory is ${dir}: a spec is specs/<issue>.md there and a run article goes in runs/ there.`;

describe("the SessionStart hook", () => {
	it("in a repo with a board, gives both reminders at startup and again after compaction", () => {
		const repo = w.repo("with-board", "git@example.com:o/ss.git");
		const ss = createBoard(repo, "SS", w.env);
		const expected = `${JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: withDir(ss.paths.dir) } })}\n`;
		expect(hook(repo, "startup", "s1")).toBe(expected);
		expect(hook(repo, "compact", "s1")).toBe(expected);
	});

	it("still gives both reminders when the focus cannot be cleared, and logs why", () => {
		const repo = w.repo("stuck-focus", "git@example.com:o/sf.git");
		const board = createBoard(repo, "SF", w.env);
		const { id } = createCard(board, { title: "focused" }).card;
		setFocus(repo, id, w.env);
		const focusDir = join(stateRoot(w.env), "focus");
		chmodSync(focusDir, 0o500);
		try {
			const input = { session_id: "s3", cwd: repo, hook_event_name: "SessionStart", source: "startup" };
			const p = Bun.spawnSync(["bun", HOOK], { cwd: repo, env: w.env as Record<string, string>, stdin: new TextEncoder().encode(JSON.stringify(input)), stdout: "pipe", stderr: "pipe" });
			expect(p.exitCode).toBe(0);
			expect(JSON.parse(p.stdout.toString()).hookSpecificOutput.additionalContext).toBe(withDir(board.paths.dir));
			expect(p.stderr.toString()).toContain("board: could not clear the focus:");
		} finally {
			chmodSync(focusDir, 0o700);
		}
	});

	it("in a repo with no board, gives only the no-board message, once per session", () => {
		const repo = w.repo("no-board", "git@example.com:o/nb.git");
		const first = JSON.parse(hook(repo, "startup", "s2"));
		expect(first.hookSpecificOutput.hookEventName).toBe("SessionStart");
		expect(first.hookSpecificOutput.additionalContext).toContain("This repo has no board yet.");
		expect(first.hookSpecificOutput.additionalContext).not.toContain("Before you stop");
		expect(hook(repo, "compact", "s2")).toBe("");
	});
});

// CF-25: a card left in Blocked by Human with every action ticked, from before
// the last tick returned it, goes back at the next session start.
describe("the SessionStart sweep of Blocked by Human", () => {
	it("returns a stranded card whose actions are all ticked, and leaves a dragged card, an open action and a refused return in place", () => {
		const repo = w.repo("stranded", "git@example.com:o/st.git");
		const board = createBoard(repo, "ST", w.env);
		const cardIn = (column: string, title: string) => {
			const { id } = createCard(board, { title }).card;
			moveCard(board, { card: id, to: "Backlog", source: "web" });
			if (column !== "Backlog") moveCard(board, { card: id, to: column, source: "web" });
			return id;
		};
		const tickAll = (id: string, texts: string[]) =>
			updateCard(board, id, (f) => ({ ...f, card: { ...f.card, actions: texts.map((text) => ({ text, ticked: true })) } }));
		const columnOf = (id: string) => readCard(board, id).card.column;

		// Parked by an added action, then ticked before the last tick moved it.
		const stranded = cardIn("In Progress", "stranded");
		addAction(board, stranded, "Which?", "mcp");
		tickAll(stranded, ["Which?"]);
		// An action added in the web UI: only the trail's forAction mark tells
		// its move from a drag.
		const webAsked = cardIn("Backlog", "asked in the web UI");
		addAction(board, webAsked, "Which?", "web");
		expect(readEvents(board.paths).filter((e) => e.card === webAsked).at(-1)).toMatchObject({ source: "web", to: "Blocked by Human", forAction: true });
		tickAll(webAsked, ["Which?"]);
		// An older trail line, with no forAction mark, from a hook.
		const older = cardIn("Next", "older trail");
		moveCard(board, { card: older, to: "Blocked by Human", source: "hook" });
		tickAll(older, ["Old question?"]);
		// The human dragged it there; old actions, all ticked.
		const dragged = cardIn("Backlog", "dragged");
		moveCard(board, { card: dragged, to: "Blocked by Human", source: "web" });
		tickAll(dragged, ["Old question?"]);
		// No actions at all.
		const bare = cardIn("Backlog", "no actions");
		moveCard(board, { card: bare, to: "Blocked by Human", source: "hook" });
		// One action still open.
		const open = cardIn("In Progress", "open");
		addAction(board, open, "One?", "mcp");
		addAction(board, open, "Two?", "mcp");
		updateCard(board, open, (f) => ({ ...f, card: { ...f.card, actions: [{ text: "One?", ticked: true }, { text: "Two?", ticked: false }] } }));
		// Blocked from Done, with a criterion unticked since: the card gate holds it.
		const held = cardIn("Done", "held");
		addAction(board, held, "Ship it?", "mcp");
		updateCard(board, held, (f) => ({ ...f, card: { ...f.card, criteria: [{ text: "It works", ticked: false }] } }));
		tickAll(held, ["Ship it?"]);

		const context = JSON.parse(hook(repo, "startup", "s4")).hookSpecificOutput.additionalContext as string;
		expect(columnOf(stranded)).toBe("In Progress");
		expect(columnOf(older)).toBe("Next");
		expect(columnOf(webAsked)).toBe("Backlog");
		expect(context).toContain(`${stranded} had every Action for Human ticked and was still in Blocked by Human; it is back in In Progress.`);
		expect(context).toContain(`${older} had every Action for Human ticked and was still in Blocked by Human; it is back in Next.`);
		for (const id of [dragged, bare, open, held]) expect(columnOf(id)).toBe("Blocked by Human");
		expect(readEvents(board.paths).filter((e) => e.event === "move-skipped" && e.card === held)).toMatchObject([
			{ source: "hook", to: "Done", reason: expect.stringContaining("the card gate holds it") },
		]);
	});
});
