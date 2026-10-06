import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DEFAULT_DIRECTORIES } from "../constants/index.ts";
import { McpServer } from "../mcp/server.ts";
import { BacklogServer } from "../server/index.ts";
import { BOARD_PORT_ENV } from "../server/port.ts";
import { refuseForeignRequest } from "../server/request-guard.ts";
import { forwardToUnixSocket } from "../server/unix-forward.ts";
import { unusedLoopbackPort } from "./test-ports.ts";

// CF-139: a page in the human's browser can rebind its own hostname to
// 127.0.0.1 and then talk to the board same-origin, where CORS never applies.
// The server must refuse any Host that is not loopback (or the interface the
// human bound on purpose) before any route runs, and any foreign Origin on a
// state-changing method. Requests go out over a raw socket so the Host and
// Origin headers are exactly what a hostile page would send.

type RawResponse = { status: number; headers: string; body: string };

function rawRequest(
	port: number,
	options: {
		method?: string;
		path?: string;
		host?: string | null;
		headers?: Record<string, string>;
		body?: string;
		upgrade?: boolean;
		version?: string;
	},
): Promise<RawResponse> {
	const method = options.method ?? "GET";
	const lines = [`${method} ${options.path ?? "/"} HTTP/${options.version ?? "1.1"}`];
	if (options.host !== null) lines.push(`Host: ${options.host ?? `127.0.0.1:${port}`}`);
	for (const [name, value] of Object.entries(options.headers ?? {})) lines.push(`${name}: ${value}`);
	if (options.upgrade) {
		lines.push("Upgrade: websocket", "Connection: Upgrade", "Sec-WebSocket-Version: 13");
		lines.push("Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==");
	} else {
		lines.push("Connection: close");
	}
	if (options.body !== undefined) {
		lines.push("Content-Type: application/json", `Content-Length: ${Buffer.byteLength(options.body)}`);
	}
	const payload = `${lines.join("\r\n")}\r\n\r\n${options.body ?? ""}`;

	return new Promise((resolve, reject) => {
		const socket = net.connect(port, "127.0.0.1");
		let data = "";
		let settled = false;
		const finish = () => {
			if (settled) return;
			settled = true;
			socket.destroy();
			const headerEnd = data.indexOf("\r\n\r\n");
			const head = headerEnd === -1 ? data : data.slice(0, headerEnd);
			const status = Number(head.split(" ")[1] ?? 0);
			resolve({ status, headers: head, body: headerEnd === -1 ? "" : data.slice(headerEnd + 4) });
		};
		socket.setTimeout(5000, () => {
			if (!settled) {
				settled = true;
				socket.destroy();
				reject(new Error(`no response to ${method} ${options.path ?? "/"} within 5s; got: ${data.slice(0, 200)}`));
			}
		});
		socket.on("connect", () => socket.write(payload));
		socket.on("data", (chunk) => {
			data += chunk.toString("utf8");
			// The server may keep the socket open (a 101 always does), so stop
			// once the head and the body it announces have arrived.
			const headerEnd = data.indexOf("\r\n\r\n");
			if (headerEnd === -1) return;
			const head = data.slice(0, headerEnd).toLowerCase();
			const body = data.slice(headerEnd + 4);
			const length = head.match(/\r\ncontent-length: *(\d+)/)?.[1];
			if (
				head.startsWith("http/1.1 101") ||
				(length !== undefined && Buffer.byteLength(body) >= Number(length)) ||
				(head.includes("transfer-encoding: chunked") && body.endsWith("0\r\n\r\n"))
			) {
				finish();
			}
		});
		socket.on("end", finish);
		socket.on("close", finish);
		socket.on("error", (error) => {
			if (!settled) {
				settled = true;
				reject(error);
			}
		});
	});
}

const CLI = join(import.meta.dir, "..", "cli.ts");

type ServedBoard = { port: number; stop: () => Promise<void> };

/**
 * Run `board serve` in its own process and wait for its banner. The cases that
 * load the page run here: under bun test, once one server in the process has
 * served the HTML bundle and stopped, a later one hangs on it, which predates
 * CF-139 (serve-board.test.ts then this file shows it on the unguarded server).
 */
async function serveCli(args: string[], env: Record<string, string> = {}): Promise<ServedBoard> {
	const boardRoot = makeBoardRoot();
	const servedPort = await unusedLoopbackPort();
	const proc = Bun.spawn(["bun", CLI, "serve", "--port", String(servedPort), ...args], {
		env: {
			...process.env,
			CODER_FLEET_BOARD_ROOT: boardRoot,
			CODER_FLEET_BOARD_PORT: "",
			CODER_FLEET_BOARD_HOST: "",
			...env,
		},
		stdout: "pipe",
		stderr: "pipe",
	});
	const stop = async () => {
		proc.kill();
		await proc.exited;
		rmSync(boardRoot, { recursive: true, force: true });
	};
	const reader = proc.stdout.getReader();
	const decoder = new TextDecoder();
	let out = "";
	const deadline = Date.now() + 8000;
	while (Date.now() < deadline && !/Project:/.test(out)) {
		const chunk = await Promise.race([
			reader.read(),
			new Promise<{ done: true; value: undefined }>((r) => setTimeout(() => r({ done: true, value: undefined }), 8000)),
		]);
		if (chunk.done) break;
		out += decoder.decode(chunk.value);
	}
	reader.releaseLock();
	if (!out.includes(`:${servedPort}`)) {
		await stop();
		throw new Error(`board serve did not report port ${servedPort}; stdout: ${out}`);
	}
	return { port: servedPort, stop };
}

function makeBoardRoot(): string {
	const root = mkdtempSync(join(tmpdir(), "board-host-guard-"));
	mkdirSync(join(root, DEFAULT_DIRECTORIES.BACKLOG, "tasks"), { recursive: true });
	writeFileSync(
		join(root, DEFAULT_DIRECTORIES.BACKLOG, "config.yml"),
		'project_name: "t"\ntask_prefix: "BD"\nstatuses: ["To Do", "In Progress", "Blocked", "Blocked by human", "Done"]\n',
	);
	return root;
}

async function taskTitles(port: number): Promise<string[]> {
	const res = await fetch(`http://127.0.0.1:${port}/api/tasks`);
	const tasks = (await res.json()) as Array<{ title: string }>;
	return tasks.map((task) => task.title);
}

function createBody(title: string): string {
	return JSON.stringify({ title, acceptanceCriteriaItems: [{ text: "proven", checked: false }] });
}

// A port in the runner's environment would override the one each test asks for.
const savedBoardPort = process.env[BOARD_PORT_ENV];
let root = "";
let server: BacklogServer | undefined;
let port = 0;

beforeAll(async () => {
	delete process.env[BOARD_PORT_ENV];
	root = makeBoardRoot();
	port = await unusedLoopbackPort();
	server = new BacklogServer(root);
	await server.start(port, false, { quiet: true });
});

afterAll(async () => {
	await server?.stop();
	rmSync(root, { recursive: true, force: true });
	if (savedBoardPort === undefined) delete process.env[BOARD_PORT_ENV];
	else process.env[BOARD_PORT_ENV] = savedBoardPort;
});

describe("a rebinding Host is refused before any route runs", () => {
	it("on the page", async () => {
		const res = await rawRequest(port, { path: "/", host: `evil.example:${port}` });
		expect(res.status).toBe(403);
		expect(res.headers.toLowerCase()).toContain("content-type: text/plain");
	});

	it("on a SPA path", async () => {
		expect((await rawRequest(port, { path: "/board", host: `evil.example:${port}` })).status).toBe(403);
	});

	it("on /api/tasks", async () => {
		const res = await rawRequest(port, { path: "/api/tasks", host: `evil.example:${port}` });
		expect(res.status).toBe(403);
		expect(res.body).not.toContain("[");
	});

	it("on a POST, which then creates nothing", async () => {
		const title = "rebound host post";
		const res = await rawRequest(port, {
			method: "POST",
			path: "/api/tasks",
			host: `evil.example:${port}`,
			body: createBody(title),
		});
		expect(res.status).toBe(403);
		expect(await taskTitles(port)).not.toContain(title);
	});

	it("on an unrouted path", async () => {
		expect((await rawRequest(port, { path: "/no-such-path", host: `evil.example:${port}` })).status).toBe(403);
	});

	it("on a WebSocket upgrade", async () => {
		const res = await rawRequest(port, { path: "/", host: `evil.example:${port}`, upgrade: true });
		expect(res.status).toBe(403);
	});

	it("when the Host is a loopback name with a different port", async () => {
		expect((await rawRequest(port, { path: "/api/statuses", host: `127.0.0.1:${port + 1}` })).status).toBe(403);
		expect((await rawRequest(port, { path: "/api/statuses", host: `localhost:${port + 1}` })).status).toBe(403);
	});

	it("when the Host only starts or ends like a loopback name", async () => {
		for (const host of [
			`127.0.0.1.evil.example:${port}`,
			`localhost.evil.example:${port}`,
			`evil-localhost:${port}`,
			`evil.example:${port}@127.0.0.1`,
			`[::1].evil.example:${port}`,
		]) {
			expect({ host, status: (await rawRequest(port, { path: "/api/statuses", host })).status }).toEqual({
				host,
				status: 403,
			});
		}
	});

	it("when the Host has a trailing dot, by decision: the name must match exactly", async () => {
		expect((await rawRequest(port, { path: "/api/statuses", host: `localhost.:${port}` })).status).toBe(403);
		expect((await rawRequest(port, { path: "/api/statuses", host: "localhost." })).status).toBe(403);
	});

	it("when there is no Host header at all", async () => {
		expect((await rawRequest(port, { path: "/api/statuses", host: null, version: "1.0" })).status).toBe(403);
	});
});

describe("loopback hosts get through", () => {
	for (const name of ["127.0.0.1", "localhost", "[::1]"]) {
		it(`${name} with the bound port and with none`, async () => {
			expect((await rawRequest(port, { path: "/api/statuses", host: `${name}:${port}` })).status).toBe(200);
			expect((await rawRequest(port, { path: "/api/statuses", host: name })).status).toBe(200);
		});
	}

	it("in any letter case, since host names are case-insensitive", async () => {
		expect((await rawRequest(port, { path: "/api/statuses", host: `LocalHost:${port}` })).status).toBe(200);
	});

	it("on a WebSocket upgrade from the board's own origin", async () => {
		for (const origin of [`http://127.0.0.1:${port}`, `http://localhost:${port}`, `http://[::1]:${port}`]) {
			const res = await rawRequest(port, { path: "/", upgrade: true, headers: { Origin: origin } });
			expect({ origin, status: res.status }).toEqual({ origin, status: 101 });
		}
	});
});

// An upgrade is a GET, but the socket it opens carries the board's broadcasts
// to whoever opened it, and a page on any origin can open one: CORS does not
// apply to WebSockets. So it is treated as state-changing, and stricter: a
// browser always sends Origin on one, so a missing Origin is refused too.
describe("a WebSocket upgrade is refused unless its Origin is the board's own", () => {
	it("refuses a foreign Origin", async () => {
		for (const origin of [
			"http://evil.example",
			`http://evil.example:${port}`,
			`http://127.0.0.1:${port + 1}`,
			"null",
		]) {
			const res = await rawRequest(port, { path: "/", upgrade: true, headers: { Origin: origin } });
			expect({ origin, status: res.status }).toEqual({ origin, status: 403 });
		}
	});

	it("refuses an upgrade with no Origin at all", async () => {
		expect((await rawRequest(port, { path: "/", upgrade: true })).status).toBe(403);
	});
});

describe("the page and its bundled assets, from board serve", () => {
	let served: ServedBoard | undefined;

	beforeAll(async () => {
		served = await serveCli([]);
	}, 20000);

	afterAll(async () => {
		await served?.stop();
	});

	it("serves the page and an asset to loopback, and refuses both to a rebinding Host", async () => {
		const p = served?.port ?? 0;
		const page = await rawRequest(p, { path: "/" });
		expect(page.status).toBe(200);
		const script = page.body.match(/<script[^>]+src="([^"]+)"/)?.[1];
		expect(script).toBeDefined();
		const path = new URL(script ?? "", `http://127.0.0.1:${p}/`).pathname;
		expect((await rawRequest(p, { path })).status).toBe(200);
		// The asset first: Bun serves it from a route of its own making, the case a guard in `fetch` misses.
		expect({ path, status: (await rawRequest(p, { path, host: `evil.example:${p}` })).status }).toEqual({
			path,
			status: 403,
		});
		expect((await rawRequest(p, { path: "/", host: `evil.example:${p}` })).status).toBe(403);
	});
});

describe("a foreign Origin is refused on every state-changing method", () => {
	it("refuses a POST from a foreign Origin, which then creates nothing", async () => {
		const title = "foreign origin post";
		const res = await rawRequest(port, {
			method: "POST",
			path: "/api/tasks",
			headers: { Origin: "http://evil.example" },
			body: createBody(title),
		});
		expect(res.status).toBe(403);
		expect(await taskTitles(port)).not.toContain(title);
	});

	it("refuses a loopback Origin on another port, another scheme, or null", async () => {
		for (const origin of [`http://127.0.0.1:${port + 1}`, `https://127.0.0.1:${port}`, "http://127.0.0.1", "null"]) {
			const res = await rawRequest(port, {
				method: "POST",
				path: "/api/tasks",
				headers: { Origin: origin },
				body: createBody(`origin ${origin}`),
			});
			expect({ origin, status: res.status }).toEqual({ origin, status: 403 });
		}
	});

	it("refuses PUT, PATCH and DELETE from a foreign Origin", async () => {
		const origin = `http://evil.example:${port}`;
		for (const [method, path, body] of [
			["PUT", "/api/config", JSON.stringify({ projectName: "pwned" })],
			["PATCH", "/api/tasks/BD-1", JSON.stringify({ title: "pwned" })],
			["DELETE", "/api/tasks/BD-1", undefined],
		] as const) {
			const res = await rawRequest(port, { method, path, headers: { Origin: origin }, body });
			expect({ method, status: res.status }).toEqual({ method, status: 403 });
		}
	});

	it("lets a same-origin POST through", async () => {
		for (const origin of [`http://127.0.0.1:${port}`, `http://LOCALHOST:${port}`, `http://[::1]:${port}`]) {
			const title = `same origin ${origin}`;
			const res = await rawRequest(port, {
				method: "POST",
				path: "/api/tasks",
				headers: { Origin: origin },
				body: createBody(title),
			});
			expect({ origin, status: res.status }).toEqual({ origin, status: 201 });
			expect(await taskTitles(port)).toContain(title);
		}
	});

	it("lets a POST with no Origin through, as curl and the CLI send", async () => {
		const title = "no origin post";
		const res = await rawRequest(port, { method: "POST", path: "/api/tasks", body: createBody(title) });
		expect(res.status).toBe(201);
		expect(await taskTitles(port)).toContain(title);
	});

	it("leaves a foreign Origin on a GET to the Host check", async () => {
		const res = await rawRequest(port, { path: "/api/statuses", headers: { Origin: "http://evil.example" } });
		expect(res.status).toBe(200);
	});
});

describe("board serve --host", () => {
	let served: ServedBoard | undefined;
	let ownPort = 0;

	beforeAll(async () => {
		served = await serveCli(["--host", "0.0.0.0"]);
		ownPort = served.port;
	}, 20000);

	afterAll(async () => {
		await served?.stop();
	});

	it("allows exactly that host, beside loopback", async () => {
		expect((await rawRequest(ownPort, { path: "/api/statuses", host: `0.0.0.0:${ownPort}` })).status).toBe(200);
		expect((await rawRequest(ownPort, { path: "/api/statuses", host: `127.0.0.1:${ownPort}` })).status).toBe(200);
		expect((await rawRequest(ownPort, { path: "/api/statuses", host: `evil.example:${ownPort}` })).status).toBe(403);
		expect((await rawRequest(ownPort, { path: "/api/statuses", host: `0.0.0.1:${ownPort}` })).status).toBe(403);
	});

	it("accepts that host as a same origin, and nothing else new", async () => {
		const ok = await rawRequest(ownPort, {
			method: "POST",
			path: "/api/tasks",
			headers: { Origin: `http://0.0.0.0:${ownPort}` },
			body: createBody("bound host origin"),
		});
		expect(ok.status).toBe(201);
		const foreign = await rawRequest(ownPort, {
			method: "POST",
			path: "/api/tasks",
			headers: { Origin: `http://evil.example:${ownPort}` },
			body: createBody("foreign on bound host"),
		});
		expect(foreign.status).toBe(403);
	});

	it("accepts that host's origin on a WebSocket upgrade, and refuses a foreign one", async () => {
		const own = await rawRequest(ownPort, {
			path: "/",
			host: `0.0.0.0:${ownPort}`,
			upgrade: true,
			headers: { Origin: `http://0.0.0.0:${ownPort}` },
		});
		expect(own.status).toBe(101);
		const foreign = await rawRequest(ownPort, {
			path: "/",
			host: `0.0.0.0:${ownPort}`,
			upgrade: true,
			headers: { Origin: `http://evil.example:${ownPort}` },
		});
		expect(foreign.status).toBe(403);
	});

	it("is not allowed on a loopback-bound server", async () => {
		expect((await rawRequest(port, { path: "/api/statuses", host: `0.0.0.0:${port}` })).status).toBe(403);
	});
});

// The app listens on a Unix socket only the gate should reach. A process ended
// by a signal never runs stop, so a later start clears what a dead one left.
describe("the app's socket directory", () => {
	const socketDirectory = (instance: BacklogServer | undefined): string =>
		(instance as unknown as { appSocketDirectory?: string | null } | undefined)?.appSocketDirectory ?? "";

	it("is private to this user", () => {
		const directory = socketDirectory(server);
		expect(directory).not.toBe("");
		expect(statSync(directory).mode & 0o777).toBe(0o700);
	});

	it("is cleared on start when the process that made it is gone, and kept while it lives", async () => {
		const base = dirname(socketDirectory(server));
		const gone = Bun.spawn(["true"]);
		await gone.exited;
		const stale = mkdtempSync(join(base, `board-app-${gone.pid}-`));
		writeFileSync(join(stale, "app.sock"), "");
		// Another process, not this one: start skips its own pid before asking whether the owner lives.
		const alive = Bun.spawn(["sleep", "30"]);
		const live = mkdtempSync(join(base, `board-app-${alive.pid}-`));
		const ownRoot = makeBoardRoot();
		const own = new BacklogServer(ownRoot);
		try {
			await own.start(0, false, { quiet: true });
			expect({ stale: existsSync(stale), live: existsSync(live) }).toEqual({ stale: false, live: true });
		} finally {
			await own.stop();
			alive.kill();
			await alive.exited;
			rmSync(ownRoot, { recursive: true, force: true });
			rmSync(stale, { recursive: true, force: true });
			rmSync(live, { recursive: true, force: true });
		}
	});
});

// board_serve starts the UI inside the MCP process, not through `board serve`.
describe("the MCP board_serve path", () => {
	it("refuses a rebinding Host and lets loopback through", async () => {
		const mcpRoot = makeBoardRoot();
		const mcp = new McpServer(mcpRoot, "Test instructions");
		try {
			const status = await mcp.startWebUi();
			const mcpPort = status.port ?? 0;
			expect((await rawRequest(mcpPort, { path: "/api/statuses", host: `evil.example:${mcpPort}` })).status).toBe(403);
			expect((await rawRequest(mcpPort, { path: "/api/statuses" })).status).toBe(200);
		} finally {
			await mcp.stopWebUi();
			await mcp.stop();
			rmSync(mcpRoot, { recursive: true, force: true });
		}
	});
});

// The guard sits in a gate that forwards to the app over a Unix socket. Bun
// reads proxy settings once at start-up, and its fetch then sends a proxy's
// absolute-form request line down even a Unix socket, which no route matches;
// a human with HTTP_PROXY set must still get a working board.
describe("board serve with a proxy in the environment", () => {
	it("still serves the page and the API", async () => {
		const deadProxy = "http://127.0.0.1:9";
		const served = await serveCli([], { HTTP_PROXY: deadProxy, http_proxy: deadProxy, NO_PROXY: "", no_proxy: "" });
		try {
			expect((await rawRequest(served.port, { path: "/api/statuses" })).status).toBe(200);
			expect((await rawRequest(served.port, { path: "/" })).status).toBe(200);
		} finally {
			await served.stop();
		}
	}, 20000);
});

// The gate waits on the app for a bounded time: an app that accepts and never
// answers would otherwise leave the browser's request hanging for good.
describe("the gate's hop to the app", () => {
	it("answers 502 when the app accepts and never responds", async () => {
		const directory = mkdtempSync(join(tmpdir(), "fwd-"));
		const socketPath = join(directory, "app.sock");
		const held: net.Socket[] = [];
		const silent = net.createServer((socket) => {
			held.push(socket);
		});
		await new Promise<void>((resolve) => silent.listen(socketPath, resolve));
		try {
			const started = Date.now();
			const res = await forwardToUnixSocket(socketPath, new Request("http://127.0.0.1/api/statuses"), 200);
			expect(res.status).toBe(502);
			expect(await res.text()).toContain("did not answer");
			expect(Date.now() - started).toBeLessThan(2000);
		} finally {
			for (const socket of held) socket.destroy();
			await new Promise<void>((resolve) => silent.close(() => resolve()));
			rmSync(directory, { recursive: true, force: true });
		}
	}, 3000);
});

// A Host header writes an IPv6 literal in brackets, `--host` takes it bare.
// Driven through the guard itself: a link-local address is not bindable on every machine.
describe("an IPv6 --host", () => {
	const scope = { boundHost: "fe80::1", port: 4242 };
	const request = (headers: Record<string, string>, method = "GET") =>
		new Request("http://board.invalid/api/statuses", { method, headers });

	it("allows its bracketed Host, with the bound port and with none", () => {
		expect(refuseForeignRequest(request({ Host: "[fe80::1]:4242" }), scope)).toBeNull();
		expect(refuseForeignRequest(request({ Host: "[FE80::1]" }), scope)).toBeNull();
	});

	it("accepts its own origin on a POST and refuses another IPv6 host", () => {
		const own = request({ Host: "[fe80::1]:4242", Origin: "http://[fe80::1]:4242" }, "POST");
		expect(refuseForeignRequest(own, scope)).toBeNull();
		expect(refuseForeignRequest(request({ Host: "[fe80::2]:4242" }), scope)?.status).toBe(403);
	});
});
