import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { compile } from "../scripts/build.ts";
import { boardAt } from "../src/board.ts";
import { createCard, readCard } from "../src/cards.ts";
import { appendEvent, readEvents } from "../src/events.ts";
import { MCP_TOOLS } from "../src/mcp.ts";
import { moveCard } from "../src/moves.ts";
import { selfCommand } from "../src/self.ts";
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

	// CF-1.2: the fleet's tools run from the binary too, which the plugin's
	// shims reach through boards.sh.
	it("runs the fleet's tools as `fleet <tool>`", () => {
		const file = join(w.root, "coder-fleet.json");
		writeFileSync(file, '{"disabledAgents": ["Scout"], "phase": "harden"}');
		const parsed = run(["fleet", "config", "parse", file, "lead coder reviewer"]);
		expect(parsed).toMatchObject({ code: 0, err: "" });
		expect(parsed.out.split("\n").slice(0, 4)).toEqual(["ok", "scout", "harden", "ok"]);
		expect(run(["fleet", "nothing"]).code).toBe(2);
	});

	// CF-1.4: hooks.json runs every board hook as `boards.sh hook <event>`, and
	// at session start boards-binary.sh puts the release build in the
	// plugin's data directory, where boards.sh finds it with no bun on PATH.
	it("runs the board's hooks as `hook <event>`, and boards.sh finds a fetched build", () => {
		const started = run(["hook", "session-start"], JSON.stringify({ session_id: "h", cwd: repo, source: "startup" }));
		expect(started.code).toBe(0);
		expect(started.out).toContain("This repo has a board.");
		const malformed = run(["hook", "subagent-stop"], JSON.stringify({ session_id: "h", agent_id: "a1", agent_type: "coder", agent_transcript_path: "/dev/null", last_assistant_message: "no handoff" }));
		expect(malformed.code).toBe(2);
		expect(malformed.err).toContain("not a valid handoff");
		expect(run(["hook", "nothing"]).code).toBe(1);

		const version = (JSON.parse(readFileSync(join(import.meta.dir, "..", "..", ".claude-plugin", "plugin.json"), "utf8")) as { version: string }).version;
		const data = join(w.root, "plugin-data");
		mkdirSync(join(data, "bin"), { recursive: true });
		writeFileSync(join(data, "bin", `boards-${version}`), readFileSync(bin), { mode: 0o755 });
		const launcher = join(import.meta.dir, "..", "boards.sh");
		const p = Bun.spawnSync(["/bin/bash", launcher, "fleet", "config", "root"], {
			cwd: repo,
			env: { ...env, PATH: "/usr/bin:/bin", CLAUDE_PLUGIN_DATA: data } as Record<string, string>,
			stdout: "pipe",
			stderr: "pipe",
		});
		expect({ code: p.exitCode, err: p.stderr.toString() }).toEqual({ code: 0, err: "" });
		expect(realpathSync(p.stdout.toString())).toBe(realpathSync(repo));
	});

	// A hook runs with its cwd in whatever repository the human opened, so
	// neither the binary, nor boards.sh's source fallback, nor a child the
	// board starts of itself from source may load that cwd's bunfig.toml,
	// which can preload code.
	it("loads no bunfig.toml from the caller's directory", () => {
		const hostile = w.repo("hostile", "https://example.com/o/hostile.git");
		const marker = join(w.root, "preloaded");
		writeFileSync(join(hostile, "evil.ts"), `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "ran");\n`);
		writeFileSync(join(hostile, "bunfig.toml"), 'preload = ["./evil.ts"]\n');
		const launcher = join(import.meta.dir, "..", "boards.sh");
		const starts: Array<{ argv: string[]; cwd?: string; env: Record<string, string | undefined> }> = [
			{ argv: [bin, "fleet", "config", "root"], cwd: hostile, env },
			{ argv: ["/bin/bash", launcher, "fleet", "config", "root"], cwd: hostile, env },
		];
		// A child the board starts of itself from source, as the test gate's
		// runner and the web server are started, from a hook in that repository.
		const here = process.cwd();
		process.chdir(hostile);
		try {
			starts.push(selfCommand(["fleet", "config", "root"], env));
		} finally {
			process.chdir(here);
		}
		for (const s of starts) {
			const p = Bun.spawnSync(s.argv, { cwd: s.cwd, env: s.env as Record<string, string>, stdout: "pipe", stderr: "pipe" });
			expect(p.exitCode).toBe(0);
			expect(realpathSync(p.stdout.toString())).toBe(realpathSync(hostile));
		}
		expect(existsSync(marker)).toBe(false);
	});
});
