import { existsSync, readFileSync, statSync } from "node:fs";

// The handoff-format check, ported from the old board's
// hooks/board-subagent-stop.sh. The rules are the handoff skill's
// (skills/handoff/SKILL.md) and the same ones claude/evals/lib/handoff-check.sh
// applies in CI; claude/evals/lib/handoff-parity.sh runs both over every case
// in claude/evals/fixtures/handoff-cases/ and fails if they disagree.
//
// Anchors quoted from the skill:
//   headings   ^## (Done|Not done|Unverified|Decisions needed)$
//   typed line ^- (Blocker|Propose item):
// Items are "one markdown list item starting `- ` at column 0", an empty
// section is "exactly one line: `- None`", and the handoff is the last thing
// in the message. Every line is right-trimmed before any anchor sees it, since
// trailing whitespace (a CRLF's \r included) never changes what a markdown
// line means; leading whitespace still matters everywhere.
const HANDOFF_HEADING = /^## (Done|Not done|Unverified|Decisions needed)$/;
const ANY_H2 = /^## /;
const ITEM = /^- /;
const TYPED = /^- (Blocker|Propose item): /;
const NONE = /^- None$/;
const SECTIONS = ["Done", "Not done", "Unverified", "Decisions needed"] as const;
type Section = (typeof SECTIONS)[number];

const cut = (line: string) => Array.from(line).slice(0, 60).join("");
const blank = (s: string) => !/[^\s]/.test(s);

// The reasons a message is not a valid handoff, none when it is one.
export function handoffErrors(message: string): string[] {
	const errors: string[] = [];
	if (blank(message)) return ["the final message is empty, so it carries no handoff"];
	let sec: Section | "" = "";
	const order: string[] = [];
	let gap = false;
	const count: Record<Section, number> = { Done: 0, "Not done": 0, Unverified: 0, "Decisions needed": 0 };
	const none: Record<Section, boolean> = { Done: false, "Not done": false, Unverified: false, "Decisions needed": false };

	for (const raw of message.split("\n")) {
		const line = raw.replace(/\s+$/, "");
		if (ANY_H2.test(line)) {
			gap = false;
			if (HANDOFF_HEADING.test(line)) {
				sec = line.slice(3) as Section;
				order.push(sec);
			} else {
				errors.push(`unexpected level-2 heading "${cut(line)}". The handoff allows no other H2.`);
				sec = "";
			}
			continue;
		}
		if (!sec) continue;
		if (blank(line)) {
			gap = true;
			continue;
		}
		// A blank line with another item after it is a blank line between
		// items, which the skill forbids; one before the next heading never
		// gets here, because the heading clears the flag first.
		if (gap) {
			errors.push(`blank line inside "## ${sec}". A section is a solid block of "- " lines; the only blank line allowed is the one before the next heading.`);
			gap = false;
		}
		if (!ITEM.test(line)) {
			errors.push(`line under "## ${sec}" does not start with "- " at column 0: "${cut(line)}"`);
			continue;
		}
		// A typed line is legal under Decisions needed and nowhere else, so a
		// Blocker that drifted into Done is sent back rather than rescued.
		if (sec !== "Decisions needed" && TYPED.test(line)) {
			errors.push(`typed line under "## ${sec}": "${cut(line)}". "- Blocker: " and "- Propose item: " lines belong under "## Decisions needed" and nowhere else.`);
		}
		count[sec]++;
		if (NONE.test(line)) none[sec] = true;
		else if (sec === "Decisions needed" && !TYPED.test(line)) {
			errors.push(
				`untyped line under "## Decisions needed": "${cut(line)}". Every line there is "- Blocker: ", "- Propose item: " or the single line "- None". A note for a later run goes in your own memory, not here.`,
			);
		}
	}

	if (order.join("|") !== SECTIONS.join("|")) {
		errors.push(
			order.length
				? `headings are wrong. Found "${order.join("|")}" (pipe separated); expected exactly "Done|Not done|Unverified|Decisions needed", each once, in that order.`
				: `no handoff headings found. The message must end with "## Done", "## Not done", "## Unverified" and "## Decisions needed", in that order.`,
		);
	}
	for (const s of SECTIONS) {
		if (count[s] === 0) errors.push(`"## ${s}" is empty. An empty section is exactly one line: "- None".`);
	}
	for (const s of SECTIONS) {
		if (none[s] && count[s] > 1) errors.push(`"## ${s}" mixes "- None" with real items. "- None" is only ever the whole section.`);
	}
	return errors;
}

// What the agent is told when its handoff is malformed.
export function reemitReason(errors: string[]): string {
	return [
		"Your final message is not a valid handoff, so the board could not be updated from it.",
		"The handoff is a machine contract - see the `handoff` skill. Problems found:",
		...errors.map((e) => `  - ${e}`),
		"",
		"Reply with the same content, ending in exactly these four headings in this order,",
		'each with at least one "- " item at column 0, and "- None" alone where a section is empty:',
		"",
		"## Done\n## Not done\n## Unverified\n## Decisions needed",
		"",
	].join("\n");
}

// The last assistant content block in a subagent's transcript: "structured"
// for a StructuredOutput call, the text for prose, or null when the file is
// missing, oversized, unreadable or ends in anything else. Read
// agent_transcript_path, never transcript_path, which is the session's.
export function transcriptFinalBlock(path: string, maxBytes = 20_000_000): { structured: true } | { text: string } | null {
	try {
		if (!path || !existsSync(path) || !statSync(path).isFile() || statSync(path).size > maxBytes) return null;
		let last: { type?: unknown; name?: unknown; text?: unknown } | undefined;
		for (const line of readFileSync(path, "utf8").split("\n")) {
			if (!line.trim()) continue;
			const entry = JSON.parse(line) as { type?: unknown; message?: { content?: unknown } };
			if (entry.type !== "assistant" || !Array.isArray(entry.message?.content)) continue;
			if (entry.message.content.length) last = entry.message.content.at(-1);
		}
		if (!last) return null;
		if (last.type === "tool_use" && last.name === "StructuredOutput") return { structured: true };
		if (last.type === "text" && typeof last.text === "string") return { text: last.text };
		return null;
	} catch {
		return null;
	}
}
