import { describe, expect, it } from "bun:test";
import { type Agent, buildLines, type Seg, type View, width } from "../../coder-fleet/hooks/status-lines.ts";
import { DESIGN, NOW, ONE_DARK, type Run } from "./status-lines.states.ts";

// CF-27: the two lines coder-fleet draws under the prompt. Each state of the
// design renders to the design's text, order and colours, and a narrow
// terminal takes away from them in the fixed order.

const tone = Object.fromEntries(Object.entries(ONE_DARK).map(([k, v]) => [v, k]));

// The runs as the design spells them: adjacent text of one colour and
// link-ness joined, the colour by its class name.
function runs(segs: readonly Seg[]): Run[] {
	const out: Run[] = [];
	for (const s of segs) {
		if (s.text === "") continue;
		const name = tone[s.color];
		if (!name) throw new Error(`${s.color} is not One Dark`);
		const last = out.at(-1);
		if (last && last[1] === name && (last[2] === "link") === (s.href !== undefined)) last[0] += s.text;
		else out.push(s.href !== undefined ? [s.text, name as Run[1], "link"] : [s.text, name as Run[1]]);
	}
	return out;
}

describe("the lines under the prompt match the design", () => {
	for (const state of DESIGN) {
		it(state.name, () => {
			const lines = buildLines(state.view);
			expect(runs(lines.line1)).toEqual(state.line1);
			expect(runs(lines.line2)).toEqual(state.line2);
			expect(lines.button).toBe(state.button);
		});
	}

	it("links each card id to its page while the web UI runs, and draws plain ids while it does not", () => {
		const one = DESIGN.find((s) => s.name === "one agent");
		if (!one) throw new Error("no one-agent state");
		const linked = buildLines(one.view).line2.find((s) => s.text === "CF-26");
		expect(linked?.href).toBe("http://127.0.0.1:41234/#CF-26");
		const plain = buildLines({ ...one.view, board: { board: true, next: "CF-26", blockedByHuman: 0, web: null } });
		expect(plain.line2.some((s) => s.href !== undefined)).toBe(false);
		expect(plain.button).toBe(true);
	});

	it("draws no button and no board figures in a repo without a board", () => {
		const rest = DESIGN.find((s) => s.name === "no agents");
		if (!rest) throw new Error("no rest state");
		const lines = buildLines({ ...rest.view, board: { board: false, next: null, blockedByHuman: 0, web: null } });
		expect(runs(lines.line2)).toEqual([["· no agents working", "f2"]]);
		expect(lines.button).toBe(false);
	});
});

describe("a narrow terminal", () => {
	const agent = (id: string, card: string, agoMs: number, activity = ""): Agent => ({
		id,
		type: "coder-fleet:coder",
		card,
		startedAt: NOW - agoMs,
		activity,
		phase: 0,
	});
	const view = (columns: number, agents: Agent[], branch = "cf-27-two-lines-under-the-prompt"): View => ({
		ctx: { percent: 40, tokens: 400_000, window: 1_000_000 },
		model: "claude-opus-5-5",
		project: "coder-fleet",
		branch,
		boot: { kind: "fleet" },
		agents,
		board: { board: true, next: null, blockedByHuman: 0, web: null },
		now: NOW,
		tick: 0,
		columns,
	});
	const text = (segs: readonly Seg[]) => segs.map((s) => s.text).join("");
	const three = [agent("a", "CF-1", 300_000), agent("b", "CF-2", 200_000), agent("c", "CF-3", 100_000)];

	it("gives up the token counts, then the run times, then whole cards, then the button, and never runs past the width", () => {
		const seen: string[] = [];
		for (let columns = 160; columns >= 20; columns--) {
			const l = buildLines(view(columns, three));
			const step = [
				/ 400k\/1M/.test(text(l.line1)) ? "tokens" : "",
				/\dm\d\ds/.test(text(l.line2)) ? "runs" : "",
				`cards ${(text(l.line2).match(/CF-\d/g) ?? []).length}`,
				l.button ? "button" : "",
			].join(" ");
			if (seen.at(-1) !== step) seen.push(step);
			// Each line fits while it still has something to give; past that
			// the row cuts what is left (line 1 has a long branch name here).
			if (columns >= 83) expect(width(l.line1)).toBeLessThanOrEqual(columns);
			if (columns >= 26) expect(width(l.line2) + (l.button ? 13 : 0)).toBeLessThanOrEqual(columns);
		}
		expect(seen).toEqual(["tokens runs cards 3 button", " runs cards 3 button", "  cards 3 button", "  cards 2 button", "  cards 1 button", "  cards 0 button", "  cards 0 "]);
	});

	it("folds the oldest card first, into +n card(s)", () => {
		const l = buildLines(view(40, three));
		expect(text(l.line2)).toBe("CF-3 ⠋ coder  ·  +2 cards");
	});

	it("cuts one agent's current action to the room left before it gives it up", () => {
		const long = "Bash bun test test/status-lines.test.ts --timeout=60000 --bail";
		const one = (columns: number) => buildLines(view(columns, [agent("a", "CF-1", 65_000, long)], "main"));
		expect(text(one(140).line2)).toBe(`CF-1  ⠋ coder 1m05s  ${long}`);
		const cut = one(70);
		expect(text(cut.line2)).toBe("CF-1  ⠋ coder 1m05s  Bash bun test test/status-lines.tes…");
		expect(width(cut.line2) + 13).toBe(70);
		const gone = text(one(40).line2);
		expect(gone).toBe("CF-1 ⠋ coder");
	});
});

describe("a wide terminal", () => {
	const view = (columns: number, agents: Agent[]): View => ({
		ctx: { percent: 22, tokens: 218_000, window: 1_000_000 },
		model: "claude-opus-5-5",
		project: "fathom",
		branch: "main",
		boot: { kind: "fleet" },
		agents,
		board: { board: true, next: null, blockedByHuman: 0, web: null },
		now: NOW,
		tick: 2,
		columns,
	});
	const text = (segs: readonly Seg[]) => segs.map((s) => s.text).join("");
	const two: Agent[] = [
		{ id: "a", type: "coder-fleet:coder", card: "CF-26", startedAt: NOW - 130_000, activity: "Edit hooks/x.sh", phase: 0 },
		{ id: "b", type: "coder-fleet:tech-writer", card: "CF-15", startedAt: NOW - 302_000, activity: "", phase: 1 },
	];

	it("spreads the same items across the row, with the button at its right end", () => {
		for (const columns of [200, 250]) {
			const l = buildLines(view(columns, two));
			expect(text(l.line1)).toBe(`ctx ${"█".repeat(7)}${"░".repeat(23)}  22% 218k/1M      ◆ Opus 5.5      fathom      ⎇ main`);
			expect(text(l.line2)).toBe("CF-26  ⠹ coder 2m10s      CF-15  ⠸ tech-writer 5m02s");
			expect(l.button).toBe(true);
			// Text, padding and the eleven columns of "[ board ↗ ]" end at the row's edge.
			expect(width(l.line2) + l.pad + 11).toBe(columns);
		}
		// One agent keeps its current action, as the narrower layout does.
		const one = buildLines(view(200, [{ ...two[0], card: "CF-26" } as Agent]));
		expect(text(one.line2)).toBe("CF-26  ⠹ coder 2m10s  Edit hooks/x.sh");
		expect(width(one.line2) + one.pad + 11).toBe(200);
	});

	it("keeps the narrower look below the wide width", () => {
		const l = buildLines(view(179, two));
		expect(text(l.line1)).toBe(`ctx ${"█".repeat(4)}${"░".repeat(16)}  22% 218k/1M · ◆ Opus 5.5 · fathom · ⎇ main`);
		expect(text(l.line2)).toBe("CF-26  ⠹ coder 2m10s   ·   CF-15  ⠸ tech-writer 5m02s");
		expect(width(l.line2) + l.pad + 11).toBe(179);
	});
});
