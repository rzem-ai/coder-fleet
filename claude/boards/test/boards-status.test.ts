import { afterAll, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	type BoardsFacts,
	binaryPath,
	boardsState,
	contextLine,
	dataDirFor,
	lockPath,
	unavailablePath,
} from "../../coder-fleet/hooks/boards-state.ts";
import { World } from "./fixtures.ts";

// CF-19: the status line the plugin's hooks module keeps for the boards
// binary, read from what boards-binary.sh leaves in the data directory, and
// the SessionStart command that runs the fetch before the board's own hook.
const w = new World("boards-status");
afterAll(() => w.dispose());

const PLUGIN = join(import.meta.dir, "..", "..", "coder-fleet");
const VERSION = "9.9.4";
const PLATFORM = "linux-x64";

// An install: the plugin's hooks, its launcher and a manifest, and no boards
// package beside it, so boards.sh runs only the release build.
function install(name: string): { plugin: string; data: string; release: string } {
	const plugin = join(w.root, name, "coder-fleet");
	for (const d of ["hooks", "scripts", ".claude-plugin"]) mkdirSync(join(plugin, d), { recursive: true });
	for (const f of ["hooks/boards-binary.sh", "hooks/boards-session-start.sh", "scripts/boards.sh"]) {
		writeFileSync(join(plugin, f), readFileSync(join(PLUGIN, f)), { mode: 0o755 });
	}
	writeFileSync(join(plugin, ".claude-plugin", "plugin.json"), `{\n  "name": "coder-fleet",\n  "version": "${VERSION}"\n}\n`);
	return { plugin, data: join(w.root, name, "data"), release: join(w.root, name, "release") };
}

// A release of a stand-in board, a script that says it ran and echoes its
// stdin, as boards-binary.sh fetches it; `sums` overrides its checksum line.
const BOARD = '#!/bin/sh\nprintf "board ran: %s\\n" "$*"\ncat\n';
function publish(release: string, sums?: string): void {
	const dir = join(release, `v${VERSION}`);
	mkdirSync(dir, { recursive: true });
	const gz = Bun.gzipSync(new TextEncoder().encode(BOARD));
	writeFileSync(join(dir, `boards-${PLATFORM}.gz`), gz);
	const sum = new Bun.CryptoHasher("sha256").update(gz).digest("hex");
	writeFileSync(join(dir, "boards-SHA256SUMS"), `${sums ?? sum}  boards-${PLATFORM}.gz\n`);
}

// A PATH holding only the tools the hooks use, less the ones named.
function toolPath(name: string, without: string[]): string {
	const dir = join(w.root, `path-${name}`);
	mkdirSync(dir, { recursive: true });
	const tools = ["bash", "sh", "env", "sed", "head", "dirname", "date", "mkdir", "rm", "rmdir", "find", "mktemp", "awk", "cut", "chmod", "mv", "cat", "uname", "curl", "gzip", "shasum", "sha256sum", "perl"];
	for (const t of tools) {
		if (without.includes(t)) continue;
		const found = Bun.which(t);
		if (found) symlinkSync(found, join(dir, t));
	}
	return dir;
}

function hook(at: ReturnType<typeof install>, script: string, extra: Record<string, string> = {}, stdin = "") {
	const p = Bun.spawnSync(["/bin/bash", join(at.plugin, "hooks", script)], {
		cwd: w.root,
		env: {
			...w.env,
			CLAUDE_PLUGIN_DATA: at.data,
			CODER_FLEET_BOARDS_PLATFORM: PLATFORM,
			CODER_FLEET_BOARDS_RELEASE_URL: `file://${at.release}`,
			CODER_FLEET_STATE_DIR: join(w.root, "state"),
			...extra,
		} as Record<string, string>,
		stdin: new TextEncoder().encode(stdin),
		stdout: "pipe",
		stderr: "pipe",
	});
	return { code: p.exitCode, out: p.stdout.toString() };
}

// The facts as the hooks module reads them from the data directory once the
// session's SessionStart hooks have finished.
function onDisk(data: string, extra: Partial<BoardsFacts> = {}): BoardsFacts {
	const lock = lockPath(data);
	const code = unavailablePath(data, VERSION);
	return {
		version: VERSION,
		dataDir: data,
		hasBinary: existsSync(binaryPath(data, VERSION)),
		isOff: false,
		lockAgeMs: existsSync(lock) ? Date.now() - statSync(lock).mtimeMs : undefined,
		unavailable: existsSync(code) ? readFileSync(code, "utf8") : undefined,
		isStarting: false,
		...extra,
	};
}

const line = (f: BoardsFacts) => boardsState(f).line;

describe("the boards binary's status line", () => {
	it("reads ready once the fetch installed the binary, and the fetch leaves no code behind", () => {
		const at = install("ready");
		publish(at.release);
		mkdirSync(join(at.data, "bin"), { recursive: true });
		writeFileSync(unavailablePath(at.data, VERSION), "fetch-failed\n");
		expect(hook(at, "boards-binary.sh").code).toBe(0);
		expect(existsSync(unavailablePath(at.data, VERSION))).toBe(false);
		expect(line(onDisk(at.data))).toBe(`coder-fleet v${VERSION}: boards binary ready`);
		expect(contextLine(boardsState(onDisk(at.data)))).toBe(`coder-fleet v${VERSION}: boards binary ready`);
	});

	it("reads downloading now while this session's fetch holds the lock, and another session's otherwise", () => {
		const at = install("lock");
		mkdirSync(lockPath(at.data), { recursive: true });
		expect(line(onDisk(at.data, { isStarting: true }))).toBe(`coder-fleet v${VERSION}: boards binary downloading now`);
		expect(line(onDisk(at.data))).toBe(`coder-fleet v${VERSION}: boards binary downloading in another session`);
		// A lock as old as the fetcher's own cut-off is a fetch that died.
		expect(line(onDisk(at.data, { lockAgeMs: 10 * 60 * 1000 }))).toBe(`coder-fleet v${VERSION}: boards binary not available: the fetch failed`);
		// Before the fetch has taken the lock, this session is about to download.
		expect(line(onDisk(join(at.data, "none"), { isStarting: true }))).toBe(`coder-fleet v${VERSION}: boards binary downloading now`);
	});

	it("names each reason the fetch gave up for", () => {
		const cases: Array<[string, () => Record<string, string>, (at: ReturnType<typeof install>) => void, string]> = [
			["no-release", () => ({ CODER_FLEET_BOARDS_PLATFORM: "plan9-x64" }), () => {}, "no release for plan9-x64"],
			["no-curl", () => ({ PATH: toolPath("no-curl", ["curl"]) }), (at) => publish(at.release), "no curl"],
			["no-gzip", () => ({ PATH: toolPath("no-gzip", ["gzip"]) }), (at) => publish(at.release), "no gzip"],
			["fetch-failed", () => ({}), () => {}, "the fetch failed"],
			["bad-checksum", () => ({}), (at) => publish(at.release, "0".repeat(64)), "a bad checksum"],
			["no-checksum-tool", () => ({ PATH: toolPath("no-sum", ["shasum", "sha256sum"]) }), (at) => publish(at.release), "no sha256sum or shasum"],
		];
		for (const [name, env, setup, why] of cases) {
			const at = install(name);
			setup(at);
			const ran = hook(at, "boards-binary.sh", env());
			expect({ name, code: ran.code, out: ran.out }).toEqual({ name, code: 0, out: "" });
			expect(existsSync(lockPath(at.data))).toBe(false);
			const state = boardsState(onDisk(at.data));
			expect({ name, line: state.line }).toEqual({ name, line: `coder-fleet v${VERSION}: boards binary not available: ${why}` });
			expect(contextLine(state)).toBe(`${state.line}; the board's tools fail until it is ready`);
		}
	});

	it("says downloading is off, and that there is no data directory, before anything the fetch left", () => {
		const at = install("off");
		expect(hook(at, "boards-binary.sh", { CODER_FLEET_BOARDS_DOWNLOAD: "off" }).code).toBe(0);
		expect(existsSync(join(at.data, "bin"))).toBe(false);
		expect(line(onDisk(at.data, { isOff: true }))).toBe(`coder-fleet v${VERSION}: boards binary not available: downloading turned off (CODER_FLEET_BOARDS_DOWNLOAD=off)`);
		expect(line({ ...onDisk(at.data), dataDir: undefined })).toBe(`coder-fleet v${VERSION}: boards binary not available: no data directory`);
	});

	it("finds the data directory Claude Code gives an install and a folder plugin", () => {
		expect(dataDirFor("/c/.claude/plugins/cache/rzem/coder-fleet/0.70.2", "coder-fleet", "/c/.claude")).toBe("/c/.claude/plugins/data/coder-fleet-rzem");
		expect(dataDirFor("/src/claude/coder-fleet/", "coder-fleet", "/c/.claude/")).toBe("/c/.claude/plugins/data/coder-fleet-inline");
		expect(dataDirFor("/src/claude/coder-fleet", "coder-fleet", undefined)).toBeUndefined();
	});
});

describe("the SessionStart command", () => {
	it("is one command that fetches and then runs the board's hook, beside the hooks module", () => {
		const hooks = JSON.parse(readFileSync(join(PLUGIN, "hooks", "hooks.json"), "utf8")) as {
			modules: string[];
			hooks: { SessionStart: Array<{ hooks: Array<{ command: string; timeout: number }> }> };
		};
		expect(hooks.modules).toEqual(["./boards-status.ts"]);
		const commands = hooks.hooks.SessionStart.flatMap((g) => g.hooks.map((h) => h.command));
		expect(commands.filter((c) => /boards-binary\.sh|boards\.sh" hook session-start/.test(c))).toEqual([]);
		const start = hooks.hooks.SessionStart.flatMap((g) => g.hooks).filter((h) => h.command.includes("boards-session-start.sh"));
		expect(start).toHaveLength(1);
		expect(start[0]?.timeout).toBeGreaterThanOrEqual(200);
	});

	it("runs the board's hook on the binary the fetch just installed, with the hook's stdin", () => {
		const at = install("order");
		publish(at.release);
		const input = JSON.stringify({ session_id: "s", source: "startup" });
		const ran = hook(at, "boards-session-start.sh", {}, input);
		expect(ran).toEqual({ code: 0, out: `board ran: hook session-start\n${input}` });
	});

	it("reports the board's hook skipped for a missing binary, rather than failing", () => {
		const at = install("skipped");
		publish(at.release);
		// Another session holds the fetch.
		mkdirSync(lockPath(at.data), { recursive: true });
		const ran = hook(at, "boards-session-start.sh", {}, "{}");
		expect(ran.code).toBe(0);
		expect(JSON.parse(ran.out)).toEqual({
			hookSpecificOutput: {
				hookEventName: "SessionStart",
				additionalContext: "coder-fleet: the board's session-start hook was skipped for a missing boards binary, so the board was not read at the start of this session.",
			},
		});
		expect(line(onDisk(at.data))).toBe(`coder-fleet v${VERSION}: boards binary downloading in another session`);
	});
});
