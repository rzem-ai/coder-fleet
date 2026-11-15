// The boards binary's state for this session, as one short line: what the
// status-line entry shows and what the session is told at SessionStart. Pure,
// so the deterministic suite tests it with no Claude Code and no network
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
};

export type BoardsStateKind = "ready" | "downloading" | "elsewhere" | "unavailable";

export type BoardsState = { kind: BoardsStateKind; line: string };

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

export function reasonFor(code: string): string {
	const [head, ...rest] = code.trim().split(/\s+/);
	if (head === "no-release") return `no release for ${rest.join(" ") || "this platform"}`;
	return REASONS[head ?? ""] ?? "the fetch failed";
}

export function boardsState(f: BoardsFacts): BoardsState {
	const name = f.version ? `coder-fleet v${f.version}` : "coder-fleet";
	const say = (kind: BoardsStateKind, what: string): BoardsState => ({ kind, line: `${name}: boards binary ${what}` });
	const no = (why: string) => say("unavailable", `not available: ${why}`);
	if (!f.version) return no("no plugin version");
	if (f.hasBinary) return say("ready", "ready");
	if (f.isOff) return no("downloading turned off (CODER_FLEET_BOARDS_DOWNLOAD=off)");
	if (!f.dataDir) return no("no data directory");
	if (f.lockAgeMs !== undefined && f.lockAgeMs < STALE_LOCK_MS) {
		return f.isStarting ? say("downloading", "downloading now") : say("elsewhere", "downloading in another session");
	}
	if (f.unavailable !== undefined) return no(reasonFor(f.unavailable));
	return f.isStarting ? say("downloading", "downloading now") : no("the fetch failed");
}

// What the session is told: the line, and for any state but ready that the
// board's tools fail until the binary is there.
export function contextLine(s: BoardsState): string {
	return s.kind === "ready" ? s.line : `${s.line}; the board's tools fail until it is ready`;
}

// The files boards-binary.sh keeps in the data directory: the release build
// for a version, the lock a fetch holds, and the code it leaves on giving up.
export const binaryPath = (dataDir: string, version: string) => `${dataDir}/bin/boards-${version}`;
export const lockPath = (dataDir: string) => `${dataDir}/bin/.boards-fetch.lock`;
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
