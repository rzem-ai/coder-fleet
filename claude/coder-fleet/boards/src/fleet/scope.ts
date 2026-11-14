// `boards fleet scope`: PreToolUse, per-agent tool scoping. Ported from
// hooks/enforce-agent-scope.sh, now a shim that pipes the hook's input here.
//
// permissions.deny is session-scoped, so it cannot say "spec-writer may only
// write under docs/specs/" while coder writes anywhere. This is where the
// per-agent half lives. It switches on agent_type and denies the tool calls
// the agent's own Invariants section forbids, quoting the invariant back so
// the agent knows which line it hit. The session-wide half - credentials,
// curl, sudo, destructive git - is denied in settings and by the sandbox
// whatever this does, and the sandbox is what contains an agent.
//
// Every agent's own memory, .claude/agent-memory/<agent type>/ in the project,
// is writable before any role's rule runs. A write tool a role holds only for
// its memory is refused anywhere else, and when the memory directory cannot
// be established.
//
// The push and release settings (push-policy.ts) are judged for every call,
// the main session's included; the role rules do not govern the main session.
//
// Errors inside the rules fail open, as the bash hook's ERR trap did: input
// that is not JSON, or anything that throws, allows the call and logs why.
// The shim is what fails closed, when this program cannot run at all.
//
// scope-words.ts has the reading of a command's text, with its reasons and
// its gaps; this file has the rules. Prints the word allow, or the deny as
// JSON.
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { join, posix } from "node:path";
import { configRoot, trunk } from "./config.ts";
import { parseEvent, readInput, stateDir, utcStamp } from "./hook.ts";
import { pluginRoot, run } from "./proc.ts";
import { callFromEvent, pushReleasePolicy } from "./push-policy.ts";
import { reviewerModes } from "./reviewer-modes.ts";
import {
	base,
	boundScan,
	boundSegments,
	COMMAND_WRAPPERS,
	commandAssigns,
	commandWords,
	dropDevNull,
	firstWord,
	ghApiDenial,
	ghPair,
	ghViaXargs,
	ghWordsDenial,
	hasQuotedFlag,
	INSTALL_VERBS,
	installVerb,
	leadingToken,
	lexAbs,
	lines,
	recoverPayloads,
	runsSed,
	SP,
	secondWord,
	sedWrites,
	splitOps,
	stripInertQuotes,
	stripLeadingSyntax,
	stripQuoted,
	stripSingleQuoted,
	subVerb,
	trimSeg,
	unescapeWords,
	wordExpansionDenial,
	words,
} from "./scope-words.ts";
import { writeAllowed } from "./write-scope.ts";

const log = (m: string) => process.stderr.write(`${utcStamp()} [PreToolUse] ${m}\n`);

// The call's answer, thrown to leave from anywhere.
class Decided {
	constructor(public out: string) {}
}

function deny(reason: string): never {
	log(`denied: ${reason}`);
	throw new Decided(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } }, null, 2));
}

function allow(): never {
	throw new Decided("allow");
}

const isWriteTool = (t: string) => t === "Write" || t === "Edit" || t === "MultiEdit" || t === "NotebookEdit";
const set = (s: string) => new Set(s.trim().split(/\s+/));

// $1 an absolute, normalised path, with the symlinks in its deepest existing
// directory resolved; the part that does not exist yet is kept as written.
function physPath(p0: string): string {
	let p = p0;
	let rest = "";
	const isDirectory = (d: string) => {
		try {
			return statSync(d).isDirectory();
		} catch {
			return false;
		}
	};
	while (p && p !== "/" && !isDirectory(p)) {
		rest = `/${p.slice(p.lastIndexOf("/") + 1)}${rest}`;
		p = p.slice(0, p.lastIndexOf("/"));
	}
	if (!p) p = "/";
	try {
		p = realpathSync(p);
	} catch {
		p = "";
	}
	return `${p.replace(/\/$/, "")}${rest}`;
}

const isLink = (p: string) => {
	try {
		return lstatSync(p).isSymbolicLink();
	} catch {
		return false;
	}
};
const exists = (p: string) => existsSync(p);
const isFile = (p: string) => {
	try {
		return statSync(p).isFile();
	} catch {
		return false;
	}
};

function git(args: string[]): { ok: boolean; status: number; out: string } {
	const r = run(["git", ...args]);
	return { ok: r.ok, status: r.status, out: r.stdout.replace(/\n+$/, "") };
}

// ------------------------------------------------------------------- the tables

// The write tools a role holds for its memory and for nothing else.
const MEMORY_ONLY_TOOLS: Record<string, string[]> = {
	scout: ["Write", "Edit", "MultiEdit"],
	reviewer: ["Write", "Edit", "MultiEdit"],
	researcher: ["Write", "Edit", "MultiEdit"],
	"spec-writer": ["Edit", "MultiEdit"],
	"tech-writer": ["Edit", "MultiEdit"],
	"ui-designer": ["Edit", "MultiEdit"],
	"spec-editor": ["Write"],
	"tech-editor": ["Write"],
	"fleet-steward": ["Write"],
};

// scout: the read allowlist, the git verbs and the gh pairs (gh holds the
// human's credential, so it is allowed by group and subcommand, never by
// group alone; api stands alone and must be a plain GET).
const SCOUT_ALLOWED_CMDS = set("ls cat head tail sed wc file rg grep find git gh cd pwd echo true read");
const SCOUT_ALLOWED_GIT = set("log show blame diff ls-files");
const SCOUT_ALLOWED_GH = new Set([
	"issue list",
	"issue view",
	"issue status",
	"pr list",
	"pr view",
	"pr diff",
	"pr checks",
	"pr status",
	"run list",
	"run view",
	"repo view",
	"release list",
	"release view",
	"label list",
	"search issues",
	"search prs",
	"search repos",
	"search code",
	"search commits",
	"api",
]);

// The reviewer: scout's reads plus the read-only verbs a review reaches for,
// and the commands that shape output without touching it.
const READONLY_GIT = set("log show blame diff ls-files status shortlog describe rev-parse rev-list cat-file grep whatchanged");
const REVIEWER_ALLOWED_CMDS = set("ls cat head tail sed wc file rg grep find git cd pwd echo true read awk sort uniq comm diff cut tr column basename dirname stat od xxd");

// The reviewer's gates (see reviewerGateCheck) and the two package-manager
// exceptions, each one exact word list (CF-199).
const REVIEWER_INSTALL_FORMS: [string, string][] = [
	["bun", "bun install --frozen-lockfile --ignore-scripts --no-env-file"],
	["npm", "npm ci --ignore-scripts"],
	["pnpm", "pnpm install --frozen-lockfile --ignore-scripts --ignore-pnpmfile"],
	["yarn1", "yarn install --frozen-lockfile --ignore-scripts"],
	["yarn2", "yarn install --immutable --mode=skip-build"],
];
const formOf = (k: string) => REVIEWER_INSTALL_FORMS.find(([key]) => key === k)?.[1] ?? "";
const REVIEWER_INSTALL_CONFIG_FILES = set("bunfig.toml pnpm-workspace.yaml");
// Matched as shell patterns against the top-level name.
const REVIEWER_INERT_DOT = [".gitignore", ".gitattributes", ".editorconfig", ".github", ".vscode", ".prettierrc", ".prettierrc.*", ".prettierignore", ".eslintrc", ".eslintrc.*", ".eslintignore"];
const REVIEWER_INERT_PKG = new Set(["name", "version", "description", "keywords", "author", "contributors", "license", "homepage", "repository", "bugs", "private", "type", "main", "module", "types", "typings", "exports", "imports", "bin", "files", "browser", "sideEffects", "engines", "os", "cpu", "dependencies", "devDependencies", "peerDependencies", "peerDependenciesMeta", "optionalDependencies", "bundleDependencies", "scripts"]);
const REVIEWER_BUN_GATE = "bun --no-install test";
const REVIEWER_PACKAGE_MANAGERS = set("npm npx pnpm pnpx yarn yarnpkg bun bunx corepack deno pip pip3 pipx poetry uv uvx gem bundle composer cargo go brew");
const REVIEWER_NETWORK_TOOLS = set("curl wget nc ncat netcat socat ssh scp sftp rsync ftp tftp telnet http https xh aria2c");
const REVIEWER_GATE_INVARIANT = `"Run the project's declared gates read-only, from the top of the review worktree, and nothing else that executes code."`;
// No @ or + first: `pytest @args.txt` reads its flags from a file.
const GATE_PATH_RE = /^[A-Za-z0-9_.][A-Za-z0-9_.@+/-]*$/;
const GATE_NAME_RE = /^[A-Za-z0-9_][A-Za-z0-9_.:@+,/=-]*$/;

// The progress log (CF-192 criterion 9): two whole-command shapes.
const REVIEWER_PROGRESS_DATE_RE = /^date( -u)? '\+[^']*' >> (\/[A-Za-z0-9._/@+-]+)$/;
const REVIEWER_PROGRESS_MKDIR_RE = /^mkdir -p (\/[A-Za-z0-9._/@+-]+)$/;
const REVIEWER_PROGRESS_NAME_RE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}-reviewer-[A-Za-z0-9._-]+-progress\.log$/;

// coder and scripter: git verbs that write.
const CODER_WRITING_GIT = set("commit switch checkout branch reset merge rebase push stash cherry-pick revert am apply tag clean rm mv restore worktree");

// ui-designer and the use-mode reviewer: the installers and their verbs.
const UI_DESIGNER_INSTALLERS = set("npm pnpm yarn bun pip pip3 pipx poetry uv gem bundle composer cargo go brew apt apt-get");

// A command that may change directory only as `cd <path> && ... && <command>`.
const CD_PATH_CHARS = "[A-Za-z0-9_.@+,:=/-]";
const CD_LEAD_RE = new RegExp(`^${SP}*cd${SP}+(\\.|\\.\\.|\\./${CD_PATH_CHARS}*|\\.\\./${CD_PATH_CHARS}*|/${CD_PATH_CHARS}*)${SP}*&&([\\s\\S]*)$`);
const SHELL_CD_WORDS = set("cd pushd popd");
const CD_SHAPE_RULE =
	"A command that runs it may change directory only as its first step, written `cd <path> && ... && <command>`: one cd, no option, a path starting with /, ./ or ../, and only && between the cd and the command. Anything else is refused rather than guessed at, because the shell may not end up where the command seems to say.";

// ------------------------------------------------------------- reviewer gates

// The gates declared in <root>/AGENTS.md, from the first ```gates block only.
function declaredGates(root: string): [string, string][] {
	let text: string;
	try {
		text = readFileSync(`${root}/AGENTS.md`, "utf8");
	} catch {
		return [];
	}
	const out: [string, string][] = [];
	let on = false;
	for (const raw of text.split("\n")) {
		if (/^```gates[ \t\v\f\r]*$/.test(raw)) {
			on = true;
			continue;
		}
		if (on && /^```[ \t\v\f\r]*$/.test(raw)) break;
		if (!on) continue;
		const line = raw.replace(/\r$/, "");
		const m = /^[A-Za-z0-9_-]+:[ \t\v\f\r]+/.exec(line);
		if (!m) continue;
		const name = line.slice(0, line.indexOf(":"));
		const cmd = line.slice(m[0].length).replace(/[ \t\v\f\r]+$/, "");
		if (cmd) out.push([name, cmd]);
	}
	return out;
}

type GateState = { kind: string; root: string; gates: [string, string][] };

class Scope {
	agentType = "";
	agent = "";
	agentId = "";
	toolName = "";
	cwd = "";
	filePath = "";
	commandStr = "";
	rawCommandStr = "";
	transcriptPath = "";
	rule = "";
	segHere = "";
	segPrev = "";
	gateCache = new Map<string, GateState>();
	reviewRaw = "";
	reviewNcd = 0;
	reviewScan = "";
	reviewAssigns: string | null = null;
	protectedMatch = "";

	constructor(public ev: Record<string, unknown>) {}

	run(): void {
		const call = callFromEvent(this.ev);
		this.agentType = call.agentType;
		this.agent = call.agent;
		this.agentId = call.agentId;
		this.toolName = call.toolName;
		this.cwd = call.cwd;
		this.filePath = call.filePath;
		this.transcriptPath = call.transcriptPath;
		this.rawCommandStr = call.raw;
		this.commandStr = call.raw;

		if (this.commandStr) {
			// Bounded first, so the normalisation is paid on at most SCAN_MAX
			// bytes, and before the recovery, so a quoted interpreter name is
			// the interpreter it looks for. The payloads are bounded too.
			// Each step drops trailing newlines, as each $( ) did.
			const chomp = (s: string) => s.replace(/\n+$/, "");
			this.commandStr = chomp(boundScan(this.commandStr, "command", log));
			this.commandStr = chomp(stripInertQuotes(this.commandStr));
			this.commandStr += chomp(boundScan(chomp(stripInertQuotes(recoverPayloads(this.commandStr))), "recovered interpreter payload", log));
		}

		// No agent_type is the main session, which the role rules do not
		// govern. Its Bash calls still meet the push and release policy.
		if (!this.agent && this.toolName !== "Bash") allow();

		// The rule a call is judged by: the role, or for the reviewer the modes
		// its brief names. Both named is reviewer-break, the wider; an unread
		// brief is review alone, the narrowest.
		this.rule = this.agent;
		if (this.agent === "reviewer") {
			const modes = ` ${reviewerModes(this.transcriptPath, this.agentId, join(stateDir(), "modes")).modes} `;
			if (modes.includes(" break ")) this.rule = "reviewer-break";
			else if (modes.includes(" use ")) this.rule = "reviewer-use";
		}

		// Agent memory: a write tool aimed at the agent's own memory directory
		// is allowed, for every role, before any role's own rule runs. The check
		// is the physical one, so a lookalike name, a .. out of the directory
		// and a memory directory symlinked elsewhere are refused.
		const memoryDir = this.agentType.replace(/[^a-zA-Z0-9_-]/g, "-");
		if (isWriteTool(this.toolName)) {
			if (checkerPresent() && writeAllowed(this.ev, "memory")) allow();
			if ((MEMORY_ONLY_TOOLS[this.rule] ?? []).includes(this.toolName)) {
				deny(
					`${this.agent} invariant: your ${this.toolName} is for your own memory and nothing else. It may write only under .claude/agent-memory/${memoryDir}/ in this project, and ${this.toolName} targeted ${this.filePath || "no path"}, or the memory directory could not be established. Put anything else in your handoff and let the lead commission it.`,
				);
			}
		}

		// The project's push and release settings, for every session and agent.
		const policy = pushReleasePolicy(call);
		if (policy !== null) deny(policy);
		if (!this.agent) allow();

		// The reviewer's own records first, before any write rule or dispatch.
		if (this.agent === "reviewer" && this.reviewerProtectedDenial()) {
			deny(
				`reviewer invariant: "Never edit, write or create a file inside the project except under .claude/agent-memory/ under your own name", and this call names ${this.protectedMatch}, which holds the record of your own modes and clock under the fleet's state directory or Claude Code's transcripts. A reviewer never writes there or names that path in a command. Keep scratch files in a directory of your own outside the project, and read a transcript with the Read or Grep tool.`,
			);
		}

		// Write destinations, before the role dispatch: two roles that hold Write
		// have no write branch of their own. Every rule here but the break and
		// use-mode reviewer's holds an allowlist inside the project, so a
		// checker that is missing only widens it; those two are denials, and
		// fail closed.
		if (["spec-writer", "spec-editor", "ui-designer", "tech-writer", "tech-editor", "fleet-steward", "reviewer-break", "reviewer-use"].includes(this.rule) && isWriteTool(this.toolName)) {
			const outside = this.rule === "reviewer-break" || this.rule === "reviewer-use";
			if (!checkerPresent()) {
				if (outside) {
					deny(
						`${this.agent} invariant: "Never edit, write or create a file inside the project except under .claude/agent-memory/ under your own name." The write-scope checker is missing, so this cannot tell outside from inside. No checker means no write - work in a copy somewhere this hook does not have to guess.`,
					);
				}
				log(`the write-scope checker is missing at ${checkerPath()}, so write-scope checking cannot run for ${this.agent}. Allowing, consistent with this hook failing open.`);
			} else if (!writeAllowed(this.ev, outside ? "outside" : "scope")) {
				deny(
					`${this.agent} invariant: that write destination is outside the role's approved output scope, or the scope could not be established. spec-writer and the spec editors write only under this project's docs/specs/; tech-writer and the tech editors write documentation under docs/ or a Markdown file at the project root; ui-designer writes prototypes/ and a commissioned article under docs/runs/; fleet-steward writes only inside its own working copy; a reviewer in break or use mode writes only OUTSIDE the project, because a mutation written back into the tree under test is a change rather than a mutation, and a driver script or a screenshot left in the tree changes the work it grades. Name the file you need in the handoff and let the lead commission it.`,
				);
			}
		}

		switch (this.rule) {
			case "spec-writer":
				this.specWriter();
				break;
			case "spec-editor":
				this.specEditor();
				break;
			case "tech-editor":
				this.techEditor();
				break;
			case "scout":
				this.scout();
				break;
			case "fleet-steward":
				this.fleetSteward();
				break;
			case "reviewer":
				this.reviewer();
				break;
			case "ui-designer":
				this.readonlyGitNoInstall(
					"ui-designer",
					'"Never run a git command that writes, and never install anything into the product repo."',
					"Your prototypes are the deliverable; a coder builds and commits the real thing.",
					"A prototype is self-contained: build it from what is already there, and name any dependency the real thing would need in the handoff.",
				);
				break;
			case "coder":
			case "scripter":
				this.coder();
				break;
			case "reviewer-break":
				this.reviewerBreak();
				break;
			case "reviewer-use":
				this.readonlyGitNoInstall(
					"reviewer",
					'"Never run a git command that writes", and never install anything into the project, the worktree under review or its dependencies.',
					"A failed criterion is a finding with the observation that failed it, not a patch.",
					"Fetch a driver into a cache outside the project instead, such as npx -p playwright@<version> node <script>, and name what the project lacks in the handoff.",
				);
				break;
		}
		allow();
	}

	// The command split into its segments, each trimmed, blank ones gone.
	segments(scan: string, trim: (s: string) => string = trimSeg): string[] {
		return lines(boundSegments(splitOps(scan), log))
			.map(trim)
			.filter((s) => s !== "");
	}

	// ---------------------------------------------- what governs the reviewer
	// Its mode record and clock live in the fleet's state directory, its brief
	// in Claude Code's transcripts. Every mode is refused a write tool aimed
	// under either, and any Bash command that names one, case-folded since
	// APFS folds case. The Bash half is a text match (docs/limits.md).
	reviewerProtectedDenial(): boolean {
		const state = stateDir();
		const transcripts = `${process.env.CLAUDE_CONFIG_DIR || `${process.env.HOME ?? ""}/.claude`}/projects`;
		if (isWriteTool(this.toolName)) {
			if (!this.filePath) return false;
			const t = `${physPath(lexAbs(this.filePath, this.cwd))}/`.toLowerCase();
			for (const root of [state, transcripts]) {
				if (!root) continue;
				const phys = physPath(root);
				if (t.startsWith(`${phys}/`.toLowerCase()) || t.startsWith(`${root}/`.toLowerCase())) {
					this.protectedMatch = root;
					return true;
				}
			}
			return false;
		}
		if (this.toolName === "Bash" && this.commandStr) {
			const cmd = this.commandStr.toLowerCase();
			for (const root of [state, physPath(state), transcripts, physPath(transcripts), ".local/state/coder-fleet", "coder-fleet/modes", "coder-fleet/clocks", ".claude/projects"]) {
				if (!root || root === "/") continue;
				if (cmd.includes(root.toLowerCase())) {
					this.protectedMatch = root;
					return true;
				}
			}
		}
		return false;
	}

	// ------------------------------------------------------------- spec-writer
	specWriter(): void {
		if (!isWriteTool(this.toolName)) return;
		if (!this.filePath) {
			log(`spec-writer called ${this.toolName} with no path in tool_input; allowing`);
			return;
		}
		const abs = lexAbs(this.filePath, this.cwd);
		if (abs.includes("/docs/specs/")) return;
		deny(
			`spec-writer invariant: "Never write anywhere except under docs/specs/: not source, not config, not tests." ${this.toolName} targeted ${abs}. Write the spec to docs/specs/<issue>.md instead. Anything else belongs to the lead.`,
		);
	}

	// ------------------------------------------------------------- spec-editor
	specEditor(): void {
		if (this.toolName === "Bash") {
			deny(
				`${this.agent} invariant: "Never run a command." A spec editor reads with Read, Grep and Glob and edits one spec under docs/specs/; it has no shell. Check a claim by reading the file it names, and put anything you could not check under Unverified.`,
			);
		}
		if (!isWriteTool(this.toolName)) return;
		if (!this.filePath) deny(`${this.agent} invariant: "Never edit anything but the spec named in the brief, under docs/specs/." ${this.toolName} came with no path, so where it would land cannot be checked.`);
		const abs = lexAbs(this.filePath, this.cwd);
		if (abs.includes("/docs/specs/")) return;
		deny(
			`${this.agent} invariant: "Never edit anything but the spec named in the brief, under docs/specs/." ${this.toolName} targeted ${abs}. Challenges go in the spec's ## Challenges (spec-editor) section; anything else belongs to the lead.`,
		);
	}

	// ------------------------------------------------------------- tech-editor
	techEditor(): void {
		if (this.toolName === "Bash") {
			deny(
				`${this.agent} invariant: "Never run a command." A tech editor reads with Read, Grep and Glob and edits tech-writer's documents in place; it has no shell. Check a claim by reading the file it names, and put anything you could not check under Unverified.`,
			);
		}
		if (!isWriteTool(this.toolName)) return;
		if (!this.filePath) deny(`${this.agent} invariant: "Never edit anything but the tech-writer documents named in the brief." ${this.toolName} came with no path, so where it would land cannot be checked.`);
	}

	// ------------------------------------------------------------------- scout
	scout(): void {
		if (isWriteTool(this.toolName)) {
			deny(
				`scout invariant: "Never edit, write or create a file, and leave the working tree exactly as you found it." scout answers in paths, line numbers and quoted excerpts only. Hand the change to coder.`,
			);
		}
		if (this.toolName !== "Bash" || !this.commandStr) return;
		const scan0 = dropDevNull(stripQuoted(this.commandStr));
		const substScan = stripSingleQuoted(this.commandStr);
		if (runsSed(scan0) && sedWrites(this.commandStr)) {
			deny(
				`scout invariant: "leave the working tree exactly as you found it." That sed script contains a w, W or e command, which writes a file or runs a program - a quoted script is still a script. Use sed -n with p to print, and hand any change to coder.`,
			);
		}
		if (substScan.includes("$(") || substScan.includes("`")) {
			deny(
				`scout invariant: no command substitution. The command contains $( or a backtick, which can hide a write behind a read. Note that double quotes do not disarm it - "$(...)" still runs. Run the inner command on its own.`,
			);
		}
		if (scan0.includes(">")) deny(`scout invariant: "no redirection into a file". scout leaves the working tree exactly as it found it, so > and >> are not available. Read the file and quote it instead.`);
		if (scan0.includes("<(") || scan0.includes(">(")) deny("scout invariant: no process substitution. Run the commands separately.");

		const scan = boundSegments(splitOps(scan0), log);
		for (const raw of lines(scan)) {
			const seg = trimSeg(raw);
			if (!seg) continue;
			const tok = leadingToken(seg);
			if (!tok) continue;
			// The segment with its leading assignments dropped, for the argument
			// checks below.
			let first = seg;
			while (firstWord(first).includes("=")) {
				const next = first.replace(new RegExp(`^[^ \\t\\n\\v\\f\\r]+${SP}+`), "");
				if (next === first) {
					first = "";
					break;
				}
				first = next;
			}
			if (!SCOUT_ALLOWED_CMDS.has(tok)) {
				deny(
					`scout invariant: "run only commands that read - ls, cat, head, tail, sed -n, wc, file, rg, grep, find, read-only git log, git show, git blame, git diff, git ls-files, and read-only gh." "${tok}" is not on that list. If the answer needs a state change, hand it to an agent that is allowed to make one.`,
				);
			}
			const padded = ` ${first} `;
			if (tok === "sed") {
				if (padded.includes(" -i") || padded.includes(" --in-place")) deny("scout invariant: sed -i edits the file in place. scout leaves the working tree exactly as it found it.");
				if (!padded.includes(" -n")) deny('scout invariant: the allowlist is "sed -n", not sed. Add -n and an explicit p, so sed only prints.');
			} else if (tok === "find") {
				if ([" -exec", " -execdir", " -ok", " -okdir", " -delete", " -fprintf", " -fls", " -fprint"].some((f) => padded.includes(f))) {
					deny("scout invariant: find -exec, -delete and the -f* actions run or write things. Use find to locate files and read them separately.");
				}
			} else if (tok === "git") {
				const verb = subVerb(first);
				if (!SCOUT_ALLOWED_GIT.has(verb)) deny(`scout invariant: read-only git only - log, show, blame, diff, ls-files. "git ${verb}" is not one of them.`);
			} else if (tok === "gh") {
				this.scoutGh(scan, first);
			}
		}
	}

	scoutGh(scan: string, first: string): void {
		let why = commandAssigns(scan);
		if (why.startsWith("for:")) {
			deny(`scout invariant: read-only gh only, and a command that runs gh may assign no variable. It has a for loop, whose header assigns ${why.slice(4)} on every pass. Run gh once per value, written out.`);
		} else if (why === "read") {
			deny("scout invariant: read-only gh only. This command runs read, which assigns a variable from standard input where no check can see it, and a command that runs gh may assign none. Run gh on its own.");
		} else if (why) {
			deny(
				`scout invariant: read-only gh only, and a command that runs gh may assign no variable. This one assigns ${why}, and a variable can point gh at another config, host or proxy - GH_CONFIG_DIR alone makes --web run whatever browser that config names. Run gh with none.`,
			);
		}
		if (ghViaXargs(first)) {
			deny("scout invariant: read-only gh only, and never through xargs, which hands gh words from standard input that no check of the command can see. Run gh with every word written out.");
		}
		const verb = ghPair(first);
		if (verb.startsWith("option:")) {
			deny(
				`scout invariant: read-only gh only. "${verb.slice(7)}" stands before the subcommand, and gh may read the next word as its value, which would change which command runs. Only -R or --repo may come before the subcommand; put any other option after it.`,
			);
		}
		if (verb === "auth" || verb.startsWith("auth ")) {
			deny('scout invariant: read-only gh only, and "gh auth" is denied in every form - "gh auth token" prints the human\'s GitHub credential. Nothing scout does needs it.');
		}
		if (!SCOUT_ALLOWED_GH.has(verb)) {
			deny(
				`scout invariant: read-only gh only - issue list/view/status, pr list/view/diff/checks/status, run list/view, repo view, release list/view, label list, search issues/prs/repos/code/commits, and api as a GET. "gh ${verb}" is not one of them. If the answer needs a write to GitHub, hand it back to the agent that asked.`,
			);
		}
		why = ghWordsDenial(first, verb);
		if (why.startsWith("expands:")) {
			deny(`scout invariant: read-only gh only. "${why.slice(8)}" holds $, {, *, ?, [ or a backtick, which the shell expands into words gh reads and this check does not - $'-f' is -f. Write every gh word out plainly.`);
		} else if (why.startsWith("quoted:")) {
			deny(`scout invariant: read-only gh only. "${why.slice(7)}" is an option with a quoted part, and a quoted option cannot be read here. Write gh's options unquoted.`);
		} else if (why.startsWith("web:")) {
			deny(`scout invariant: read-only gh only, and no --web or -w: "${why.slice(4)}" opens a browser, which runs whatever program gh's config or environment names. Read the text in the terminal instead.`);
		}
		if (hasQuotedFlag(this.commandStr)) {
			deny("scout invariant: read-only gh only. This command has a quoted option - a quote opening a word that starts with - - and what a quoted option says cannot be read here. Write gh's options unquoted.");
		}
		if (verb === "api") {
			const api = ghApiDenial(first);
			if (api) {
				deny(
					`scout invariant: read-only gh only, so gh api is a plain GET or nothing - ${api}. It takes one endpoint, which may end in a query string, and only --paginate, --slurp, -i/--include, -q/--jq, -t/--template, -H/--header with an Accept header, and -X/--method GET, each written unquoted.`,
				);
			}
		}
	}

	// ----------------------------------------------------------- fleet-steward
	// Its working copy: CODER_FLEET_REPO, else the repository this plugin sits
	// in, two levels below .claude-plugin/marketplace.json. null from the
	// plugin cache, and the caller falls back to its weaker check.
	stewardRepoRoot(): string | null {
		const env = process.env.CODER_FLEET_REPO;
		if (env) return env.replace(/\/$/, "");
		const plugin = pluginRoot();
		const harness = posix.dirname(plugin);
		const repo = posix.dirname(harness);
		if (posix.basename(plugin) === "coder-fleet" && posix.basename(harness) === "claude" && isFile(`${repo}/.claude-plugin/marketplace.json`)) return repo;
		return null;
	}

	// Whether a steward command that mentions push is the one push it may run:
	// in full, git push [-u|--set-upstream] [-q] origin <branch>, or
	// <branch>:<branch>, a plain name that is not main, master or the trunk.
	// "" when allowed, "hit" for main, master or the trunk, "shape" otherwise.
	static stewardPushAllowed(cmd0: string, trunkName: string): string {
		const cmd = cmd0.replace(/^ +/, "").replace(/ +$/, "");
		if (!/^git +push( +(-u|--set-upstream|-q))* +origin +[A-Za-z0-9._/:-]+$/.test(cmd)) return "shape";
		const ref = cmd.slice(cmd.lastIndexOf(" ") + 1);
		const k = ref.indexOf(":");
		const src = k < 0 ? ref : ref.slice(0, k);
		const dst = k < 0 ? ref : ref.slice(k + 1);
		if (src !== dst) return "shape";
		if (src === "" || src.startsWith("-") || src.includes(":") || src.includes("..") || src.endsWith("/") || src.startsWith("/") || src.includes("//") || src.endsWith(".") || src.startsWith("refs/") || src === "HEAD" || src === "@") {
			return "shape";
		}
		const low = src.replace(/^heads\//, "").replace(/[A-Z]/g, (c) => c.toLowerCase());
		if (low === "main" || low === "master" || low === "head") return "hit";
		if (trunkName && low === trunkName.replace(/[A-Z]/g, (c) => c.toLowerCase())) return "hit";
		return "";
	}

	fleetSteward(): void {
		if (isWriteTool(this.toolName)) {
			if (!this.filePath) {
				log(`fleet-steward called ${this.toolName} with no path in tool_input; allowing`);
				return;
			}
			const abs = lexAbs(this.filePath, this.cwd);
			const root = this.stewardRepoRoot();
			if (root !== null) {
				if (abs.startsWith(`${root}/`)) return;
				deny(
					`fleet-steward invariant: "Never touch anything outside the coder-fleet working copy." ${this.toolName} targeted ${abs}, which is outside ${root}. The steward files and proposes; it does not edit other repositories.`,
				);
			}
			if (abs.includes("/coder-fleet/")) return;
			deny(
				`fleet-steward invariant: "Never touch anything outside the coder-fleet working copy." ${this.toolName} targeted ${abs}, which is not under a coder-fleet directory. Set CODER_FLEET_REPO in the environment if the working copy lives somewhere this check cannot see.`,
			);
		}
		if (this.toolName !== "Bash" || !this.commandStr) return;

		// A command that mentions push in any spelling is allowed only as the
		// one push stewardPushAllowed names, judged on the whole raw command.
		if (this.rawCommandStr.replace(/[\\"']/g, "").replace(/[A-Z]/g, (c) => c.toLowerCase()).includes("push")) {
			let trunkName = "";
			const r = configRoot(this.cwd);
			if (r !== null) {
				const t = trunk(r);
				if (!t.ok) {
					deny(
						`fleet-steward invariant: "no push to a default branch". This repository's trunk could not be resolved (baseBranch in .claude/coder-fleet.json does not name a usable branch, or the remote's HEAD names one the fleet does not pass to git), so no push can be shown to miss it. Fix the setting, then push the migration branch.`,
					);
				}
				trunkName = t.vars.FLEET_TRUNK;
			}
			const hits = Scope.stewardPushAllowed(this.rawCommandStr, trunkName);
			if (hits === "") return;
			if (hits === "hit") {
				deny(`fleet-steward invariant: "no push to a default branch". This push names main, master or ${trunkName || "the trunk"}, this repository's trunk. Push the migration branch and open a pull request instead.`);
			}
			deny(
				`fleet-steward invariant: "no push to a default branch". A steward command that mentions push may only be, in full, git push [-u|--set-upstream] [-q] origin <branch>, or origin <branch>:<branch>, with a plain branch name: nothing before or after it, no other remote, option or command, and no quote, backslash or $. Run the push of the migration branch on its own.`,
			);
		}

		const scan0 = dropDevNull(stripQuoted(this.commandStr));
		// Redirection targets are resolved and checked: a real narrowing, not a
		// complete boundary, since a program the steward runs writes wherever.
		const root = this.stewardRepoRoot() ?? "";
		const tmp = process.env.TMPDIR || "/nonexistent-tmpdir";
		for (const line of lines(scan0)) {
			for (const m of line.matchAll(new RegExp(`[0-9]?>>?${SP}*[^ \\t\\n\\v\\f\\r;|&]+`, "g"))) {
				const target = m[0].replace(new RegExp(`^[0-9]*>>?${SP}*`), "");
				if (!target || target.startsWith("&")) continue;
				const abs = lexAbs(target, this.cwd);
				// Its own temporary directory, not bare /tmp, which every user shares.
				if (abs.startsWith(`${tmp}/`) || abs.startsWith("/dev/")) continue;
				if (root) {
					if (abs.startsWith(`${root}/`)) continue;
					deny(
						`fleet-steward invariant: "Never touch anything outside the coder-fleet working copy." This command redirects into ${abs}, which is outside ${root}. Write inside the working copy, or into a temporary directory.`,
					);
				}
				if (abs.includes("/coder-fleet/")) continue;
				deny(
					`fleet-steward invariant: "Never touch anything outside the coder-fleet working copy." This command redirects into ${abs}, which is not under a coder-fleet directory. Set CODER_FLEET_REPO in the environment if the working copy lives somewhere this check cannot see.`,
				);
			}
		}

		const subst = stripSingleQuoted(this.commandStr);
		if (subst.includes("$(") || subst.includes("`")) {
			deny(
				`fleet-steward invariant: "Never touch anything outside the coder-fleet working copy." A command substitution hides where its inner command writes, so this check cannot confirm the write stays inside the working copy. Run the inner command on its own line.`,
			);
		}

		for (const raw of lines(boundSegments(splitOps(scan0), log))) {
			const seg = trimSeg(raw);
			if (leadingToken(seg) !== "git") continue;
			const verb = subVerb(seg);
			if (["merge", "rebase", "reset", "filter-branch", "filter-repo"].includes(verb)) {
				deny(
					`fleet-steward invariant: "Never merge" and "never run a git command that rewrites shared history: no force-push, no reset, no rebase onto a shared branch." "git ${verb}" is one of those. File it and propose it; the human decides on the pull request.`,
				);
			}
			if (verb === "push") {
				deny('fleet-steward invariant: "no push to a default branch". This push is spelled so that the word push cannot be read, so it is not the one push the steward may run. Run git push origin <branch> on its own.');
			}
		}
	}

	// ------------------------------------------------------------ where it runs

	// A cd or pushd moves where every later segment runs. true, having moved
	// segHere, when the segment is one.
	segCd(seg: string, tok: string): boolean {
		if (tok !== "cd" && tok !== "pushd") return false;
		const arg = secondWord(commandWords(seg));
		if (arg === "" || arg === "~") {
			this.segPrev = this.segHere;
			this.segHere = process.env.HOME ?? "";
		} else if (arg === "-") {
			const prev = this.segPrev;
			this.segPrev = this.segHere;
			this.segHere = prev;
		} else if (!arg.startsWith("-")) {
			this.segPrev = this.segHere;
			this.segHere = lexAbs(arg, this.segHere);
		}
		return true;
	}

	// Whether a guarded segment runs where segCd says: no cd at all, or exactly
	// `cd <path> &&` first and only && up to the segment. raw: the command with
	// quoted spans erased; ncd: its cd, pushd and popd segments; idx: the
	// guarded segment's 1-based index.
	static cdShapeOk(raw: string, ncd: number, idx: number): boolean {
		if (ncd === 0) return true;
		if (ncd !== 1) return false;
		const m = CD_LEAD_RE.exec(raw);
		if (!m) return false;
		const rest = m[2].replace(/&&/g, "\x03");
		const stop = rest.search(/[|&;\n()]/);
		const chain = stop < 0 ? rest : rest.slice(0, stop);
		const marks = (chain.match(/\x03/g) ?? []).length;
		// The cd is segment 1, and the chain holds one more segment than &&s.
		return idx <= marks + 2;
	}

	// Which checkout dir is: worktree (the top of a linked worktree), sub
	// (inside one), main, layout (a git layout this cannot map to a main
	// checkout: --separate-git-dir or bare) or notrepo. The gate list comes
	// from the main checkout's AGENTS.md, never the worktree's. Cached per
	// directory.
	gateDirState(dir: string): GateState {
		const cached = this.gateCache.get(dir);
		if (cached) return cached;
		const st: GateState = { kind: "notrepo", root: "", gates: [] };
		this.gateCache.set(dir, st);
		const r = git(["-C", dir, "rev-parse", "--path-format=absolute", "--git-dir", "--git-common-dir", "--show-toplevel"]);
		const [gitdir = "", common = "", top = ""] = r.ok ? r.out.split("\n") : [];
		if (!gitdir || !common) return st;
		const bare = git(["--git-dir=" + common, "config", "--bool", "core.bare"]);
		if (base(common) !== ".git" || (bare.ok && bare.out === "true")) {
			st.kind = "layout";
			return st;
		}
		st.root = common.slice(0, common.lastIndexOf("/"));
		st.gates = declaredGates(st.root);
		if (gitdir === common) {
			st.kind = "main";
			return st;
		}
		const real = (p: string) => {
			try {
				return statSync(p).isDirectory() ? realpathSync(p) : "";
			} catch {
				return "";
			}
		};
		const phys = real(dir);
		st.kind = phys && phys === real(top) ? "worktree" : "sub";
		return st;
	}

	// ---------------------------------------------------------------- reviewer
	// Read allowlists, and beyond them the project's declared gates only, run
	// as written in AGENTS.md's ```gates block, from the top of a linked
	// worktree: a package manager, an install, a snapshot update, a --fix, a
	// watcher, an emitting build and a network call are refused whatever the
	// list says. A package manager is never a gate, with two exceptions: a bun
	// project's `bun --no-install test`, and one frozen install, with scripts
	// off, that the worktree's lockfile names, into a worktree with no
	// node_modules, whose install config matches the merge base with main.
	reviewerProgressOk(): boolean {
		const c = this.rawCommandStr;
		if (c.includes("\n") || c.includes("\r")) return false;
		let path: string;
		let m = REVIEWER_PROGRESS_DATE_RE.exec(c);
		if (m) path = m[2];
		else {
			m = REVIEWER_PROGRESS_MKDIR_RE.exec(c);
			if (!m) return false;
			path = m[1];
		}
		if (`/${path}/`.includes("/../") || `/${path}/`.includes("/./")) return false;
		// Anchored to the session's project, never to the cwd.
		const project = process.env.CLAUDE_PROJECT_DIR;
		if (!project || !statSafeDir(project)) return false;
		const projectRoot = this.gateDirState(project).root;
		if (!projectRoot) return false;
		const here = this.gateDirState(this.cwd).root;
		if (!here) return false;
		if (physPath(here) !== physPath(projectRoot)) return false;
		const want = `${physPath(projectRoot)}/docs/runs`;
		if (c.startsWith("mkdir")) {
			if (physPath(path) !== want) return false;
			if (isLink(path)) return false;
		} else {
			if (!REVIEWER_PROGRESS_NAME_RE.test(base(path))) return false;
			if (physPath(path.slice(0, path.lastIndexOf("/"))) !== want) return false;
			if (isLink(path)) return false;
			if (exists(path) && !isFile(path)) return false;
		}
		return true;
	}

	reviewer(): void {
		if (this.toolName === "Bash" && this.reviewerProgressOk()) return;
		if (isWriteTool(this.toolName)) {
			deny(
				`reviewer invariant: "Never edit, write or create a file. Not a fix, not a test, not a note." The report is the whole output: a reviewer that edits makes the diff the human approves a different diff from the one they read. Raise it as a finding and let coder make the change.`,
			);
		}
		if (this.toolName !== "Bash" || !this.commandStr) return;
		const scan0 = dropDevNull(stripQuoted(this.commandStr));
		const subst = stripSingleQuoted(this.commandStr);
		if (runsSed(scan0) && sedWrites(this.commandStr)) {
			deny(
				`reviewer invariant: "Never edit, write or create a file. Not a fix, not a test, not a note." That sed script contains a w, W or e command, which writes a file or runs a program. Quote it however you like; it is still a script.`,
			);
		}
		if (subst.includes("$(") || subst.includes("`")) {
			deny(
				"reviewer invariant: no command substitution. $( and backticks can hide a write or a test run behind something that reads like an inspection, and double quotes do not disarm them. Run the inner command on its own.",
			);
		}
		if (scan0.includes(">")) deny(`reviewer invariant: "Never edit, write or create a file. Not a fix, not a test, not a note." > and >> create files. The report is the whole output.`);
		if (scan0.includes("<(") || scan0.includes(">(")) deny("reviewer invariant: no process substitution. Run the commands separately.");

		this.reviewRaw = scan0;
		this.reviewScan = boundSegments(splitOps(scan0), log);
		// Two passes: whether a gate runs where the hook thinks depends on the
		// segments after it as well as before.
		const segs: string[] = [];
		const toks: string[] = [];
		this.reviewNcd = 0;
		for (const raw of lines(this.reviewScan)) {
			const seg = trimSeg(raw);
			if (!seg) continue;
			const tok = leadingToken(seg);
			segs.push(seg);
			toks.push(tok);
			if (SHELL_CD_WORDS.has(tok)) this.reviewNcd += 1;
		}
		this.segHere = this.cwd;
		this.segPrev = this.cwd;
		for (let i = 0; i < segs.length; i++) {
			const seg = segs[i];
			const tok = toks[i];
			if (!tok) continue;
			this.segCd(seg, tok);
			if (!REVIEWER_ALLOWED_CMDS.has(tok)) {
				// Not a read, so a declared gate or nothing.
				this.reviewerGateCheck(seg, tok, i + 1);
				continue;
			}
			const padded = ` ${seg} `;
			if (tok === "git") {
				const verb = subVerb(seg);
				if (!READONLY_GIT.has(verb)) {
					deny(
						`reviewer invariant: "Never run a git command that writes: no commit, push, force-push, checkout, stash, reset or rebase. Read-only git only." "git ${verb}" is not a read-only verb. Read the history with git log, show, blame, diff or ls-files; anything that changes a ref belongs to coder.`,
					);
				}
			} else if (tok === "sed") {
				if (padded.includes(" -i") || padded.includes(" --in-place")) deny("reviewer invariant: sed -i edits the file in place. The reviewer never changes the diff it is reading.");
			} else if (tok === "find") {
				if ([" -exec", " -execdir", " -ok", " -okdir", " -delete", " -fprintf", " -fls", " -fprint"].some((f) => padded.includes(f))) {
					deny("reviewer invariant: find -exec, -delete and the -f* actions run or write things. Locate files with find and read them separately.");
				}
			}
		}
	}

	// The segments with a leading literal CI=true removed where it leads a
	// gate: a command follows it and that command is not a read.
	static ciStripped(segs: string): string {
		return lines(segs)
			.map((seg) => {
				const m = new RegExp(`^${SP}*CI=true${SP}+([^ \\t\\n\\v\\f\\r][\\s\\S]*)$`).exec(seg);
				if (m) {
					const tok = leadingToken(m[1]);
					if (tok && !REVIEWER_ALLOWED_CMDS.has(tok)) return m[1];
				}
				return seg;
			})
			.join("\n");
	}

	// The segment as the words a gate is compared with.
	static gateWords(seg: string): string {
		let s = stripLeadingSyntax(seg);
		s = lines(s)
			.map((l) => l.replace(/[ \t\v\f\r)]+$/, ""))
			.join("\n");
		return words(unescapeWords(s)).join(" ");
	}

	// bungate, install:<kind>, or "".
	static pmForm(seg: string): string {
		const ws = Scope.gateWords(seg);
		const body = ws.startsWith("CI=true ") ? ws.slice("CI=true ".length) : ws;
		if (body === REVIEWER_BUN_GATE || body.startsWith(`${REVIEWER_BUN_GATE} `)) return "bungate";
		for (const [key, form] of REVIEWER_INSTALL_FORMS) if (ws === form) return `install:${key}`;
		return "";
	}

	// Whether the words after the test gate's own are one relative path, one
	// test-name filter, or one of each, the path staying inside top.
	static selectorOk(rest: string, top: string): boolean {
		let paths = 0;
		let names = 0;
		let want = false;
		const topp = physPath(top);
		for (const tok of words(rest)) {
			if (want) {
				if (!GATE_NAME_RE.test(tok)) return false;
				names += 1;
				want = false;
				continue;
			}
			if (["-t", "--testNamePattern", "--test-name-pattern", "-g", "--grep"].includes(tok)) want = true;
			else if (/^(--testNamePattern|--test-name-pattern|--grep)=/.test(tok)) {
				if (!GATE_NAME_RE.test(tok.slice(tok.indexOf("=") + 1))) return false;
				names += 1;
			} else if (tok.startsWith("-")) return false;
			else {
				if (!GATE_PATH_RE.test(tok)) return false;
				if (`/${tok}/`.includes("/../")) return false;
				if (!topp) return false;
				if (isLink(lexAbs(tok, top))) return false;
				const pp = physPath(lexAbs(tok, top));
				if (!pp.startsWith(`${topp}/`)) return false;
				paths += 1;
			}
		}
		return !want && paths <= 1 && names <= 1 && paths + names >= 1;
	}

	static gateMatch(ws: string, gates: [string, string][], top: string): string {
		for (const [name, cmd0] of gates) {
			if (!cmd0) continue;
			const cmd = words(cmd0).join(" ");
			if (ws === cmd) return name;
			if (name === "test" && ws.startsWith(`${cmd} `) && Scope.selectorOk(ws.slice(cmd.length + 1), top)) return name;
		}
		return "";
	}

	// Whether p, absolute and normalised, is under TMPDIR or a Claude Code
	// scratchpad root and outside every checkout named, both spellings of the
	// path compared.
	static underScratch(p: string, ...checkouts: string[]): boolean {
		const pp = physPath(p);
		for (const c of checkouts) {
			if (!c) continue;
			if (p === c || p.startsWith(`${c}/`)) return false;
			if (pp === c || pp.startsWith(`${c}/`)) return false;
		}
		if (/^\/tmp\/claude-[\s\S]*\/[\s\S]*$/.test(p) || /^\/private\/tmp\/claude-[\s\S]*\/[\s\S]*$/.test(p)) return true;
		if (/^\/private\/tmp\/claude-[\s\S]*\/[\s\S]*$/.test(pp)) return true;
		const tmpdir = process.env.TMPDIR;
		if (tmpdir) {
			let t = lexAbs(tmpdir, "/");
			if (t !== "/" && p.startsWith(`${t}/`)) return true;
			t = physPath(t);
			if (t !== "/" && pp.startsWith(`${t}/`)) return true;
		}
		return false;
	}

	// The first word that puts a gate in a refused class, as "<class>:<word>":
	// snapshot, write, watch, or emit (build output not under TMPDIR or the
	// scratchpad). tsc and vue-tsc emit unless told --noEmit; so does build.
	static gateFlagDenial(ws: string, here: string, root: string): string {
		const herep = physPath(here);
		const all = words(ws);
		const tool = base(all[0] ?? "");
		let verb = "";
		let wantOut = "";
		let noemit = false;
		let outOk = false;
		let emits = false;
		for (const tok of all.slice(1)) {
			if (wantOut) {
				const abs = lexAbs(tok, here);
				if (!Scope.underScratch(abs, here, herep, root)) return `emit:${wantOut} ${tok}`;
				wantOut = "";
				outOk = true;
				continue;
			}
			if (/^(-u|--u|--u=.*|--update|--update=.*|--update\..*|--update-snapshots|--update-snapshots=.*|--updateSnapshot|--updateSnapshot=.*|--update-snapshot|--update-snapshot=.*|--test-update-snapshots|--test-update-snapshots=.*)$/s.test(tok)) return `snapshot:${tok}`;
			if (/^(--fix|--fix=.*|--fix-.*|--write|--write=.*|--apply|--apply=.*|--apply-unsafe)$/s.test(tok)) return `write:${tok}`;
			if (/^(--watch|--watch=.*|--watch-.*|--watchAll|--watchAll=.*)$/s.test(tok)) return `watch:${tok}`;
			if (tok === "--noEmit" || tok === "--noEmit=true" || tok === "--no-emit") {
				noemit = true;
				continue;
			}
			if (["--outDir", "--outdir", "--out-dir", "--outFile", "--outfile", "--out-file", "--declarationDir", "--tsBuildInfoFile", "--output", "-o", "--dist-dir"].includes(tok)) {
				wantOut = tok;
				continue;
			}
			if (/^(--outDir|--outdir|--out-dir|--outFile|--outfile|--out-file|--declarationDir|--tsBuildInfoFile|--output|--dist-dir)=/.test(tok)) {
				const abs = lexAbs(tok.slice(tok.indexOf("=") + 1), here);
				if (!Scope.underScratch(abs, here, herep, root)) return `emit:${tok}`;
				outOk = true;
				continue;
			}
			// A cluster of short flags, with or without a value: -u updates
			// snapshots, -w is watch or write.
			const cl = /^-([A-Za-z]+)(=[\s\S]*)?$/.exec(tok);
			if (cl) {
				if (cl[1].includes("u")) return `snapshot:${tok}`;
				if (cl[1].includes("w")) return `watch:${tok}`;
			}
			if (!tok.startsWith("-") && !verb) {
				verb = tok;
				if (verb === "watch" || verb === "dev") return `watch:${verb}`;
				if (verb === "build") emits = true;
			}
		}
		if (wantOut) return `emit:${wantOut}`;
		if (tool === "tsc" || tool === "vue-tsc") emits = true;
		if (emits && !noemit && !outOk) return `emit:${tool}${verb ? ` ${verb}` : ""}`;
		return "";
	}

	reviewerGateCheck(seg: string, tok: string, idx: number): void {
		let pm = "";
		if (REVIEWER_PACKAGE_MANAGERS.has(tok)) {
			pm = Scope.pmForm(seg);
			if (pm.startsWith("install:")) {
				this.reviewerInstallCheck(tok, idx, pm.slice(8));
				return;
			}
			if (pm !== "bungate") {
				deny(
					`reviewer invariant: ${REVIEWER_GATE_INVARIANT} "${tok}" is a package manager, and a package manager is never a gate: \`pnpm --filter x typecheck\` may install before it runs the script, and an install changes the dependencies under review. Declare the gate as the binary it calls, ./node_modules/.bin/<tool>, and run that. Two forms are the exceptions, each exactly as written: a bun project's test gate, declared as \`${REVIEWER_BUN_GATE}\`, and at the top of a review worktree with no node_modules the one install its lockfile names - ${REVIEWER_INSTALL_FORMS.map(([, f]) => f).join("; ")}.`,
				);
			}
		}
		if (REVIEWER_NETWORK_TOOLS.has(tok)) {
			deny(`reviewer invariant: ${REVIEWER_GATE_INVARIANT} "${tok}" is a network tool, and a review reads the diff, not the network. Whatever it would fetch, say in a finding what needs checking.`);
		}
		if (!Scope.cdShapeOk(this.reviewRaw, this.reviewNcd, idx)) {
			deny(`reviewer invariant: ${REVIEWER_GATE_INVARIANT} "${tok}" is not a read, so it may only be a declared gate, and where a gate runs has to be certain. ${CD_SHAPE_RULE}`);
		}
		const { kind, root, gates } = this.gateDirState(this.segHere);
		if (kind === "layout") {
			deny(
				`reviewer invariant: ${REVIEWER_GATE_INVARIANT} This repository keeps its git dir apart from its checkout (a --separate-git-dir or bare layout), so this hook cannot tell where the main checkout is, and it reads the gate list from nowhere else. Nothing may execute here; list the gates under Unverified.`,
			);
		}
		if (!gates.length) {
			deny(
				`reviewer invariant: ${REVIEWER_GATE_INVARIANT} "${tok}" is not one of the commands a reviewer reads with, and this checkout declares no gates in AGENTS.md, so nothing may execute. Say in a finding what needs running and what you expect it to show, and list the unrun gate under Unverified.`,
			);
		}
		const candidate = gates.some(([, cmd0]) => {
			const cmd = cmd0.startsWith("CI=true ") ? cmd0.slice("CI=true ".length) : cmd0;
			const first = cmd.split(/[ \t\n\v\f\r]/)[0];
			return base(first) === tok;
		});
		if (!candidate) {
			deny(
				`reviewer invariant: ${REVIEWER_GATE_INVARIANT} "${tok}" is not one of the commands a reviewer reads with, and not a declared gate in ${root}/AGENTS.md. Say in a finding what needs running and what you expect it to show, and list it under Unverified.`,
			);
		}

		// Walked once per command. One assignment is exempt: a literal CI=true
		// leading a gate in its own segment, which stops test runners writing
		// snapshots on every version; any other assignment is refused.
		if (this.reviewAssigns === null) this.reviewAssigns = commandAssigns(Scope.ciStripped(this.reviewScan));
		const why = this.reviewAssigns;
		if (why.startsWith("for:")) {
			deny(
				`reviewer invariant: ${REVIEWER_GATE_INVARIANT} A command that runs a gate assigns no variable, and this one has a for loop whose header assigns ${why.slice(4)} - NODE_OPTIONS alone loads code into every test run. Run the gate on its own, as declared.`,
			);
		} else if (why === "read") {
			deny(
				`reviewer invariant: ${REVIEWER_GATE_INVARIANT} This command runs read, which assigns a variable from standard input where no check can see it, and a command that runs a gate assigns none. Run the gate on its own, as declared.`,
			);
		} else if (why) {
			deny(
				`reviewer invariant: ${REVIEWER_GATE_INVARIANT} A command that runs a gate assigns no variable, and this one assigns ${why} - NODE_OPTIONS alone loads code into every test run. Run the gate on its own, as declared.`,
			);
		}

		const ws = Scope.gateWords(seg);
		const body = ws.startsWith("CI=true ") ? ws.slice("CI=true ".length) : ws;
		const first = body.split(" ")[0];
		if (COMMAND_WRAPPERS.has(base(first))) {
			deny(
				`reviewer invariant: ${REVIEWER_GATE_INVARIANT} "${base(first)}" is a wrapper in front of the gate, and a gate runs exactly as declared - xargs alone adds words no check can see. Run the gate with nothing in front of it.`,
			);
		}
		const exp = wordExpansionDenial(ws, false);
		if (exp.startsWith("expands:")) {
			deny(
				`reviewer invariant: ${REVIEWER_GATE_INVARIANT} "${exp.slice(8)}" holds $, {, *, ?, [ or a backtick, which the shell expands into words the gate reads and this check does not. Write every word of the gate out plainly.`,
			);
		} else if (exp.startsWith("quoted:")) {
			deny(`reviewer invariant: ${REVIEWER_GATE_INVARIANT} "${exp.slice(7)}" is a quoted option, and what a quoted option says cannot be read here. Run the gate as declared, unquoted.`);
		}
		if (ws.includes("'") || ws.includes('"')) {
			deny(
				`reviewer invariant: ${REVIEWER_GATE_INVARIANT} This gate command has a quoted word, and a quoted span is erased before the check reads it, so what it says cannot be read here. Run the gate as declared, unquoted.`,
			);
		}
		if (hasQuotedFlag(this.commandStr)) {
			deny(
				`reviewer invariant: ${REVIEWER_GATE_INVARIANT} This command has a quoted option - a quote opening a word that starts with - - and what a quoted option says cannot be read here. Run the gate as declared, unquoted.`,
			);
		}
		const inst = installVerb(body);
		if (inst) {
			deny(
				`reviewer invariant: ${REVIEWER_GATE_INVARIANT} "${tok} ${inst}" installs, and an install changes the dependencies under review. If the gate cannot run without it, say so in a finding and list the gate under Unverified.`,
			);
		}
		const flag = Scope.gateFlagDenial(body, this.segHere, root);
		if (flag.startsWith("snapshot:")) {
			deny(`reviewer invariant: ${REVIEWER_GATE_INVARIANT} "${flag.slice(9)}" updates snapshots, which rewrites the expectations the diff is judged against. Run the gate without it; a stale snapshot is a finding.`);
		} else if (flag.startsWith("write:")) {
			deny(`reviewer invariant: ${REVIEWER_GATE_INVARIANT} "${flag.slice(6)}" rewrites files, which changes the diff under review. Run the check without it; what it would change is a finding.`);
		} else if (flag.startsWith("watch:")) {
			deny(`reviewer invariant: ${REVIEWER_GATE_INVARIANT} "${flag.slice(6)}" is watch mode, which never exits and reports no final count. Run the gate once, as declared.`);
		} else if (flag.startsWith("emit:")) {
			deny(
				`reviewer invariant: ${REVIEWER_GATE_INVARIANT} "${flag.slice(5)}" writes build output inside the repository. A gate may pass --noEmit, or send its output with --outDir under TMPDIR or the scratchpad.`,
			);
		}

		if (kind === "main") {
			deny(
				`reviewer invariant: ${REVIEWER_GATE_INVARIANT} ${this.segHere} is the main checkout, not a linked worktree. The board hooks commit there and it has whatever branch out it happens to have, so a gate run there checks the wrong tree. Run the gate from the top of the review worktree.`,
			);
		} else if (kind === "sub") {
			deny(
				`reviewer invariant: ${REVIEWER_GATE_INVARIANT} ${this.segHere} is inside the review worktree but not at its top, and a gate runs from the top of the review worktree, where its declared paths mean what they say. cd to the worktree's top and run it there.`,
			);
		} else if (kind !== "worktree") {
			deny(`reviewer invariant: ${REVIEWER_GATE_INVARIANT} ${this.segHere} is not a git checkout, so it cannot be the review worktree. Run the gate from the top of the review worktree.`);
		}

		const name = Scope.gateMatch(ws, gates, this.segHere);
		// The bun gate is the one form whatever the list declares.
		if (name && pm === "bungate" && body !== REVIEWER_BUN_GATE) {
			if (!Scope.selectorOk(body.startsWith(`${REVIEWER_BUN_GATE} `) ? body.slice(REVIEWER_BUN_GATE.length + 1) : body, this.segHere)) {
				deny(
					`reviewer invariant: ${REVIEWER_GATE_INVARIANT} "${ws}" adds words to bun's test gate, which is exactly \`${REVIEWER_BUN_GATE}\` with at most one relative path and one test-name filter after it, whatever the gates block declares.`,
				);
			}
		}
		if (name) return;
		deny(
			`reviewer invariant: ${REVIEWER_GATE_INVARIANT} "${ws}" is not a declared gate, nor the test gate with one relative path or one test name after it. The declared gates, in ${root}/AGENTS.md, are: ${gates.map(([n]) => `${n} `).join("")}- run one exactly as written there.`,
		);
	}

	// The lockfile install. Returns only when it may run here.
	reviewerInstallCheck(tok: string, idx: number, want: string): void {
		const form = formOf(want);
		if (!Scope.cdShapeOk(this.reviewRaw, this.reviewNcd, idx)) {
			deny(`reviewer invariant: ${REVIEWER_GATE_INVARIANT} "${form}" installs, so where it runs has to be certain. ${CD_SHAPE_RULE}`);
		}
		const { kind, root, gates } = this.gateDirState(this.segHere);
		const here = this.segHere;
		if (kind === "layout") {
			deny(
				`reviewer invariant: ${REVIEWER_GATE_INVARIANT} This repository keeps its git dir apart from its checkout (a --separate-git-dir or bare layout), so this hook cannot tell where the main checkout is. Install nothing; list the gates under Unverified.`,
			);
		} else if (kind === "main") {
			deny(
				`reviewer invariant: ${REVIEWER_GATE_INVARIANT} ${here} is the main checkout, not a linked worktree, and an install there changes the human's own dependencies. Install only at the top of the review worktree.`,
			);
		} else if (kind === "sub") {
			deny(
				`reviewer invariant: ${REVIEWER_GATE_INVARIANT} ${here} is inside the review worktree but not at its top, and the install runs from the top of the review worktree, beside its lockfile. cd to the worktree's top and run it there.`,
			);
		} else if (kind !== "worktree") {
			deny(`reviewer invariant: ${REVIEWER_GATE_INVARIANT} ${here} is not a git checkout, so it cannot be the review worktree. Install only at the top of the review worktree.`);
		}
		if (!gates.length) {
			deny(
				`reviewer invariant: ${REVIEWER_GATE_INVARIANT} "${form}" installs dependencies for the gates, and this checkout declares no gates in AGENTS.md, so there is nothing to install for. List the unrun gates under Unverified.`,
			);
		}
		// No assignment anywhere, CI=true included: npm_config_* reconfigures
		// an install.
		if (commandAssigns(this.reviewScan)) {
			deny(
				`reviewer invariant: ${REVIEWER_GATE_INVARIANT} A command that installs assigns no variable, and this one does: npm_config_ignore_scripts=false alone turns install scripts back on. Run "${form}" on its own.`,
			);
		}
		const top = here;
		if (exists(`${top}/node_modules`) || isLink(`${top}/node_modules`)) {
			deny(
				`reviewer invariant: ${REVIEWER_GATE_INVARIANT} ${top}/node_modules already exists, and a reviewer installs only into a worktree that has none, so an install never rewrites dependencies someone else put there. Run the gates against what is installed, and if they cannot run, say so under Unverified.`,
			);
		}
		const have = lockKind(top);
		if (have === want) {
			let drift: string;
			try {
				drift = installConfigDrift(top, root);
			} catch {
				drift = "unreadable config";
			}
			if (drift.startsWith("base:")) {
				deny(
					`reviewer invariant: ${REVIEWER_GATE_INVARIANT} ${drift.slice(5)}, and the install's config is checked against that merge base, the one commit that is both main's and the diff's. Install nothing; list the gates that need dependencies under Unverified.`,
				);
			}
			if (drift) {
				deny(
					`reviewer invariant: ${REVIEWER_GATE_INVARIANT} ${drift} in ${top} differs from its merge base with the main checkout's HEAD (${root}), and an install reads config even with scripts off: a yarnPath, plugin or pnpmfile is code, an .npmrc, .env or bunfig.toml registry decides what is fetched, and packageManager or devEngines picks the tool. A reviewer installs only when every top-level dotfile but the inert ones, bunfig.toml, pnpm-workspace.yaml and every package.json field but the ordinary ones are what that merge base has. Say in a finding that the diff changes it, and list the gates that need dependencies under Unverified.`,
				);
			}
			return;
		}
		if (have === "none") {
			deny(
				`reviewer invariant: ${REVIEWER_GATE_INVARIANT} ${top} has no lockfile (bun.lock, bun.lockb, package-lock.json, npm-shrinkwrap.json, pnpm-lock.yaml or yarn.lock), and a reviewer installs only what a lockfile pins. List the gates that need dependencies under Unverified, with that reason.`,
			);
		}
		if (have.startsWith("many:")) {
			deny(
				`reviewer invariant: ${REVIEWER_GATE_INVARIANT} ${top} has more than one lockfile (${have.slice(5)}), so which install the project means is a guess. List the gates that need dependencies under Unverified, with that reason.`,
			);
		}
		if (have.startsWith("link:")) {
			deny(
				`reviewer invariant: ${REVIEWER_GATE_INVARIANT} ${top}/${have.slice(5)} is a symlink or not a regular file, so the lockfile the install would read is not the one in the worktree. List the gates that need dependencies under Unverified.`,
			);
		}
		if (have === "yarnx") {
			deny(
				`reviewer invariant: ${REVIEWER_GATE_INVARIANT} ${top}/yarn.lock is neither yarn 1's (# yarn lockfile v1) nor berry's (__metadata:), so which frozen install it takes cannot be told. List the gates that need dependencies under Unverified.`,
			);
		}
		deny(
			`reviewer invariant: ${REVIEWER_GATE_INVARIANT} "${tok}" is not the install this worktree's lockfile names: ${top} does not have the lockfile that form reads. The one install it allows is "${formOf(have)}".`,
		);
	}

	// ------------------------------------------------------------------- coder
	// A git command that writes, in a directory that cannot be shown to be a
	// linked worktree, is refused: committing in a main checkout puts the work
	// on somebody else's branch. `git worktree add` is the one writing command
	// allowed anywhere, since it creates the isolation. scripter is held the
	// same way.
	coder(): void {
		if (this.toolName !== "Bash" || !this.commandStr) return;
		if (!Bun.which("git")) return;
		this.segHere = this.cwd;
		this.segPrev = this.cwd;
		const raw = stripQuoted(this.commandStr);
		const segs: string[] = [];
		const toks: string[] = [];
		let ncd = 0;
		for (const line of lines(boundSegments(splitOps(raw), log))) {
			// A subshell's parens go with the whitespace.
			const seg = line.replace(new RegExp(`^[ \\t\\n\\v\\f\\r(]+`), "").replace(new RegExp(`[ \\t\\n\\v\\f\\r)]+$`), "");
			if (!seg) continue;
			const first = leadingToken(seg);
			segs.push(seg);
			toks.push(first);
			if (SHELL_CD_WORDS.has(first)) ncd += 1;
		}
		for (let i = 0; i < segs.length; i++) {
			const seg = segs[i];
			const first = toks[i];
			if (this.segCd(seg, first)) continue;
			if (first !== "git") continue;
			const verb = subVerb(seg);
			if (!CODER_WRITING_GIT.has(verb)) continue;
			if (verb === "worktree" && worktreeSubVerb(seg) === "add") continue;
			if (!Scope.cdShapeOk(raw, ncd, i + 1)) {
				deny(
					`coder invariant: "Confirm you are in your worktree and that it is clean before you touch anything." "git ${verb}" writes, and this guard has to be certain which checkout it writes in. ${CD_SHAPE_RULE} Or pass the worktree with git -C <path>. If you cannot tell which worktree is yours, raise a "Blocker: " line asking, as a question ending in "?", where your worktree is.`,
				);
			}
			const target = gitTargetDir(seg, this.segHere) || ".";
			const g = git(["-C", target, "rev-parse", "--absolute-git-dir"]);
			const gitdir = g.ok ? g.out : "";
			if (gitdir.includes("/worktrees/")) continue;
			if (!gitdir) {
				deny(
					`coder invariant: "Confirm you are in your worktree and that it is clean before you touch anything." "git ${verb}" writes, and ${target} is not a git repository at all, so it cannot be the worktree you were given. Find the worktree you were handed, or stop and raise a "Blocker: " line asking, as a question ending in "?", which worktree you were meant to use.`,
				);
			}
			deny(
				`coder invariant: "Confirm you are in your worktree and that it is clean before you touch anything", and out of scope is "anything on a shared branch". "git ${verb}" writes, and ${target} is not a linked worktree - git reports its git dir as ${gitdir}, which is a main checkout. Committing there puts your work on somebody else's branch. Work in the worktree you were given; if you have not got one, change nothing and raise a "Blocker: " line asking, as a question ending in "?", where your worktree is.`,
			);
		}
	}

	// ----------------------------------------------------- reviewer, break mode
	// The one rule that may run anything: mutation testing is copy, change, run.
	// Its write half is the outside-the-project check above; here, read-only git.
	reviewerBreak(): void {
		if (this.toolName !== "Bash" || !this.commandStr) return;
		for (const seg of this.segments(stripQuoted(this.commandStr))) {
			if (leadingToken(seg) !== "git") continue;
			const verb = subVerb(seg);
			if (!READONLY_GIT.has(verb)) {
				deny(
					`reviewer invariant: "Never run a git command that writes: no commit, push, force-push, checkout, stash, reset or rebase. Read-only git only." "git ${verb}" is not a read-only verb, and a mutation that survived is a finding with a reproduction rather than a patch. Mutate a copy outside the project and report what survived.`,
				);
			}
		}
	}

	// ------------------------------------- ui-designer and the use-mode reviewer
	// Read-only git and no install; Bash otherwise open, since building,
	// serving and driving a prototype or the product is the job.
	readonlyGitNoInstall(role: string, invariant: string, gitHint: string, installHint: string): void {
		if (this.toolName !== "Bash" || !this.commandStr) return;
		for (const seg of this.segments(stripQuoted(this.commandStr))) {
			const tok = leadingToken(seg);
			if (!tok) continue;
			const verb = subVerb(seg);
			if (tok === "git" && !READONLY_GIT.has(verb)) deny(`${role} invariant: ${invariant} "git ${verb}" is not a read-only verb. ${gitHint}`);
			if (UI_DESIGNER_INSTALLERS.has(tok)) {
				const iv = installVerb(seg);
				if (INSTALL_VERBS.has(iv)) deny(`${role} invariant: ${invariant} "${tok} ${iv}" installs into the repo. ${installHint}`);
			}
		}
	}
}

function statSafeDir(p: string): boolean {
	try {
		return statSync(p).isDirectory();
	} catch {
		return false;
	}
}

// The directory a git command targets: its -C, resolved where the segment
// runs, else where the segment runs.
function gitTargetDir(seg: string, here: string): string {
	let want = false;
	for (const tok of words(commandWords(seg))) {
		if (want) return lexAbs(tok, here);
		if (tok === "-C") want = true;
	}
	return here;
}

// The sub-verb of `git worktree`, or "".
function worktreeSubVerb(seg: string): string {
	let state = "opts";
	for (const tok of words(commandWords(seg)).slice(1)) {
		if (state === "skip") {
			state = "opts";
			continue;
		}
		if (["-C", "-c", "--git-dir", "--work-tree"].includes(tok)) {
			state = "skip";
			continue;
		}
		if (tok.startsWith("-")) continue;
		if (state === "opts") {
			if (tok === "worktree") state = "verb";
			continue;
		}
		return tok;
	}
	return "";
}

// The kind of lockfile at top: bun, npm, pnpm, yarn1 or yarn2, or none,
// many:<kinds>, yarnx, or link:<file> for one that is a symlink or not a
// regular file.
function lockKind(top: string): string {
	const kinds: string[] = [];
	for (const f of ["bun.lock", "bun.lockb", "package-lock.json", "npm-shrinkwrap.json", "pnpm-lock.yaml", "yarn.lock"]) {
		const p = `${top}/${f}`;
		if (!exists(p) && !isLink(p)) continue;
		if (isLink(p) || !isFile(p)) return `link:${f}`;
		let k: string;
		if (f.startsWith("bun.")) k = "bun";
		else if (f === "package-lock.json" || f === "npm-shrinkwrap.json") k = "npm";
		else if (f === "pnpm-lock.yaml") k = "pnpm";
		else {
			let text = "";
			try {
				text = readFileSync(p, "utf8");
			} catch {}
			const ls = text.split("\n");
			if (ls.some((l) => l.startsWith("# yarn lockfile v1"))) k = "yarn1";
			else if (ls.some((l) => l.startsWith("__metadata:"))) k = "yarn2";
			else k = "yarnx";
		}
		if (!kinds.includes(k)) kinds.push(k);
	}
	if (!kinds.length) return "none";
	if (kinds.length > 1) return `many:${kinds.join(" ")}`;
	return kinds[0];
}

function globMatch(pattern: string, name: string): boolean {
	const re = new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[\\s\\S]*").replace(/\?/g, "[\\s\\S]")}$`);
	return re.test(name);
}

// Whether a top-level name is compared with the merge base: a config file name
// in any case, or a dot entry other than .git not spelled as an inert one.
function comparedName(n: string): boolean {
	if (n === ".git" || n === "" || n === "." || n === "..") return false;
	if (REVIEWER_INSTALL_CONFIG_FILES.has(n.toLowerCase())) return true;
	if (n.startsWith(".")) return !REVIEWER_INERT_DOT.some((p) => globMatch(p, n));
	return false;
}

const byteSort = (a: string, b: string) => Buffer.compare(Buffer.from(a), Buffer.from(b));

// "relpath hash" for every file under d, sorted, hashed as git stores them
// with no filter; null on a symlink, a special file or a name with a newline.
function diskTree(top: string, d: string): string | null {
	const files: string[] = [];
	const walk = (dir: string, rel: string): boolean => {
		let names: string[];
		try {
			names = readdirSync(dir);
		} catch {
			return false;
		}
		for (const n of names) {
			if (n.includes("\n")) return false;
			const p = `${dir}/${n}`;
			const r = rel ? `${rel}/${n}` : n;
			let st: ReturnType<typeof lstatSync>;
			try {
				st = lstatSync(p);
			} catch {
				return false;
			}
			if (st.isDirectory()) {
				if (!walk(p, r)) return false;
			} else if (st.isFile()) files.push(r);
			else return false;
		}
		return true;
	};
	if (!walk(d, "")) return null;
	if (!files.length) return "";
	files.sort(byteSort);
	const r = run(["git", "-C", top, "hash-object", "--no-filters", "--stdin-paths"], { input: files.map((f) => `${d}/${f}\n`).join("") });
	if (!r.ok) return null;
	const hashes = r.stdout.replace(/\n+$/, "").split("\n");
	return files
		.map((f, i) => `${f} ${hashes[i] ?? ""}`)
		.sort(byteSort)
		.join("\n");
}

// Whether the top-level entry n on disk has the content the base commit has
// for it, both absent included. Contents, not git's status.
function entrySame(top: string, baseRev: string, n: string): boolean {
	const p = `${top}/${n}`;
	const t = git(["-C", top, "cat-file", "-t", `${baseRev}:${n}`]);
	const type = t.ok ? t.out : "";
	if (isLink(p)) return false;
	if (!exists(p)) return type === "";
	if (isFile(p)) {
		if (type !== "blob") return false;
		const want = git(["-C", top, "rev-parse", `${baseRev}:${n}`]);
		const got = git(["-C", top, "hash-object", "--no-filters", "--", p]);
		return want.ok && got.ok && want.out !== "" && want.out === got.out;
	}
	if (statSafeDir(p)) {
		if (type !== "tree") return false;
		const got = diskTree(top, p);
		if (got === null) return false;
		const ls = run(["git", "-C", top, "ls-tree", "-r", "-z", `${baseRev}:${n}`]);
		if (!ls.ok) return false;
		const want = ls.stdout
			.split("\0")
			.filter((rec, i, all) => rec !== "" || i < all.length - 1)
			.map((rec) => {
				const tab = rec.indexOf("\t");
				const meta = (tab < 0 ? rec : rec.slice(0, tab)).split(" ");
				const path = tab < 0 ? "" : rec.slice(tab + 1);
				return `${path} ${meta[2] ?? ""}`;
			})
			.sort(byteSort)
			.join("\n")
			.replace(/\n+$/, "");
		return want === got;
	}
	return false;
}

// jq's ==: deep, with object keys in any order.
function jqEqual(a: unknown, b: unknown): boolean {
	if (a === b) return true;
	if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") return false;
	if (Array.isArray(a) !== Array.isArray(b)) return false;
	if (Array.isArray(a)) {
		const bb = b as unknown[];
		return a.length === bb.length && a.every((v, i) => jqEqual(v, bb[i]));
	}
	const ao = a as Record<string, unknown>;
	const bo = b as Record<string, unknown>;
	const ka = Object.keys(ao);
	const kb = Object.keys(bo);
	return ka.length === kb.length && ka.every((k) => Object.prototype.hasOwnProperty.call(bo, k) && jqEqual(ao[k], bo[k]));
}

// The first thing about the worktree top that is not what the merge base of
// main's HEAD and its own has, by name, or "". `base:<why>` when there is no
// such commit on main's first-parent line. Anything git cannot answer is a
// difference, so it fails closed.
function installConfigDrift(top: string, main: string): string {
	const wt = git(["-C", top, "rev-parse", "--verify", "-q", "HEAD^{commit}"]);
	if (!wt.ok || !wt.out) return "base:the review worktree's HEAD is not a commit";
	const mh = git(["-C", main, "rev-parse", "--verify", "-q", "HEAD^{commit}"]);
	if (!mh.ok || !mh.out) return "base:the main checkout's HEAD is not a commit";
	const mb = git(["-C", top, "merge-base", mh.out, wt.out]);
	if (mb.status === 1) return "base:there is no merge base of the main checkout's HEAD and the review worktree's HEAD, so the diff shares no history with main";
	if (!mb.ok || !mb.out) return "base:the merge base of the main checkout's HEAD and the review worktree's HEAD could not be computed";
	const baseRev = mb.out;
	const fp = git(["-C", top, "rev-list", "--first-parent", mh.out]);
	if (!fp.ok) return "base:the first-parent history of the main checkout's HEAD could not be read";
	if (!fp.out.split("\n").includes(baseRev)) {
		return `base:the merge base ${baseRev} is not on the first-parent chain of the main checkout's HEAD, so it is a side branch's commit main merged, not a commit of main's own`;
	}
	const names = new Set<string>();
	try {
		for (const n of readdirSync(top)) names.add(n);
	} catch {}
	const lt = run(["git", "-C", top, "ls-tree", "-z", "--name-only", baseRev]);
	if (!lt.ok) return "git ls-tree";
	for (const n of lt.stdout.split("\0")) names.add(n);
	for (const n of [...names].sort(byteSort)) {
		if (!comparedName(n)) continue;
		if (!entrySame(top, baseRev, n)) return n;
	}
	// No index entry may hide the work tree from git, anywhere.
	const lf = run(["git", "-C", top, "ls-files", "-v", "-z"]);
	if (!lf.ok) return "git ls-files";
	for (const rec of lf.stdout.split("\0")) {
		for (const l of rec.split("\n")) if (/^[a-zS]/.test(l)) return "the index, which marks an entry skip-worktree or assume-unchanged,";
	}
	const pj = `${top}/package.json`;
	if (isLink(pj)) return "package.json";
	if (exists(pj) && !isFile(pj)) return "package.json";
	const shown = git(["-C", main, "show", `${baseRev}:package.json`]);
	const strip = (v: unknown): Record<string, unknown> => {
		if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("not an object");
		const out: Record<string, unknown> = {};
		for (const [k, val] of Object.entries(v as Record<string, unknown>)) if (!REVIEWER_INERT_PKG.has(k)) out[k] = val;
		return out;
	};
	let keys: string;
	try {
		const y = strip(JSON.parse(shown.ok ? shown.out : "{}"));
		if (exists(pj)) {
			const x = strip(JSON.parse(readFileSync(pj, "utf8")));
			keys = [...new Set([...Object.keys(x), ...Object.keys(y)])]
				.sort()
				.filter((k) => !jqEqual(x[k] ?? null, y[k] ?? null))
				.join(", ");
		} else keys = Object.keys(y).sort().join(", ");
	} catch {
		return "package.json";
	}
	return keys ? `package.json field ${keys}` : "";
}

// The checker's entry file, check-write-scope.py, now a shim onto
// `boards fleet check-write-scope`. A plugin without it is a plugin whose
// checker is missing, and the break and use-mode reviewer's rule fails closed
// on that.
function checkerPath(): string {
	return `${pluginRoot()}/hooks/lib/check-write-scope.py`;
}

function checkerPresent(): boolean {
	return isFile(checkerPath());
}

export function decide(input: string): string {
	const ev = parseEvent(input);
	if (!ev) {
		log("hook input is not valid JSON; allowing the call");
		return "allow";
	}
	try {
		new Scope(ev).run();
	} catch (e) {
		if (e instanceof Decided) return e.out;
		log(`unexpected error (${(e as Error).message ?? e}); allowing the call`);
		return "allow";
	}
	return "allow";
}

export async function scopeCommand(): Promise<number> {
	process.stdout.write(`${decide(await readInput())}\n`);
	return 0;
}
