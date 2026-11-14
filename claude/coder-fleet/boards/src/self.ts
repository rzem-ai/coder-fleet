import { join } from "node:path";

// How this program starts itself again, from source or as the compiled
// `boards` binary. Inside a binary built with `bun build --compile` every
// module's path is under Bun's embedded file system, /$bunfs/, and
// process.execPath is the binary itself, which takes the subcommand as its
// first argument. From source, process.execPath is Bun, which needs cli.ts.

export const COMPILED = import.meta.path.startsWith("/$bunfs/");

export const CLI_PATH = join(import.meta.dir, "cli.ts");

// The command line that runs this program's subcommand `args`.
export function selfArgv(args: string[]): string[] {
	return COMPILED ? [process.execPath, ...args] : [process.execPath, CLI_PATH, ...args];
}
