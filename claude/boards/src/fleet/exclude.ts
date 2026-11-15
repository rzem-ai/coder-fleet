// Keep the fleet's files out of a project's history (CF-201). Ported from
// scripts/fleet-exclude.py, now a shim onto `boards fleet exclude`, which
// /init and /kickoff run from the project root.
//
// The fleet's agent memory (.claude/agent-memory/coder-fleet-*/), each rule
// file the plugin installs under .claude/rules/ and .claude/coder-fleet.json
// are listed in the common git dir's info/exclude, which every linked
// worktree shares and nothing commits.
//
//   status   one line per tracked group (`tracked <path> <n> file(s)`), one
//            per .gitignore line an earlier /init wrote (`gitignore <line>`),
//            one per entry (`present <entry>` or `missing <entry>`), and last
//            `state: excluded`, `state: needs-migration` or `state: not-excluded`.
//   write    appends every missing entry under one header; refuses, writing
//            nothing, while any of those paths is tracked or an old .gitignore
//            line is there.
//   migrate  from the main checkout only, with nothing else staged: untracks
//            every tracked path with `git rm --cached`, removes the old
//            .gitignore lines, writes the exclude, and commits the removals
//            and the .gitignore change as one commit.
//
// Exit codes: 0 done, 1 refused and nothing changed, 2 usage, 3 a git step
// failed and what this run changed was put back.
import { mkdirSync, readdirSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { envWithout, isFile, pluginRoot, run } from "./proc.ts";

const HEADER = "# coder-fleet: kept out of this project's history";
const FIXED = ["/.claude/agent-memory/coder-fleet-*/"];
const AFTER_RULES = ["/.claude/coder-fleet.json"];
// The lines /init wrote to the root .gitignore before CF-201.
const OLD_GITIGNORE = ["docs/runs/", ".boards/", ".claude/agent-memory/"];
const SUBJECT = "Keep the fleet's memory, rules and config out of this project's history";
const BODY = "They stay on disk and are listed in the common git dir's info/exclude.";

class Refusal extends Error {}
class GitFailed extends Error {}

const SPLIT = /\r\n|[\n\r\v\f\x1c\x1d\x1e\x85\u2028\u2029]/;

function git(cwd: string, args: string[], opts: { input?: string; check?: boolean } = {}) {
	const r = run(["git", "-C", cwd, ...args], { input: opts.input, env: envWithout((k) => k === "GIT_DIR" || k === "GIT_WORK_TREE" || k === "GIT_INDEX_FILE") });
	if (opts.check !== false && !r.ok) throw new GitFailed(`git ${args.join(" ")}: ${(r.stderr || r.stdout).trim()}`);
	return r;
}

function entries(): string[] {
	const rules = join(pluginRoot(), "templates", "rules");
	let names: string[] = [];
	try {
		names = readdirSync(rules)
			.filter((n) => isFile(join(rules, n)))
			.sort();
	} catch {}
	return [...FIXED, ...names.map((n) => `/.claude/rules/${n}`), ...AFTER_RULES];
}

// The pathspecs that find a tracked copy of each entry, from the top level.
function pathspecs(wanted: string[]): string[] {
	return wanted.map((e) => {
		const rel = e.replace(/^\/+/, "").replace(/\/+$/, "");
		return e.endsWith("/") ? `:(top,glob)${rel}/**` : `:(top,literal)${rel}`;
	});
}

// The entry a tracked path falls under, spelled as the path it names.
function groupOf(path: string, wanted: string[]): string {
	if (path.startsWith(".claude/agent-memory/")) return `${path.split("/").slice(0, 3).join("/")}/`;
	for (const e of wanted) {
		const rel = e.replace(/^\/+/, "");
		if (rel.endsWith("/") && path.startsWith(rel)) return rel;
	}
	return path;
}

// A text file as python's text mode reads it, universal newlines and all;
// null when it does not exist.
function readText(path: string): string | null {
	try {
		return readFileSync(path, "utf8").replace(/\r\n?/g, "\n");
	} catch (e) {
		if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
		throw e;
	}
}

function writeText(path: string, text: string): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, text);
}

class Repo {
	top: string;
	main: boolean;
	exclude: string;
	gitignore: string;
	wanted: string[];

	constructor(cwd: string) {
		const p = git(cwd, ["rev-parse", "--path-format=absolute", "--show-toplevel", "--git-dir", "--git-common-dir"], { check: false });
		if (!p.ok) throw new Refusal(`${cwd} is not inside a git repository with a working tree, so there is nothing to exclude`);
		const [top, gitdir, common] = p.stdout.split(SPLIT);
		this.top = top;
		const real = (x: string) => {
			try {
				return realpathSync(x);
			} catch {
				return x;
			}
		};
		this.main = real(gitdir) === real(common);
		this.exclude = join(common, "info", "exclude");
		this.gitignore = join(this.top, ".gitignore");
		this.wanted = entries();
	}

	tracked(): string[] {
		return git(this.top, ["ls-files", "-z", "--", ...pathspecs(this.wanted)])
			.stdout.split("\0")
			.filter(Boolean);
	}

	groups(files: string[]): Array<[string, number]> {
		const counts = new Map<string, number>();
		for (const f of files) {
			const g = groupOf(f, this.wanted);
			counts.set(g, (counts.get(g) ?? 0) + 1);
		}
		return [...counts.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
	}

	oldLines(): string[] {
		const found: string[] = [];
		for (let line of lines(readText(this.gitignore) ?? "")) {
			line = line.replace(/\r+$/, "").trimEnd();
			if (OLD_GITIGNORE.includes(line) && !found.includes(line)) found.push(line);
		}
		return found;
	}

	present(): Set<string> {
		const have = new Set(lines(readText(this.exclude) ?? "").map((l) => l.trim()));
		return new Set(this.wanted.filter((e) => have.has(e) || have.has(e.replace(/^\/+/, ""))));
	}

	// Appends the missing entries; returns [added, present].
	addEntries(): [string[], string[]] {
		const text = readText(this.exclude) ?? "";
		const have = this.present();
		const missing = this.wanted.filter((e) => !have.has(e));
		if (missing.length) {
			const sep = !text || text.endsWith("\n") ? "" : "\n";
			const header = lines(text).includes(HEADER) ? "" : `${HEADER}\n`;
			writeText(this.exclude, text + sep + header + missing.map((e) => `${e}\n`).join(""));
		}
		return [missing, this.wanted.filter((e) => have.has(e))];
	}
}

// python's str.splitlines(), without the ends.
function lines(text: string): string[] {
	if (!text) return [];
	const parts = text.split(SPLIT);
	if (parts.length && parts[parts.length - 1] === "" && SPLIT.test(text.slice(-1))) parts.pop();
	return parts;
}

const say = (s: string) => process.stdout.write(`${s}\n`);

function sayEntries([added, present]: [string[], string[]]): void {
	for (const e of added) say(`added ${e}`);
	for (const e of present) say(`present ${e}`);
}

function status(repo: Repo): number {
	const files = repo.tracked();
	for (const [g, n] of repo.groups(files)) say(`tracked ${g} ${n} file(s)`);
	const old = repo.oldLines();
	for (const line of old) say(`gitignore ${line}`);
	const have = repo.present();
	for (const e of repo.wanted) say(`${have.has(e) ? "present" : "missing"} ${e}`);
	if (files.length || old.length) say("state: needs-migration");
	else if (have.size === repo.wanted.length) say("state: excluded");
	else say("state: not-excluded");
	return 0;
}

function write(repo: Repo): number {
	if (repo.tracked().length || repo.oldLines().length)
		throw new Refusal(
			"the project is half set up: the fleet's files are still tracked, or the .gitignore still has the lines an earlier /init wrote, so nothing was written; run `fleet-exclude.py migrate` once the human agrees to the one commit it makes, then this is done",
		);
	sayEntries(repo.addEntries());
	return 0;
}

function migrate(repo: Repo): number {
	if (!repo.main) throw new Refusal(`${repo.top} is a linked worktree; run migrate from the main checkout, whose branch takes the commit`);
	const files = repo.tracked();
	const old = repo.oldLines();
	if (!files.length && !old.length) {
		sayEntries(repo.addEntries());
		say("nothing to migrate: none of the fleet's files is tracked and the .gitignore has none of the old lines");
		return 0;
	}
	if (!git(repo.top, ["diff", "--cached", "--quiet"], { check: false }).ok)
		throw new Refusal("something else is staged, and the migration commits on its own; commit or unstage it, then run migrate again. Nothing was changed");
	const excludeBefore = readText(repo.exclude);
	const gitignoreBefore = readText(repo.gitignore);
	let added: [string[], string[]];
	try {
		if (files.length) git(repo.top, ["rm", "-r", "--cached", "-q", "--pathspec-from-file=-", "--pathspec-file-nul"], { input: files.map((f) => `${f}\0`).join("") });
		if (old.length) {
			const kept = (gitignoreBefore ?? "").split(/(?<=\n)/).filter((l) => l !== "" && !OLD_GITIGNORE.includes(l.replace(/[\r\n]+$/, "").trimEnd()));
			writeText(repo.gitignore, kept.join(""));
			git(repo.top, ["add", "--", ".gitignore"]);
		}
		added = repo.addEntries();
		git(repo.top, ["commit", "-q", "-m", SUBJECT, "-m", BODY]);
	} catch (e) {
		if (!(e instanceof GitFailed)) throw e;
		git(repo.top, ["reset", "-q", "--", ...files, ...(old.length ? [".gitignore"] : [])], { check: false });
		if (gitignoreBefore !== null) writeText(repo.gitignore, gitignoreBefore);
		if (excludeBefore === null) {
			try {
				unlinkSync(repo.exclude);
			} catch {}
		} else writeText(repo.exclude, excludeBefore);
		throw e;
	}
	for (const [g, n] of repo.groups(files)) say(`untracked ${g} ${n} file(s), kept on disk`);
	for (const line of old) say(`removed .gitignore line ${line}`);
	sayEntries(added);
	const sha = git(repo.top, ["rev-parse", "--short", "HEAD"]).stdout.trim();
	say(`committed ${sha} "${SUBJECT}"`);
	return 0;
}

export function excludeCommand(args: string[]): number {
	const modes: Record<string, (r: Repo) => number> = { status, write, migrate };
	if (args.length !== 1 || !Object.hasOwn(modes, args[0])) {
		process.stderr.write("usage: fleet-exclude.py status|write|migrate\n");
		return 2;
	}
	try {
		return modes[args[0]](new Repo(process.cwd()));
	} catch (e) {
		if (e instanceof Refusal) {
			say(`refused: ${e.message}`);
			return 1;
		}
		if (e instanceof GitFailed) {
			say(`failed, and what this run changed was put back: ${e.message}`);
			return 3;
		}
		throw e;
	}
}
