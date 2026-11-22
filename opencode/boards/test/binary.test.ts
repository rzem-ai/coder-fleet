import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { compile, hostPlatform } from "../scripts/build.ts";
import { boardAt } from "../src/board.ts";
import { createCard, readCard } from "../src/cards.ts";
import { appendEvent, readEvents } from "../src/events.ts";
import { MCP_TOOLS } from "../src/mcp.ts";
import { moveCard } from "../src/moves.ts";
import { selfCommand } from "../src/self.ts";
import { readWebState, webStatePaths } from "../src/web.ts";
import { World } from "./fixtures.ts";

// The portable binary contracts survive the migration: CLI, MCP, embedded
// page, release runner and no project source autoload. Launcher discovery is
// OpenCode's installed bin/ layout, never Claude's versioned plugin cache.
const w = new World("native-binary");
const env = { ...w.env, XDG_STATE_HOME: join(w.root, "state") };
mkdirSync(env.XDG_STATE_HOME);
const repo = w.repo("bin", "https://example.com/o/bin.git");
const bin = join(w.root, "boards");
const dist = join(w.root, "dist");
const PAGE = "<!doctype html><title>stand-in page</title>\n";
const SCRIPT = "console.log('stand-in');\n";
const LAUNCHER = join(import.meta.dir, "..", "..", "coder-fleet", "scripts", "boards.sh");
const sleepers: Array<ReturnType<typeof Bun.spawn>> = [];
const servers: number[] = [];

function run(args: string[], stdin = "", extra: Record<string, string> = {}) {
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
	for (const pid of servers) { try { process.kill(pid); } catch {} }
	for (const sleeper of sleepers) sleeper.kill();
	w.dispose();
});

const board = () => boardAt(join(w.boardsRoot, "BN"));

describe("the native compiled binary", () => {
	it("serves the CLI and MCP tools from one file", async () => {
		expect(run(["new", "Filed from the CLI"])).toMatchObject({ code: 0, out: "BN-1\n" });
		const client = new Client({ name: "binary-test", version: "0" });
		await client.connect(new StdioClientTransport({ command: bin, args: ["mcp"], cwd: repo, env: env as Record<string, string>, stderr: "pipe" }));
		try {
			const { tools } = await client.listTools();
			expect(tools.map((tool) => tool.name)).toEqual(MCP_TOOLS.map((tool) => tool.name));
			const listed = await client.callTool({ name: "card_list", arguments: {} });
			expect(JSON.parse((listed.content as { text: string }[])[0]?.text ?? "")).toEqual([{ id: "BN-1", title: "Filed from the CLI", column: "Draft", parent: null }]);
		} finally { await client.close(); }
	});

	it("starts its embedded web server and serves the page it carries", async () => {
		const holder = Bun.spawn(["sleep", "60"]);
		sleepers.push(holder);
		expect(run(["web"], "", { CLAUDE_PID: String(holder.pid) }).code).toBe(0);
		const state = readWebState(webStatePaths("BN", env).state);
		if (!state) throw new Error("no web state file");
		servers.push(state.pid);
		const ps = Bun.spawnSync(["ps", "-o", "command=", "-p", String(state.pid)], { stdout: "pipe" });
		expect(ps.stdout.toString().trim()).toBe(`${bin} web-server ${board().paths.dir} ${holder.pid}`);
		const base = `http://127.0.0.1:${state.port}`;
		const page = await fetch(`${base}/`);
		expect(page.headers.get("content-type")).toStartWith("text/html");
		expect(await page.text()).toBe(PAGE);
		expect(await (await fetch(`${base}/assets/app.js`)).text()).toBe(SCRIPT);
		expect(await (await fetch(`${base}/cards/BN-1`)).text()).toBe(PAGE);
		expect(await (await fetch(`${base}/..%2F..%2Fetc%2Fpasswd`)).text()).toBe(PAGE);
		expect((await (await fetch(`${base}/api/board`)).json()).prefix).toBe("BN");
	});

	it("runs the release test runner as itself", () => {
		const b = board();
		writeFileSync(b.paths.config, `${readFileSync(b.paths.config, "utf8").trimEnd()}\ntest: "exit 0"\n`);
		const { id } = createCard(b, { title: "Released by the runner" }).card;
		for (const to of ["Backlog", "Done"]) moveCard(b, { card: id, to, source: "web" });
		const commit = w.git(repo, "rev-parse", "HEAD");
		appendEvent(b.paths, { event: "release-started", source: "hook", release: "r1", tag: "v1.0.0", tagObject: "r1", commit, gitDir: join(repo, ".git"), cards: [id], run: "r1" });
		expect(run(["test-runner", b.paths.dir, "r1"])).toMatchObject({ code: 0, err: "" });
		expect(readEvents(b.paths).find((event) => event.event === "test-run" && event.run === "r1")).toMatchObject({ commit, result: "passed", exit: 0 });
		expect(readCard(b, id).card.column).toBe("Released");
	});

	it("parses configuration and native lifecycle JSON without a Python shim", () => {
		const file = join(w.root, "coder-fleet.json");
		writeFileSync(file, '{"disabledAgents": ["Scout"], "phase": "harden"}');
		const parsed = run(["fleet", "config", "parse", file, "lead coder reviewer"]);
		expect(parsed.out.split("\n").slice(0, 4)).toEqual(["ok", "scout", "harden", "ok"]);
		const started = run(["opencode", "session"], JSON.stringify({ sessionID: "native", cwd: repo }));
		expect(started.code).toBe(0);
		expect(JSON.parse(started.out).directory).toBe(board().paths.dir);
		const malformed = run(["opencode", "finish"], JSON.stringify({ sessionID: "child", parentID: "native", agent: "coder", cwd: repo, text: "no handoff" }));
		expect(JSON.parse(malformed.out)).toMatchObject({ valid: false });
		expect(run(["opencode", "nothing"], JSON.stringify({ sessionID: "native", cwd: repo })).code).toBe(1);
	});

	it("runs an installed native binary without Bun and discovers its own roster", () => {
		const plugin = join(w.root, "installed", ".opencode");
		mkdirSync(join(plugin, "scripts"), { recursive: true });
		mkdirSync(join(plugin, "bin"));
		mkdirSync(join(plugin, "agent"));
		writeFileSync(join(plugin, "scripts", "boards.sh"), readFileSync(LAUNCHER));
		writeFileSync(join(plugin, "agent", "coder.md"), "---\ndescription: fixture\n---\n");
		const binary = join(plugin, "bin", `boards-${hostPlatform()}`);
		const launch = (extra: Record<string, string> = {}) => Bun.spawnSync(["/bin/bash", join(plugin, "scripts", "boards.sh"), "fleet", "config", "roster"], { cwd: repo, env: { ...env, PATH: "/usr/bin:/bin", ...extra } as Record<string, string> });
		expect(launch().exitCode).toBe(127);
		writeFileSync(binary, readFileSync(bin), { mode: 0o644 });
		expect(launch().exitCode).toBe(127);
		chmodSync(binary, 0o755);
		expect(launch().stdout.toString()).toBe("coder");
		// An explicit missing override must fail, never run a different build.
		expect(launch({ CODER_FLEET_BOARDS_BIN: join(w.root, "missing") }).exitCode).toBe(127);
		const direct = Bun.spawnSync([binary, "fleet", "config", "roster"], { cwd: repo, env: env as Record<string, string> });
		expect(direct.stdout.toString()).toBe("coder");
	});

	it("uses a checkout build or an explicit override, never source or Claude data", () => {
		const root = join(w.root, "checkout", "opencode");
		const plugin = join(root, "coder-fleet");
		const pkg = join(root, "boards");
		mkdirSync(join(plugin, "scripts"), { recursive: true });
		mkdirSync(join(pkg, "src"), { recursive: true });
		writeFileSync(join(plugin, "scripts", "boards.sh"), readFileSync(LAUNCHER));
		const marker = join(w.root, "source-ran");
		writeFileSync(join(pkg, "src", "cli.ts"), `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran')`);
		const launch = (extra: Record<string, string> = {}) => Bun.spawnSync(["/bin/bash", join(plugin, "scripts", "boards.sh"), "where"], { cwd: repo, env: { ...env, ...extra } as Record<string, string> });
		expect(launch({ CLAUDE_PLUGIN_DATA: join(w.root, "claude-data") }).exitCode).toBe(127);
		expect(existsSync(marker)).toBe(false);
		mkdirSync(join(pkg, "bin"));
		writeFileSync(join(pkg, "bin", `boards-${hostPlatform()}`), "#!/bin/sh\nprintf 'checkout\\n'\n", { mode: 0o755 });
		expect(launch().stdout.toString()).toBe("checkout\n");
		expect(launch({ CODER_FLEET_BOARDS_BIN: bin }).stdout.toString()).toContain("BN");
		expect(existsSync(marker)).toBe(false);
	});

	it("loads no bunfig.toml from the caller's directory", () => {
		const hostile = w.repo("hostile", "https://example.com/o/hostile.git");
		const marker = join(w.root, "preloaded");
		writeFileSync(join(hostile, "evil.ts"), `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "ran");\n`);
		writeFileSync(join(hostile, "bunfig.toml"), 'preload = ["./evil.ts"]\n');
		const starts = [{ argv: [bin, "fleet", "config", "root"], cwd: hostile, env }];
		const here = process.cwd();
		process.chdir(hostile);
		try { starts.push(selfCommand(["fleet", "config", "root"], env) as typeof starts[number]); }
		finally { process.chdir(here); }
		for (const start of starts) {
			const p = Bun.spawnSync(start.argv, { cwd: start.cwd, env: start.env as Record<string, string> });
			expect(p.exitCode).toBe(0);
			expect(realpathSync(p.stdout.toString())).toBe(realpathSync(hostile));
		}
		expect(existsSync(marker)).toBe(false);
	});
});
