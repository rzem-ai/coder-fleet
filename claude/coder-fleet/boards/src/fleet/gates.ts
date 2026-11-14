// The two gates a card meets on its way to Done on the old board, ported from
// hooks/lib/gates.sh, now a shim onto `boards fleet gates`. Shared by the two
// hooks that move a card there: board-task-completed.sh on a [board:<id>]
// task, and board-release-close.sh on a release tag push. Each decides; what
// a refusal does to the card is the caller's. The old board's own bash keeps
// what touches the board, board_log and board_item_checklist: the shim runs
// those and hands this code their results.
import { lstatSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { assignments, onPath, run, shq } from "./proc.ts";

// gate_tree_changed_since: is any regular file under `dir` newer than the
// marker, outside the directories that are build output or tooling.
const PRUNED = new Set([".git", "node_modules", ".claude", "dist", "build", "target", ".venv", "__pycache__"]);

function treeChangedSince(marker: string, dir: string): boolean {
	let since: number;
	try {
		since = statSync(marker).mtimeMs;
	} catch {
		return false;
	}
	const walk = (d: string): boolean => {
		let names: string[];
		try {
			names = readdirSync(d);
		} catch {
			return false;
		}
		for (const n of names) {
			if (PRUNED.has(n)) continue;
			const p = join(d, n);
			let st: ReturnType<typeof lstatSync>;
			try {
				st = lstatSync(p);
			} catch {
				continue;
			}
			if (st.isDirectory()) {
				if (walk(p)) return true;
			} else if (st.isFile() && st.mtimeMs > since) return true;
		}
		return false;
	};
	return walk(dir);
}

const lines = (s: string, max: number) =>
	s
		.split("\n")
		.map((l) => l.slice(0, max))
		.join("\n");

type Verdict = { vars: Record<string, string>; logs: string[] };

// The test gate: GATE_VERDICT pass, fail or unknown, GATE_DETAIL and
// GATE_STATUS_FILE. Resolved in order: a configured test command, then a
// test-status marker file, then unknown, which the caller settles by the gate
// mode.
export function testVerdict(workDir: string, env: Record<string, string | undefined>): Verdict {
	const logs: string[] = [];
	const command = env.CODER_FLEET_TEST_COMMAND ?? "";
	const timeout = env.CODER_FLEET_TEST_TIMEOUT ?? "300";
	const maxAge = Number(env.CODER_FLEET_TEST_STATUS_MAX_AGE ?? "3600");
	let verdict = "";
	let detail = "";
	if (command) {
		let runner: string[] = [];
		if (/^[0-9]+$/.test(timeout) && Number(timeout) > 0) {
			if (onPath("timeout")) runner = ["timeout", timeout];
			else if (onPath("gtimeout")) runner = ["gtimeout", timeout];
		}
		logs.push(`running the test command in ${workDir}: ${command}`);
		// One shell string, so pipelines, && chains and loops keep working,
		// with or without timeout.
		const r = run(["sh", "-c", '"$@" 2>&1', "sh", ...runner, "bash", "-c", command], { cwd: workDir });
		if (r.status === 0) {
			verdict = "pass";
			detail = `\`${command}\` passed.`;
		} else {
			verdict = "fail";
			const tail = r.stdout.replace(/\n+$/, "").split("\n").slice(-15).join("\n");
			detail = `\`${command}\` exited ${r.status}.\n\nLast lines of output:\n\n${lines(tail, 200)}`.replace(/\n+$/, "");
		}
	}
	const statusFile = env.CODER_FLEET_TEST_STATUS_FILE || `${workDir}/.claude/test-status`;
	let isFile = false;
	try {
		isFile = statSync(statusFile).isFile();
	} catch {}
	if (!verdict && isFile) {
		const age = Math.floor(Date.now() / 1000) - Math.floor(statSync(statusFile).mtimeMs / 1000);
		const text = readFileSync(statusFile, "utf8");
		const all = text.split("\n");
		const word = (all[0] ?? "").replace(/\r/g, "").trim().split(/\s+/)[0]?.toLowerCase() ?? "";
		if (["fail", "failed", "red"].includes(word)) {
			// A failure is honoured whatever its age: a stale "fail" can only
			// block a completion, while a stale "pass" approves code it never saw.
			const rest = lines(all.slice(1, 16).join("\n").replace(/\n+$/, ""), 200);
			verdict = "fail";
			detail = `${statusFile} reports a failure.\n\n${rest}`.replace(/\n+$/, "");
		} else if (["pass", "passed", "ok", "green"].includes(word)) {
			if (age > maxAge) logs.push(`${statusFile} reports a pass but is ${age}s old (limit ${maxAge}s); treating it as stale`);
			else if (treeChangedSince(statusFile, workDir))
				logs.push(`${statusFile} reports a pass, but ${workDir} has been modified since it was written, so it is not evidence about the current code; ignoring it`);
			else {
				verdict = "pass";
				detail = `${statusFile} reports a pass, and nothing in ${workDir} has changed since.`;
			}
		} else logs.push(`${statusFile} does not start with pass or fail (found "${word}"); ignoring it`);
	}
	return { vars: { GATE_VERDICT: verdict || "unknown", GATE_DETAIL: detail, GATE_STATUS_FILE: statusFile }, logs };
}

// The card gate: finished when the card has at least one acceptance criterion
// and every criterion and Definition of Done item is ticked. Otherwise the
// body says what is missing, in card markdown.
export function cardBody(id: string, acCount: number, openCount: number, openAc: string, openDod: string): { finished: boolean; body: string } {
	if (acCount > 0 && openCount === 0) return { finished: true, body: "" };
	const parts: string[] = [];
	if (acCount === 0) parts.push(`${id} has no acceptance criteria, so there is nothing to say it is finished. Add them from the spec, or from the brief if there is none.`);
	if (openAc) parts.push(`Acceptance criteria not ticked:\n\n${openAc}`.replace(/\n+$/, ""));
	if (openDod) parts.push(`Definition of Done items not ticked:\n\n${openDod}`.replace(/\n+$/, ""));
	let body = parts.join("\n\n");
	if (openAc || openDod)
		body = `${body}\n\nTick each one with its evidence in a comment. A Definition of Done item that does not apply is ticked, with \`not applicable: <reason>\` in the comment.`;
	return { finished: false, body };
}

const USAGE = "usage: boards fleet gates test-verdict <hook> <work dir> | card-body <id> <ac count> <open count> <open ac> <open dod>";

export function gatesCommand(args: string[]): number {
	const [op, ...rest] = args;
	if (op === "test-verdict" && rest.length === 2) {
		const [hook, workDir] = rest;
		const v = testVerdict(workDir, process.env);
		process.stdout.write(v.logs.map((l) => `board_log ${shq(hook)} ${shq(l)}\n`).join("") + assignments(v.vars));
		return 0;
	}
	if (op === "card-body" && rest.length === 5) {
		const [id, ac, open, openAc, openDod] = rest;
		const c = cardBody(id, Number(ac), Number(open), openAc, openDod);
		process.stdout.write(assignments({ GATE_CARD_BODY: c.body }));
		return c.finished ? 0 : 1;
	}
	process.stderr.write(`${USAGE}\n`);
	return 2;
}
