import { afterAll, describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { join } from "node:path";
import { createBoard } from "../src/board.ts";
import { readCard } from "../src/cards.ts";
import { cardHistory } from "../src/events.ts";
import { alive } from "../src/lock.ts";
import { LOOPBACK, readWebState, serveWeb, startWebUI, webStatePaths } from "../src/web.ts";
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
const sleepers: Array<ReturnType<typeof Bun.spawn>> = [];
afterAll(() => {
	server.stop(true);
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
		expect(second).toEqual({ url: first.url, reused: true });
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
