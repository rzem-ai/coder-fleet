import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Env } from "../src/paths.ts";

const CLI = join(import.meta.dir, "..", "src", "cli.ts");

// One throwaway world per test file: its own XDG_CONFIG_HOME, HOME, TMPDIR and
// an empty global git config, so nothing reads or writes the human's own
// ~/.config or git settings.
export class World {
	readonly root: string;
	readonly env: Env;

	constructor(name: string) {
		this.root = realpathSync(mkdtempSync(join(tmpdir(), `boards-${name}-`)));
		for (const d of ["config", "home", "tmp"]) mkdirSync(join(this.root, d));
		writeFileSync(join(this.root, "gitconfig"), "");
		this.env = {
			PATH: process.env.PATH,
			XDG_CONFIG_HOME: join(this.root, "config"),
			HOME: join(this.root, "home"),
			TMPDIR: join(this.root, "tmp"),
			GIT_CONFIG_NOSYSTEM: "1",
			GIT_CONFIG_GLOBAL: join(this.root, "gitconfig"),
			GIT_AUTHOR_NAME: "t",
			GIT_AUTHOR_EMAIL: "t@t",
			GIT_COMMITTER_NAME: "t",
			GIT_COMMITTER_EMAIL: "t@t",
		};
	}

	get boardsRoot(): string {
		return join(this.root, "config", "boards");
	}

	git(dir: string, ...args: string[]): string {
		const p = Bun.spawnSync(["git", "-C", dir, ...args], { env: this.env as Record<string, string>, stdout: "pipe", stderr: "pipe" });
		if (p.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${p.stderr.toString()}`);
		return p.stdout.toString().trim();
	}

	// A repo with one commit, and an origin when one is given.
	repo(name: string, origin?: string): string {
		const dir = join(this.root, name);
		mkdirSync(dir, { recursive: true });
		this.git(dir, "init", "-q", "-b", "main");
		writeFileSync(join(dir, "README.md"), "x\n");
		this.git(dir, "add", "README.md");
		this.git(dir, "commit", "-q", "-m", "base");
		if (origin) this.git(dir, "remote", "add", "origin", origin);
		return dir;
	}

	worktree(repo: string, name: string): string {
		const dir = join(this.root, name);
		this.git(repo, "worktree", "add", "-q", dir, "-b", name);
		return dir;
	}

	cli(cwd: string, args: string[], stdin = ""): { code: number; out: string; err: string } {
		const p = Bun.spawnSync(["bun", CLI, ...args], {
			cwd,
			env: this.env as Record<string, string>,
			stdin: new TextEncoder().encode(stdin),
			stdout: "pipe",
			stderr: "pipe",
		});
		return { code: p.exitCode ?? -1, out: p.stdout.toString(), err: p.stderr.toString() };
	}

	dispose(): void {
		rmSync(this.root, { recursive: true, force: true });
	}
}
