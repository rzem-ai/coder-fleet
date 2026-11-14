// What the fleet tools share: running a program, running git with nothing in
// the environment able to point it at another repository, finding the
// plugin the tools belong to, and printing shell assignments for a sourced
// shim to eval.
import { realpathSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { COMPILED } from "../self.ts";

export type Ran = { status: number; stdout: string; stderr: string; ok: boolean };

// Runs `cmd`, never through a shell. A program that cannot start at all
// (not on PATH, not executable) is status 127 with the error as stderr.
export function run(cmd: string[], opts: { cwd?: string; env?: Record<string, string | undefined>; input?: string | Uint8Array } = {}): Ran {
	try {
		const p = Bun.spawnSync(cmd, {
			cwd: opts.cwd,
			env: (opts.env ?? process.env) as Record<string, string>,
			stdin: opts.input === undefined ? "ignore" : typeof opts.input === "string" ? Buffer.from(opts.input) : opts.input,
			stdout: "pipe",
			stderr: "pipe",
		});
		const status = p.exitCode ?? 128 + (p.signalCode ? 1 : 0);
		return { status, stdout: p.stdout.toString(), stderr: p.stderr.toString(), ok: status === 0 };
	} catch (e) {
		return { status: 127, stdout: "", stderr: String((e as Error).message ?? e), ok: false };
	}
}

// fleet-config.sh's _fleet_git: every variable that can redirect discovery or
// set core.worktree is unset, so the caller's environment cannot point git at
// another repository.
const GIT_REDIRECTS = [
	"GIT_DIR",
	"GIT_COMMON_DIR",
	"GIT_WORK_TREE",
	"GIT_CEILING_DIRECTORIES",
	"GIT_CONFIG_PARAMETERS",
	"GIT_CONFIG_COUNT",
	"GIT_CONFIG",
	"GIT_CONFIG_GLOBAL",
	"GIT_CONFIG_SYSTEM",
	"GIT_DISCOVERY_ACROSS_FILESYSTEM",
	"GIT_NAMESPACE",
	"GIT_INDEX_FILE",
	"GIT_OBJECT_DIRECTORY",
];

export function cleanGitEnv(): Record<string, string | undefined> {
	const env = { ...process.env };
	for (const k of GIT_REDIRECTS) delete env[k];
	return env;
}

export function fleetGit(args: string[], cwd?: string): Ran {
	return run(["git", ...args], { cwd, env: cleanGitEnv() });
}

// The environment with only the variables a script's own git helper dropped
// taken out: `drop` names them.
export function envWithout(drop: (k: string) => boolean): Record<string, string | undefined> {
	const env: Record<string, string | undefined> = {};
	for (const [k, v] of Object.entries(process.env)) if (!drop(k)) env[k] = v;
	return env;
}

// `cd dir && pwd -P`: the real path of a directory, or "" when it is not one.
export function realDir(p: string): string {
	try {
		if (!statSync(p).isDirectory()) return "";
		return realpathSync(p);
	} catch {
		return "";
	}
}

export function isDir(p: string): boolean {
	try {
		return statSync(p).isDirectory();
	} catch {
		return false;
	}
}

export function isFile(p: string): boolean {
	try {
		return statSync(p).isFile();
	} catch {
		return false;
	}
}

// The coder-fleet plugin these tools belong to. boards.sh sets
// CODER_FLEET_PLUGIN_ROOT to the plugin it sits in; otherwise it is found from
// this file, or from the binary under <plugin>/boards/bin/.
export function pluginRoot(): string {
	const fromEnv = process.env.CODER_FLEET_PLUGIN_ROOT;
	if (fromEnv) return fromEnv;
	if (COMPILED) return join(dirname(process.execPath), "..", "..");
	return join(import.meta.dir, "..", "..", "..");
}

// Single-quoted for a POSIX shell, so any value, newlines included, survives
// an eval.
export function shq(s: string): string {
	return `'${s.replace(/'/g, `'\\''`)}'`;
}

// NAME='value' lines for a sourced shim to eval.
export function assignments(vars: Record<string, string>): string {
	return Object.entries(vars)
		.map(([k, v]) => `${k}=${shq(v)}\n`)
		.join("");
}

// Is `name` on PATH as an executable, as `command -v` answers it.
export function onPath(name: string): boolean {
	return Bun.which(name) !== null;
}
