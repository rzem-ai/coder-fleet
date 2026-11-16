import type { LinesBoot } from "../types/index";

// The boards binary's state for this session: the line the session is told
// at SessionStart, and what the second line under the prompt shows of the
// binary while it is not ready (status-lines.ts draws it). Pure, so the
// deterministic suite tests it with no Claude Code and no network
// (claude/boards/test/boards-status.test.ts); boards-status.ts gathers the
// facts through `$` and calls it.

// What the session can see of the binary at one moment.
export type BoardsFacts = {
	// The plugin's version from plugin.json, or undefined when unreadable.
	version: string | undefined;
	// The plugin's data directory, or undefined when it cannot be worked out.
	dataDir: string | undefined;
	// A binary boards.sh would run is there: the release build for this
	// version, or in a checkout of the coder-fleet repo the checkout's build.
	hasBinary: boolean;
	// CODER_FLEET_BOARDS_DOWNLOAD=off.
	isOff: boolean;
	// How old the fetch lock is, or undefined when no fetch holds it.
	lockAgeMs: number | undefined;
	// The code boards-binary.sh left in .boards-unavailable-<version> when it
	// last gave up on this version, or undefined.
	unavailable: string | undefined;
	// This session's SessionStart hooks, the fetch among them, have not
	// finished yet.
	isStarting: boolean;
	// The fetch the hooks module started itself, when no SessionStart hook
	// ran one (a /reload-plugins, or a plugin updated in a running session):
	// still running, or how it exited. Absent when it started none.
	ownFetch?: OwnFetch;
};

export type OwnFetch = "running" | { exitCode: number };

export type BoardsStateKind = "ready" | "downloading" | "elsewhere" | "unavailable";

// `line` is what the session is told; `why`, for unavailable, is the short
// reason line 2 gives.
export type BoardsState = { kind: BoardsStateKind; line: string; why?: string };

// boards-binary.sh takes a lock older than this to be a fetch that died.
export const STALE_LOCK_MS = 10 * 60 * 1000;

// The codes boards-binary.sh writes, and what the line says for each. A code
// it does not know reads as a failed fetch.
const REASONS: Record<string, string> = {
	"no-curl": "no curl",
	"no-gzip": "no gzip",
	"fetch-failed": "the fetch failed",
	"bad-checksum": "a bad checksum",
	"no-checksum-tool": "no sha256sum or shasum",
};

// The same reasons as line 2 gives them, after "unavailable:".
const SHORT: Record<string, string> = {
	"no-curl": "no curl",
	"no-gzip": "no gzip",
	"fetch-failed": "fetch failed",
	"bad-checksum": "bad checksum",
	"no-checksum-tool": "no sha256sum or shasum",
};

export function reasonFor(code: string, short = false): string {
	const [head, ...rest] = code.trim().split(/\s+/);
	if (head === "no-release") return `no release for ${rest.join(" ") || "this platform"}`;
	return (short ? SHORT : REASONS)[head ?? ""] ?? (short ? "fetch failed" : "the fetch failed");
}

export function boardsState(f: BoardsFacts): BoardsState {
	const name = f.version ? `coder-fleet v${f.version}` : "coder-fleet";
	const say = (kind: BoardsStateKind, what: string): BoardsState => ({ kind, line: `${name}: boards binary ${what}` });
	const no = (why: string, short = why): BoardsState => ({ ...say("unavailable", `not available: ${why}`), why: short });
	if (!f.version) return no("no plugin version");
	if (f.hasBinary) return say("ready", "ready");
	if (f.isOff) return no("downloading turned off (CODER_FLEET_BOARDS_DOWNLOAD=off)", "downloading turned off");
	if (!f.dataDir) return no("no data directory");
	const own = f.ownFetch;
	if (isLive(f.lockAgeMs)) {
		return f.isStarting || own === "running" ? say("downloading", "downloading now") : say("elsewhere", "downloading in another session");
	}
	// A failure is only what the fetch said: the code it left, or the exit
	// of the fetch this module started.
	if (f.unavailable !== undefined) return no(reasonFor(f.unavailable), reasonFor(f.unavailable, true));
	if (own !== undefined && own !== "running") {
		return own.exitCode !== 0 ? no("the fetch failed", "fetch failed") : no("the fetch ended without one; see the coder-fleet hooks log", "no binary fetched");
	}
	// Waiting for this session's SessionStart fetch, running the module's
	// own, or about to start it (shouldFetch).
	return say("downloading", "downloading now");
}

// hooks.json's timeout on the SessionStart command that runs the fetch.
export const START_BUDGET_MS = 200_000;
// How long a load of the hooks module waits for a SessionStart hook to
// begin before it takes the load for one in a running session (a reload,
// an update, an enable), where none comes. A real start runs its
// SessionStart hooks within seconds of loading the module.
export const HOOK_GRACE_MS = 15_000;

// When this load of the hooks module was started, whether an earlier load
// in the session already started (so no SessionStart hook will run for this
// one), and when this load saw a SessionStart hook begin and whether it
// finished.
export type StartFacts = { now: number; loadedAt: number | undefined; laterLoad: boolean; hookStartedAt: number | undefined; hookDone: boolean };

// Whether a SessionStart hook may still fetch for this load: one that began
// until it finishes or runs out of time, and with none seen yet, the grace
// on a load that may be the session's first. A `session.start` that comes
// long after the session began is no sign of a later load: a resumed
// session counts from its first launch.
export function isStarting(s: StartFacts): boolean {
	if (s.hookDone) return false;
	if (s.hookStartedAt !== undefined) return s.now - s.hookStartedAt < START_BUDGET_MS;
	if (s.laterLoad) return false;
	return s.loadedAt === undefined || s.now - s.loadedAt < HOOK_GRACE_MS;
}

const isLive = (lockAgeMs: number | undefined) => lockAgeMs !== undefined && lockAgeMs < STALE_LOCK_MS;

// Whether the hooks module starts the fetch itself: nothing is there for
// this version, no live fetch holds the lock, the last fetch left no code,
// no SessionStart hook is still to run it, and the module has not started
// one for this version already.
export function shouldFetch(f: BoardsFacts): boolean {
	return (
		f.version !== undefined &&
		f.dataDir !== undefined &&
		!f.hasBinary &&
		!f.isOff &&
		!isLive(f.lockAgeMs) &&
		f.unavailable === undefined &&
		!f.isStarting &&
		f.ownFetch === undefined
	);
}

// The command the hooks module runs to fetch, with the environment the
// SessionStart hook gives boards-binary.sh.
export function fetchCommand(root: string, dataDir: string): { argv: string[]; env: Record<string, string> } {
	const r = root.replace(/\/+$/, "");
	return { argv: ["/bin/bash", `${r}/hooks/boards-binary.sh`], env: { CLAUDE_PLUGIN_ROOT: r, CLAUDE_PLUGIN_DATA: dataDir } };
}

// What the session is told: the line, and for any state but ready that the
// board's tools fail until the binary is there.
export function contextLine(s: BoardsState): string {
	return s.kind === "ready" ? s.line : `${s.line}; the board's tools fail until it is ready`;
}

// The files boards-binary.sh keeps in the data directory: the release build
// for a version, the lock a fetch holds, how far that fetch has got, and the
// code it leaves on giving up.
export const binaryPath = (dataDir: string, version: string) => `${dataDir}/bin/boards-${version}`;
export const lockPath = (dataDir: string) => `${dataDir}/bin/.boards-fetch.lock`;
export const progressPath = (dataDir: string) => `${dataDir}/bin/.boards-fetch-progress`;

// The progress file's one line, `<bytes arrived> <bytes expected>`, as a
// whole percentage; null while the size is not known or the file is not
// there or not readable.
export function progressPercent(text: string | undefined): number | null {
	const m = /^\s*(\d+)\s+(\d+)\s*$/.exec(text ?? "");
	if (!m) return null;
	const got = Number(m[1]);
	const total = Number(m[2]);
	if (!(total > 0)) return null;
	return Math.max(0, Math.min(100, Math.floor((got * 100) / total)));
}

// How long line 2 says the binary is ready once a download this session saw
// has finished, before it becomes the fleet's.
export const READY_HOLD_MS = 8000;

// What line 2 shows of the binary, if anything: the download (this
// session's or another's) with its percentage, ready for READY_HOLD_MS once
// a download this session saw has finished, the reason while it is not
// available, or the fleet. A session that found the binary there from the
// start goes straight to the fleet.
export type BootLine = LinesBoot;

export function bootLine(s: BoardsState, f: { version: string | undefined; percent: number | null; readyAt: number | undefined; now: number }): BootLine {
	switch (s.kind) {
		case "downloading":
		case "elsewhere":
			return { kind: s.kind, version: f.version, percent: f.percent };
		case "unavailable":
			return { kind: "unavailable", version: f.version, why: s.why ?? "fetch failed" };
		default:
			return f.readyAt !== undefined && f.now - f.readyAt < READY_HOLD_MS ? { kind: "ready", version: f.version } : { kind: "fleet" };
	}
}
export const unavailablePath = (dataDir: string, version: string) => `${dataDir}/bin/.boards-unavailable-${version}`;

// The data directory Claude Code gives the plugin, as scripts/boards.sh
// works it out: an install at <config>/plugins/cache/<marketplace>/<plugin>/
// <version> has <config>/plugins/data/<plugin>-<marketplace>, and a plugin
// loaded from a folder (--plugin-dir) has <config>/plugins/data/<name>-inline.
export function dataDirFor(root: string, name: string, configDir: string | undefined): string | undefined {
	const parts = root.replace(/\/+$/, "").split("/");
	const n = parts.length;
	if (n >= 6 && parts[n - 4] === "cache" && parts[n - 5] === "plugins" && parts[n - 1] && parts[n - 2] && parts[n - 3]) {
		return `${parts.slice(0, n - 4).join("/")}/data/${parts[n - 2]}-${parts[n - 3]}`;
	}
	if (!configDir) return undefined;
	return `${configDir.replace(/\/+$/, "")}/plugins/data/${name.replace(/[^A-Za-z0-9_-]/g, "-")}-inline`;
}
