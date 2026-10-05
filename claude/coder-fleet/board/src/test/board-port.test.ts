import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_DIRECTORIES } from "../constants/index.ts";
import { BacklogServer } from "../server/index.ts";
import { BOARD_PORT_ENV, BoardPortError, resolveBoardPort } from "../server/port.ts";
import { holdLoopbackPort, unusedLoopbackPort } from "./test-ports.ts";
import { closeServer, listenOnEphemeralPort } from "./test-utils.ts";

// The board's port comes from one place for every way of starting it: an
// explicit --port, then CODER_FLEET_BOARD_PORT, then default_port in the
// board's config.yml, then a random loopback port. A port from any of the
// first three that is busy moves up one at a time until a port binds, and
// nothing free up to 65535 is an error naming it. These pin that resolution,
// the bind loop behind `board serve`, and the CLI that wraps it.

const STATUSES = 'statuses: ["To Do", "Doing", "Blocked", "Blocked by human", "Done"]';

function makeRoot(defaultPort?: number): string {
	const root = mkdtempSync(join(tmpdir(), "board-port-"));
	mkdirSync(join(root, DEFAULT_DIRECTORIES.BACKLOG, "tasks"), { recursive: true });
	const lines = ['project_name: "t"', 'task_prefix: "BD"', STATUSES];
	if (defaultPort !== undefined) lines.push(`default_port: ${defaultPort}`);
	writeFileSync(join(root, DEFAULT_DIRECTORIES.BACKLOG, "config.yml"), `${lines.join("\n")}\n`);
	return root;
}

describe("resolveBoardPort", () => {
	it("takes the flag over the env and the config", () => {
		expect(resolveBoardPort({ flag: "5001", env: "5002", configPort: 5003 })).toEqual({ port: 5001, source: "flag" });
	});

	it("takes the env over the config", () => {
		expect(resolveBoardPort({ env: "5002", configPort: 5003 })).toEqual({ port: 5002, source: "env" });
	});

	it("takes the config when nothing else is set", () => {
		expect(resolveBoardPort({ configPort: 5003 })).toEqual({ port: 5003, source: "config" });
	});

	it("asks for a random port when nothing is set, and treats an empty env as unset", () => {
		expect(resolveBoardPort({})).toEqual({ port: 0, source: "random" });
		expect(resolveBoardPort({ env: "", configPort: 5003 })).toEqual({ port: 5003, source: "config" });
		expect(resolveBoardPort({ env: "   " })).toEqual({ port: 0, source: "random" });
	});

	it("treats 0 from any source as a request for a random port", () => {
		expect(resolveBoardPort({ flag: 0, configPort: 5003 })).toEqual({ port: 0, source: "random" });
		expect(resolveBoardPort({ env: "0", configPort: 5003 })).toEqual({ port: 0, source: "random" });
	});

	it("refuses a value that is not a port, naming where it came from", () => {
		expect(() => resolveBoardPort({ flag: "abc" })).toThrow(/--port/);
		expect(() => resolveBoardPort({ env: "70000" })).toThrow(new RegExp(BOARD_PORT_ENV));
		expect(() => resolveBoardPort({ env: "64.5" })).toThrow(new RegExp(BOARD_PORT_ENV));
		expect(() => resolveBoardPort({ configPort: Number.NaN })).toThrow(/default_port/);
		expect(() => resolveBoardPort({ configPort: -1 })).toThrow(BoardPortError);
	});
});

describe("BacklogServer.start with a configured port", () => {
	const roots: string[] = [];
	const servers: BacklogServer[] = [];
	const holders: net.Server[] = [];
	const savedEnv = process.env[BOARD_PORT_ENV];

	beforeAll(() => {
		delete process.env[BOARD_PORT_ENV];
	});

	afterEach(async () => {
		for (const s of servers.splice(0)) await s.stop();
		for (const h of holders.splice(0)) await closeServer(h);
		for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
		delete process.env[BOARD_PORT_ENV];
	});

	afterAll(() => {
		if (savedEnv === undefined) delete process.env[BOARD_PORT_ENV];
		else process.env[BOARD_PORT_ENV] = savedEnv;
	});

	function serverFor(root: string): BacklogServer {
		roots.push(root);
		const s = new BacklogServer(root);
		servers.push(s);
		return s;
	}

	it("binds default_port from the config when it is free", async () => {
		const port = await unusedLoopbackPort();
		const s = serverFor(makeRoot(port));
		await s.start(undefined, false, { quiet: true });
		expect(s.port).toBe(port);
		expect(s.portBinding).toEqual({ source: "config", requested: port, busy: false });
	});

	it("binds the env port over default_port", async () => {
		const configPort = await unusedLoopbackPort();
		const envPort = await unusedLoopbackPort();
		process.env[BOARD_PORT_ENV] = String(envPort);
		const s = serverFor(makeRoot(configPort));
		await s.start(undefined, false, { quiet: true });
		expect(s.port).toBe(envPort);
		expect(s.portBinding?.source).toBe("env");
	});

	it("moves up from a busy default_port to the next free one and says so", async () => {
		const { server: holder, port } = await listenOnEphemeralPort();
		holders.push(holder);
		const s = serverFor(makeRoot(port));
		await s.start(undefined, false, { quiet: true });
		expect(s.port).toBeGreaterThan(port);
		expect(s.portBinding).toEqual({ source: "config", requested: port, busy: true });
		expect((await fetch(`${s.url}/api/statuses`)).status).toBe(200);
	});

	it("moves up from a busy env port too", async () => {
		const { server: holder, port } = await listenOnEphemeralPort();
		holders.push(holder);
		process.env[BOARD_PORT_ENV] = String(port);
		const s = serverFor(makeRoot());
		await s.start(undefined, false, { quiet: true });
		expect(s.port).toBeGreaterThan(port);
		expect(s.portBinding).toEqual({ source: "env", requested: port, busy: true });
	});

	it("fails naming the configured port when nothing from it up to 65535 is free, and binds nothing", async () => {
		const holder = await holdLoopbackPort(65535);
		if (holder) holders.push(holder);
		const s = serverFor(makeRoot(65535));
		const failure = await s.start(undefined, false, { quiet: true }).catch((error: unknown) => error);
		expect(failure).toBeInstanceOf(BoardPortError);
		expect((failure as Error).message).toContain("65535");
		expect((failure as Error).message).toContain("default_port");
		expect(s.url).toBeNull();
	});

	// The other exhaustion case starts at 65535, so it never reaches the probe
	// for a next port. This one does: 65534 is busy, the probe finds nothing
	// free above it, and the board fails rather than taking a random port.
	it("fails naming the configured port when the search above it finds nothing free", async () => {
		for (const held of [65534, 65535]) {
			const holder = await holdLoopbackPort(held);
			if (holder) holders.push(holder);
		}
		const s = serverFor(makeRoot(65534));
		const failure = await s.start(undefined, false, { quiet: true }).catch((error: unknown) => error);
		expect(failure).toBeInstanceOf(BoardPortError);
		expect((failure as Error).message).toContain("65534");
		expect((failure as Error).message).toContain("default_port");
		expect(s.url).toBeNull();
	});

	it("moves up from a busy explicit port too, and says the requested port was busy", async () => {
		const { server: holder, port } = await listenOnEphemeralPort();
		holders.push(holder);
		const s = serverFor(makeRoot());
		await s.start(port, false, { quiet: true });
		expect(s.port).toBeGreaterThan(port);
		expect(s.portBinding).toEqual({ source: "flag", requested: port, busy: true });
		expect((await fetch(`${s.url}/api/statuses`)).status).toBe(200);
	});

	it("fails naming the requested port when nothing from a busy explicit 65535 up is free", async () => {
		const holder = await holdLoopbackPort(65535);
		if (holder) holders.push(holder);
		const s = serverFor(makeRoot());
		const failure = await s.start(65535, false, { quiet: true }).catch((error: unknown) => error);
		expect(failure).toBeInstanceOf(BoardPortError);
		expect((failure as Error).message).toContain("65535");
		expect((failure as Error).message).toContain("--port");
		expect(s.url).toBeNull();
	});

	it("binds a random port with no flag, env or config, and reports no configured port", async () => {
		const s = serverFor(makeRoot());
		await s.start(undefined, false, { quiet: true });
		expect(s.port).toBeGreaterThan(0);
		expect(s.portBinding).toEqual({ source: "random", requested: 0, busy: false });
	});
});

// `board serve` end to end: the CLI resolves its port through the same
// function, and prints the busy note beside the URL.
describe("board serve CLI with a configured port", () => {
	const CLI = join(import.meta.dir, "..", "cli.ts");

	async function serveUntilUrl(root: string, env: Record<string, string>, args: string[] = []) {
		const proc = Bun.spawn(["bun", CLI, "serve", ...args], {
			env: { ...process.env, CODER_FLEET_BOARD_ROOT: root, [BOARD_PORT_ENV]: "", ...env },
			stdout: "pipe",
			stderr: "pipe",
		});
		const reader = proc.stdout.getReader();
		const decoder = new TextDecoder();
		let out = "";
		const deadline = Date.now() + 8000;
		try {
			// The banner's Project line comes after the URL and any busy note.
			while (Date.now() < deadline && !/Project:/.test(out)) {
				const chunk = await Promise.race([
					reader.read(),
					new Promise<{ done: true; value: undefined }>((r) =>
						setTimeout(() => r({ done: true, value: undefined }), 8000),
					),
				]);
				if (chunk.done) break;
				out += decoder.decode(chunk.value);
			}
		} finally {
			reader.releaseLock();
			proc.kill();
		}
		const code = await proc.exited;
		const err = await new Response(proc.stderr).text();
		return { out, err, code };
	}

	it("moves up from a busy CODER_FLEET_BOARD_PORT and says the configured port was busy", async () => {
		const root = makeRoot();
		const { server: holder, port } = await listenOnEphemeralPort();
		try {
			const { out } = await serveUntilUrl(root, { [BOARD_PORT_ENV]: String(port) });
			const bound = Number(out.match(/http:\/\/127\.0\.0\.1:(\d+)/)?.[1]);
			expect(bound).toBeGreaterThan(port);
			expect(out).toContain(`${port}`);
			expect(out).toMatch(/busy/);
		} finally {
			await closeServer(holder);
			rmSync(root, { recursive: true, force: true });
		}
	}, 15000);

	it("moves up from a busy --port and says the requested port was busy", async () => {
		const root = makeRoot();
		const { server: holder, port } = await listenOnEphemeralPort();
		try {
			const { out } = await serveUntilUrl(root, {}, ["--port", String(port)]);
			const bound = Number(out.match(/http:\/\/127\.0\.0\.1:(\d+)/)?.[1]);
			expect(bound).toBeGreaterThan(port);
			expect(out).toMatch(new RegExp(`requested port ${port} \\(--port\\) was busy, so the board is on ${bound}`));
		} finally {
			await closeServer(holder);
			rmSync(root, { recursive: true, force: true });
		}
	}, 15000);
});
