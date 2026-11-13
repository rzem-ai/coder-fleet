import { afterAll, describe, expect, it } from "bun:test";
import { mkdirSync, readFileSync, realpathSync, renameSync } from "node:fs";
import { join } from "node:path";
import { createBoard, openBoard, requireBoard } from "../src/board.ts";
import { createCard, listCards } from "../src/cards.ts";
import { readEvents } from "../src/events.ts";
import { normaliseRemote } from "../src/key.ts";
import { resolveBoard } from "../src/resolve.ts";
import { World } from "./fixtures.ts";

const w = new World("keying");
afterAll(() => w.dispose());
const titles = (cwd: string) => listCards(requireBoard(cwd, w.env)).map((c) => c.card.title);
const dirOf = (cwd: string) => resolveBoard(cwd, w.env)?.found?.paths.dir;

// Criterion 3.
describe("a repo's checkouts share one board", () => {
	it("reads and writes the same board from the main checkout, a subdirectory and every linked worktree", () => {
		const repo = w.repo("shared", "git@example.com:o/shared.git");
		const wt1 = w.worktree(repo, "shared-wt1");
		const wt2 = w.worktree(repo, "shared-wt2");
		mkdirSync(join(repo, "deep", "er"), { recursive: true });
		const board = createBoard(wt1, "SH", w.env);
		for (const cwd of [repo, join(repo, "deep", "er"), wt2]) expect(dirOf(cwd)).toBe(board.paths.dir);
		createCard(requireBoard(repo, w.env), { title: "from main" });
		createCard(requireBoard(wt2, w.env), { title: "from wt2" });
		expect(titles(wt1)).toEqual(["from main", "from wt2"]);
		expect(titles(repo)).toEqual(["from main", "from wt2"]);
	});
});

// Criterion 4.
describe("keyed by the origin URL", () => {
	it("normalises every spelling of one remote to one key", () => {
		const spellings = [
			"git@github.com:owner/repo.git",
			"git@github.com:owner/repo",
			"github.com:owner/repo.git",
			"ssh://git@github.com/owner/repo.git",
			"ssh://git@github.com:22/owner/repo",
			"git+ssh://git@github.com/owner/repo.git/",
			"https://github.com/owner/repo.git",
			"https://github.com/owner/repo",
			"https://user:token@GitHub.com/owner/repo/",
			"http://github.com/owner/repo.git",
			"git://github.com/owner/repo.git",
		];
		for (const s of spellings) expect({ s, k: normaliseRemote(s) }).toEqual({ s, k: "github.com/owner/repo" });
		expect(normaliseRemote("https://github.com/owner/other.git")).not.toBe("github.com/owner/repo");
		expect(normaliseRemote("/srv/git/repo.git")).toBe("file:/srv/git/repo.git");
		expect(normaliseRemote("file:///srv/git/repo/.git")).toBe("file:/srv/git/repo");
	});

	it("reaches one board from an SSH clone and an HTTPS clone of the same repo, and records the key", () => {
		const ssh = w.repo("clone-ssh", "git@github.com:owner/same.git");
		const https = w.repo("clone-https", "https://github.com/owner/same");
		const board = createBoard(ssh, "SM", w.env);
		expect(board.config).toMatchObject({ key: "github.com/owner/same", keyKind: "url" });
		createCard(requireBoard(ssh, w.env), { title: "seen by both" });
		expect(dirOf(https)).toBe(board.paths.dir);
		expect(titles(https)).toEqual(["seen by both"]);
	});

	it("keys an ssh alias remote as written, so a clone made through an alias gets its own board", () => {
		// Accepted cost: the board never runs ssh to learn what an alias stands for.
		expect(normaliseRemote("git@github-work:o/r.git")).toBe("github-work/o/r");
		const viaAlias = w.repo("via-alias", "git@github-work:o/alias.git");
		const viaHost = w.repo("via-host", "https://github.com/o/alias");
		expect(resolveBoard(viaAlias, w.env)?.key.value).toBe("github-work/o/alias");
		createBoard(viaHost, "VH", w.env);
		expect(openBoard(viaAlias, w.env)).toBeNull();
	});

	it("reaches the same board after the repo is moved, and from a fresh clone elsewhere", () => {
		const repo = w.repo("mover", "git@github.com:owner/mover.git");
		const dir = createBoard(repo, "MV", w.env).paths.dir;
		const moved = join(w.root, "moved-here");
		renameSync(repo, moved);
		expect(dirOf(moved)).toBe(dir);
		expect(dirOf(w.repo("recloned", "https://github.com/owner/mover.git"))).toBe(dir);
	});
});

// Criterion 5.
describe("a repo with no origin", () => {
	it("is keyed by its shared git directory's absolute path, from every checkout", () => {
		const repo = w.repo("local");
		const wt = w.worktree(repo, "local-wt");
		const board = createBoard(wt, "LO", w.env);
		expect(board.config.keyKind).toBe("path");
		expect(board.config.key).toBe(realpathSync(join(repo, ".git")));
		expect(dirOf(repo)).toBe(board.paths.dir);
	});

	it("keeps its path-keyed board, config unchanged, after it gains an origin, and never logs a re-key", () => {
		const repo = w.repo("gains-remote");
		const wt = w.worktree(repo, "gains-remote-wt");
		const before = createBoard(repo, "GR", w.env);
		createCard(before, { title: "kept" });
		const configBytes = readFileSync(before.paths.config, "utf8");
		w.git(repo, "remote", "add", "origin", "git@github.com:owner/gains.git");

		for (const cwd of [repo, wt, repo]) {
			const res = resolveBoard(cwd, w.env);
			expect(res?.found?.paths.dir).toBe(before.paths.dir);
			expect(res?.key).toEqual({ kind: "path", value: before.config.key });
		}
		expect(readFileSync(before.paths.config, "utf8")).toBe(configBytes);
		expect(openBoard(repo, w.env)?.config).toMatchObject({ keyKind: "path", key: before.config.key, prefix: "GR" });
		expect(titles(wt)).toEqual(["kept"]);
		expect(createCard(requireBoard(wt, w.env), { title: "next" }).card.id).toBe("GR-2");
		expect(readEvents(before.paths).map((e) => e.event)).toEqual(["board-created"]);
		// It still has a board, so no second one can be made for it.
		expect(w.cli(repo, ["init"], "GS\n").err).toContain("already has a board, prefix GR");
		// A separate clone of that remote has no path-keyed board, so it has none.
		expect(openBoard(w.repo("gains-clone", "https://github.com/owner/gains"), w.env)).toBeNull();
	});

	it("uses the URL-keyed board when both keys somehow have one, rewriting neither", () => {
		const urlBoard = createBoard(w.repo("has-url-board", "git@github.com:owner/both.git"), "UB", w.env);
		const repo = w.repo("path-first");
		const pathBoard = createBoard(repo, "PB", w.env);
		const configs = () => [readFileSync(urlBoard.paths.config, "utf8"), readFileSync(pathBoard.paths.config, "utf8")];
		const before = configs();
		w.git(repo, "remote", "add", "origin", "https://github.com/owner/both.git");
		const res = resolveBoard(repo, w.env);
		expect(res?.found?.paths.dir).toBe(urlBoard.paths.dir);
		expect(res?.shadowed).toBe(pathBoard.paths.dir);
		expect(configs()).toEqual(before);
		expect(readEvents(pathBoard.paths).map((e) => e.event)).toEqual(["board-created"]);
	});
});

// Criterion 6.
describe("a fork", () => {
	it("gets its own board with its own prefix, even with an upstream remote naming the original", () => {
		const upstream = w.repo("upstream", "git@github.com:owner/proj.git");
		const fork = w.repo("fork", "git@github.com:forker/proj.git");
		w.git(fork, "remote", "add", "upstream", "git@github.com:owner/proj.git");
		const a = createBoard(upstream, "UP", w.env);
		expect(openBoard(fork, w.env)).toBeNull();
		const b = createBoard(fork, "FK", w.env);
		expect(a.paths.dir).not.toBe(b.paths.dir);
		createCard(a, { title: "upstream only" });
		expect(titles(fork)).toEqual([]);
	});
});
