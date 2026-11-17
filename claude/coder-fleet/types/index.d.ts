// coder-fleet's contract with Claude Code: the values its hooks module keeps
// in `$.state` for the two lines it draws under the prompt
// (hooks/boards-status.ts), so a change to one redraws them. The hooks
// module and the pure modules it draws with (hooks/status-lines.ts,
// hooks/boards-state.ts) take their types from here.

// Line 1's model, project and branch.
// `effort` is the level the main loop's last model request asked for, as
// `turn.step` saw it; absent before the first request or on a model without effort.
export type LinesIdent = { model: string; effort?: string; project: string; branch: string };

// What the session's context window holds, as `$.session.usage()` gives it.
export type LinesCtx = { percent?: number; tokens?: number; window: number };

// What line 2 shows of the boards binary, if anything: the download (this
// session's or another's) with its percentage, ready for a few seconds once
// a download this session saw has finished, the short reason while it is not
// available, or the fleet.
export type LinesBoot =
	| { kind: "downloading" | "elsewhere"; version: string | undefined; percent: number | null }
	| { kind: "ready"; version: string | undefined }
	| { kind: "unavailable"; version: string | undefined; why: string }
	| { kind: "fleet" };

// A fleet agent working now: its id, its type (`coder-fleet:coder`), the
// card its spawn was bound to, when it started, what it is doing now, the
// offset of its spinner, and whether it is a teammate, which idles between
// turns rather than finishing.
export type LinesAgent = {
	id: string;
	type: string;
	card: string | null;
	startedAt: number;
	activity: string;
	phase: number;
	isTeammate?: boolean;
};

// What the board says, from `boards fleet status-lines`.
export type LinesBoard = { board: boolean; next: string | null; blockedByHuman: number; web: string | null; focus: string | null };

// The redraw clock: the time of the last tick, and how many there have been.
export type LinesClock = { now: number; tick: number };

// What survives a reload of the hooks module within the session: whether it
// has started before (a later start has no SessionStart hooks of its own),
// and the fetch it started for a version, with its exit code once it ended.
export type LinesSession = { loaded: boolean; fetch: { version: string; exitCode: number | null } | null };

declare module "claude-code" {
	interface PluginState {
		"coder-fleet": {
			"lines-ident": LinesIdent;
			"lines-ctx": LinesCtx | null;
			"lines-boot": LinesBoot;
			"lines-agents": LinesAgent[];
			"lines-board": LinesBoard | null;
			"lines-clock": LinesClock;
			"lines-session": LinesSession;
		};
	}
}
