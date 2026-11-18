import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
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

// CF-1.1: the board as one compiled binary. The suite builds it for this
// machine only, carrying a stand-in page, and drives the CLI, the MCP tools,
// the web server and the test gate's runner through it. The three release
// builds are made by scripts/build.ts at release.
const w = new World("binary");
const env = { ...w.env, XDG_STATE_HOME: join(w.root, "state") };
mkdirSync(env.XDG_STATE_HOME);
const repo = w.repo("bin", "https://example.com/o/bin.git");
const bin = join(w.root, "boards");
const dist = join(w.root, "dist");
const PAGE = "<!doctype html><title>stand-in page</title>\n";
const SCRIPT = "console.log('stand-in');\n";
// The plugin beside this package in a checkout, and its launcher.
const PLUGIN = join(import.meta.dir, "..", "..", "coder-fleet");
const PLUGIN_JSON = join(PLUGIN, ".claude-plugin", "plugin.json");
const LAUNCHER = join(PLUGIN, "scripts", "boards.sh");
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

		const version = (JSON.parse(readFileSync(PLUGIN_JSON, "utf8")) as { version: string }).version;
		const data = join(w.root, "plugin-data");
		mkdirSync(join(data, "bin"), { recursive: true });
		writeFileSync(join(data, "bin", `boards-${version}`), readFileSync(bin), { mode: 0o755 });
		const launcher = LAUNCHER;
		const p = Bun.spawnSync(["/bin/bash", launcher, "fleet", "config", "root"], {
			cwd: repo,
			env: { ...env, PATH: "/usr/bin:/bin", CLAUDE_PLUGIN_DATA: data } as Record<string, string>,
			stdout: "pipe",
			stderr: "pipe",
		});
		expect({ code: p.exitCode, err: p.stderr.toString() }).toEqual({ code: 0, err: "" });
		expect(realpathSync(p.stdout.toString())).toBe(realpathSync(repo));
	});

	// CF-13: an install carries the launcher and no boards package, so it runs
	// the release build for its version or exits 127 with one line, and never
	// falls back to source, even with Bun on PATH.
	it("runs only the release build in an install, and exits 127 without one", () => {
		const plugin = join(w.root, "install", "coder-fleet");
		mkdirSync(join(plugin, "scripts"), { recursive: true });
		mkdirSync(join(plugin, ".claude-plugin"), { recursive: true });
		writeFileSync(join(plugin, "scripts", "boards.sh"), readFileSync(LAUNCHER));
		writeFileSync(join(plugin, ".claude-plugin", "plugin.json"), '{\n  "name": "coder-fleet",\n  "version": "9.9.9"\n}\n');
		const data = join(w.root, "install-data");
		const launch = () =>
			Bun.spawnSync(["/bin/bash", join(plugin, "scripts", "boards.sh"), "fleet", "config", "root"], {
				cwd: repo,
				env: { ...env, CLAUDE_PLUGIN_DATA: data } as Record<string, string>,
				stdout: "pipe",
				stderr: "pipe",
			});
		const missing = launch();
		expect(missing.exitCode).toBe(127);
		expect(missing.stdout.toString()).toBe("");
		expect(missing.stderr.toString()).toBe(`boards: no release binary at ${data}/bin/boards-9.9.9 for this plugin\n`);

		mkdirSync(join(data, "bin"), { recursive: true });
		writeFileSync(join(data, "bin", "boards-9.9.9"), readFileSync(bin), { mode: 0o755 });
		const found = launch();
		expect({ code: found.exitCode, err: found.stderr.toString() }).toEqual({ code: 0, err: "" });
		expect(realpathSync(found.stdout.toString())).toBe(realpathSync(repo));
	});

	// CF-13: run from the human's own terminal nothing sets CLAUDE_PLUGIN_DATA,
	// so the launcher maps its install path, plugins/cache/<marketplace>/
	// coder-fleet/<version>/, to plugins/data/coder-fleet-<marketplace>/ and
	// runs the release build there; CLAUDE_PLUGIN_DATA still wins when set.
	it("finds the release build from its install path when CLAUDE_PLUGIN_DATA is unset", () => {
		const plugins = join(w.root, "terminal", "plugins");
		const plugin = join(plugins, "cache", "rzem", "coder-fleet", "9.9.8");
		mkdirSync(join(plugin, "scripts"), { recursive: true });
		mkdirSync(join(plugin, ".claude-plugin"), { recursive: true });
		writeFileSync(join(plugin, "scripts", "boards.sh"), readFileSync(LAUNCHER));
		writeFileSync(join(plugin, ".claude-plugin", "plugin.json"), '{\n  "name": "coder-fleet",\n  "version": "9.9.8"\n}\n');
		const stub = (dir: string, name: string) => {
			mkdirSync(join(dir, "bin"), { recursive: true });
			writeFileSync(join(dir, "bin", "boards-9.9.8"), `#!/bin/sh\nprintf '%s\\n' ${name} "$CODER_FLEET_PLUGIN_ROOT" "$@"\n`, { mode: 0o755 });
		};
		// The World's env is an allowlist, so CLAUDE_PLUGIN_DATA is unset unless a case sets it.
		const launch = (at: string, args: string[], extra: Record<string, string> = {}) =>
			Bun.spawnSync(["/bin/bash", join(at, "scripts", "boards.sh"), ...args], { cwd: repo, env: { ...env, ...extra } as Record<string, string>, stdout: "pipe", stderr: "pipe" });
		const result = (p: ReturnType<typeof launch>) => ({ code: p.exitCode, out: p.stdout.toString(), err: p.stderr.toString() });
		const data = join(plugins, "data", "coder-fleet-rzem");

		expect(result(launch(plugin, ["init"]))).toEqual({ code: 127, out: "", err: `boards: no release binary at ${data}/bin/boards-9.9.8 for this plugin\n` });

		stub(data, "derived");
		for (const args of [["init"], ["web", "--port", "a b"]]) {
			expect(result(launch(plugin, args))).toEqual({ code: 0, out: ["derived", plugin, ...args, ""].join("\n"), err: "" });
		}

		const set = join(w.root, "terminal", "set-data");
		stub(set, "set");
		expect(result(launch(plugin, ["init"], { CLAUDE_PLUGIN_DATA: set }))).toEqual({ code: 0, out: ["set", plugin, "init", ""].join("\n"), err: "" });

		// Anywhere but plugins/cache there is no data directory to work out.
		const elsewhere = join(w.root, "terminal", "elsewhere", "coder-fleet");
		mkdirSync(join(elsewhere, "scripts"), { recursive: true });
		writeFileSync(join(elsewhere, "scripts", "boards.sh"), readFileSync(LAUNCHER));
		expect(result(launch(elsewhere, ["init"]))).toEqual({ code: 127, out: "", err: `boards: no CLAUDE_PLUGIN_DATA, and ${elsewhere} is not a plugins/cache install, so there is nowhere to find the release binary\n` });
	});

	// CF-18: in a checkout the launcher runs claude/boards/bin's build and
	// never Bun on the source, even with the source there and Bun on PATH; with
	// no build it exits 127 with one line naming how to make one.
	it("never runs bun on the source in a checkout, and runs the build there when built", () => {
		const root = join(w.root, "checkout", "claude");
		const plugin = join(root, "coder-fleet");
		const pkg = join(root, "boards");
		mkdirSync(join(plugin, "scripts"), { recursive: true });
		mkdirSync(join(plugin, ".claude-plugin"), { recursive: true });
		mkdirSync(join(pkg, "src"), { recursive: true });
		mkdirSync(join(pkg, "scripts"), { recursive: true });
		writeFileSync(join(plugin, "scripts", "boards.sh"), readFileSync(LAUNCHER));
		writeFileSync(join(plugin, ".claude-plugin", "plugin.json"), '{\n  "name": "coder-fleet",\n  "version": "9.9.7"\n}\n');
		const ran = join(w.root, "checkout", "ran");
		for (const f of ["main.ts", "cli.ts"]) writeFileSync(join(pkg, "src", f), `require("node:fs").writeFileSync(${JSON.stringify(ran)}, "source");\n`);
		writeFileSync(join(pkg, "scripts", "build.ts"), "");
		// A bun on PATH that says it was started.
		const fakeBin = join(w.root, "checkout", "path");
		mkdirSync(fakeBin);
		writeFileSync(join(fakeBin, "bun"), `#!/bin/sh\nprintf bun > ${JSON.stringify(ran)}\n`, { mode: 0o755 });
		const data = join(w.root, "checkout", "data");
		mkdirSync(data);
		const launch = () => {
			const p = Bun.spawnSync(["/bin/bash", join(plugin, "scripts", "boards.sh"), "fleet", "config", "root"], {
				cwd: repo,
				env: { ...env, PATH: `${fakeBin}:${env.PATH ?? "/usr/bin:/bin"}`, CLAUDE_PLUGIN_DATA: data } as Record<string, string>,
				stdout: "pipe",
				stderr: "pipe",
			});
			return { code: p.exitCode, out: p.stdout.toString(), err: p.stderr.toString() };
		};
		const platform = hostPlatform();
		expect(launch()).toEqual({ code: 127, out: "", err: `boards: no build at ${pkg}/bin/boards-${platform}; run \`bun run build\` in ${pkg} to make one\n` });
		expect(existsSync(ran)).toBe(false);

		mkdirSync(join(pkg, "bin"));
		const built = join(pkg, "bin", `boards-${platform}`);
		writeFileSync(built, `#!/bin/sh\nprintf '%s\\n' built "$CODER_FLEET_PLUGIN_ROOT" "$@"\n`, { mode: 0o644 });
		expect(launch()).toEqual({ code: 127, out: "", err: `boards: the build at ${built} is not executable; run \`bun run build\` in ${pkg} to remake it\n` });
		chmodSync(built, 0o755);
		expect(launch()).toEqual({ code: 0, out: ["built", plugin, "fleet", "config", "root", ""].join("\n"), err: "" });
		expect(existsSync(ran)).toBe(false);
	});

	// CF-18: a checkout's own build comes before the release build, and the
	// release build still runs in a checkout that has none of its own.
	it("prefers the checkout's build to the release build, and falls back to the release build", () => {
		const root = join(w.root, "order", "claude");
		const plugin = join(root, "coder-fleet");
		const pkg = join(root, "boards");
		mkdirSync(join(plugin, "scripts"), { recursive: true });
		mkdirSync(join(plugin, ".claude-plugin"), { recursive: true });
		mkdirSync(join(pkg, "scripts"), { recursive: true });
		mkdirSync(join(pkg, "bin"));
		writeFileSync(join(plugin, "scripts", "boards.sh"), readFileSync(LAUNCHER));
		writeFileSync(join(plugin, ".claude-plugin", "plugin.json"), '{\n  "name": "coder-fleet",\n  "version": "9.9.6"\n}\n');
		writeFileSync(join(pkg, "scripts", "build.ts"), "");
		const data = join(w.root, "order", "data");
		mkdirSync(join(data, "bin"), { recursive: true });
		const stub = (file: string, name: string) => writeFileSync(file, `#!/bin/sh\nprintf '%s\\n' ${name} "$@"\n`, { mode: 0o755 });
		const local = join(pkg, "bin", `boards-${hostPlatform()}`);
		stub(local, "local");
		stub(join(data, "bin", "boards-9.9.6"), "release");
		const launch = () => {
			const p = Bun.spawnSync(["/bin/bash", join(plugin, "scripts", "boards.sh"), "where"], { cwd: repo, env: { ...env, CLAUDE_PLUGIN_DATA: data } as Record<string, string>, stdout: "pipe", stderr: "pipe" });
			return { code: p.exitCode, out: p.stdout.toString(), err: p.stderr.toString() };
		};
		expect(launch()).toEqual({ code: 0, out: "local\nwhere\n", err: "" });
		rmSync(local);
		expect(launch()).toEqual({ code: 0, out: "release\nwhere\n", err: "" });
	});

	// A hook runs with its cwd in whatever repository the human opened, so
	// neither the binary nor a child the board starts of itself from source
	// may load that cwd's bunfig.toml, which can preload code.
	it("loads no bunfig.toml from the caller's directory", () => {
		const hostile = w.repo("hostile", "https://example.com/o/hostile.git");
		const marker = join(w.root, "preloaded");
		writeFileSync(join(hostile, "evil.ts"), `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "ran");\n`);
		writeFileSync(join(hostile, "bunfig.toml"), 'preload = ["./evil.ts"]\n');
		const starts: Array<{ argv: string[]; cwd?: string; env: Record<string, string | undefined> }> = [{ argv: [bin, "fleet", "config", "root"], cwd: hostile, env }];
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
