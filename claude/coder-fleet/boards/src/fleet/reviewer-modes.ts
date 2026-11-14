// Which modes a reviewer's brief gives it, ported from
// hooks/lib/reviewer-modes.sh, now a shim onto `boards fleet reviewer-modes`.
//
// The reviewer runs in up to three modes, and the lead's brief names them in
// its header, `Modes: review, break` for example. The clock caps a break-mode
// run and no other, and the scope hook gives break and use mode the
// outside-the-project write rule they need. No hook event carries the spawn
// prompt, but the runtime writes the subagent's transcript beside the
// session's, at <session transcript without .jsonl>/subagents/agent-<id>.jsonl
// or deeper for a workflow lane, and its first user message is the brief.
//
// The signal, stated once:
//   - Only the spawn prompt counts: the first user message.
//   - Only its header counts: the prompt's first five lines.
//   - A header line is one of those five that looks like a mode line in any
//     case or spacing. Its format is closed: exactly `Modes: ` at column 0,
//     then one or more of review, break and use, lower case, separated by a
//     comma and at most one space, nothing else but trailing whitespace. A
//     header line in any other form, or two of them, is malformed.
//   - No header line: review only, read cleanly.
//   - Malformed header, no brief found, no user message yet, or an agent id
//     that is not plain [A-Za-z0-9_-]: the brief is unread, and the caller
//     fails closed its own way.
//   - Sticky: the first clean read is recorded in <state>/modes/<agent_id>,
//     created exclusively with mode 0600 in a 0700 directory, and every later
//     call uses the record. An unread brief records nothing.
//
// Prints "review", "review break", "review use" or "review break use"; exit 0
// when the answer is recorded or was read cleanly, 1 when the brief is unread
// (and prints "review").
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const HEADER_LINES = 5;
const ANSWERS = ["review", "review break", "review use", "review break use"];
const ID_RE = /^[A-Za-z0-9_-]+$/;

function findBrief(dir: string, name: string, depth: number): string | null {
	if (depth > 4) return null;
	let entries: string[];
	try {
		entries = readdirSync(dir);
	} catch {
		return null;
	}
	for (const e of entries) {
		const p = join(dir, e);
		try {
			const st = statSync(p);
			if (st.isFile() && e === name) return p;
		} catch {}
	}
	for (const e of entries) {
		const p = join(dir, e);
		try {
			if (statSync(p).isDirectory()) {
				const hit = findBrief(p, name, depth + 1);
				if (hit) return hit;
			}
		} catch {}
	}
	return null;
}

export function briefPath(transcript: string, id: string): string | null {
	if (!ID_RE.test(id) || !transcript) return null;
	const base = `${transcript.replace(/\.jsonl$/, "")}/subagents`;
	try {
		if (!statSync(base).isDirectory()) return null;
	} catch {
		return null;
	}
	const direct = join(base, `agent-${id}.jsonl`);
	try {
		if (statSync(direct).isFile()) return direct;
	} catch {}
	return findBrief(base, `agent-${id}.jsonl`, 1);
}

class Unread extends Error {}

// The modes the brief names, or null when it is unread.
export function readModes(transcript: string, id: string): string | null {
	const path = briefPath(transcript, id);
	if (!path) return null;
	try {
		let user: Record<string, unknown> | null = null;
		for (const line of readFileSync(path, "utf8").split("\n")) {
			if (!line.trim()) continue;
			const v = JSON.parse(line) as unknown;
			if (v && typeof v === "object" && !Array.isArray(v) && (v as Record<string, unknown>).type === "user") {
				user = v as Record<string, unknown>;
				break;
			}
		}
		if (!user) throw new Unread("no brief yet");
		const content = (user.message as Record<string, unknown> | undefined)?.content;
		let text: string;
		if (typeof content === "string") text = content;
		else if (Array.isArray(content))
			text = content
				.filter((c) => c && typeof c === "object" && c.type === "text" && typeof c.text === "string")
				.map((c) => c.text as string)
				.join("\n");
		else throw new Unread("no text");
		const heads = text
			.split("\n")
			.slice(0, HEADER_LINES)
			.map((l) => l.replace(/\r$/, ""))
			.filter((l) => /^[ \t]*modes[ \t]*:/i.test(l));
		if (heads.length === 0) return "review";
		if (heads.length > 1) throw new Unread("two headers");
		const head = heads[0].replace(/[ \t]+$/, "");
		if (!/^Modes: (review|break|use)(, ?(review|break|use))*$/.test(head)) throw new Unread("malformed");
		const words = head.match(/review|break|use/g) ?? [];
		return `review${["break", "use"]
			.filter((m) => words.includes(m))
			.map((m) => ` ${m}`)
			.join("")}`;
	} catch {
		return null;
	}
}

function firstLine(p: string): string {
	try {
		return readFileSync(p, "utf8").split("\n", 1)[0];
	} catch {
		return "";
	}
}

export function reviewerModes(transcript: string, id: string, stateDir: string): { modes: string; read: boolean } {
	if (!ID_RE.test(id)) return { modes: "review", read: false };
	const rec = join(stateDir, id);
	if (existsSync(rec) && statSync(rec).isFile()) {
		const out = firstLine(rec);
		// A record this code never writes is no answer; fail closed.
		return ANSWERS.includes(out) ? { modes: out, read: true } : { modes: "review", read: false };
	}
	let out = readModes(transcript, id);
	if (out === null) return { modes: "review", read: false };
	try {
		mkdirSync(stateDir, { recursive: true, mode: 0o700 });
		chmodSync(stateDir, 0o700);
		writeFileSync(rec, `${out}\n`, { flag: "wx", mode: 0o600 });
	} catch {}
	// Another call may have recorded first; its answer stands.
	if (existsSync(rec)) {
		const first = firstLine(rec);
		if (ANSWERS.includes(first)) out = first;
	}
	return { modes: out, read: true };
}

export function reviewerModesCommand(args: string[]): number {
	const [transcript = "", id = "", stateDir = ""] = args;
	if (!stateDir) {
		process.stderr.write("usage: boards fleet reviewer-modes <session transcript_path> <agent_id> <state dir>\n");
		process.stdout.write("review");
		return 2;
	}
	const { modes, read } = reviewerModes(transcript, id, stateDir);
	process.stdout.write(modes);
	return read ? 0 : 1;
}
