#!/usr/bin/env bun
// The PreToolUse hook for the Agent tool, `boards hook pre-agent`: binds the
// spawn to its card when it is sent, the card a `Board-Item:` line in the
// prompt names or else the checkout's focus at this moment, keyed by the
// call's tool_use_id, and starts work on that card (onSpawnSent in
// src/hook-moves.ts). It prints nothing and never blocks the spawn.
import { boardForHook } from "../hook-board.ts";
import { onSpawnSent } from "../hook-moves.ts";
import { StateDirRefused } from "../paths.ts";

try {
	const input = JSON.parse(await Bun.stdin.text()) as { cwd?: string; session_id?: string; tool_use_id?: unknown; tool_input?: { prompt?: unknown } };
	const cwd = input.cwd || process.cwd();
	const prompt = typeof input.tool_input?.prompt === "string" ? input.tool_input.prompt : "";
	const toolUseId = typeof input.tool_use_id === "string" ? input.tool_use_id : "";
	const { board } = boardForHook({ cwd, sessionId: input.session_id });
	if (board && input.session_id && toolUseId) onSpawnSent(board, cwd, input.session_id, toolUseId, prompt);
} catch (e) {
	// A refused state directory was named once, at session start.
	if (!(e instanceof StateDirRefused)) process.stderr.write(`board: ${(e as Error).message}\n`);
}
