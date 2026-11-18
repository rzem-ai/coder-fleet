// CF-27: every state of the design for the two lines under the prompt
// (concept D), each as the view boards-status.ts would gather and what the
// design draws for it: each line's runs of text with their One Dark colour
// and, for a card id while the web UI runs, its link. status-lines.test.ts
// renders each and compares.
import type { Agent, BoardFacts, View } from "../../coder-fleet/hooks/status-lines.ts";

export const NOW = 1_800_000_000_000;
const WEB = "http://127.0.0.1:41234/";

// A colour by the design's class name.
export const ONE_DARK = {
	f0: "#dcdfe4",
	f1: "#abb2bf",
	f2: "#7f848e",
	f3: "#5c6370",
	red: "#e06c75",
	green: "#98c379",
	yellow: "#e5c07b",
	blue: "#61afef",
	purple: "#c678dd",
	cyan: "#56b6c2",
} as const;
type Tone = keyof typeof ONE_DARK;

// A run as the design spells it: text, colour, and "link" for a card id
// drawn as a hyperlink.
export type Run = [string, Tone] | [string, Tone, "link"];

export type DesignState = { name: string; view: View; line1: Run[]; line2: Run[]; button: boolean };

const agent = (id: string, type: string, card: string | null, agoMs: number, phase: number, activity = ""): Agent => ({
	id,
	type: `coder-fleet:${type}`,
	card,
	startedAt: NOW - agoMs,
	activity,
	phase,
});

const board = (web: string | null): BoardFacts => ({ board: true, next: "CF-26", blockedByHuman: 0, web });

const base = (percent: number, tokens: number): Omit<View, "boot" | "agents" | "board" | "tick"> => ({
	ctx: { percent, tokens, window: 1_000_000 },
	model: "claude-opus-5-5",
	project: "coder-fleet",
	branch: "main",
	now: NOW,
	columns: 120,
	// The design draws the plain glyphs; CF-43's Nerd Font icons are pinned in status-lines.test.ts.
	nerdFont: false,
});

const tail: Run[] = [
	[" · ", "f2"],
	["◆ Opus 5.5", "blue"],
	[" · ", "f2"],
	["coder-fleet", "f0"],
	[" · ", "f2"],
	["⎇ main", "green"],
];

const gauge = (fill: number, of: number, tone: Tone, pct: string, tokens?: string): Run[] => [
	["ctx ", "f1"],
	["█".repeat(fill), tone],
	["░".repeat(of - fill), "f3"],
	[pct, tone === "red" ? "red" : "f0"],
	...(tokens ? ([[tokens, "f1"]] as Run[]) : []),
];

const at9 = [...gauge(2, 20, "green", "   9%", " 92k/1M"), ...tail];

const coder = agent("a1", "coder", "CF-26", 130_000, 2, "Edit hooks/boards-binary.sh");
const reviewer = agent("a2", "reviewer", "CF-26", 48_000, 4);
const techWriter = agent("a3", "tech-writer", "CF-15", 302_000, 3);

export const DESIGN: DesignState[] = [
	{
		name: "t + 0.6s: startup, the binary is downloading",
		view: { ...base(9.2, 92_000), boot: { kind: "downloading", version: "0.75.0", percent: 31 }, agents: [], board: null, tick: 2 },
		line1: at9,
		line2: [
			["⠹", "yellow"],
			[" boards v0.75.0  ", "f0"],
			["▰▰▰", "yellow"],
			["▱▱▱▱▱▱▱", "f3"],
			["  31%", "f0"],
			["  downloading", "f2"],
		],
		button: false,
	},
	{
		name: "t + 0.6s: another session holds the fetch",
		view: { ...base(9.2, 92_000), boot: { kind: "elsewhere", version: "0.75.0", percent: 58 }, agents: [], board: null, tick: 4 },
		line1: at9,
		line2: [
			["⠼", "yellow"],
			[" boards v0.75.0  ", "f0"],
			["▰▰▰▰▰▰", "yellow"],
			["▱▱▱▱", "f3"],
			["  58%", "f0"],
			["  another session is fetching", "f2"],
		],
		button: false,
	},
	{
		name: "t + 2.4s: the binary is ready",
		view: { ...base(9.2, 92_000), boot: { kind: "ready", version: "0.75.0" }, agents: [], board: board(null), tick: 0 },
		line1: at9,
		line2: [
			["✓", "green"],
			[" boards v0.75.0 ready", "f0"],
		],
		button: false,
	},
	{
		name: "no agents",
		view: { ...base(14.1, 141_000), boot: { kind: "fleet" }, agents: [], board: board(WEB), tick: 0 },
		line1: [...gauge(3, 20, "green", "  14%", " 141k/1M"), ...tail],
		line2: [
			["· no agents working  ·  next ", "f2"],
			["CF-26", "f1", "link"],
			["  ·  blocked by human 0", "f2"],
		],
		button: true,
	},
	{
		name: "one agent",
		view: { ...base(21.8, 218_000), boot: { kind: "fleet" }, agents: [coder], board: board(WEB), tick: 0 },
		line1: [...gauge(4, 20, "green", "  22%", " 218k/1M"), ...tail],
		line2: [
			["CF-26", "purple", "link"],
			["  ⠹", "cyan"],
			[" coder", "f0"],
			[" 2m10s", "f1"],
			["  Edit hooks/boards-binary.sh", "f2"],
		],
		button: true,
	},
	{
		name: "several agents",
		view: { ...base(71.2, 712_000), boot: { kind: "fleet" }, agents: [techWriter, coder, reviewer], board: board(WEB), tick: 0 },
		line1: [...gauge(14, 20, "yellow", "  71%", " 712k/1M"), ...tail],
		line2: [
			["CF-26", "purple", "link"],
			["  ⠹", "cyan"],
			[" coder", "f0"],
			[" 2m10s", "f1"],
			["  ⠼", "cyan"],
			[" reviewer", "f0"],
			[" 0m48s", "f1"],
			["   ·   ", "f2"],
			["CF-15", "purple", "link"],
			["  ⠸", "cyan"],
			[" tech-writer", "f0"],
			[" 5m02s", "f1"],
		],
		button: true,
	},
	{
		// The design calls this "about 80 columns"; these lines shrink to its
		// drawing from 60 columns down to 48, since at 80 both of them fit with
		// less taken away than it shows.
		name: "narrow",
		view: { ...base(71.2, 712_000), boot: { kind: "fleet" }, agents: [techWriter, coder, reviewer], board: board(WEB), tick: 0, columns: 60 },
		line1: [...gauge(7, 10, "yellow", "  71%"), ...tail],
		line2: [
			["CF-26", "purple", "link"],
			[" ⠹", "cyan"],
			[" coder", "f0"],
			[" ⠼", "cyan"],
			[" reviewer", "f0"],
			["  ·  +1 card", "f2"],
		],
		button: true,
	},
	{
		name: "failure: the fetch failed or the checksum did not match",
		view: { ...base(9.2, 92_000), boot: { kind: "unavailable", version: "0.75.0", why: "bad checksum" }, agents: [], board: null, tick: 0 },
		line1: at9,
		line2: [
			["✗ boards v0.75.0 unavailable: bad checksum", "red"],
			["  ·  board tools off  ·  /coder-fleet:help-boards", "f2"],
		],
		button: false,
	},
	{
		name: "ctx 85%+: near compaction, agents working",
		view: {
			...base(88.4, 884_000),
			boot: { kind: "fleet" },
			agents: [agent("a1", "coder", "CF-26", 391_000, 2)],
			board: board(WEB),
			tick: 0,
		},
		line1: [...gauge(18, 20, "red", "  88%", " 884k/1M"), [" · ", "f2"], ["compact soon", "yellow"], ...tail],
		line2: [
			["CF-26", "purple", "link"],
			["  ⠹", "cyan"],
			[" coder", "f0"],
			[" 6m31s", "f1"],
		],
		button: true,
	},
];
