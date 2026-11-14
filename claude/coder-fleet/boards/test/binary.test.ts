import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { compile } from "../scripts/build.ts";
import { boardAt } from "../src/board.ts";
import { createCard, readCard } from "../src/cards.ts";
import { appendEvent, readEvents } from "../src/events.ts";
import { MCP_TOOLS } from "../src/mcp.ts";
import { moveCard } from "../src/moves.ts";
import { readWebState, webStatePaths } from "../src/web.ts";
import { World } from "./fixtures.ts";

// CF-1.1: the board as one compiled binary. The suite builds it for this
// machine only, carrying a stand-in page, and drives the CLI, the MCP tools,
// the web server and the test gate's runner through it. The four release
// builds are made by scripts/build.ts at release.
const w = new World("binary");
const env = { ...w.env, XDG_STATE_HOME: join(w.root, "state") };
mkdirSync(env.XDG_STATE_HOME);
const repo = w.repo("bin", "https://example.com/o/bin.git");
const bin = join(w.root, "boards");
const dist = join(w.root, "dist");
const PAGE = "<!doctype html><title>stand-in page</title>\n";
const SCRIPT = "console.log('stand-in');\n";
const sleepers: Array<ReturnType<typeof Bun.spawn>> = [];
const servers: number[] = [];

function run(args: string[], stdin = "", extra: Record<string, string> = {}): { code: number; out: string; err: string } {
	const p = Bun.spawnSync([bin, ...args], { cwd: repo, env: { ...env, ...extra } as Record<string, string>, stdin: new TextEncoder().encode(stdin), stdout: "pipe", stderr: "pipe" });
	return { code: p.exitCode ?? -1, out: p.stdout.toString(), err: p.stderr.toString() };
}

beforeAll(async () => {
	mkdirSync(join(dist, "assets"), { recursive: true });
	writeFileSync(join(dist, "index.html"), PAGE);
	writeFileSync(join(dist, "assets", "app.js"), SCRIPT);
	await compile(bin, dist);
	expect(run(["init"], "BN\n").code).toBe(0);
}, 120_000);

afterAll(() => {
	for (const pid of servers) {
		try {
			process.kill(pid);
		} catch {}
	}
	for (const s of sleepers) s.kill();
	w.dispose();
});

const board = () => boardAt(join(w.boardsRoot, "BN"));

describe("the compiled binary", () => {
	it("serves the CLI and the MCP tools from one file", async () => {
		const filed = run(["new", "Filed from the CLI"]);
		expect(filed).toMatchObject({ code: 0, out: "BN-1\n" });

		const client = new Client({ name: "binary-test", version: "0" });
		await client.connect(new StdioClientTransport({ command: bin, args: ["mcp"], cwd: repo, env: env as Record<string, string>, stderr: "pipe" }));
		try {
			const { tools } = await client.listTools();
			expect(tools.map((t) => t.name)).toEqual(MCP_TOOLS.map((t) => t.name));
			const listed = await client.callTool({ name: "card_list", arguments: {} });
			expect(JSON.parse((listed.content as { text: string }[])[0]?.text ?? "")).toEqual([{ id: "BN-1", title: "Filed from the CLI", column: "Draft", parent: null }]);
		} finally {
			await client.close();
		}
	});

	it("starts the web server as itself, serving the page it carries", async () => {
		const holder = Bun.spawn(["sleep", "60"]);
		sleepers.push(holder);
		const web = run(["web"], "", { CLAUDE_PID: String(holder.pid) });
		expect(web.code).toBe(0);
		expect(web.out).not.toContain("not built");
		const state = readWebState(webStatePaths("BN", env).state);
		if (!state) throw new Error("no web state file");
		servers.push(state.pid);
		const ps = Bun.spawnSync(["ps", "-o", "command=", "-p", String(state.pid)], { stdout: "pipe" });
		expect(ps.stdout.toString().trim()).toBe(`${bin} web-server ${board().paths.dir} ${holder.pid}`);

		const base = `http://127.0.0.1:${state.port}`;
		const page = await fetch(`${base}/`);
		expect(page.headers.get("content-type")).toStartWith("text/html");
		expect(await page.text()).toBe(PAGE);
		const script = await fetch(`${base}/assets/app.js`);
		expect(script.headers.get("content-type")).toStartWith("text/javascript");
		expect(await script.text()).toBe(SCRIPT);
		// A route of the page's own, and a path outside the page, get the page.
		expect(await (await fetch(`${base}/cards/BN-1`)).text()).toBe(PAGE);
		expect(await (await fetch(`${base}/..%2F..%2Fetc%2Fpasswd`)).text()).toBe(PAGE);
		expect((await (await fetch(`${base}/api/board`)).json()).prefix).toBe("BN");
	});

	it("runs a release's background test run as itself", () => {
		const b = board();
		writeFileSync(b.paths.config, `${readFileSync(b.paths.config, "utf8").trimEnd()}\ntest: "exit 0"\n`);
		const { id } = createCard(b, { title: "Released by the runner" }).card;
		for (const to of ["Backlog", "Done"]) moveCard(b, { card: id, to, source: "web" });
		const commit = w.git(repo, "rev-parse", "HEAD");
		appendEvent(b.paths, { event: "release-started", source: "hook", release: "r1", tag: "v1.0.0", tagObject: "r1", commit, gitDir: join(repo, ".git"), cards: [id], run: "r1" });

		const ran = run(["test-runner", b.paths.dir, "r1"]);
		expect(ran).toMatchObject({ code: 0, err: "" });
		expect(readEvents(b.paths).find((e) => e.event === "test-run" && e.run === "r1")).toMatchObject({ commit, result: "passed", exit: 0 });
		expect(readCard(b, id).card.column).toBe("Released");
	});
});
