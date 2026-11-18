// The web UI's dev page: a seeded, throwaway sandbox board, the board's web
// server run from source on a known loopback port, and Vite with hot reload
// proxying /api to it.
//
//   bun run dev [--reseed] [--port <vite port>] [--api-port <server port>]     (in web/)
//
// The sandbox lives in one private directory, coder-fleet/boards-web-dev under
// the user's cache directory ($XDG_CACHE_HOME, else ~/.cache), never in a
// shared temp directory another user could plant first. It is made 0700, and
// one that exists is reused only when it is a real directory, not a symlink,
// owned by this user, with mode 0700. It holds its own XDG_CONFIG_HOME,
// XDG_STATE_HOME, HOME and an empty git config, and this process runs with
// those set, so nothing here reads or writes the human's own ~/.config/boards
// or state directory. The server runs inside this process, so stopping it
// (Ctrl-C, or SIGTERM) stops the server. A sandbox that exists is reused,
// edits and all; --reseed throws it away first.
import { chmodSync, existsSync, lstatSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, sep } from "node:path";
import { createBoard, requireBoard } from "../src/board.ts";
import { boardsRoot, stateRoot } from "../src/paths.ts";
import { LOOPBACK, serveWeb } from "../src/web.ts";
import { seedBoard } from "./web-dev-seed.ts";

const WEB = join(import.meta.dir, "..", "web");
const PREFIX = "DEV";

function flag(name: string, fallback: number): number {
	const i = process.argv.indexOf(name);
	if (i < 0) return fallback;
	const n = Number(process.argv[i + 1]);
	if (!Number.isInteger(n) || n < 1 || n > 65535) {
		console.error(`${name} needs a port number`);
		process.exit(2);
	}
	return n;
}

function run(cmd: string[], cwd: string, env: Record<string, string>): void {
	const p = Bun.spawnSync(cmd, { cwd, env, stdout: "pipe", stderr: "pipe" });
	if (p.exitCode !== 0) throw new Error(`${cmd.join(" ")}: ${p.stderr.toString()}`);
}

const original = { ...process.env } as Record<string, string>;
const reseed = process.argv.includes("--reseed");
const vitePort = flag("--port", 5173);
const apiPort = flag("--api-port", 4577);

// The human's own boards and state directories, from the environment as it came.
const realBoards = boardsRoot(original);
const realState = stateRoot(original);

const cache = original.XDG_CACHE_HOME && isAbsolute(original.XDG_CACHE_HOME) ? original.XDG_CACHE_HOME : join(original.HOME || homedir(), ".cache");
const root = join(cache, "coder-fleet", "boards-web-dev");

// Refuses unless `dir` is a real directory (not a symlink) this user owns with
// mode 0700, so a directory someone else planted is never used.
function assertPrivate(dir: string): void {
	const st = lstatSync(dir);
	if (!st.isDirectory() || st.uid !== process.getuid?.() || (st.mode & 0o777) !== 0o700) {
		console.error(`${dir} is not a private directory of yours (a real directory, not a symlink, owned by you, mode 0700), so the dev page will not use it. Remove or fix it and run again.`);
		process.exit(1);
	}
}

// Makes `dir` 0700 when it is new, then checks it either way.
function privateDir(dir: string): void {
	if (!existsSync(dir)) {
		mkdirSync(dirname(dir), { recursive: true });
		mkdirSync(dir, { mode: 0o700 });
		chmodSync(dir, 0o700);
	}
	assertPrivate(dir);
}

for (const real of [realBoards, realState]) {
	if (root === real || root.startsWith(real + sep) || real.startsWith(root + sep)) {
		console.error(`The sandbox ${root} overlaps ${real}; refusing to go on`);
		process.exit(1);
	}
}
privateDir(join(cache, "coder-fleet"));
privateDir(root);
const env: Record<string, string> = {
	PATH: process.env.PATH ?? "",
	HOME: join(root, "home"),
	XDG_CONFIG_HOME: join(root, "config"),
	XDG_STATE_HOME: join(root, "state"),
	TMPDIR: join(root, "tmp"),
	GIT_CONFIG_NOSYSTEM: "1",
	GIT_CONFIG_GLOBAL: join(root, "gitconfig"),
	GIT_AUTHOR_NAME: "sandbox",
	GIT_AUTHOR_EMAIL: "sandbox@example.com",
	GIT_COMMITTER_NAME: "sandbox",
	GIT_COMMITTER_EMAIL: "sandbox@example.com",
};

// Everything below runs in the sandbox's environment, never the human's.
Object.assign(process.env, env);
if (boardsRoot(process.env) !== join(root, "config", "boards") || stateRoot(process.env) !== join(root, "state", "coder-fleet-boards")) {
	throw new Error("The sandbox environment did not take; refusing to go on");
}

const repo = join(root, "repo");
const fresh = reseed || !existsSync(join(boardsRoot(env), PREFIX, "config.yml"));
if (fresh) {
	// What is inside the private directory checked above, and nothing outside it.
	for (const name of readdirSync(root)) rmSync(join(root, name), { recursive: true, force: true });
	for (const d of ["config", "home", "state", "tmp", "repo"]) mkdirSync(join(root, d), { recursive: true });
	writeFileSync(join(root, "gitconfig"), "");
	run(["git", "-C", repo, "init", "-q", "-b", "main"], root, env);
	writeFileSync(join(repo, "README.md"), "The sandbox repo for the board's web UI dev page.\n");
	run(["git", "-C", repo, "add", "README.md"], root, env);
	run(["git", "-C", repo, "commit", "-q", "-m", "base"], root, env);
	run(["git", "-C", repo, "remote", "add", "origin", "git@example.com:sandbox/web-dev.git"], root, env);
	seedBoard(createBoard(repo, PREFIX, env));
}
const board = requireBoard(repo, env);

let server: ReturnType<typeof serveWeb>;
try {
	server = serveWeb(board, apiPort);
} catch (e) {
	console.error(`The sandbox server could not listen on ${LOOPBACK}:${apiPort}: ${(e as Error).message}\nPass --api-port <port> to use another.`);
	process.exit(1);
}
const api = `http://${LOOPBACK}:${server.port}`;

// Vite gets the human's own environment, and the sandbox server's address.
const vite = Bun.spawn(["bun", "--bun", "vite", "--host", LOOPBACK, "--port", String(vitePort), "--strictPort"], {
	cwd: WEB,
	env: { ...original, BOARDS_WEB_DEV_API: api },
	stdin: "inherit",
	stdout: "inherit",
	stderr: "inherit",
});

console.log(`\nSandbox board ${PREFIX} (${fresh ? "seeded" : "reused; pass --reseed to start fresh"}) in ${root}`);
console.log(`Its server: ${api}/ (API only)`);
console.log(`Open http://${LOOPBACK}:${vitePort}/\n`);

let stopping = false;
function stop(code: number): void {
	if (stopping) return;
	stopping = true;
	vite.kill();
	server.stop(true);
	process.exit(code);
}
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"] as const) process.on(sig, () => stop(0));
void vite.exited.then((code) => stop(code));
