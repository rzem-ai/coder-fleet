#!/usr/bin/env bun
// The PreToolUse hook for the Agent tool, `boards hook pre-agent`: binds the
// spawn to its card when it is sent, the card a `Board-Item:` line in the
// prompt names or else the checkout's focus at this moment, keyed by the
// call's tool_use_id, and starts work on that card (onSpawnSent in
// src/hook-moves.ts). When the spawn is a coder or scripter and its card is in
// Draft, it prints a warning as additionalContext for the lead
// (draftSpawnWarning); otherwise it prints nothing. It never blocks the spawn.
import { boardForHook } from "../hook-board.ts";
import { draftSpawnWarning, onSpawnSent } from "../hook-moves.ts";
import { StateDirRefused } from "../paths.ts";

try {
	const input = JSON.parse(await Bun.stdin.text()) as { cwd?: string; session_id?: string; tool_use_id?: unknown; tool_input?: { prompt?: unknown; subagent_type?: unknown } };
	const cwd = input.cwd || process.cwd();
	const prompt = typeof input.tool_input?.prompt === "string" ? input.tool_input.prompt : "";
	const toolUseId = typeof input.tool_use_id === "string" ? input.tool_use_id : "";
	const { board } = boardForHook({ cwd, sessionId: input.session_id });
	if (board && input.session_id && toolUseId) {
		const bound = onSpawnSent(board, cwd, input.session_id, toolUseId, prompt);
		const warning = draftSpawnWarning(board, bound, input.tool_input?.subagent_type);
		if (warning) process.stdout.write(`${JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: warning } })}\n`);
	}
} catch (e) {
	// A refused state directory was named once, at session start.
	if (!(e instanceof StateDirRefused)) process.stderr.write(`board: ${(e as Error).message}\n`);
}
