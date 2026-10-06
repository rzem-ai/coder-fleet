import { afterAll, afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import type net from "node:net";
import { McpServer } from "../mcp/server.ts";
import { registerServeTools } from "../mcp/tools/serve/index.ts";
import { BOARD_PORT_ENV } from "../server/port.ts";
import { holdLoopbackPort, unusedLoopbackPort } from "./test-ports.ts";
import {
	closeServer,
	createUniqueTestDir,
	initializeFilesystemTestProject,
	listenOnEphemeralPort,
	openBoardSocket,
	safeCleanup,
} from "./test-utils.ts";

// The web UI is per Claude Code instance: it lives inside the session's own MCP
// process, on a loopback port - CODER_FLEET_BOARD_PORT, then default_port,
// then a random one - started only when asked. These pin the
// three tools that make that true - board_serve starts it once and hands back
// the URL, board_url answers without starting anything, board_stop ends it
// mid-session - and that stopping the MCP server takes the web UI with it.

const getText = (content: unknown[] | undefined, index = 0): string => {
	const item = content?.[index] as { text?: string } | undefined;
	return item?.text ?? "";
};

async function refused(url: string): Promise<boolean> {
	try {
		await fetch(url);
		return false;
	} catch {
		return true;
	}
}

// Run fn with console.log and process.stdout.write replaced by counters, and
// report how many times each was called. Stdout is the MCP transport, so any
// call at all is a corrupted stream.
async function countStdoutWrites(fn: () => Promise<unknown>): Promise<{ log: number; write: number }> {
	const log = spyOn(console, "log").mockImplementation(() => {});
	const write = spyOn(process.stdout, "write").mockImplementation(() => true);
	try {
		await fn();
		return { log: log.mock.calls.length, write: write.mock.calls.length };
	} finally {
		log.mockRestore();
		write.mockRestore();
	}
}

let TEST_DIR: string;
let server: McpServer;

async function call(name: string, args: Record<string, unknown> = {}) {
	return server.testInterface.callTool({ params: { name, arguments: args } });
}

// A port in the runner's environment would make every random-port case here
// a configured one, so each test starts with it unset and the original returns
// afterwards.
const savedBoardPort = process.env[BOARD_PORT_ENV];

describe("MCP serve tools", () => {
	afterAll(() => {
		if (savedBoardPort === undefined) delete process.env[BOARD_PORT_ENV];
		else process.env[BOARD_PORT_ENV] = savedBoardPort;
	});

	beforeEach(async () => {
		delete process.env[BOARD_PORT_ENV];
		TEST_DIR = createUniqueTestDir("mcp-serve");
		server = new McpServer(TEST_DIR, "Test instructions");
		await server.filesystem.ensureBacklogStructure();
		await initializeFilesystemTestProject(server, "Test Project");
		// The fixture writes upstream's default_port of 6420, which a fleet board
		// never carries. Clear it, so every case starts from a real board's config
		// and only the configured-port cases set one.
		const config = await server.filesystem.loadConfig();
		if (config) await server.filesystem.saveConfig({ ...config, defaultPort: undefined });
		registerServeTools(server);
	});

	afterEach(async () => {
		await server.stop();
		await safeCleanup(TEST_DIR);
	});

	it("board_url reports not running before anything is started", async () => {
		const result = await call("board_url");
		const body = JSON.parse(getText(result.content));
		expect(body.running).toBe(false);
		expect(body.url).toBeNull();
	});

	it("board_serve starts the web UI on a random loopback port and returns its URL", async () => {
		const result = await call("board_serve");
		const body = JSON.parse(getText(result.content));
		expect(body.running).toBe(true);
		expect(body.host).toBe("127.0.0.1");
		expect(body.port).toBeGreaterThan(0);
		expect(body.url).toBe(`http://127.0.0.1:${body.port}`);

		const res = await fetch(`${body.url}/api/tasks`);
		expect(res.status).toBe(200);
	});

	it("board_serve is idempotent: a second call returns the same URL", async () => {
		const first = JSON.parse(getText((await call("board_serve")).content));
		const second = JSON.parse(getText((await call("board_serve")).content));
		expect(second.url).toBe(first.url);

		const asked = JSON.parse(getText((await call("board_url")).content));
		expect(asked.running).toBe(true);
		expect(asked.url).toBe(first.url);
	});

	it("stopping the MCP server stops the web UI", async () => {
		const body = JSON.parse(getText((await call("board_serve")).content));
		await server.stop();
		let refused = false;
		try {
			await fetch(`${body.url}/api/tasks`);
		} catch {
			refused = true;
		}
		expect(refused).toBe(true);
	});

	describe("board_stop", () => {
		it("(a) reports nothing stopped when nothing is running", async () => {
			const result = await call("board_stop");
			expect(result.isError).toBeFalsy();
			const body = JSON.parse(getText(result.content));
			expect(body).toEqual({ running: false, url: null, host: null, port: null, stopped: null });

			const asked = JSON.parse(getText((await call("board_url")).content));
			expect(asked.running).toBe(false);
		});

		it("(b) stops a running UI and returns the URL it stopped", async () => {
			const served = JSON.parse(getText((await call("board_serve")).content));
			// A request first, so a kept-alive connection exists when the stop comes.
			expect((await fetch(`${served.url}/api/tasks`)).status).toBe(200);

			const result = await call("board_stop");
			expect(result.isError).toBeFalsy();
			const body = JSON.parse(getText(result.content));
			expect(body).toEqual({ running: false, url: null, host: null, port: null, stopped: served.url });

			const asked = JSON.parse(getText((await call("board_url")).content));
			expect(asked.running).toBe(false);
			expect(asked.url).toBeNull();
			expect(await refused(`${served.url}/api/tasks`)).toBe(true);
		});

		it("(c) is idempotent: a second stop reports nothing stopped", async () => {
			await call("board_serve");
			await call("board_stop");
			const second = await call("board_stop");
			expect(second.isError).toBeFalsy();
			expect(JSON.parse(getText(second.content)).stopped).toBeNull();
		});

		it("(d) a serve after a stop starts a fresh UI", async () => {
			await call("board_serve");
			await call("board_stop");
			const again = JSON.parse(getText((await call("board_serve")).content));
			expect(again.running).toBe(true);
			expect((await fetch(`${again.url}/api/tasks`)).status).toBe(200);
		});

		it("(e) closes an open WebSocket", async () => {
			const served = JSON.parse(getText((await call("board_serve")).content));
			const ws = openBoardSocket(served.url.replace("http", "ws"), served.url);
			await new Promise<void>((resolve, reject) => {
				ws.addEventListener("open", () => resolve(), { once: true });
				ws.addEventListener("error", () => reject(new Error("websocket failed to open")), { once: true });
			});
			const closed = new Promise<boolean>((resolve) =>
				ws.addEventListener("close", () => resolve(true), { once: true }),
			);
			const timeout = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 2000));

			await call("board_stop");
			expect(await Promise.race([closed, timeout])).toBe(true);
		});

		it("(f) a stop issued during a start wins", async () => {
			const serving = call("board_serve");
			await call("board_stop");
			const served = JSON.parse(getText((await serving).content));

			const asked = JSON.parse(getText((await call("board_url")).content));
			expect(asked.running).toBe(false);
			expect(await refused(`${served.url}/api/tasks`)).toBe(true);
		});

		it("(f') at the server level, stopWebUi during startWebUi leaves nothing running", async () => {
			const starting = server.startWebUi();
			await server.stopWebUi();
			const started = await starting;

			expect(server.webUiStatus().running).toBe(false);
			expect(await refused(`${started.url}/api/tasks`)).toBe(true);
		});

		it("(g) writes nothing to stdout", async () => {
			await call("board_serve");
			const counts = await countStdoutWrites(() => call("board_stop"));
			expect(counts).toEqual({ log: 0, write: 0 });
		});

		it("(g') at the server level, stopWebUi writes nothing to stdout", async () => {
			await server.startWebUi();
			const counts = await countStdoutWrites(() => server.stopWebUi());
			expect(counts).toEqual({ log: 0, write: 0 });
		});

		it("(h) is listed, and marked idempotent", async () => {
			const { tools } = await server.testInterface.listTools();
			const stop = tools.find((tool) => tool.name === "board_stop");
			expect(stop).toBeDefined();
			expect(stop?.annotations?.idempotentHint).toBe(true);
		});
	});

	// CF-128: /board honours the port the human configured - default_port in
	// the board's config.yml, or CODER_FLEET_BOARD_PORT over it - and moves up
	// one at a time from a busy one rather than giving up or going random.
	describe("configured port", () => {
		const holders: net.Server[] = [];

		async function configurePort(port: number): Promise<void> {
			const config = await server.filesystem.loadConfig();
			if (!config) throw new Error("test project has no config");
			await server.filesystem.saveConfig({ ...config, defaultPort: port });
		}

		afterEach(async () => {
			for (const h of holders.splice(0)) await closeServer(h);
		});

		it("(1) binds default_port from the config and returns that URL", async () => {
			const port = await unusedLoopbackPort();
			await configurePort(port);
			const body = JSON.parse(getText((await call("board_serve")).content));
			expect(body.running).toBe(true);
			expect(body.url).toBe(`http://127.0.0.1:${port}`);
			expect(body.portSource).toBe("config");
			expect(body.configuredPortBusy).toBe(false);
			expect((await fetch(`${body.url}/api/tasks`)).status).toBe(200);
		});

		it("(2) takes CODER_FLEET_BOARD_PORT over default_port", async () => {
			const configPort = await unusedLoopbackPort();
			const envPort = await unusedLoopbackPort();
			await configurePort(configPort);
			process.env[BOARD_PORT_ENV] = String(envPort);
			const body = JSON.parse(getText((await call("board_serve")).content));
			expect(body.url).toBe(`http://127.0.0.1:${envPort}`);
			expect(body.portSource).toBe("env");
		});

		it("(3) binds a random loopback port with neither set, and names no configured port", async () => {
			const body = JSON.parse(getText((await call("board_serve")).content));
			expect(body.port).toBeGreaterThan(0);
			expect(body.portSource).toBe("random");
			expect(body.configuredPort).toBeUndefined();
			expect(body.note).toBeUndefined();
		});

		it("(4) moves up from a busy configured port and says the configured one was busy", async () => {
			const { server: holder, port } = await listenOnEphemeralPort();
			holders.push(holder);
			await configurePort(port);
			const body = JSON.parse(getText((await call("board_serve")).content));
			expect(body.running).toBe(true);
			expect(body.port).toBeGreaterThan(port);
			expect(body.url).toBe(`http://127.0.0.1:${body.port}`);
			expect(body.configuredPort).toBe(port);
			expect(body.configuredPortBusy).toBe(true);
			expect(body.note).toContain(String(port));
			expect(body.note).toContain(String(body.port));
			expect(body.note).toMatch(/busy/);
			expect((await fetch(`${body.url}/api/tasks`)).status).toBe(200);
		});

		it("(5) fails naming the configured port when nothing up to 65535 is free, and binds nothing", async () => {
			const holder = await holdLoopbackPort(65535);
			if (holder) holders.push(holder);
			await configurePort(65535);
			const result = await call("board_serve");
			expect(result.isError).toBe(true);
			expect(getText(result.content)).toContain("65535");

			const asked = JSON.parse(getText((await call("board_url")).content));
			expect(asked.running).toBe(false);
		});
	});
});
