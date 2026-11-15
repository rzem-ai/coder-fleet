import { afterAll, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installPackages } from "../scripts/build.ts";
import { installedMatches } from "../scripts/installed.ts";

// CF-18: the build skips `bun install`, and so the network, only when
// node_modules holds what bun.lock locks.
const root = mkdtempSync(join(tmpdir(), "installed-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const LOCK = `{
  "lockfileVersion": 2,
  "workspaces": {
    "": {
      "name": "fixture",
      "dependencies": { "a": "1.0.0" },
    },
  },
  "packages": {
    "a": ["a@1.0.0", "", { "dependencies": { "b": "^2" }, "optionalDependencies": { "a-wasm": "1.0.0" } }, "sha512-x"],
    "a-wasm": ["a-wasm@1.0.0", "", { "dependencies": { "wasm-rt": "1" }, "cpu": "wasm32" }, "sha512-x"],
    "wasm-rt": ["wasm-rt@1.0.0", "", {}, "sha512-x"],
    "b": ["b@3.0.0", "", {}, "sha512-x"],
    "a/b": ["b@2.0.0", "", {}, "sha512-x"],
  }
}
`;

// a needs g only optionally, b needs it outright, and the workspace needs
// both, in the order `deps` names them.
const sharedLock = (deps: string) => `{
  "lockfileVersion": 2,
  "workspaces": { "": { "name": "fixture", "dependencies": ${deps} } },
  "packages": {
    "a": ["a@1.0.0", "", { "optionalDependencies": { "g": "1.0.0" } }, "sha512-x"],
    "b": ["b@1.0.0", "", { "dependencies": { "g": "1.0.0" } }, "sha512-x"],
    "g": ["g@1.0.0", "", {}, "sha512-x"]
  }
}
`;

function fixture(name: string, installed: Record<string, string>, deps = '{ "a": "1.0.0" }', lock = LOCK): string {
	const dir = join(root, name);
	mkdirSync(dir);
	writeFileSync(join(dir, "bun.lock"), lock);
	writeFileSync(join(dir, "package.json"), `{ "name": "fixture", "dependencies": ${deps} }\n`);
	mkdirSync(join(dir, "node_modules"));
	for (const [path, version] of Object.entries(installed)) {
		mkdirSync(join(dir, path), { recursive: true });
		writeFileSync(join(dir, path, "package.json"), JSON.stringify({ version }));
	}
	return dir;
}

const whole = { "node_modules/a": "1.0.0", "node_modules/a/node_modules/b": "2.0.0" };

describe("installedMatches", () => {
	it("holds when every package the workspace needs is at its locked version, another platform's left out", async () => {
		expect(await installedMatches(fixture("whole", whole))).toBe(true);
	});

	it("fails on a missing or drifted package, a package.json the lockfile does not match, or no node_modules", async () => {
		expect(await installedMatches(fixture("nested-missing", { "node_modules/a": "1.0.0" }))).toBe(false);
		expect(await installedMatches(fixture("drifted", { ...whole, "node_modules/a/node_modules/b": "2.0.1" }))).toBe(false);
		expect(await installedMatches(fixture("deps-changed", whole, '{ "a": "1.0.0", "c": "1.0.0" }'))).toBe(false);
		const none = fixture("none", {});
		rmSync(join(none, "node_modules"), { recursive: true });
		expect(await installedMatches(none)).toBe(false);
	});

	it("still requires a package one dependency needs only optionally and another needs outright, in either order", async () => {
		const both = { "node_modules/a": "1.0.0", "node_modules/b": "1.0.0" };
		for (const deps of ['{ "a": "1.0.0", "b": "1.0.0" }', '{ "b": "1.0.0", "a": "1.0.0" }']) {
			const name = `shared-${deps.indexOf('"a"') < deps.indexOf('"b"') ? "ab" : "ba"}`;
			expect(await installedMatches(fixture(name, both, deps, sharedLock(deps)))).toBe(false);
			expect(await installedMatches(fixture(`${name}-whole`, { ...both, "node_modules/g": "1.0.0" }, deps, sharedLock(deps)))).toBe(true);
		}
	});
});

// CF-18: the build's install step, for this package and web/, runs a frozen,
// scripts-off install where node_modules does not match, and none where it does.
describe("installPackages", () => {
	const pkg = join(import.meta.dir, "..");
	const dirs = [pkg, join(pkg, "web")];
	const record = async (matches: (dir: string) => boolean) => {
		const ran: Array<{ cwd: string; argv: string[] }> = [];
		await installPackages(
			(cwd, argv) => ran.push({ cwd, argv }),
			async (dir) => matches(dir),
		);
		return ran;
	};

	it("installs each package that does not match, frozen and with install scripts off", async () => {
		expect(await record(() => false)).toEqual(dirs.map((cwd) => ({ cwd, argv: ["bun", "install", "--frozen-lockfile", "--ignore-scripts"] })));
		for (const cwd of dirs) {
			expect(await record((dir) => dir !== cwd)).toEqual([{ cwd, argv: ["bun", "install", "--frozen-lockfile", "--ignore-scripts"] }]);
		}
	});

	it("installs nothing when both match", async () => {
		expect(await record(() => true)).toEqual([]);
	});
});
