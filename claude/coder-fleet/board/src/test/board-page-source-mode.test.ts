import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { chmodSync, cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// CF-204. On the first session after a plugin update the board MCP server can
// start before the SessionStart hook has fetched the release build, so board.sh
// runs `bun src/cli.ts` in the plugin cache, which has no node_modules. Bun
// installs the runtime imports on the fly, so the task tools answer, but it
// cannot bundle the page: `/` answered 500 and board_serve handed out that URL.
// These run that exact shape - a copy of the board's source with no packages
// anywhere above it, as the MCP server over stdio - and pin what board_serve
// does now: an error with the cause and the fix while the binary is missing,
// and a working page served by the binary once it has arrived.

const BOARD_DIR = resolve(import.meta.dir, "..", "..");

let work: string;
let pluginBoard: string;
let project: string;

beforeAll(() => {
	work = mkdtempSync(join(tmpdir(), "board-page-source-"));
	pluginBoard = join(work, "plugin", "board");
	mkdirSync(pluginBoard, { recursive: true });
	for (const entry of ["src", "package.json", "bunfig.toml", "tsconfig.json", "bun.lock"]) {
		cpSync(join(BOARD_DIR, entry), join(pluginBoard, entry), { recursive: true });
	}
	project = join(work, "project");
	mkdirSync(join(project, ".boards", "tasks"), { recursive: true });
	writeFileSync(join(project, ".boards", "config.yml"), 'project_name: "page"\nstatuses: ["To Do", "Done"]\n');
});

afterAll(() => {
	rmSync(work, { recursive: true, force: true });
});

/** The board MCP server as board.sh starts it in source mode, with `binary` as where the release build lands. */
async function sourceModeServer(binary: string): Promise<Client> {
	const env: Record<string, string> = {};
	for (const [key, value] of Object.entries(process.env)) if (value !== undefined) env[key] = value;
	delete env.CODER_FLEET_BOARD_PORT;
	env.CODER_FLEET_BOARD_ROOT = project;
	env.CODER_FLEET_BOARD_BINARY = binary;
	const transport = new StdioClientTransport({
		command: process.execPath,
		args: [join(pluginBoard, "src", "cli.ts"), "mcp"],
		cwd: project,
		env,
		stderr: "ignore",
	});
	const client = new Client({ name: "cf-204", version: "0.0.0" });
	await client.connect(transport);
	return client;
}

function text(result: Awaited<ReturnType<Client["callTool"]>>): string {
	const first = (result.content as { type: string; text?: string }[])[0];
	return first?.text ?? "";
}

describe("board_serve from source without packages", () => {
	it("returns the cause and the fix, not a URL, while the binary is missing", async () => {
		const client = await sourceModeServer(join(work, "data", "bin", "board-9.9.9"));
		try {
			const result = await client.callTool({ name: "board_serve", arguments: {} }, undefined, { timeout: 120_000 });
			expect(result.isError).toBe(true);
			const message = text(result);
			// Any 5xx: Bun answers 500 for a page it cannot bundle locally, and 502 through the socket forwarder on CI's runner.
			expect(message).toMatch(/answered 5\d\d /);
			expect(message).toContain("not installed yet");
			expect(message).toContain("reconnect the board MCP server");
			const status = await client.callTool({ name: "board_url", arguments: {} });
			expect(JSON.parse(text(status)).running).toBe(false);
		} finally {
			await client.close();
		}
	}, 180_000);

	it("serves a working page from the binary once it has arrived", async () => {
		// The release build stands in as a launcher for the board's own source,
		// which has its packages.
		const binDir = join(work, "data", "bin");
		mkdirSync(binDir, { recursive: true });
		const binary = join(binDir, "board-9.9.10");
		writeFileSync(binary, `#!/bin/sh\nexec "${process.execPath}" "${join(BOARD_DIR, "src", "cli.ts")}" "$@"\n`);
		chmodSync(binary, 0o755);
		const client = await sourceModeServer(binary);
		try {
			const result = await client.callTool({ name: "board_serve", arguments: {} }, undefined, { timeout: 120_000 });
			expect(result.isError).toBeFalsy();
			const status = JSON.parse(text(result));
			expect(status.running).toBe(true);
			const page = await fetch(`${status.url}/`);
			await page.text();
			expect(page.status).toBe(200);
			const again = JSON.parse(text(await client.callTool({ name: "board_serve", arguments: {} })));
			expect(again.url).toBe(status.url);
			const stopped = JSON.parse(text(await client.callTool({ name: "board_stop", arguments: {} })));
			expect(stopped.stopped).toBe(status.url);
			await expect(fetch(`${status.url}/`)).rejects.toThrow();
		} finally {
			await client.close();
		}
	}, 180_000);
});
