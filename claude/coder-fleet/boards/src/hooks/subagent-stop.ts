#!/usr/bin/env bun
// The SubagentStop hook, not registered yet: each `Blocker:` line in the
// agent's handoff becomes an Action for Human on its bound card, which moves
// the card to Blocked by Human (onAgentStop in src/hook-moves.ts). It prints
// nothing, so it never holds up a stop.
import { boardForHook } from "../hook-board.ts";
import { onAgentStop } from "../hook-moves.ts";

try {
	const input = JSON.parse(await Bun.stdin.text()) as { cwd?: string; session_id?: string; agent_id?: string; last_assistant_message?: unknown };
	const cwd = input.cwd || process.cwd();
	const handoff = typeof input.last_assistant_message === "string" ? input.last_assistant_message : "";
	const { board } = boardForHook({ cwd, sessionId: input.session_id });
	if (board && input.session_id && input.agent_id) onAgentStop(board, input.session_id, input.agent_id, handoff);
} catch (e) {
	process.stderr.write(`board: ${(e as Error).message}\n`);
}
