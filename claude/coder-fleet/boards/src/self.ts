import { join } from "node:path";

// How this program starts itself again, from source or as the compiled
// `boards` binary. Inside a binary built with `bun build --compile` every
// module's path is under Bun's embedded file system, /$bunfs/, and
// process.execPath is the binary itself, which takes the subcommand as its
// first argument. From source, process.execPath is Bun, which needs cli.ts.

export const COMPILED = import.meta.path.startsWith("/$bunfs/");

export const CLI_PATH = join(import.meta.dir, "cli.ts");

export const PACKAGE_DIR = join(import.meta.dir, "..");

// How to start this program's subcommand `args` as a child with environment
// `env`. The compiled binary loads no bunfig.toml or .env (scripts/build.ts).
// From source, Bun would load both from its cwd, which for a hook is whatever
// repository the human opened, so the child runs from this package's
// directory with .env loading off and is told the caller's directory in
// BOARDS_CALLER_CWD, as boards.sh does; restoreCallerCwd moves back into it.
export function selfCommand(args: string[], env: Record<string, string | undefined>): { argv: string[]; cwd?: string; env: Record<string, string | undefined> } {
	if (COMPILED) return { argv: [process.execPath, ...args], env };
	return { argv: [process.execPath, "--no-env-file", CLI_PATH, ...args], cwd: PACKAGE_DIR, env: { ...env, BOARDS_CALLER_CWD: process.cwd() } };
}

// The first thing a process started by boards.sh or selfCommand does: move
// into the directory it was started for.
export function restoreCallerCwd(): void {
	const dir = process.env.BOARDS_CALLER_CWD;
	if (!dir) return;
	delete process.env.BOARDS_CALLER_CWD;
	process.chdir(dir);
	// The caller's own spelling of it, as a shell keeps PWD after a cd.
	process.env.PWD = dir;
}
