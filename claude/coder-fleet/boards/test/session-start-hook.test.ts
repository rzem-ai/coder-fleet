import { afterAll, describe, expect, it } from "bun:test";
import { chmodSync } from "node:fs";
import { join } from "node:path";
import { createBoard } from "../src/board.ts";
import { createCard } from "../src/cards.ts";
import { setFocus } from "../src/focus.ts";
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

describe("the SessionStart hook", () => {
	it("in a repo with a board, gives both reminders at startup and again after compaction", () => {
		const repo = w.repo("with-board", "git@example.com:o/ss.git");
		createBoard(repo, "SS", w.env);
		const expected = `${JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: REMINDERS } })}\n`;
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
			expect(JSON.parse(p.stdout.toString()).hookSpecificOutput.additionalContext).toBe(REMINDERS);
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
