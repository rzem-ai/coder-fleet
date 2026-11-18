// `boards fleet fast-forward`: SessionStart, bring the main checkout's default
// branch level with its remote by fast-forward alone, and tell the session
// what happened. Ported from hooks/main-fast-forward.sh, now a shim that pipes
// the hook's input here.
//
// Agent worktrees are cut from the main checkout, so a default branch left
// behind its remote has every new item built on old code. The lead brings it
// level after each merge; this covers the session start.
//
// Where it acts: only in a main checkout, and not on a compaction. Which
// remote: origin, or the only one. Which branch: the trunk config.ts resolves
// (baseBranch, else the remote's HEAD, else main); a baseBranch it cannot use
// moves nothing. A remote or branch name outside letters, digits, '.', '_',
// '/' and '-', or starting with '-', is never handed to git.
//
// What it fetches from: only https, ssh and git remotes and the scp-like
// form, and git is held to the same list with protocol.allow. Nothing is
// fetched when the repository's own config sets a key that can run a command
// (remote-guard.ts holds the list), when it borrows objects through
// alternates, or when legacy remote files could redirect the fetch. The
// repository's hooks and fsmonitor never run.
//
// What the session is told: only text this file wrote and names that passed
// the check above. git's own words go to the hook log, with the userinfo of
// any URL cut out.
//
// What it does: one fetch of the default branch, bounded at
// CODER_FLEET_FETCH_TIMEOUT seconds (5), in its own process group so the
// watchdog takes ssh and any helper with it. Then, when the local branch is
// strictly behind: git merge --ff-only where it is checked out here, nothing
// where a linked worktree has it out or a rebase or bisect holds it, and
// git update-ref old to new where nothing has it out. It never resets,
// stashes, rebases, merges with a commit or forces.
//
// What it prints: one line of SessionStart additionalContext when it moved the
// branch or could not, and nothing when the branch was level or ahead, unless
// baseBranch named it. A second line says which branch is out when baseBranch
// is set and the main checkout is not on it. Each line goes to the hook log.
// It never fails the session: any error is logged and the session goes on.
//
// Knobs: CODER_FLEET_FAST_FORWARD=off does nothing; CODER_FLEET_FETCH_TIMEOUT
// is the fetch's bound in seconds.
import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { trunk } from "./config.ts";
import { hookLog, obj, readInput } from "./hook.ts";
import { run, type Ran } from "./proc.ts";
import { allowedKey, legacyRemoteFiles, redact, urlKind } from "./remote-guard.ts";

const HOOK = "FastForward";

function logFile(): string {
	const env = process.env;
	if (env.BOARD_LOG_FILE) return env.BOARD_LOG_FILE;
	const state = env.CODER_FLEET_STATE_DIR || `${env.XDG_STATE_HOME || `${env.HOME ?? ""}/.local/state`}/coder-fleet`;
	return `${state}/log/hooks.log`;
}

const log = (m: string) => hookLog(HOOK, m, logFile());

class Stop extends Error {}

// A name may reach the session only when it is made of letters, digits, '.',
// '_', '/' and '-' and does not start with '-'.
const safe = (s: string) => s !== "" && !s.startsWith("-") && /^[A-Za-z0-9._/-]+$/.test(s);
const plural = (n: string) => (n === "1" ? "1 commit" : `${n} commits`);
const chomp = (s: string) => s.replace(/\n+$/, "");
const clean = (s: string) => s.replace(/[\x00-\x1f]/g, "");

function gitEnv(): Record<string, string | undefined> {
	const env: Record<string, string | undefined> = { ...process.env };
	for (const k of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR", "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES"]) delete env[k];
	// Credentials are never asked for.
	Object.assign(env, { GIT_TERMINAL_PROMPT: "0", GIT_ASKPASS: "", SSH_ASKPASS: "", SSH_ASKPASS_REQUIRE: "never", GCM_INTERACTIVE: "never" });
	return env;
}

// Every git call on the repository runs without its own hooks, fsmonitor,
// alternate-refs command, submodule recursion, maintenance or autostash, held
// to the fetchable protocols, in English.
const G_CONFIG = [
	"-c", "core.hooksPath=/dev/null", "-c", "core.fsmonitor=false", "-c", "core.alternateRefsCommand=",
	"-c", "submodule.recurse=false", "-c", "gc.auto=0", "-c", "maintenance.auto=false", "-c", "merge.autoStash=false",
	"-c", "protocol.allow=never", "-c", "protocol.https.allow=always", "-c", "protocol.ssh.allow=always",
	"-c", "protocol.git.allow=always", "-c", "protocol.ext.allow=never", "-c", "protocol.file.allow=never",
];

// The fetch, bounded: SIGTERM to its process group when the time is up, then
// SIGKILL a second later. Resolves to git's exit status (128 + the signal
// when killed) and its stderr.
function boundedFetch(args: string[], env: Record<string, string | undefined>, limit: number): Promise<{ rc: number; err: string }> {
	return new Promise((resolve) => {
		let err = "";
		let child: ReturnType<typeof spawn>;
		try {
			child = spawn("git", args, { detached: true, env: env as NodeJS.ProcessEnv, stdio: ["ignore", "ignore", "pipe"] });
		} catch (e) {
			resolve({ rc: 127, err: String((e as Error).message ?? e) });
			return;
		}
		const group = (sig: NodeJS.Signals) => {
			try {
				if (child.pid) process.kill(-child.pid, sig);
			} catch {}
		};
		let kill: ReturnType<typeof setTimeout> | undefined;
		const dog = setTimeout(() => {
			group("SIGTERM");
			kill = setTimeout(() => group("SIGKILL"), 1000);
		}, limit * 1000);
		child.stderr?.on("data", (d) => {
			err += d.toString();
		});
		child.on("error", (e) => {
			clearTimeout(dog);
			if (kill) clearTimeout(kill);
			resolve({ rc: 127, err: String(e.message ?? e) });
		});
		child.on("exit", (code, signal) => {
			clearTimeout(dog);
			if (kill) clearTimeout(kill);
			group("SIGKILL");
			const signals: Record<string, number> = { SIGHUP: 1, SIGINT: 2, SIGKILL: 9, SIGTERM: 15 };
			const rc = code ?? 128 + (signal ? (signals[signal] ?? 15) : 15);
			// stderr closes once every writer is gone; wait for it, briefly.
			const done = () => resolve({ rc, err });
			if (child.stderr && !child.stderr.readableEnded) {
				const cap = setTimeout(done, 1000);
				child.stderr.on("end", () => {
					clearTimeout(cap);
					done();
				});
			} else done();
		});
	});
}

export async function fastForward(input: string): Promise<string> {
	let ctx = "";
	if ((process.env.CODER_FLEET_FAST_FORWARD || "on") === "off") return "";

	let ev: Record<string, unknown> = {};
	try {
		ev = obj(JSON.parse(input));
	} catch {}
	const sourceKind = typeof ev.source === "string" ? ev.source : "";
	let cwd = typeof ev.cwd === "string" ? ev.cwd : "";
	if (sourceKind === "compact") return "";
	if (!cwd) cwd = process.env.PWD || process.cwd();
	try {
		if (!statSync(cwd).isDirectory()) return "";
	} catch {
		return "";
	}

	const rawLimit = process.env.CODER_FLEET_FETCH_TIMEOUT ?? "";
	const limit = /^[0-9]+$/.test(rawLimit) && rawLimit !== "0" ? Number(rawLimit) : 5;

	const env = gitEnv();
	const plainGit = (args: string[]): Ran => run(["git", ...args], { env });
	let top = "";
	const G = (args: string[]): Ran => run(["git", "-C", top, ...G_CONFIG, ...args], { env: { ...env, LC_ALL: "C" }, input: "" });

	let outNote = "";
	let said = false;
	let trapSet = false;

	const say = (text: string): never => {
		log(`${top}: ${text}`);
		let full = clean(`Session start: ${text}`);
		if (outNote) {
			log(`${top}: ${outNote}`);
			full += `\n${clean(`Session start: ${outNote}`)}`;
		}
		said = true;
		ctx = full;
		throw new Stop();
	};

	try {
		if (chomp(plainGit(["-C", cwd, "rev-parse", "--is-inside-work-tree"]).stdout) !== "true") return "";
		const t = plainGit(["-C", cwd, "rev-parse", "--show-toplevel"]);
		if (!t.ok) return "";
		top = chomp(t.stdout);
		const gd = G(["rev-parse", "--path-format=absolute", "--git-dir"]);
		if (!gd.ok) return "";
		const cd = G(["rev-parse", "--path-format=absolute", "--git-common-dir"]);
		if (!cd.ok) return "";
		const gitdir = chomp(gd.stdout);
		const common = chomp(cd.stdout);
		// A linked worktree's git dir is under the common one; only the main
		// checkout has them equal.
		if (!gitdir || gitdir !== common) return "";

		const unsafeName = () => {
			log(`${top}: the remote or default branch name is not one the hook passes to git; nothing fetched`);
			say(
				"the default branch was not fast-forwarded: the name of its remote or of the branch holds a character outside letters, digits, '.', '_', '/' and '-', or starts with '-', so the hook left it alone.",
			);
		};

		// The trunk, from the one resolver. A baseBranch it cannot use moves
		// nothing and never falls back to the remote's HEAD; the session gets a
		// fixed sentence, and the resolver's reason, which quotes the project's
		// own text, goes to the log alone.
		const tr = trunk(top);
		let def = "";
		let from = "";
		if (tr.ok) {
			def = tr.vars.FLEET_TRUNK;
			from = tr.vars.FLEET_TRUNK_FROM;
		} else if (tr.vars.FLEET_TRUNK_FROM === "remote") {
			unsafeName();
		} else {
			log(`${top}: no trunk: ${tr.vars.FLEET_TRUNK_REASON}`);
			say(
				"baseBranch in .claude/coder-fleet.json does not name a usable branch, so nothing was fetched or moved; the hook log has the reason, and /coder-fleet:agents base shows it.",
			);
		}
		const whatIsOut = (headRef: string) => {
			const out = headRef.replace(/^refs\/heads\//, "");
			if (!headRef) return "has a detached HEAD out";
			if (safe(out)) return `has ${out} out`;
			return "has another branch out";
		};
		if (from === "setting") {
			const hereBranch = chomp(G(["symbolic-ref", "-q", "HEAD"]).stdout);
			if (hereBranch !== `refs/heads/${def}`) {
				outNote = `the main checkout ${whatIsOut(hereBranch)}, not the base branch ${def}, and agent worktrees are cut from what is out.`;
			}
		}
		trapSet = true;

		// No remote, or several and none called origin: nothing to fetch from,
		// said only of a base branch the human named.
		const noRemoteCopy = (why: string) => {
			if (from !== "setting") throw new Stop();
			say(`${def} has no remote copy the hook can fetch, since ${why}, so there is nothing to fast-forward it to, and nothing moved.`);
		};
		const r = G(["remote"]);
		if (!r.ok) throw new Stop();
		const remotes = chomp(r.stdout);
		if (!remotes) noRemoteCopy("the repository has no remote");
		const lines = remotes.split("\n");
		let remote = "";
		if (lines.includes("origin")) remote = "origin";
		else if (lines.length === 1) remote = remotes;
		else noRemoteCopy("it has several remotes and none is called origin");

		if (remote.includes("/") || !safe(remote) || !safe(def) || !plainGit(["check-ref-format", "--branch", def]).ok) unsafeName();
		const localRef = `refs/heads/${def}`;
		const remoteRef = `refs/remotes/${remote}/${def}`;
		if (!G(["show-ref", "--verify", "-q", localRef]).ok) throw new Stop();

		const refused = (why: string): never =>
			say(
				`${def} was not fast-forwarded to ${remote}/${def} and is left as it is: ${why}. Never reset, stash, rebase or force past this; tell the human, as lead-procedures says under Worktrees and memory.`,
			);

		// --- what may be fetched
		const scopes = ["--local"];
		if (chomp(G(["config", "--local", "--type=bool", "--get", "extensions.worktreeconfig"]).stdout) === "true") scopes.push("--worktree");
		for (const scope of scopes) {
			const keys = G(["config", scope, "--list", "--name-only", "-z"]).stdout.split("\0");
			keys.pop();
			for (const key of keys) {
				if (allowedKey(key)) continue;
				log(`${top}: ${scope} config sets ${redact(key)}, which is not on the allowlist; nothing fetched`);
				if (safe(key)) {
					refused(
						`the repository's own git config sets ${key}, which is not on the hook's list of keys known to run no command, so the hook fetched nothing for the lead to do by hand`,
					);
				}
				refused(
					"the repository's own git config sets a key whose name the hook does not repeat and which is not on its list of keys known to run no command, so the hook fetched nothing for the lead to do by hand",
				);
			}
		}
		if (existsSync(`${common}/objects/info/alternates`)) {
			refused("the repository borrows objects through objects/info/alternates, so the hook fetched nothing for the lead to do by hand");
		}
		if (legacyRemoteFiles(common)) {
			refused(
				"the repository has legacy remote files under remotes/ or branches/ in its git dir, which can redirect a fetch, so the hook fetched nothing for the lead to do by hand",
			);
		}
		const urls = chomp(G(["remote", "get-url", "--all", remote]).stdout);
		if (!urls) throw new Stop();
		for (const url of urls.split("\n")) {
			switch (urlKind(url)) {
				case "helper":
					refused(`${remote} is fetched through a remote helper, and the hook fetches only https, ssh and git remotes`);
					break;
				case "path":
					refused(`${remote} is a path on this machine, and the hook fetches only https, ssh and git remotes`);
					break;
				case "unknown":
					refused(`${remote} has a URL the hook does not recognise, and it fetches only https, ssh and git remotes`);
			}
		}
		// Every remote's url and pushurl in the repository's own config is held
		// to the same list, since a planted one is in reach of the next fetch.
		for (const scope of scopes) {
			const recs = G(["config", scope, "-z", "--get-regexp", "^remote\\..*\\.(url|pushurl)$"]).stdout.split("\0");
			recs.pop();
			for (const rec of recs) {
				const nl = rec.indexOf("\n");
				const val = nl < 0 ? rec : rec.slice(nl + 1);
				if (urlKind(val) === "ok") continue;
				log(`${top}: ${scope} ${nl < 0 ? rec : rec.slice(0, nl)} is ${redact(val)}, which is not an https, ssh or git URL; nothing fetched`);
				refused("a remote url or pushurl in the repository's own config is not an https, ssh or git URL, so the hook fetched nothing for the lead to do by hand");
			}
		}

		// --- the bounded fetch
		const fetched = await boundedFetch(
			["-C", top, ...G_CONFIG, "fetch", "--quiet", "--no-tags", "--no-recurse-submodules", "--no-write-fetch-head", "--", remote, `refs/heads/${def}`],
			{ ...env, LC_ALL: "C" },
			limit,
		);
		if (fetched.rc !== 0) {
			const err = fetched.err;
			log(`${top}: git fetch ${remote} exited ${fetched.rc}: ${redact(err)}`);
			// A base branch the human named may exist only here. git's own words
			// for that are fixed, so matching them reads nothing the remote chose.
			if (from === "setting" && err.includes(`fatal: couldn't find remote ref refs/heads/${def}`)) {
				say(`${def} has no copy on ${remote}, so there is nothing to fast-forward it to, and nothing moved.`);
			}
			if (fetched.rc > 128) refused(`the fetch from ${remote} did not finish within ${limit} s, so how far behind it is is unknown`);
			if (
				["Authentication failed", "Permission denied", "could not read Username", "could not read Password", "terminal prompts disabled", "Host key verification failed", " 401", " 403"].some((p) =>
					err.includes(p),
				)
			) {
				refused(`${remote} refused the credentials, or none could be given without a prompt`);
			}
			if (
				["Could not resolve", "Connection refused", "timed out", "Network is unreachable", "No route to host", "does not appear to be a git repository", "not found", "unable to access"].some((p) =>
					err.includes(p),
				)
			) {
				refused(`${remote} could not be reached`);
			}
			refused(`the fetch from ${remote} failed for a reason the hook log records`);
		}

		// --- compare
		const o = G(["rev-parse", "-q", "--verify", `${localRef}^{commit}`]);
		if (!o.ok) throw new Stop();
		const n = G(["rev-parse", "-q", "--verify", `${remoteRef}^{commit}`]);
		if (!n.ok) throw new Stop();
		const oldSha = chomp(o.stdout);
		const newSha = chomp(n.stdout);
		if (oldSha === newSha) throw new Stop();
		const count = (range: string) => {
			const c = G(["rev-list", "--count", range]);
			return c.ok ? chomp(c.stdout) : null;
		};
		// Ahead of the remote: said only of a base branch the human named.
		if (G(["merge-base", "--is-ancestor", newSha, oldSha]).ok) {
			if (from !== "setting") throw new Stop();
			say(`${def} is ${plural(count(`${newSha}..${oldSha}`) ?? "?")} ahead of ${remote}/${def} and not behind it, so there is nothing to fast-forward, and nothing moved.`);
		}
		const behind = count(`${oldSha}..${newSha}`);
		if (behind === null) throw new Stop();
		if (!G(["merge-base", "--is-ancestor", oldSha, newSha]).ok) {
			const ahead = count(`${newSha}..${oldSha}`) ?? "?";
			refused(`${def} has ${plural(ahead)} ${remote}/${def} lacks, and ${remote}/${def} has ${behind} it lacks`);
		}

		// Where the default branch is checked out: here, or a linked worktree.
		const hereBranch = chomp(G(["symbolic-ref", "-q", "HEAD"]).stdout);
		let elsewhere = "";
		let wt = "";
		for (const line of G(["worktree", "list", "--porcelain"]).stdout.split("\n")) {
			if (line.startsWith("worktree ")) wt = line.slice("worktree ".length);
			else if (line === `branch ${localRef}` && wt !== top && !elsewhere) elsewhere = wt;
		}

		if (hereBranch === localRef) {
			const m = G(["merge", "--ff-only", "--no-autostash", "--no-stat", "-q", newSha]);
			if (!m.ok) {
				const err = m.stderr;
				log(`${top}: git merge --ff-only refused: ${redact(err)}`);
				// git lists the files in the way one per line, indented by a tab.
				// Only the ones with safe names are named; the rest are counted.
				const named: string[] = [];
				let others = 0;
				for (const line of chomp(err).split("\n")) {
					if (!line.startsWith("\t")) continue;
					const f = line.slice(1);
					if (safe(f) && named.length < 5) named.push(f);
					else others += 1;
				}
				if (named.length || others > 0) {
					let files = named.length ? named.join(", ") : "files";
					if (named.length && others > 0) files = `${named.join(", ")} and ${others} more`;
					if (!named.length && others === 1) files = "a file whose name the hook does not repeat";
					if (!named.length && others > 1) files = `${others} files whose names the hook does not repeat`;
					refused(`git merge --ff-only refused the ${plural(behind)} from ${remote}/${def}, because a changed or untracked file is in the way: ${files}`);
				}
				refused(`git merge --ff-only refused the ${plural(behind)} from ${remote}/${def} for a reason the hook log records`);
			}
			const s = G(["rev-parse", "--short", newSha]);
			const short = s.ok ? chomp(s.stdout) : newSha;
			say(`fast-forwarded ${def} by ${plural(behind)} to ${remote}/${def} (${short}).`);
		}

		if (elsewhere) {
			if (safe(elsewhere)) refused(`${def} is checked out in the linked worktree ${elsewhere}, so it is brought level from there`);
			refused(`${def} is checked out in a linked worktree whose path the hook does not repeat, so it is brought level from there`);
		}

		// A rebase or a bisect detaches HEAD, so the listing above does not show
		// the branch as out, yet git's own checked-out check refuses to move it.
		const dirs = [common];
		try {
			for (const d of readdirSync(join(common, "worktrees")).sort()) dirs.push(join(common, "worktrees", d));
		} catch {}
		const head1 = (p: string) => {
			try {
				return readFileSync(p, "utf8").split("\n", 1)[0];
			} catch {
				return "";
			}
		};
		const isFileAt = (p: string) => {
			try {
				return statSync(p).isFile();
			} catch {
				return false;
			}
		};
		for (const d of dirs) {
			try {
				if (!statSync(d).isDirectory()) continue;
			} catch {
				continue;
			}
			const where = d === common ? "the main checkout" : "a linked worktree";
			for (const f of [join(d, "rebase-merge", "head-name"), join(d, "rebase-apply", "head-name")]) {
				if (isFileAt(f) && head1(f) === localRef) {
					refused(`${def} is being rebased in ${where}, so the hook left it for the lead to bring level once the rebase is done`);
				}
			}
			const bisect = join(d, "BISECT_START");
			if (isFileAt(bisect)) {
				const b = head1(bisect);
				if (b === def || b === localRef) refused(`${def} is being bisected in ${where}, so the hook left it for the lead to bring level once the bisect is done`);
			}
		}

		const u = G(["update-ref", "-m", `coder-fleet: fast-forward ${def} to ${remote}/${def} at session start`, localRef, newSha, oldSha]);
		if (!u.ok) {
			log(`${top}: git update-ref refused: ${redact(chomp(u.stdout + u.stderr))}`);
			refused("git update-ref refused to move it, most likely because it moved while the hook ran");
		}
		// This line already says what is out.
		outNote = "";
		say(`fast-forwarded ${def} by ${plural(behind)} to ${remote}/${def} without a checkout; the main checkout ${whatIsOut(hereBranch)}, not ${def}, and agent worktrees are cut from what is out.`);
	} catch (e) {
		if (!(e instanceof Stop)) log(`unexpected error (${(e as Error).message ?? e}); nothing more moved, session continues`);
	}
	// On every way out once the trunk is known, the note on what is out rides
	// alone when nothing else was said.
	if (!said && trapSet && outNote) {
		log(`${top}: ${outNote}`);
		ctx = clean(`Session start: ${outNote}`);
	}
	if (!ctx) return "";
	return JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: ctx } });
}

export async function fastForwardCommand(): Promise<number> {
	let out = "";
	try {
		out = await fastForward(await readInput());
	} catch (e) {
		log(`unexpected error (${(e as Error).message ?? e}); nothing more moved, session continues`);
	}
	if (out) process.stdout.write(`${out}\n`);
	return 0;
}
