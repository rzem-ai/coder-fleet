#!/usr/bin/env bun
// The PreToolUse hook for the Agent tool, not registered yet: a `Board-Item:`
// line in the spawn prompt focuses the spawning checkout on that card, so the
// subagent binds to it when it starts. It never blocks the spawn.
import { boardForHook } from "../hook-board.ts";
import { StateDirRefused } from "../paths.ts";
import { focusFromSpawnPrompt } from "../hook-moves.ts";

try {
	const input = JSON.parse(await Bun.stdin.text()) as { cwd?: string; session_id?: string; tool_input?: { prompt?: unknown } };
	const cwd = input.cwd || process.cwd();
	const prompt = input.tool_input?.prompt;
	const { board } = boardForHook({ cwd, sessionId: input.session_id });
	if (board && typeof prompt === "string") focusFromSpawnPrompt(board, cwd, prompt);
} catch (e) {
	// A refused state directory was named once, at session start.
	if (!(e instanceof StateDirRefused)) process.stderr.write(`board: ${(e as Error).message}\n`);
}
