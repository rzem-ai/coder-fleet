// The two lines coder-fleet draws under the prompt, below Claude Code's own
// hint line, as coloured segments. Pure, so the deterministic suite renders
// every state with no Claude Code (claude/boards/test/status-lines.test.ts);
// boards-status.ts gathers the facts through `$` and draws what this builds.
//
// Line 1, always: the context gauge with its percentage and tokens used of
// the window, "compact soon" from 85%, the model, its effort, the project and the branch.
// Line 2: the boards binary while it downloads, then ready for a few seconds,
// or why it is unavailable; after that the cards fleet agents are working on,
// grouped by card, or the board at rest; and once the board is up a
// "[ board ↗ ]" button at its right end, which boards-status.ts draws.
//
// On a narrow terminal both lines shrink together, a level at a time, in a
// fixed order: the token counts; then the run times and the current action
// (the gauge and the spacing tighten with them); then whole cards, from the
// last, into "+n card(s)"; the button last of all. What still does not fit is
// cut at the end of the row, never wrapped.
//
// On a wide terminal, as fleet-strip lays out its own rows, the same items
// spread across the row: a longer gauge, wide gaps in place of line 1's dots
// and between line 2's cards, and every agent's current action when all of
// them fit, not only the one agent's. Wherever the width is known, the button sits
// at the row's right end.
import type { LinesAgent, LinesBoard, LinesCtx } from "../types/index";
import type { BootLine } from "./boards-state";

// One Dark, as fleet-strip draws it.
export const C = {
	fg0: "#dcdfe4",
	fg1: "#abb2bf",
	fg2: "#7f848e",
	fg3: "#5c6370",
	red: "#e06c75",
	green: "#98c379",
	yellow: "#e5c07b",
	blue: "#61afef",
	purple: "#c678dd",
	cyan: "#56b6c2",
} as const;

export const SPIN = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

// The button's label, drawn by the terminal as "[ board ↗ ]".
export const BUTTON_LABEL = "board ↗";
const BUTTON_COLUMNS = BUTTON_LABEL.length + 4;
// The least room kept between line 2's text and the button.
const BUTTON_GAP = 2;

// From this width the lines spread out, as fleet-strip's WIDE_AT does.
export const WIDE_AT = 180;
// The gauge's length and the gap between items on a wide terminal.
export const WIDE_GAUGE = 30;
export const WIDE_GAP = "      ";

// One run of text in one colour; a link where `href` is set.
export type Seg = { text: string; color: string; href?: string };

// The facts the lines draw from, as types/index.d.ts declares them; the
// spinner's offset keeps agents from spinning in step, and the lines need
// nothing of the board's focus.
export type Ctx = LinesCtx;
export type Agent = LinesAgent;
export type BoardFacts = Omit<LinesBoard, "focus">;

export type View = {
	ctx: Ctx | null;
	model: string;
	effort?: string;
	project: string;
	branch: string;
	boot: BootLine;
	agents: readonly Agent[];
	board: BoardFacts | null;
	now: number;
	// Counts the redraws, for the spinners.
	tick: number;
	// The width the lines are drawn in, when the terminal has said.
	columns: number | undefined;
	// Nerd Font icons lead the model, effort and branch; false (the
	// CODER_FLEET_NERD_FONT=0 opt-out) brings back ◆ ◇ ⎇. Unset is on.
	nerdFont?: boolean;
};

// `pad` is the spaces between line 2's text and the button that put the
// button at the row's right end; 0 with no button or no known width.
export type Lines = { line1: Seg[]; line2: Seg[]; button: boolean; pad: number };

const padL = (s: string, w: number) => (s.length >= w ? s : " ".repeat(w - s.length) + s);
// Control characters, escape sequences among them, never reach the screen
// from a tool's input, a branch name or a file.
export const clean = (s: string) => s.replace(/[\u0000-\u001f\u007f-\u009f]/g, "");
const oneLine = (s: string) => clean(s.replace(/\s+/g, " ")).trim();

// How many columns a run of text takes: a cell per code point, which holds
// for every glyph these lines draw.
export const width = (segs: readonly Seg[]) => segs.reduce((n, s) => n + [...s.text].length, 0);

export function fmtTok(n: number): string {
	if (n < 1000) return String(Math.round(n));
	if (n < 1_000_000) {
		const k = n / 1000;
		return `${(k < 10 ? k.toFixed(1) : String(Math.round(k))).replace(/\.0$/, "")}k`;
	}
	return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

export function fmtRun(ms: number): string {
	const s = Math.max(0, Math.floor(ms / 1000));
	const h = Math.floor(s / 3600);
	const m = Math.floor((s % 3600) / 60);
	if (h > 0) return `${h}h${String(m).padStart(2, "0")}m`;
	return `${m}m${String(s % 60).padStart(2, "0")}s`;
}

// `claude-opus-5-5` as "Opus 5.5"; a name it cannot read, as given.
export function prettyModel(id: string): string {
	const m = /claude-([a-z]+)-(\d+)(?:-(\d+))?/i.exec(id);
	const name = m?.[1];
	if (!m || !name) return clean(id);
	const family = name.charAt(0).toUpperCase() + name.slice(1);
	return m[3] && m[3].length <= 2 ? `${family} ${m[2]}.${m[3]}` : `${family} ${m[2]}`;
}

// The icons leading the model, effort and branch, written as escapes so the
// source holds no private-use glyph: Nerd Fonts v3, flasks for the model
// tiers. Each is one code point, which is how `width` counts. A model of no
// known tier, and every icon under the opt-out, keeps the plain glyphs.
const TIER_ICON: Record<string, string> = {
	haiku: "\u{F0095}",
	sonnet: "\u{F0096}",
	opus: "\u{F0094}",
	fable: "\u{F0093}",
};
const NERD_EFFORT = "\u{F1019}";
const NERD_BRANCH = "\u{EC6F}";
const NERD_PROJECT = "\u{EB29}";
const PLAIN_MODEL = "◆";
const PLAIN_EFFORT = "◇";
const PLAIN_BRANCH = "⎇";

// The model's icon by tier, matched in the id or name whatever its case.
export function modelIcon(id: string, nerd = true): string {
	if (!nerd) return PLAIN_MODEL;
	const tier = /haiku|sonnet|opus|fable/i.exec(id)?.[0];
	return (tier && TIER_ICON[tier.toLowerCase()]) || PLAIN_MODEL;
}

// The agent's type as line 2 names it: `coder-fleet:coder` is "coder".
export const shortType = (t: string) => clean(t.includes(":") ? t.slice(t.lastIndexOf(":") + 1) : t);

// What a tool call is doing, as line 2 says it: the tool and its main
// argument, a path made relative to the session's directory or to the agent
// worktree it is in.
export function describeCall(tool: string, input: Record<string, unknown>, cwd: string): string {
	const str = (k: string) => (typeof input[k] === "string" ? (input[k] as string) : "");
	const raw = str("command") || str("file_path") || str("notebook_path") || str("pattern") || str("url") || str("query") || str("description") || str("path");
	let arg = cwd && raw.startsWith(`${cwd}/`) ? raw.slice(cwd.length + 1) : raw;
	arg = arg.replace(/^.*?\.claude\/worktrees\/[^/\s]+\//, "");
	return oneLine(`${tool.replace(/^mcp__.+?__/, "")} ${arg}`).slice(0, 120);
}

// The levels the lines shrink through, in order.
const TOKENS = 1; // the token counts go
const RUNS = 2; // then the run times and the current action, the gauge halves and the spacing tightens
const FOLD = 3; // then FOLD + n folds the last n cards into "+n card(s)"

const pct5 = (p: number) => padL(`${p}%`, 5);

function line1(v: View, level: number, wide = false): Seg[] {
	const w = wide ? WIDE_GAUGE : level >= RUNS ? 10 : 20;
	const p = Math.round(Math.max(0, Math.min(100, v.ctx?.percent ?? 0)));
	const filled = Math.max(0, Math.min(w, Math.round((p / 100) * w)));
	const tone = p >= 85 ? C.red : p >= 70 ? C.yellow : C.green;
	const segs: Seg[] = [
		{ text: "ctx ", color: C.fg1 },
		{ text: "█".repeat(filled), color: tone },
		{ text: "░".repeat(w - filled), color: C.fg3 },
		{ text: pct5(p), color: p >= 85 ? C.red : C.fg0 },
	];
	if (level < TOKENS && v.ctx?.tokens !== undefined && v.ctx.window > 0) {
		segs.push({ text: ` ${fmtTok(v.ctx.tokens)}/${fmtTok(v.ctx.window)}`, color: C.fg1 });
	}
	const nerd = v.nerdFont !== false;
	const dot = () => segs.push({ text: wide ? WIDE_GAP : " · ", color: C.fg2 });
	if (p >= 85) {
		dot();
		segs.push({ text: "compact soon", color: C.yellow });
	}
	if (v.model) {
		dot();
		segs.push({ text: `${modelIcon(v.model, nerd)} ${prettyModel(v.model)}`, color: C.blue });
	}
	if (v.effort) {
		dot();
		segs.push({ text: `${nerd ? NERD_EFFORT : PLAIN_EFFORT} ${clean(v.effort)}`, color: C.purple });
	}
	if (v.project) {
		dot();
		segs.push({ text: nerd ? `${NERD_PROJECT} ${clean(v.project)}` : clean(v.project), color: C.fg0 });
	}
	if (v.branch) {
		dot();
		segs.push({ text: `${nerd ? NERD_BRANCH : PLAIN_BRANCH} ${clean(v.branch)}`, color: C.green });
	}
	return segs.filter((s) => s.text !== "");
}

function bar(percent: number | null): Seg[] {
	const p = percent ?? 0;
	const filled = Math.max(0, Math.min(10, Math.round(p / 10)));
	return [
		{ text: "▰".repeat(filled), color: C.yellow },
		{ text: "▱".repeat(10 - filled), color: C.fg3 },
		{ text: pct5(p), color: C.fg0 },
	];
}

const boards = (version: string | undefined) => (version ? `boards v${version}` : "boards");

function bootSegs(b: Exclude<BootLine, { kind: "fleet" }>, tick: number): Seg[] {
	switch (b.kind) {
		case "downloading":
		case "elsewhere":
			return [
				{ text: SPIN[tick % SPIN.length] ?? "⠋", color: C.yellow },
				{ text: ` ${boards(b.version)}  `, color: C.fg0 },
				...bar(b.percent),
				{ text: b.kind === "downloading" ? "  downloading" : "  another session is fetching", color: C.fg2 },
			].filter((s) => s.text !== "");
		case "ready":
			return [
				{ text: "✓", color: C.green },
				{ text: ` ${boards(b.version)} ready`, color: C.fg0 },
			];
		case "unavailable":
			return [
				{ text: `✗ ${boards(b.version)} unavailable: ${clean(b.why)}`, color: C.red },
				{ text: "  ·  board tools off  ·  /coder-fleet:help-boards", color: C.fg2 },
			];
	}
}

const cardLink = (board: BoardFacts | null, id: string) => (board?.web ? `${board.web}#${encodeURIComponent(id)}` : undefined);

function restSegs(board: BoardFacts | null): Seg[] {
	const segs: Seg[] = [{ text: "· no agents working", color: C.fg2 }];
	if (!board?.board) return segs;
	if (board.next) {
		segs.push({ text: "  ·  next ", color: C.fg2 });
		const href = cardLink(board, board.next);
		segs.push({ text: board.next, color: C.fg1, ...(href ? { href } : {}) });
	}
	segs.push({ text: `  ·  blocked by human ${board.blockedByHuman}`, color: C.fg2 });
	return segs;
}

// The agents grouped by card: the card whose work started last first, so the
// oldest folds first on a narrow terminal, and each card's agents in the
// order they started. Agents bound to no card come last, under no id.
export function groupByCard(agents: readonly Agent[]): Array<{ card: string | null; agents: Agent[] }> {
	const groups: Array<{ card: string | null; agents: Agent[] }> = [];
	for (const a of [...agents].sort((x, y) => x.startedAt - y.startedAt)) {
		const g = groups.find((x) => x.card === a.card);
		if (g) g.agents.push(a);
		else groups.push({ card: a.card, agents: [a] });
	}
	const started = (g: { agents: Agent[] }) => g.agents[0]?.startedAt ?? 0;
	const newestFirst = (x: { agents: Agent[] }, y: { agents: Agent[] }) => started(y) - started(x);
	return [...groups.filter((g) => g.card !== null).sort(newestFirst), ...groups.filter((g) => g.card === null)];
}

// `every` shows each agent's current action, as a wide terminal does when
// they all fit; otherwise only the one agent's is shown.
function agentSegs(v: View, level: number, actionRoom: number | null, wide = false, every = false): Seg[] {
	const tight = level >= RUNS;
	const between = wide ? WIDE_GAP : tight ? "  ·  " : "   ·   ";
	const groups = groupByCard(v.agents);
	const folded = Math.max(0, Math.min(groups.length, level - FOLD + 1));
	const shown = groups.slice(0, groups.length - folded);
	const one = v.agents.length === 1;
	const segs: Seg[] = [];
	shown.forEach((g, i) => {
		if (i > 0) segs.push({ text: between, color: C.fg2 });
		if (g.card) {
			const href = cardLink(v.board, g.card);
			segs.push({ text: g.card, color: C.purple, ...(href ? { href } : {}) });
		}
		g.agents.forEach((a, j) => {
			const lead = !g.card && j === 0 ? "" : tight ? " " : "  ";
			segs.push({ text: `${lead}${SPIN[(v.tick + a.phase) % SPIN.length] ?? "⠋"}`, color: C.cyan });
			segs.push({ text: ` ${shortType(a.type)}`, color: C.fg0 });
			if (!tight) segs.push({ text: ` ${fmtRun(v.now - a.startedAt)}`, color: C.fg1 });
			if (!tight && (one || every) && a.activity) {
				const act = oneLine(a.activity);
				const room = actionRoom ?? act.length;
				if (room >= MIN_ACTION) segs.push({ text: `  ${act.length > room ? `${act.slice(0, room - 1)}…` : act}`, color: C.fg2 });
			}
		});
	});
	if (folded > 0) {
		segs.push({ text: `${shown.length ? between : ""}+${folded} card${folded === 1 ? "" : "s"}`, color: C.fg2 });
	}
	return segs;
}

// The least of the current action worth showing, cut, before it goes whole.
const MIN_ACTION = 12;

function line2(v: View, level: number, columns: number | undefined, wide = false, every = false): Seg[] {
	if (v.boot.kind !== "fleet") return bootSegs(v.boot, v.tick);
	if (!v.agents.length) return restSegs(v.board);
	if (every && v.agents.length > 1) return agentSegs(v, level, null, wide, true);
	const full = agentSegs(v, level, null, wide);
	if (columns === undefined || level >= RUNS || v.agents.length !== 1) return full;
	// The one agent's current action is cut to the room left before it goes.
	const without = width(agentSegs(v, level, 0, wide));
	const room = columns - without - 2 - (hasButton(v) ? BUTTON_GAP + BUTTON_COLUMNS : 0);
	return room >= MIN_ACTION ? agentSegs(v, level, room, wide) : full;
}

const hasButton = (v: View) => v.boot.kind === "fleet" && v.board?.board === true;

// The highest level there is for this view: every card folded, then the
// button gone.
function lastLevel(v: View): number {
	const cards = v.boot.kind === "fleet" ? groupByCard(v.agents).length : 0;
	return FOLD + cards;
}

export function buildLines(v: View): Lines {
	const cols = v.columns;
	const button = hasButton(v);
	const pinned = (l: Omit<Lines, "pad">): Lines => ({ ...l, pad: l.button && cols !== undefined ? Math.max(BUTTON_GAP, cols - width(l.line2) - BUTTON_COLUMNS) : 0 });
	// A wide terminal spreads the lines out when all of both fits, with every
	// agent's current action if those fit too; past that the narrow levels
	// apply as usual.
	if (cols !== undefined && cols >= WIDE_AT) {
		const l1 = line1(v, 0, true);
		const room = cols - (button ? BUTTON_GAP + BUTTON_COLUMNS : 0);
		if (width(l1) <= cols) {
			for (const every of [true, false]) {
				const l2 = line2(v, 0, cols, true, every);
				if (width(l2) <= room) return pinned({ line1: l1, line2: l2, button });
			}
		}
	}
	const last = lastLevel(v);
	const fits1 = (level: number) => cols === undefined || width(line1(v, level)) <= cols;
	const fits2 = (level: number, withButton: boolean) =>
		cols === undefined || width(line2(v, level, cols)) + (withButton ? BUTTON_GAP + BUTTON_COLUMNS : 0) <= cols;
	// Line 1 has nothing left to give past RUNS; line 2 past the last fold.
	let need1 = 0;
	while (need1 < RUNS && !fits1(need1)) need1++;
	let need2 = 0;
	while (need2 < last && !fits2(need2, button)) need2++;
	const level = Math.max(need1, need2);
	// The button goes only once every card has folded and the line still
	// does not fit; what is left is cut at the row's end.
	return pinned({ line1: line1(v, level), line2: line2(v, level, cols), button: button && fits2(level, true) });
}
