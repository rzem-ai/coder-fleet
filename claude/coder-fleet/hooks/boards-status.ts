// The two lines coder-fleet draws under the prompt in a terminal session,
// below Claude Code's own hint line, through a ui.render hook on PromptHint;
// and the boards binary's state handed to the session at SessionStart.
//
// Line 1 is the session: the context gauge, the model, its effort, the
// project and the branch. Line 2 is the fleet: the boards binary while it downloads (this
// session's fetch or another's, read from the progress file boards-binary.sh
// writes), ready for a few seconds after, or why it is unavailable; then the
// cards fleet agents are working on, or the board at rest, and a
// "[ board ↗ ]" button that starts or reuses the web UI and opens it.
// status-lines.ts builds the lines and boards-state.ts reads the binary's
// state, both pure and tested in the suite; this module only gathers facts
// through `$`, keeps them in `$.state` so a change redraws, and draws.
//
// CODER_FLEET_STATUS_LINES=off draws nothing, and nothing is drawn outside
// the terminal; the session is told the binary's state at SessionStart either
// way. The download stays in boards-binary.sh: this reads what it leaves,
// the binary, its lock, its progress and the code it writes on giving up.
// When no SessionStart hook ran it for this load (a /reload-plugins or a
// plugin updated in a running session re-runs session.start alone, and an
// enable does the same), this starts it itself in the background, once per
// version: at once when an earlier load in the session left its mark, and
// otherwise once HOOK_GRACE_MS pass with no SessionStart hook begun.
import type { EngineInterface, Register, RenderElement } from "claude-code";
import { atom, read, update } from "claude-code";
import type { LinesAgent, LinesBoard, LinesIdent, LinesSession } from "../types/index";
import {
	type BoardsFacts,
	type BoardsState,
	type BootLine,
	binaryPath,
	boardsState,
	bootLine,
	contextLine,
	dataDirFor,
	fetchCommand,
	HOOK_GRACE_MS,
	isStarting,
	lockPath,
	type OwnFetch,
	progressPath,
	progressPercent,
	shouldFetch,
	unavailablePath,
} from "./boards-state";
import { BUTTON_LABEL, buildLines, C, type Ctx, describeCall, type Seg } from "./status-lines";

// The redraw clock: twice a second, for the download's bar and the spinners.
const TICK_MS = 500;
// How often, in ticks, the context, the agents and the board are read again.
const USAGE_TICKS = 10;
const BOARD_TICKS = 30;
// What the lines draw from, kept in `$.state` so a change redraws them; the
// plugin's types contract, types/index.d.ts, declares each.
type Ident = LinesIdent;
type Tracked = LinesAgent;
type Board = LinesBoard;

const identA = atom({ plugin: "coder-fleet", key: "lines-ident" } as const, { model: "", project: "", branch: "" } as Ident);
const ctxA = atom({ plugin: "coder-fleet", key: "lines-ctx" } as const, null as Ctx | null);
const bootA = atom({ plugin: "coder-fleet", key: "lines-boot" } as const, { kind: "fleet" } as BootLine);
const agentsA = atom({ plugin: "coder-fleet", key: "lines-agents" } as const, [] as Tracked[]);
const boardA = atom({ plugin: "coder-fleet", key: "lines-board" } as const, null as Board | null);
const clockA = atom({ plugin: "coder-fleet", key: "lines-clock" } as const, { now: 0, tick: 0 });
// Kept across a reload of this module, unlike the variables below.
const sessionA = atom({ plugin: "coder-fleet", key: "lines-session" } as const, { loaded: false, fetch: null } as LinesSession);

type Where = {
	version: string | undefined;
	dataDir: string | undefined;
	// The binaries boards.sh would run, in its order.
	binaries: string[];
	os: string | undefined;
};

let where: Promise<Where> | undefined;
let off: Promise<boolean> | undefined;
// CODER_FLEET_NERD_FONT=0: the plain ◆ ◇ ⎇ in place of the Nerd Font icons.
let plain: Promise<boolean> | undefined;
// When this load's session.start came, and whether an earlier load in the
// session already started; when a SessionStart hook began in this load, and
// whether it finished. boards-state.ts's isStarting reads them.
let loadedAt: number | undefined;
let laterLoad = false;
let hookStartedAt: number | undefined;
let hookDone = false;
let sawMissing = false;
let readyAt: number | undefined;
let ticker: unknown;
let ticks = 0;
let spawned = 0;
// The version this load's own fetch runs for, and how it ended when it
// ended with no exit of its own (it could not start, or was killed).
let fetching: string | undefined;
let ended: { version: string; exitCode: number } | undefined;

const quiet = (p: Promise<unknown>) => void p.catch(() => undefined);

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
	const uname = await $.process.run(["uname", "-s", "-m"]).catch(() => undefined);
	const [os, arch] = (uname?.stdout ?? "").trim().split(/\s+/);
	const binaries: string[] = [];
	// A checkout of the coder-fleet repo: boards.sh runs the build in
	// claude/boards/bin first.
	const pkg = `${root.slice(0, root.lastIndexOf("/"))}/boards`;
	if (await $.fs.exists(`${pkg}/scripts/build.ts`).catch(() => false)) {
		const o = os === "Darwin" ? "darwin" : os === "Linux" ? "linux" : undefined;
		const a = arch === "arm64" || arch === "aarch64" ? "arm64" : arch === "x86_64" || arch === "amd64" ? "x64" : undefined;
		if (o && a) binaries.push(`${pkg}/bin/boards-${o}-${a}`);
	}
	if (dataDir && version) binaries.push(binaryPath(dataDir, version));
	return { version, dataDir, binaries, os };
}

async function binary($: EngineInterface): Promise<string | undefined> {
	where ??= locate($);
	for (const bin of (await where).binaries) {
		if (await $.fs.exists(bin).catch(() => false)) return bin;
	}
	return undefined;
}

async function facts($: EngineInterface): Promise<BoardsFacts & { percent: number | null }> {
	where ??= locate($);
	const w = await where;
	const now = await $.clock.now();
	const f: BoardsFacts & { percent: number | null } = {
		version: w.version,
		dataDir: w.dataDir,
		hasBinary: false,
		isOff: false,
		lockAgeMs: undefined,
		unavailable: undefined,
		isStarting: isStarting({ now, loadedAt, laterLoad, hookStartedAt, hookDone }),
		percent: null,
	};
	// Ready costs one file check in an install.
	if (await binary($)) return { ...f, hasBinary: true };
	f.isOff = (await $.env.get("CODER_FLEET_BOARDS_DOWNLOAD")) === "off";
	if (f.isOff || !w.dataDir || !w.version) return f;
	const lock = await $.fs.stat(lockPath(w.dataDir)).catch(() => undefined);
	if (lock) {
		f.lockAgeMs = Math.max(0, now - lock.mtimeMs);
		f.percent = progressPercent(await $.fs.read(progressPath(w.dataDir)).catch(() => undefined));
	}
	f.unavailable = await $.fs.read(unavailablePath(w.dataDir, w.version)).catch(() => undefined);
	f.ownFetch = await ownFetch($, w.version);
	return f;
}

// The fetch this module started for the version: its exit once it ended,
// running while this load's child is; one an earlier load started that has
// no exit (its unloading killed it) counts as none, so this load fetches.
async function ownFetch($: EngineInterface, version: string): Promise<OwnFetch | undefined> {
	const s = (await read($, sessionA)).fetch;
	if (!s || s.version !== version) return undefined;
	if (s.exitCode !== null) return { exitCode: s.exitCode };
	if (fetching !== version) return undefined;
	return ended?.version === version ? { exitCode: ended.exitCode } : "running";
}

// Runs boards-binary.sh in the background as the SessionStart hook would,
// and keeps how it exited. What it logs goes to the hooks log, so its
// output is only drained.
function startFetch($: EngineInterface, version: string, dataDir: string): void {
	if (fetching === version) return;
	fetching = version;
	const { argv, env } = fetchCommand($.plugin.root, dataDir);
	quiet(
		(async () => {
			await update($, sessionA, (s) => ({ ...s, fetch: { version, exitCode: null } }));
			let code: number | null = null;
			try {
				const child = $.process.spawn({ argv, env });
				for await (const _ of child) {
					// drained
				}
				code = (await child.result).code;
			} catch {
				code = null;
			}
			// Only an exit of the fetch's own is kept for the session. A child
			// that could not start or was killed (as a reload kills it) has none:
			// this load reads it as failed, and the next load fetches again.
			if (code === null) ended = { version, exitCode: 1 };
			else await update($, sessionA, (s) => ({ ...s, fetch: { version, exitCode: code } }));
		})(),
	);
}

// Reads the binary's state again and what line 2 shows of it. Once the
// binary is ready this costs one file check.
async function refreshBinary($: EngineInterface): Promise<BoardsState> {
	let f = await facts($);
	if (shouldFetch(f) && f.version && f.dataDir) {
		startFetch($, f.version, f.dataDir);
		f = { ...f, ownFetch: "running" };
	}
	const s = boardsState(f);
	const now = await $.clock.now();
	if (s.kind !== "ready") sawMissing = true;
	else if (sawMissing && readyAt === undefined) {
		readyAt = now;
		quiet(refreshBoard($));
	}
	const boot = bootLine(s, { version: f.version, percent: f.percent, readyAt, now });
	await update($, bootA, (was) => (JSON.stringify(was) === JSON.stringify(boot) ? was : boot));
	return s;
}

async function refreshUsage($: EngineInterface): Promise<void> {
	const u = await $.session.usage();
	const ctx: Ctx = { window: u.context.window, ...(u.context.percent !== undefined ? { percent: u.context.percent } : {}), ...(u.context.tokens !== undefined ? { tokens: u.context.tokens } : {}) };
	await update($, ctxA, () => ctx);
}

// The project is the main checkout's folder, so an agent's worktree still
// reads as the project it belongs to.
async function refreshIdent($: EngineInterface): Promise<void> {
	const [model, cwd] = await Promise.all([$.session.model(), $.session.cwd()]);
	let project = cwd.split("/").filter(Boolean).pop() ?? cwd;
	let branch = "";
	const r = await $.process.run(["git", "rev-parse", "--abbrev-ref", "HEAD", "--show-toplevel", "--git-common-dir"], { cwd, timeoutMs: 3000 }).catch(() => undefined);
	if (r && r.exitCode === 0) {
		const [head = "", top = "", common = ""] = r.stdout.split("\n").map((l) => l.trim());
		branch = head;
		const abs = common.startsWith("/") ? common : `${top}/${common}`;
		project = (abs.endsWith("/.git") ? abs.slice(0, -5) : top).split("/").filter(Boolean).pop() ?? project;
	}
	await update($, identA, (prev) => ({ ...prev, model, project, branch }));
}

// What the board says, from `boards fleet status-lines`, once the binary is
// there.
async function refreshBoard($: EngineInterface): Promise<void> {
	const bin = await binary($);
	if (!bin) return;
	const cwd = await $.session.cwd();
	const r = await $.process.run([bin, "fleet", "status-lines", cwd], { cwd, env: { CODER_FLEET_PLUGIN_ROOT: $.plugin.root }, timeoutMs: 10_000 });
	if (r.exitCode !== 0) return;
	const b = JSON.parse(r.stdout) as Board;
	await update($, boardA, () => ({
		board: b.board === true,
		next: typeof b.next === "string" ? b.next : null,
		blockedByHuman: typeof b.blockedByHuman === "number" ? b.blockedByHuman : 0,
		web: typeof b.web === "string" && /^http:\/\/127\.0\.0\.1:\d+\/$/.test(b.web) ? b.web : null,
		focus: typeof b.focus === "string" ? b.focus : null,
	}));
}

const FINISHED = ["completed", "failed", "killed"];

// Drops the agents that have finished or gone.
async function reconcileAgents($: EngineInterface): Promise<void> {
	const list = await $.agent.list();
	const live = new Map(list.filter((a) => !FINISHED.includes(a.status)).map((a) => [a.id, a]));
	await update($, agentsA, (agents) => {
		const kept = agents.filter((a) => live.has(a.id));
		return kept.length === agents.length ? agents : kept;
	});
}

// The card a `Board-Item: XY-12` line names, as the board's own hook reads it.
function boardItemLine(text: string): string | null {
	const m = /^[ \t]*(?:-[ \t]+)?board-item:[ \t]*([A-Za-z][A-Za-z0-9]*-[0-9]+(?:\.[0-9]+)*)[ \t]*$/im.exec(text.replace(/\r/g, ""));
	return m?.[1] ? m[1].toUpperCase() : null;
}

async function tick($: EngineInterface): Promise<void> {
	ticks += 1;
	const boot = await read($, bootA);
	const settled = boot.kind === "fleet" || boot.kind === "unavailable";
	// The binary is read until it is ready and its ready line has had its time.
	if (!settled || (boot.kind === "unavailable" && ticks % 4 === 0)) await refreshBinary($);
	if (ticks % USAGE_TICKS === 0) {
		quiet(refreshUsage($));
		quiet(reconcileAgents($));
	}
	if (ticks % BOARD_TICKS === 0) {
		quiet(refreshIdent($));
		quiet(refreshBoard($));
	}
	// Redraw for what moves: the bar, a spinner or a run time.
	const agents = await read($, agentsA);
	if (!settled || agents.length > 0 || ticks % BOARD_TICKS === 0) {
		const now = await $.clock.now();
		await update($, clockA, (c) => ({ now, tick: c.tick + 1 }));
	}
}

async function openBoard($: EngineInterface): Promise<void> {
	const boards = await $.mcp.connect("boards");
	if (!boards.isConnected) {
		$.ui.toast(`coder-fleet: the board's tools are not connected (${boards.message}); see /coder-fleet:help-boards`);
		return;
	}
	const r = await $.mcp.call(boards.server, "board_web", {});
	const text = r.content.map((c) => (c as { text?: string }).text ?? "").join("\n");
	const url = /http:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):\d+\//.exec(text)?.[0];
	if (r.isError || !url) {
		$.ui.toast(`coder-fleet: ${text.split("\n")[0] || "the board's web UI did not start"}`);
		return;
	}
	quiet(refreshBoard($));
	where ??= locate($);
	const os = (await where).os;
	const opener = os === "Darwin" ? "open" : os === "Linux" ? "xdg-open" : undefined;
	const opened = opener ? await $.process.run([opener, url], { timeoutMs: 10_000 }).catch(() => undefined) : undefined;
	if (!opened || opened.exitCode !== 0) $.ui.toast(`coder-fleet: the browser could not be opened; the board is at ${url}`);
}

function start($: EngineInterface): void {
	if (ticker) return;
	quiet(refreshUsage($));
	quiet(refreshIdent($));
	quiet(refreshBoard($));
	quiet(reconcileAgents($));
	ticker = $.clock.every(TICK_MS, () => quiet(tick($)));
}

export const register: Register = (on) => {
	on("session.start", async ($, e, next) => {
		const started = await next(e);
		loadedAt ??= await $.clock.now();
		// A later load in the session (a reload, an update, an enable) has no
		// SessionStart hooks of its own to fetch. One after a load of this
		// version or later says so; with no mark (the first load since an
		// older version, or of the plugin at all), a SessionStart hook not
		// begun within the grace says so, and the binary is read again then.
		const session = await read($, sessionA);
		if (session.loaded) laterLoad = true;
		else await update($, sessionA, (s) => ({ ...s, loaded: true }));
		$.clock.after(HOOK_GRACE_MS + 100, () => quiet(refreshBinary($)));
		await refreshBinary($).catch(() => {});
		off ??= $.env.get("CODER_FLEET_STATUS_LINES").then((v) => v === "off");
		if (!(await off)) start($);
		return started;
	});

	// Claude Code's own SessionStart hooks, hooks.json's among them, run
	// beneath this one: the fetch has run once next(e) resolves. It blocks
	// nothing, so a failure here passes on what the hooks beneath answered.
	on("classic.SessionStart", async ($, e, next) => {
		hookDone = false;
		hookStartedAt = await $.clock.now();
		await refreshBinary($).catch(() => {});
		const result = await next(e);
		hookDone = true;
		const s = await refreshBinary($).catch(() => undefined);
		if (!s) return result;
		return { ...result, additionalContext: [...(result.additionalContext ?? []), contextLine(s)] };
	}).catch(($, e, next) => next(e));

	on("session.measure", async ($, e, next) => {
		const r = await next(e);
		quiet(refreshUsage($));
		return r;
	});

	// The engine has no getter for the session's effort, so the main loop's
	// requests say it as they go out; a subagent's do not.
	on("turn.step", async function* ($, e, next) {
		if (e.agentId === undefined) {
			const effort = typeof e.effort === "string" ? e.effort : "";
			quiet(update($, identA, (prev) => ((prev.effort ?? "") === effort ? prev : { ...prev, effort })));
		}
		return yield* next(e);
	});

	on("turn.complete", async ($, e, next) => {
		const r = await next(e);
		if (e.agentId !== undefined) {
			const id = e.agentId;
			quiet(reconcileAgents($));
			quiet(update($, agentsA, (agents) => (agents.some((a) => a.id === id && !a.isTeammate) ? agents.filter((a) => a.id !== id) : agents)));
			return r;
		}
		quiet(refreshUsage($));
		quiet(refreshIdent($));
		quiet(refreshBoard($));
		return r;
	});

	// A fleet agent's card is the one its spawn is bound to: its Board-Item:
	// line, else the checkout's focus as the spawn is sent.
	on("agent.spawn", async ($, e, next) => {
		const r = await next(e);
		if (!("agentId" in r) || !r.agentId) return r;
		if (e.provider?.plugin !== $.plugin.name && !/^coder-fleet:/.test(e.subagentType)) return r;
		const id = r.agentId;
		const named = boardItemLine(e.prompt);
		const agent: Tracked = {
			id,
			type: e.subagentType,
			card: named ?? (await read($, boardA))?.focus ?? null,
			startedAt: await $.clock.now(),
			activity: "",
			phase: (spawned++ * 3) % 10,
			isTeammate: r.teammateId !== undefined,
		};
		await update($, agentsA, (agents) => [...agents.filter((a) => a.id !== id), agent]);
		// The focus read again now, in case it changed since the last read.
		if (!named) {
			quiet(
				refreshBoard($).then(async () => {
					const focus = (await read($, boardA))?.focus ?? null;
					await update($, agentsA, (agents) => agents.map((a) => (a.id === id ? { ...a, card: focus } : a)));
				}),
			);
		}
		return r;
	}).catch(($, e, next) => next(e));

	// What each fleet agent is doing now, for line 2 when it is the only one.
	on("tool.call", async ($, e, next) => {
		const id = e.agentId;
		if (id !== undefined) {
			quiet(
				(async () => {
					if (!(await read($, agentsA)).some((a) => a.id === id)) return;
					const activity = describeCall(String(e.tool), e as unknown as Record<string, unknown>, await $.session.cwd());
					await update($, agentsA, (agents) => agents.map((a) => (a.id === id ? { ...a, activity } : a)));
				})(),
			);
		}
		return next(e);
	}).catch(($, e, next) => next(e));

	on("ui.render", { component: "PromptHint" }, async ($, e, next) => {
		off ??= $.env.get("CODER_FLEET_STATUS_LINES").then((v) => v === "off");
		plain ??= $.env.get("CODER_FLEET_NERD_FONT").then((v) => v === "0");
		if (e.surface !== "terminal" || (await off)) return next(e);
		start($);
		const hint = await next(e);
		const [ident, ctx, boot, agents, board, clock] = await Promise.all([
			read($, identA),
			read($, ctxA),
			read($, bootA),
			read($, agentsA),
			read($, boardA),
			read($, clockA),
		]);
		const lines = buildLines({
			ctx,
			...ident,
			boot,
			agents,
			board,
			now: clock.now || (await $.clock.now()),
			tick: clock.tick,
			columns: e.viewport?.columns,
			nerdFont: !(await plain),
		});
		const { Box, Text, Link, Button } = $.ui.resolve(e);
		const draw = (segs: Seg[]) =>
			segs.map((s) => (s.href ? h(Text, { color: s.color }, h(Link, { href: s.href }, s.text)) : h(Text, { color: s.color }, s.text)));
		const row2 = [h(Text, { wrap: "truncate" }, ...draw(lines.line2))];
		if (lines.button) {
			// The spaces that put the button at the row's right end.
			if (lines.pad > 0) row2[0] = h(Text, { wrap: "truncate" }, ...draw(lines.line2), h(Text, {}, " ".repeat(lines.pad)));
			row2.push(h(Button, { key: "board", label: BUTTON_LABEL, onPress: () => quiet(openBoard($)) }, h(Text, { color: C.blue }, BUTTON_LABEL)));
		}
		// Claude Code's own hint line first, as it draws it, then the two lines.
		return h(
			Box,
			{ flexDirection: "column" },
			hint,
			h(Text, { wrap: "truncate" }, ...draw(lines.line1)),
			h(Box, { flexDirection: "row", justifyContent: "space-between" }, ...row2),
		) as RenderElement;
	}).catch(($, e, next) => next(e));
};

