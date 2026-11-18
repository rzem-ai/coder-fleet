#!/usr/bin/env bun
// The PostToolUse hook for Bash, `boards hook post-push`. Claude Code runs it only
// after a Bash call succeeded. When the command ran `git push`, it starts the
// test gate for each release tag the command named that carries a `Cards:`
// line and that origin now holds, asked with `git ls-remote` (releaseCatchUp
// in src/releases.ts), so only a tag that reached the remote counts, and no
// other tag is started by an unrelated push. A run goes on in the background; the hook
// returns at once and the turn never waits for the suite. What it started is
// added to the session's context.
import { boardForHook } from "../hook-board.ts";
import { isGitPush, pushedNames, releaseCatchUp } from "../releases.ts";

try {
	const raw = await Bun.stdin.text();
	// Every Bash call runs this hook, so the cheap test comes first.
	if (raw.includes("push")) {
		const input = JSON.parse(raw) as { cwd?: string; session_id?: string; tool_input?: { command?: unknown } };
		const command = typeof input.tool_input?.command === "string" ? input.tool_input.command : "";
		if (isGitPush(command)) {
			const cwd = input.cwd || process.cwd();
			const { board } = boardForHook({ cwd, sessionId: input.session_id });
			const lines = board ? releaseCatchUp(board, cwd, process.env, input.session_id, pushedNames(command)) : [];
			if (lines.length) {
				process.stdout.write(`${JSON.stringify({ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: lines.join("\n") } })}\n`);
			}
		}
	}
} catch (e) {
	process.stderr.write(`board: ${(e as Error).message}\n`);
}
