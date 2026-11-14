import { homedir, tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";

export type Env = Record<string, string | undefined>;

// The directory every board lives under: $XDG_CONFIG_HOME/boards when
// XDG_CONFIG_HOME is set to an absolute path, else ~/.config/boards. The XDG
// spec says a relative value is to be ignored, so it is.
export function boardsRoot(env: Env = process.env): string {
	const xdg = env.XDG_CONFIG_HOME;
	if (xdg && isAbsolute(xdg)) return join(xdg, "boards");
	return join(env.HOME || homedir(), ".config", "boards");
}

// What one board's directory holds. Nothing else is written there, and
// nothing the board writes goes anywhere else, so a repo's checkouts never
// see a file of the board's. Agent memory is not here: it stays in each
// checkout's .claude/agent-memory.
export const LAYOUT = {
	config: "config.yml", // the prefix, the key, and later the project's defaults
	ids: "ids.json", // the highest number handed out, top level and per parent
	events: "events.log", // the append-only event log
	cards: "cards", // one <ID>.md per card
	specs: "specs", // one <issue>.md per spec
	runs: "runs", // run articles
	locks: "locks", // lock files
	testRuns: "test-runs", // test-run logs
} as const;

export type BoardPaths = { [K in keyof typeof LAYOUT]: string } & { dir: string };

export function boardPaths(dir: string): BoardPaths {
	const out = { dir } as BoardPaths;
	for (const [k, v] of Object.entries(LAYOUT)) (out as Record<string, string>)[k] = join(dir, v);
	return out;
}

// Where the hooks keep what lasts no longer than a session or a checkout's
// work: the once-per-session no-board markers, each checkout's focus and each
// agent's binding. It is under the system temporary directory, never in a
// repo or a board's directory.
export function stateRoot(env: Env = process.env): string {
	return join(env.TMPDIR || tmpdir(), `coder-fleet-boards-${process.getuid?.() ?? "user"}`);
}
