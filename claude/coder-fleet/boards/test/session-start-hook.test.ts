import { afterAll, describe, expect, it } from "bun:test";
import { join } from "node:path";
import { createBoard } from "../src/board.ts";
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

	it("in a repo with no board, gives only the no-board message, once per session", () => {
		const repo = w.repo("no-board", "git@example.com:o/nb.git");
		const first = JSON.parse(hook(repo, "startup", "s2"));
		expect(first.hookSpecificOutput.hookEventName).toBe("SessionStart");
		expect(first.hookSpecificOutput.additionalContext).toContain("This repo has no board yet.");
		expect(first.hookSpecificOutput.additionalContext).not.toContain("Before you stop");
		expect(hook(repo, "compact", "s2")).toBe("");
	});
});
