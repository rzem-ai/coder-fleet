// `boards hook <event>`: runs one of the board's hooks, each of which reads
// Claude Code's hook JSON on stdin when it is loaded. hooks.json calls these
// through boards.sh. Each import is spelled out so the compiled binary
// carries every hook.
export const HOOKS = ["session-start", "pre-agent", "subagent-start", "subagent-stop", "task-completed", "post-push", "stop"] as const;

export async function runHook(args: string[]): Promise<number> {
	switch (args[0]) {
		case "session-start":
			await import("./session-start.ts");
			return 0;
		case "pre-agent":
			await import("./pre-agent.ts");
			return 0;
		case "subagent-start":
			await import("./subagent-start.ts");
			return 0;
		case "subagent-stop":
			await import("./subagent-stop.ts");
			return 0;
		case "task-completed":
			await import("./task-completed.ts");
			return 0;
		case "post-push":
			await import("./post-push.ts");
			return 0;
		case "stop":
			await import("./stop.ts");
			return 0;
	}
	process.stderr.write(`boards hook: name one of ${HOOKS.join(", ")}\n`);
	return 1;
}
