// Whether a package's node_modules already holds what its bun.lock locks, so
// a build can skip `bun install` and use no network (CF-18).
//
//   bun scripts/installed.ts <package dir>   exits 0 when it does, 1 otherwise
//
// It holds when the lockfile's workspace dependencies are the ones
// package.json names, and every package they need, followed through the
// lockfile, is installed at its locked version where Bun puts it: `a` at
// node_modules/a, and `a/b`, a copy of b that only a needs, at
// node_modules/a/node_modules/b. A package locked for another platform (one
// with `os` or `cpu`), or an optional one, may be absent, along with what
// only it needs.
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

type Entry = [string, string?, { os?: unknown; cpu?: unknown }?, ...unknown[]];
interface Lock {
	workspaces?: Record<string, { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }>;
	packages?: Record<string, Entry>;
}

const same = (a: Record<string, string> = {}, b: Record<string, string> = {}) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());

// The package's name and version from a lockfile entry's "name@version".
function spec(entry: Entry): { name: string; version: string } {
	const at = entry[0].lastIndexOf("@");
	return at > 0 ? { name: entry[0].slice(0, at), version: entry[0].slice(at + 1) } : { name: entry[0], version: "" };
}

export async function installedMatches(packageDir: string): Promise<boolean> {
	const dir = resolve(packageDir);
	if (!existsSync(join(dir, "node_modules")) || !existsSync(join(dir, "bun.lock"))) return false;
	let lock: Lock;
	let pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
	try {
		lock = (await import(join(dir, "bun.lock"), { with: { type: "jsonc" } })).default as Lock;
		pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
	} catch {
		return false;
	}
	const root = lock.workspaces?.[""];
	if (!root || !same(root.dependencies, pkg.dependencies) || !same(root.devDependencies, pkg.devDependencies)) return false;
	const packages = lock.packages ?? {};
	// The key a package's entry sits under, `a/b` for a copy of b only a
	// needs, has its parent's key in front of its name.
	const parentOf = (key: string): string => {
		const { name } = spec(packages[key] as Entry);
		return key.endsWith(`/${name}`) ? key.slice(0, -name.length - 1) : "";
	};
	// Where Bun installs the entry under `key`: its parent's directory, then
	// node_modules/<its name>.
	const where = (key: string): string => {
		const parent = parentOf(key);
		return join(parent && packages[parent] ? where(parent) : dir, "node_modules", spec(packages[key] as Entry).name);
	};
	// The entry `name` resolves to from inside `from`: the nearest copy up
	// its chain of parents, else the top-level one.
	const resolveDep = (from: string, name: string): string | undefined => {
		for (let at = from; at; at = parentOf(at)) if (packages[`${at}/${name}`]) return `${at}/${name}`;
		return packages[name] ? name : undefined;
	};
	// Walk what the workspace needs. A package locked for another platform
	// (one with `os` or `cpu`), or an optional one, may be absent, and then
	// what only it needs is not looked for.
	const seen = new Set<string>();
	const walk = (key: string | undefined, optional: boolean): boolean => {
		if (!key) return optional;
		// Only a package found installed is marked, so one absent as an
		// optional dependency is still looked for where another requires it.
		if (seen.has(key)) return true;
		const entry = packages[key] as Entry;
		const meta = (entry[2] ?? {}) as { os?: unknown; cpu?: unknown; dependencies?: Record<string, string>; optionalDependencies?: Record<string, string> };
		let installed: string | undefined;
		try {
			installed = (JSON.parse(readFileSync(join(where(key), "package.json"), "utf8")) as { version?: string }).version;
		} catch {
			return optional || "os" in meta || "cpu" in meta;
		}
		const { version } = spec(entry);
		if (/^\d/.test(version) && installed !== version) return false;
		seen.add(key);
		return (
			Object.keys(meta.dependencies ?? {}).every((d) => walk(resolveDep(key, d), false)) &&
			Object.keys(meta.optionalDependencies ?? {}).every((d) => walk(resolveDep(key, d), true))
		);
	};
	return Object.keys({ ...root.dependencies, ...root.devDependencies }).every((d) => walk(resolveDep("", d), false));
}

if (import.meta.main) {
	const dir = process.argv[2];
	if (!dir) {
		console.error("usage: bun scripts/installed.ts <package dir>");
		process.exit(2);
	}
	process.exit((await installedMatches(dir)) ? 0 : 1);
}
