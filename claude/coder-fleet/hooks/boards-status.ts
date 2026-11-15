// The boards binary's state for the whole session: a status-line entry that
// names the plugin version and one state (ready, downloading now, downloading
// in another session, or not available and why), and the same line handed to
// the session at SessionStart, so the lead can say why a board tool fails.
//
// The download stays in boards-binary.sh. This module only reads what it
// leaves: the binary itself, its fetch lock, and the code it writes to
// <data>/bin/.boards-unavailable-<version> when it gives up on a version.
// boards-state.ts turns those facts into the line. While the binary is
// missing the entry is checked again every two seconds, so a download that
// finishes mid-session reads ready without a restart; once ready it stops.
import type { EngineInterface, Register, Timer } from "claude-code";
import { type BoardsFacts, type BoardsState, binaryPath, boardsState, contextLine, dataDirFor, lockPath, unavailablePath } from "./boards-state";

const POLL_MS = 2000;
// hooks.json's timeout on the SessionStart command that runs the fetch.
const START_BUDGET_MS = 200_000;

type Where = {
	version: string | undefined;
	dataDir: string | undefined;
	// The binaries boards.sh would run, in its order.
	binaries: string[];
};

let where: Promise<Where> | undefined;
let startedAt: number | undefined;
let hooksDone = false;
let shown: string | undefined;
let poll: Timer | undefined;

async function locate($: EngineInterface): Promise<Where> {
	const root = $.plugin.root.replace(/\/+$/, "");
	const version = await $.fs
		.read(`${root}/.claude-plugin/plugin.json`)
		.then((text) => {
			const v = (JSON.parse(text) as { version?: unknown }).version;
			return typeof v === "string" && v !== "" ? v : undefined;
		})
		.catch(() => undefined);
	const home = await $.env.get("HOME");
	const config = (await $.env.get("CLAUDE_CONFIG_DIR")) ?? (home ? `${home}/.claude` : undefined);
	const dataDir = dataDirFor(root, $.plugin.name, config);
	const binaries: string[] = [];
	// A checkout of the coder-fleet repo: boards.sh runs the build in
	// claude/boards/bin first.
	const pkg = `${root.slice(0, root.lastIndexOf("/"))}/boards`;
	if (await $.fs.exists(`${pkg}/scripts/build.ts`).catch(() => false)) {
		const uname = await $.process.run(["uname", "-s", "-m"]).catch(() => undefined);
		const [os, arch] = (uname?.stdout ?? "").trim().split(/\s+/);
		const o = os === "Darwin" ? "darwin" : os === "Linux" ? "linux" : undefined;
		const a = arch === "arm64" || arch === "aarch64" ? "arm64" : arch === "x86_64" || arch === "amd64" ? "x64" : undefined;
		if (o && a) binaries.push(`${pkg}/bin/boards-${o}-${a}`);
	}
	if (dataDir && version) binaries.push(binaryPath(dataDir, version));
	return { version, dataDir, binaries };
}

async function facts($: EngineInterface): Promise<BoardsFacts> {
	where ??= locate($);
	const w = await where;
	const now = await $.clock.now();
	const f: BoardsFacts = {
		version: w.version,
		dataDir: w.dataDir,
		hasBinary: false,
		isOff: false,
		lockAgeMs: undefined,
		unavailable: undefined,
		isStarting: !hooksDone && (startedAt === undefined || now - startedAt < START_BUDGET_MS),
	};
	// Ready costs one file check in an install.
	for (const bin of w.binaries) {
		if (await $.fs.exists(bin).catch(() => false)) return { ...f, hasBinary: true };
	}
	f.isOff = (await $.env.get("CODER_FLEET_BOARDS_DOWNLOAD")) === "off";
	if (f.isOff || !w.dataDir || !w.version) return f;
	const lock = await $.fs.stat(lockPath(w.dataDir)).catch(() => undefined);
	if (lock) f.lockAgeMs = Math.max(0, now - lock.mtimeMs);
	f.unavailable = await $.fs.read(unavailablePath(w.dataDir, w.version)).catch(() => undefined);
	return f;
}

async function refresh($: EngineInterface): Promise<BoardsState> {
	const s = boardsState(await facts($));
	if (s.line !== shown) {
		shown = s.line;
		$.ui.status(s.line);
	}
	if (s.kind === "ready") {
		poll?.cancel();
		poll = undefined;
	} else {
		poll ??= $.clock.every(POLL_MS, () => {
			refresh($).catch(() => {});
		});
	}
	return s;
}

export const register: Register = (on) => {
	on("session.start", async ($, e, next) => {
		const started = await next(e);
		startedAt ??= await $.clock.now();
		await refresh($).catch(() => {});
		return started;
	});

	// Claude Code's own SessionStart hooks, hooks.json's among them, run
	// beneath this one: the fetch has run once next(e) resolves. It blocks
	// nothing, so a failure here passes on what the hooks beneath answered.
	on("classic.SessionStart", async ($, e, next) => {
		hooksDone = false;
		startedAt = await $.clock.now();
		await refresh($).catch(() => {});
		const result = await next(e);
		hooksDone = true;
		const s = await refresh($).catch(() => undefined);
		if (!s) return result;
		return { ...result, additionalContext: [...(result.additionalContext ?? []), contextLine(s)] };
	}).catch(($, e, next) => next(e));
};
