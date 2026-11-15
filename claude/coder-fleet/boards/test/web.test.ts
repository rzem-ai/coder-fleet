import { afterAll, describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { join } from "node:path";
import { createBoard } from "../src/board.ts";
import { readCard } from "../src/cards.ts";
import { cardHistory, readEvents } from "../src/events.ts";
import { alive } from "../src/lock.ts";
import { readConfig, webConfig, writeConfig } from "../src/config.ts";
import { hostAllowed, LOOPBACK, networkUrls, readWebState, serveWeb, startWebUI, webMessage, webStatePaths } from "../src/web.ts";
import { World } from "./fixtures.ts";

// Group H, criteria 58 and 59, and criterion 2 for the web UI: the server
// listens on loopback only, a second request reuses it, it stops when its last
// holder ends, and nothing it writes shows in git status.
const w = new World("web");
const env = { ...w.env, XDG_STATE_HOME: join(w.root, "state") };
const repo = w.repo("web", "git@example.com:o/web.git");
const wt = w.worktree(repo, "web-wt");
const board = createBoard(repo, "WB", env);
const server = serveWeb(board);
const base = `http://${LOOPBACK}:${server.port}`;
const open = createBoard(w.repo("web-open", "git@example.com:o/web-open.git"), "WO", env);
const wide = serveWeb(open, 0, undefined, "0.0.0.0");
const wideBase = `http://${LOOPBACK}:${wide.port}`;
const sleepers: Array<ReturnType<typeof Bun.spawn>> = [];
afterAll(() => {
	server.stop(true);
	wide.stop(true);
	for (const s of sleepers) s.kill();
	w.dispose();
});

async function post(path: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
	return fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
}

function status(dir: string): string {
	return w.git(dir, "status", "--porcelain", "--ignored", "--untracked-files=all");
}

function sleeper(): number {
	const p = Bun.spawn(["sleep", "60"]);
	sleepers.push(p);
	return p.pid;
}

async function until(ok: () => boolean | Promise<boolean>, ms: number): Promise<boolean> {
	const end = Date.now() + ms;
	while (Date.now() < end) {
		if (await ok()) return true;
		await Bun.sleep(100);
	}
	return ok();
}

async function answers(url: string): Promise<boolean> {
	try {
		return (await fetch(`${url}api/board`)).ok;
	} catch {
		return false;
	}
}

describe("the web UI's API", () => {
	it("writes nothing git status shows, in the repo or a worktree", async () => {
		const made = await post("/api/cards", { title: "first" });
		expect(made.status).toBe(201);
		const id = ((await made.json()) as { id: string }).id;
		const other = ((await (await post("/api/cards", { title: "second" })).json()) as { id: string }).id;
		const ops: Array<[string, unknown]> = [
			[`/api/cards/${id}/edit`, { title: "First", body: "What it is.\n" }],
			[`/api/cards/${id}/add`, { list: "criteria", text: "It works" }],
			[`/api/cards/${id}/add`, { list: "dod", text: "Tested" }],
			[`/api/cards/${id}/tick`, { list: "criteria", n: 0 }],
			[`/api/cards/${id}/untick`, { list: "criteria", n: 0 }],
			[`/api/cards/${id}/edititem`, { list: "criteria", n: 0, text: "It still works" }],
			[`/api/cards/${id}/tick`, { list: "criteria", n: 0 }],
			[`/api/cards/${id}/remove`, { list: "dod", n: 0 }],
			[`/api/cards/${id}/comment`, { text: "Looks right" }],
			[`/api/cards/${id}/move`, { to: "Backlog" }],
			[`/api/cards/${other}/move`, { to: "Backlog" }],
			[`/api/cards/${id}/move`, { to: "Next" }],
			[`/api/cards/${other}/move`, { to: "Next", index: 0 }],
			[`/api/cards/${id}/order`, { index: 0 }],
			[`/api/cards/${id}/add`, { list: "actions", text: "Pick one" }],
			[`/api/cards/${id}/tick`, { list: "actions", n: 0 }],
			[`/api/cards/${id}/move`, { to: "Done" }],
		];
		for (const [path, body] of ops) {
			const r = await post(path, body);
			expect({ path, status: r.status }).toEqual({ path, status: 200 });
			expect(status(repo)).toBe("");
			expect(status(wt)).toBe("");
		}
		const card = readCard(board, id).card;
		expect(card.title).toBe("First");
		expect(card.criteria).toEqual([{ text: "It still works", ticked: true }]);
		expect(card.column).toBe("Done");
		// The human's moves are the web's, and the one into Done with nothing
		// ticked on its Definition of Done had nothing unticked to bypass.
		expect(cardHistory(board.paths, id).map((e) => [e.to, e.source])).toEqual([
			["Backlog", "web"],
			["Next", "web"],
			["Blocked by Human", "web"],
			["Done", "web"],
		]);
		const view = (await (await fetch(`${base}/api/board`)).json()) as { cards: Array<{ id: string; column: string }> };
		expect(view.cards.find((c) => c.id === other)?.column).toBe("Next");
	});

	it("deletes a card through deleteCard, so the event log keeps a line for it, and writes nothing git status shows", async () => {
		const id = ((await (await post("/api/cards", { title: "doomed" })).json()) as { id: string }).id;
		const r = await post(`/api/cards/${id}/delete`, {});
		expect(r.status).toBe(200);
		expect(await r.json()).toEqual({ deleted: id });
		expect(existsSync(join(board.paths.cards, `${id}.md`))).toBe(false);
		expect(readEvents(board.paths).filter((e) => e.event === "card-deleted" && e.card === id)).toMatchObject([{ source: "web", title: "doomed" }]);
		expect((await fetch(`${base}/api/cards/${id}`)).status).toBe(404);
		expect(status(repo)).toBe("");
		expect(status(wt)).toBe("");
	});

	it("refuses a move with a bad index before moving anything", async () => {
		const id = ((await (await post("/api/cards", { title: "unmoved" })).json()) as { id: string }).id;
		const lines = readEvents(board.paths).length;
		const r = await post(`/api/cards/${id}/move`, { to: "Backlog", index: -1 });
		expect(r.status).toBe(400);
		expect(readCard(board, id).card.column).toBe("Draft");
		expect(readEvents(board.paths).length).toBe(lines);
	});

	it("answers a malformed percent-encoding in the path with 400", async () => {
		const r = await fetch(`${base}/%E0%A4%A`);
		expect(r.status).toBe(400);
	});

	it("refuses a move the column rules refuse, and says why", async () => {
		const id = ((await (await post("/api/cards", { title: "draft" })).json()) as { id: string }).id;
		const r = await post(`/api/cards/${id}/move`, { to: "Next" });
		expect(r.status).toBe(409);
		expect(((await r.json()) as { error: string }).error).toContain("leaves Draft only for Backlog");
		const detail = (await (await fetch(`${base}/api/cards/${id}`)).json()) as { targets: Array<{ column: string; refused?: string }> };
		expect(detail.targets.filter((t) => !t.refused).map((t) => t.column)).toEqual(["Backlog"]);
	});
});

describe("loopback only", () => {
	it("listens on 127.0.0.1 and on no other address of this machine", async () => {
		expect(server.hostname).toBe(LOOPBACK);
		const outward = Object.values(networkInterfaces())
			.flat()
			.filter((a) => a && a.family === "IPv4" && !a.internal)
			.map((a) => a?.address);
		for (const address of outward) {
			let reached = true;
			try {
				await fetch(`http://${address}:${server.port}/api/board`, { signal: AbortSignal.timeout(2000) });
			} catch {
				reached = false;
			}
			expect({ address, reached }).toEqual({ address, reached: false });
		}
	});

	it("refuses another host name, another origin's write and a write that is not JSON", async () => {
		expect((await fetch(`${base}/api/board`, { headers: { host: `rebound.example:${server.port}` } })).status).toBe(403);
		expect((await post("/api/cards", { title: "x" }, { origin: "https://elsewhere.example" })).status).toBe(403);
		const form = await fetch(`${base}/api/cards`, { method: "POST", headers: { "content-type": "text/plain" }, body: '{"title":"x"}' });
		expect(form.status).toBe(415);
	});
});

describe("starting the web UI", () => {
	it("reuses the running server for a second session and stops when the last one ends", async () => {
		const one = sleeper();
		const two = sleeper();
		const first = startWebUI(wt, one, env);
		expect(first.reused).toBe(false);
		expect(first.url.startsWith(`http://${LOOPBACK}:`)).toBe(true);
		const second = startWebUI(repo, two, env);
		expect(second).toEqual({ url: first.url, reused: true, network: [] });
		expect(await answers(first.url)).toBe(true);
		const { state } = webStatePaths("WB", env);
		const pid = readWebState(state)?.pid ?? 0;
		expect(readWebState(state)?.holders).toEqual([one, two]);

		process.kill(one);
		expect(await until(() => readWebState(state)?.holders.length === 1, 5000)).toBe(true);
		expect(await answers(first.url)).toBe(true);

		process.kill(two);
		expect(await until(() => !alive(pid), 5000)).toBe(true);
		expect(existsSync(state)).toBe(false);
		expect(await answers(first.url)).toBe(false);
		expect(status(repo)).toBe("");
		expect(status(wt)).toBe("");
	});
});

// CF-10: config.yml's `listen:` and `port:`, the Host and Origin rules on
// both addresses, and a running server moved when config.yml moves it.
describe("where the web UI listens, from config.yml", () => {
	const cfg = { prefix: "XY", key: "k", keyKind: "origin" as const, created: "2026-11-15" };

	it("defaults to 127.0.0.1 on a free port, takes 0.0.0.0 and a port from 1 to 65535, and refuses anything else by its key", () => {
		expect(webConfig(cfg)).toEqual({ listen: "127.0.0.1", port: 0 });
		expect(webConfig({ ...cfg, listen: null, port: null })).toEqual({ listen: "127.0.0.1", port: 0 });
		expect(webConfig({ ...cfg, listen: "0.0.0.0", port: 4577 })).toEqual({ listen: "0.0.0.0", port: 4577 });
		expect(webConfig({ ...cfg, listen: "127.0.0.1", port: 1 })).toEqual({ listen: "127.0.0.1", port: 1 });
		expect(webConfig({ ...cfg, port: 65535 }).port).toBe(65535);
		for (const listen of ["localhost", "::", "192.168.1.5", "0.0.0.0 ", 0, true]) {
			expect(() => webConfig({ ...cfg, listen })).toThrow(/^listen: in config\.yml must be 127\.0\.0\.1 or 0\.0\.0\.0/);
		}
		for (const port of [0, -1, 65536, 1.5, "4577", true]) {
			expect(() => webConfig({ ...cfg, port })).toThrow(/^port: in config\.yml must be a whole number from 1 to 65535/);
		}
	});

	it("reads both keys from a board's config.yml as YAML writes them", () => {
		const b = createBoard(w.repo("web-yaml", "git@example.com:o/web-yaml.git"), "WY", env);
		writeConfig(b.paths, { ...readConfig(b.paths), listen: "0.0.0.0", port: 4577 });
		expect(webConfig(readConfig(b.paths))).toEqual({ listen: "0.0.0.0", port: 4577 });
	});
});

describe("the Host and Origin rules", () => {
	async function hostStatus(at: string, host: string): Promise<number> {
		return (await fetch(`${at}/api/board`, { headers: { host } })).status;
	}

	async function write(at: string, host: string, origin?: string): Promise<number> {
		const headers: Record<string, string> = { host, "content-type": "application/json" };
		if (origin !== undefined) headers.origin = origin;
		return (await fetch(`${at}/api/cards`, { method: "POST", headers, body: '{"title":"x"}' })).status;
	}

	it("on 127.0.0.1, answers only 127.0.0.1 or localhost on its own port, as before", async () => {
		const p = server.port;
		for (const host of [`127.0.0.1:${p}`, `localhost:${p}`]) expect({ host, s: await hostStatus(base, host) }).toEqual({ host, s: 200 });
		for (const host of [`evil.example:${p}`, `192.168.1.5:${p}`, `[::1]:${p}`, `LOCALHOST:${p}`, `localhost.:${p}`, `127.0.0.1:${p + 1}`, "127.0.0.1", `localhost:0${p}`]) {
			expect({ host, s: await hostStatus(base, host) }).toEqual({ host, s: 403 });
		}
		expect(hostAllowed(LOOPBACK, null, p ?? 0)).toBe(false);
	});

	it("on 127.0.0.1, takes a write with no Origin or its own, and refuses any other", async () => {
		const p = server.port;
		const host = `127.0.0.1:${p}`;
		for (const origin of [undefined, `http://127.0.0.1:${p}`, `http://localhost:${p}`]) expect({ origin, s: await write(base, host, origin) }).toEqual({ origin, s: 201 });
		for (const origin of ["https://elsewhere.example", `http://127.0.0.1:${(p ?? 0) + 1}`, `https://127.0.0.1:${p}`, "null", `http://192.168.1.5:${p}`]) {
			expect({ origin, s: await write(base, host, origin) }).toEqual({ origin, s: 403 });
		}
	});

	it("on 0.0.0.0, answers an IP literal or localhost on its own port, and refuses a domain name, any other spelling and any other port", async () => {
		const p = wide.port ?? 0;
		expect(wide.hostname).toBe("0.0.0.0");
		for (const host of [`127.0.0.1:${p}`, `localhost:${p}`, `192.168.1.5:${p}`, `10.0.0.255:${p}`, `[::1]:${p}`, `[fe80::1]:${p}`, `[::ffff:192.168.1.5]:${p}`]) {
			expect({ host, s: await hostStatus(wideBase, host) }).toEqual({ host, s: 200 });
		}
		const refused = [
			`evil.example:${p}`,
			`rebound.example.:${p}`,
			`192.168.1.5.:${p}`,
			`localhost.:${p}`,
			`LOCALHOST:${p}`,
			`192.168.1.5:${p + 1}`,
			`[::1]:${p + 1}`,
			"192.168.1.5",
			`192.168.1.5:`,
			"[::1]",
			`127.1:${p}`,
			`0x7f.0.0.1:${p}`,
			`010.0.0.1:${p}`,
			`256.0.0.1:${p}`,
			`::1:${p}`,
			`[::1:${p}`,
			`[evil.example]:${p}`,
			`[fe80::1%25en0]:${p}`,
			`192.168.1.5:${p}:${p}`,
			`192.168.1.5:+${p}`,
		];
		for (const host of refused) {
			// The parser may answer a Host it cannot read with 400 itself; what
			// matters is that nothing is served.
			const s = await hostStatus(wideBase, host);
			expect({ host, served: s === 200 }).toEqual({ host, served: false });
		}
		expect(hostAllowed("0.0.0.0", null, p)).toBe(false);
		expect(hostAllowed("0.0.0.0", `[fe80::1%en0]:${p}`, p)).toBe(false);
		expect(hostAllowed("0.0.0.0", `evil.example:${p}`, p)).toBe(false);
	});

	it("on 0.0.0.0, takes a write only with an Origin of http:// and the request's own Host", async () => {
		const p = wide.port ?? 0;
		for (const host of [`192.168.1.5:${p}`, `localhost:${p}`, `[::1]:${p}`]) {
			expect({ host, s: await write(wideBase, host, `http://${host}`) }).toEqual({ host, s: 201 });
		}
		const lan = `192.168.1.5:${p}`;
		for (const origin of [undefined, "null", `http://127.0.0.1:${p}`, `https://${lan}`, `http://${lan}/`, `http://192.168.1.6:${p}`, "https://elsewhere.example", `http://evil.example:${p}`]) {
			expect({ origin, s: await write(wideBase, lan, origin) }).toEqual({ origin, s: 403 });
		}
		expect(await write(wideBase, `evil.example:${p}`, `http://evil.example:${p}`)).toBe(403);
	});

	it("on 0.0.0.0, answers on this machine's network addresses", async () => {
		const p = wide.port ?? 0;
		const urls = networkUrls("0.0.0.0", p);
		expect(networkUrls(LOOPBACK, p)).toEqual([]);
		for (const url of urls) {
			const host = new URL(url).host;
			expect({ url, s: (await fetch(`${url}api/board`, { signal: AbortSignal.timeout(2000) })).status }).toEqual({ url, s: 200 });
			expect(await write(url.slice(0, -1), host, `http://${host}`)).toBe(201);
		}
	});
});

describe("a running web UI that config.yml has moved", () => {
	const moved = w.repo("web-moved", "git@example.com:o/web-moved.git");
	const mb = createBoard(moved, "WM", env);
	const { state } = webStatePaths("WM", env);

	function configure(fields: Record<string, unknown>): void {
		const { listen: _l, port: _p, ...rest } = readConfig(mb.paths);
		writeConfig(mb.paths, { ...rest, ...fields } as ReturnType<typeof readConfig>);
	}

	function freePort(): number {
		const s = Bun.serve({ hostname: LOOPBACK, port: 0, fetch: () => new Response("") });
		const port = s.port ?? 0;
		s.stop(true);
		return port;
	}

	it("refuses a bad listen: or port: before starting anything", () => {
		configure({ listen: "localhost" });
		expect(() => startWebUI(moved, sleeper(), env)).toThrow(/^listen: in .*config\.yml must be 127\.0\.0\.1 or 0\.0\.0\.0/);
		configure({ port: 70000 });
		expect(() => startWebUI(moved, sleeper(), env)).toThrow(/^port: in .*config\.yml must be a whole number/);
		expect(existsSync(state)).toBe(false);
		configure({});
	});

	it("restarts it where config.yml now says, held by every session, and fails naming a fixed port already taken", async () => {
		const one = sleeper();
		const two = sleeper();
		const first = startWebUI(moved, one, env);
		expect(first.reused).toBe(false);
		const oldPid = readWebState(state)?.pid ?? 0;

		const port = freePort();
		configure({ listen: "0.0.0.0", port });
		const second = startWebUI(moved, two, env);
		expect(second).toEqual({ url: `http://127.0.0.1:${port}/`, reused: false, network: networkUrls("0.0.0.0", port), was: first.url });
		expect(await until(() => !alive(oldPid), 5000)).toBe(true);
		expect(await answers(first.url)).toBe(false);
		expect(await answers(second.url)).toBe(true);
		expect(readWebState(state)).toMatchObject({ port, listen: "0.0.0.0", asked: port, holders: [two, one] });
		expect(webMessage(second).split("\n")[0]).toBe(`Restarted the board's web UI where config.yml now says, since it was running at ${first.url}: ${second.url}`);
		const again = startWebUI(moved, one, env);
		expect(again).toEqual({ url: second.url, reused: true, network: second.network });
		if (again.network.length) expect(webMessage(again).split("\n")[1]).toContain(again.network[0] ?? "");

		// A fixed port another program holds on the same address.
		const blocker = Bun.serve({ hostname: LOOPBACK, port: 0, fetch: () => new Response("someone else") });
		try {
			configure({ listen: "127.0.0.1", port: blocker.port });
			expect(() => startWebUI(moved, one, env)).toThrow(`Port ${blocker.port} is already in use on this machine`);
			expect(existsSync(state)).toBe(false);
		} finally {
			blocker.stop(true);
		}

		// With neither key set, a fresh server on loopback and a free port.
		configure({});
		const back = startWebUI(moved, one, env);
		expect(back.reused).toBe(false);
		expect(back.network).toEqual([]);
		expect(webMessage(back)).toBe(`Started the board's web UI: ${back.url}`);
		const pid = readWebState(state)?.pid ?? 0;
		process.kill(one);
		process.kill(two);
		expect(await until(() => !alive(pid), 5000)).toBe(true);
	}, 30_000);
});
