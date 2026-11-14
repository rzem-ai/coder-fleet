#!/usr/bin/env bun
// The SubagentStart hook, not registered yet: binds the subagent to its
// checkout's focus, a resume keeping its first binding, and starts work on
// that card (onAgentStart in src/hook-moves.ts). It never blocks the spawn.
import { boardForHook } from "../hook-board.ts";
import { StateDirRefused } from "../paths.ts";
import { onAgentStart } from "../hook-moves.ts";

try {
	const input = JSON.parse(await Bun.stdin.text()) as { cwd?: string; session_id?: string; agent_id?: string };
	const cwd = input.cwd || process.cwd();
	const { board } = boardForHook({ cwd, sessionId: input.session_id });
	if (board && input.session_id && input.agent_id) onAgentStart(board, cwd, input.session_id, input.agent_id);
} catch (e) {
	// A refused state directory was named once, at session start.
	if (!(e instanceof StateDirRefused)) process.stderr.write(`board: ${(e as Error).message}\n`);
}
