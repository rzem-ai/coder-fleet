#!/usr/bin/env bun
// The SubagentStop hook, not registered yet: each `Blocker:` line in the
// agent's handoff becomes an Action for Human on its bound card, which moves
// the card to Blocked by Human, and a coder's or scripter's stop then runs the
// card gate (onAgentStop in src/hook-moves.ts). It prints nothing, so it never
// holds up a stop.
import { boardForHook } from "../hook-board.ts";
import { StateDirRefused } from "../paths.ts";
import { onAgentStop } from "../hook-moves.ts";

try {
	const input = JSON.parse(await Bun.stdin.text()) as { cwd?: string; session_id?: string; agent_id?: string; agent_type?: unknown; last_assistant_message?: unknown };
	const cwd = input.cwd || process.cwd();
	const handoff = typeof input.last_assistant_message === "string" ? input.last_assistant_message : "";
	const { board } = boardForHook({ cwd, sessionId: input.session_id });
	if (board && input.session_id && input.agent_id) onAgentStop(board, input.session_id, input.agent_id, input.agent_type, handoff);
} catch (e) {
	// A refused state directory was named once, at session start.
	if (!(e instanceof StateDirRefused)) process.stderr.write(`board: ${(e as Error).message}\n`);
}
