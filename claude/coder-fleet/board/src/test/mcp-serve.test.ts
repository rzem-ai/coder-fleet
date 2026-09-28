import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { McpServer } from "../mcp/server.ts";
import { registerServeTools } from "../mcp/tools/serve/index.ts";
import { createUniqueTestDir, initializeFilesystemTestProject, safeCleanup } from "./test-utils.ts";

// The web UI is per Claude Code instance: it lives inside the session's own MCP
// process, on a random loopback port, started only when asked. These pin the
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

describe("MCP serve tools", () => {
	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("mcp-serve");
		server = new McpServer(TEST_DIR, "Test instructions");
		await server.filesystem.ensureBacklogStructure();
		await initializeFilesystemTestProject(server, "Test Project");
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
			const ws = new WebSocket(served.url.replace("http", "ws"));
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
});
