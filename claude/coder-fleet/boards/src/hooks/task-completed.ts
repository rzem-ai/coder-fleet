#!/usr/bin/env bun
// The TaskCompleted hook, `boards hook task-completed`: a task whose subject carries
// `[board:<id>]` runs the card gate on that card, which moves it into Done
// when every item on it is ticked (onTaskCompleted in src/hook-moves.ts).
// It prints nothing and never blocks the task.
import { boardForHook } from "../hook-board.ts";
import { onTaskCompleted } from "../hook-moves.ts";
import { StateDirRefused } from "../paths.ts";

try {
	const input = JSON.parse(await Bun.stdin.text()) as { cwd?: string; session_id?: string; task_subject?: unknown };
	const cwd = input.cwd || process.cwd();
	const subject = typeof input.task_subject === "string" ? input.task_subject : "";
	const { board } = boardForHook({ cwd, sessionId: input.session_id });
	if (board && subject) onTaskCompleted(board, subject, input.session_id);
} catch (e) {
	// A refused state directory was named once, at session start.
	if (!(e instanceof StateDirRefused)) process.stderr.write(`board: ${(e as Error).message}\n`);
}
