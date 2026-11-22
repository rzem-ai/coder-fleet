// Deferred Claude UI contract, preserved as migration input. Not a native test.
import { afterAll, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	type BoardsFacts,
	binaryPath,
	boardsState,
	bootLine,
	contextLine,
	dataDirFor,
	fetchCommand,
	lockPath,
	progressPath,
	progressPercent,
	READY_HOLD_MS,
	shouldFetch,
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
function publish(release: string, sums?: string, board = BOARD): Uint8Array {
	const dir = join(release, `v${VERSION}`);
	mkdirSync(dir, { recursive: true });
	const gz = Bun.gzipSync(new TextEncoder().encode(board));
	writeFileSync(join(dir, `boards-${PLATFORM}.gz`), gz);
	const sum = new Bun.CryptoHasher("sha256").update(gz).digest("hex");
	writeFileSync(join(dir, "boards-SHA256SUMS"), `${sums ?? sum}  boards-${PLATFORM}.gz\n`);
	return gz;
}

// A PATH holding only the tools the hooks use, less the ones named.
function toolPath(name: string, without: string[]): string {
	const dir = join(w.root, `path-${name}`);
	mkdirSync(dir, { recursive: true });
	const tools = ["bash", "sh", "env", "sed", "head", "dirname", "date", "mkdir", "rm", "rmdir", "find", "mktemp", "awk", "cut", "chmod", "mv", "cat", "uname", "curl", "gzip", "shasum", "sha256sum", "perl", "sleep", "wc", "tr"];
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
		// A lock as old as the fetcher's own cut-off is a fetch that died:
		// the module starts another, and nothing has failed yet.
		const stale = onDisk(at.data, { lockAgeMs: 10 * 60 * 1000 });
		expect(shouldFetch(stale)).toBe(true);
		expect(line(stale)).toBe(`coder-fleet v${VERSION}: boards binary downloading now`);
		// Before the fetch has taken the lock, this session is about to download.
		expect(line(onDisk(join(at.data, "none"), { isStarting: true }))).toBe(`coder-fleet v${VERSION}: boards binary downloading now`);
	});

	it("names each reason the fetch gave up for", () => {
		// Each code, what the session is told and what line 2 says.
		const cases: Array<[string, () => Record<string, string>, (at: ReturnType<typeof install>) => void, string, string]> = [
			["no-release", () => ({ CODER_FLEET_BOARDS_PLATFORM: "plan9-x64" }), () => {}, "no release for plan9-x64", "no release for plan9-x64"],
			["no-curl", () => ({ PATH: toolPath("no-curl", ["curl"]) }), (at) => void publish(at.release), "no curl", "no curl"],
			["no-gzip", () => ({ PATH: toolPath("no-gzip", ["gzip"]) }), (at) => void publish(at.release), "no gzip", "no gzip"],
			["fetch-failed", () => ({}), () => {}, "the fetch failed", "fetch failed"],
			["bad-checksum", () => ({}), (at) => void publish(at.release, "0".repeat(64)), "a bad checksum", "bad checksum"],
			["no-checksum-tool", () => ({ PATH: toolPath("no-sum", ["shasum", "sha256sum"]) }), (at) => void publish(at.release), "no sha256sum or shasum", "no sha256sum or shasum"],
		];
		for (const [name, env, setup, why, short] of cases) {
			const at = install(name);
			setup(at);
			const ran = hook(at, "boards-binary.sh", env());
			expect({ name, code: ran.code, out: ran.out }).toEqual({ name, code: 0, out: "" });
			expect(existsSync(lockPath(at.data))).toBe(false);
			const state = boardsState(onDisk(at.data));
			expect({ name, line: state.line }).toEqual({ name, line: `coder-fleet v${VERSION}: boards binary not available: ${why}` });
			expect({ name, why: state.why }).toEqual({ name, why: short });
			expect(contextLine(state)).toBe(`${state.line}; the board's tools fail until it is ready`);
		}
	});

	it("starts the fetch itself after a reload, when no SessionStart hook ran one, and calls nothing a failure the fetch did not say", () => {
		// A /reload-plugins: no binary, no lock, no code, the start budget over.
		const at = install("reload");
		publish(at.release);
		const reload = onDisk(at.data);
		expect(shouldFetch(reload)).toBe(true);
		expect(boardsState(reload).kind).not.toBe("unavailable");
		expect(boardsState({ ...reload, ownFetch: "running" }).line).toBe(`coder-fleet v${VERSION}: boards binary downloading now`);
		// The module's command is the SessionStart hook's fetch, and installs.
		const { argv, env } = fetchCommand(`${at.plugin}/`, at.data);
		const ran = Bun.spawnSync([...argv], {
			cwd: w.root,
			env: { ...w.env, CODER_FLEET_BOARDS_PLATFORM: PLATFORM, CODER_FLEET_BOARDS_RELEASE_URL: `file://${at.release}`, CODER_FLEET_STATE_DIR: join(w.root, "state"), ...env } as Record<string, string>,
		});
		expect(ran.exitCode).toBe(0);
		expect(boardsState({ ...onDisk(at.data), ownFetch: { exitCode: 0 } }).kind).toBe("ready");
		// Once per version, never while a SessionStart hook may still fetch,
		// nor beside a live fetch, nor over a code the fetch left.
		expect(shouldFetch({ ...reload, ownFetch: { exitCode: 1 } })).toBe(false);
		expect(shouldFetch({ ...reload, ownFetch: "running" })).toBe(false);
		expect(shouldFetch({ ...reload, isStarting: true })).toBe(false);
		expect(shouldFetch({ ...reload, lockAgeMs: 0 })).toBe(false);
		expect(shouldFetch({ ...reload, unavailable: "fetch-failed\n" })).toBe(false);
		expect(shouldFetch({ ...reload, isOff: true })).toBe(false);
		expect(shouldFetch({ ...reload, dataDir: undefined })).toBe(false);
		// While its own fetch holds the lock, it is this session's download.
		expect(boardsState({ ...reload, lockAgeMs: 0, ownFetch: "running" }).kind).toBe("downloading");
		// A failure is the code the fetch left, or its own fetch's exit.
		expect(boardsState({ ...reload, unavailable: "fetch-failed\n" })).toMatchObject({ kind: "unavailable", why: "fetch failed" });
		expect(boardsState({ ...reload, ownFetch: { exitCode: 1 } })).toMatchObject({ kind: "unavailable", why: "fetch failed" });
	});

	it("says downloading is off, and that there is no data directory, before anything the fetch left", () => {
		const at = install("off");
		expect(hook(at, "boards-binary.sh", { CODER_FLEET_BOARDS_DOWNLOAD: "off" }).code).toBe(0);
		expect(existsSync(join(at.data, "bin"))).toBe(false);
		expect(line(onDisk(at.data, { isOff: true }))).toBe(`coder-fleet v${VERSION}: boards binary not available: downloading turned off (CODER_FLEET_BOARDS_DOWNLOAD=off)`);
		expect(line({ ...onDisk(at.data), dataDir: undefined })).toBe(`coder-fleet v${VERSION}: boards binary not available: no data directory`);
	});

	it("writes how far the download has got where every session reads it, and takes it away with the lock", async () => {
		const at = install("progress");
		// Random text, so the gzipped release is large enough to stop part way.
		const gz = publish(at.release, undefined, `${BOARD}# ${Buffer.from(crypto.getRandomValues(new Uint8Array(1500))).toString("hex")}\n`);
		const go = join(w.root, "progress-go");
		// A curl that sends the headers and the first 310 bytes of the release,
		// then waits to be told to send the rest. Any other fetch is a copy.
		const fake = join(w.root, "path-progress");
		mkdirSync(fake, { recursive: true });
		writeFileSync(
			join(fake, "curl"),
			[
				"#!/bin/bash",
				'd= o= url=',
				'while [ $# -gt 0 ]; do case "$1" in -D) d=$2; shift 2 ;; -o) o=$2; shift 2 ;; --max-time) shift 2 ;; -*) shift ;; *) url=$1; shift ;; esac; done',
				'src="${url#file://}"',
				'if [ -n "$d" ]; then',
				'  printf "HTTP/1.1 200 OK\r\nContent-Length: %s\r\n\r\n" "$(wc -c < "$src" | tr -d " ")" > "$d"',
				'  head -c 310 "$src" > "$o"',
				`  while [ ! -e '${go}' ]; do sleep 0.05; done`,
				"fi",
				'cat "$src" > "$o"',
				"",
			].join("\n"),
			{ mode: 0o755 },
		);
		const p = Bun.spawn(["/bin/bash", join(at.plugin, "hooks", "boards-binary.sh")], {
			cwd: w.root,
			env: {
				...w.env,
				PATH: `${fake}:${process.env.PATH}`,
				CLAUDE_PLUGIN_DATA: at.data,
				CODER_FLEET_BOARDS_PLATFORM: PLATFORM,
				CODER_FLEET_BOARDS_RELEASE_URL: `file://${at.release}`,
				CODER_FLEET_STATE_DIR: join(w.root, "state"),
			} as Record<string, string>,
			stdout: "pipe",
			stderr: "pipe",
		});
		const read = () => (existsSync(progressPath(at.data)) ? readFileSync(progressPath(at.data), "utf8") : undefined);
		const until = Date.now() + 10_000;
		while (read() !== `310 ${gz.length}\n` && Date.now() < until) await Bun.sleep(20);
		expect(read()).toBe(`310 ${gz.length}\n`);
		expect(progressPercent(read())).toBe(Math.floor((310 * 100) / gz.length));
		writeFileSync(go, "");
		expect(await p.exited).toBe(0);
		expect(existsSync(binaryPath(at.data, VERSION))).toBe(true);
		expect(existsSync(progressPath(at.data))).toBe(false);
		expect(existsSync(lockPath(at.data))).toBe(false);
		// A size not known yet, or no file, is no percentage.
		expect(progressPercent("120 0\n")).toBeNull();
		expect(progressPercent(undefined)).toBeNull();
	});

	it("shows line 2 the download, then ready for eight seconds, and a start that found the binary the fleet at once", () => {
		const s = (f: Partial<BoardsFacts>) => boardsState({ ...onDisk(join(w.root, "boot")), ...f });
		const at = { version: VERSION, percent: 31, readyAt: undefined, now: 1000 };
		expect(bootLine(s({ lockAgeMs: 0, isStarting: true }), at)).toEqual({ kind: "downloading", version: VERSION, percent: 31 });
		expect(bootLine(s({ lockAgeMs: 0 }), at)).toEqual({ kind: "elsewhere", version: VERSION, percent: 31 });
		expect(bootLine(s({ hasBinary: true }), { ...at, readyAt: 1000, now: 1000 + READY_HOLD_MS - 1 })).toEqual({ kind: "ready", version: VERSION });
		expect(bootLine(s({ hasBinary: true }), { ...at, readyAt: 1000, now: 1000 + READY_HOLD_MS })).toEqual({ kind: "fleet" });
		expect(bootLine(s({ hasBinary: true }), at)).toEqual({ kind: "fleet" });
		expect(bootLine(s({ unavailable: "bad-checksum\n" }), at)).toEqual({ kind: "unavailable", version: VERSION, why: "bad checksum" });
		expect(READY_HOLD_MS).toBe(8000);
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
