// The sandbox board's seed for the web UI's dev page (scripts/web-dev.ts).
// Every card, move, tick, comment and Action for Human is made through the
// board's own functions, so the cards and the event trail are what the page
// reads in production. Moves have source `web`, the one source allowed to put
// a card in Next, to override a gate or to reach Released. Only the two
// release runs at the end are written as events directly, since the test
// gate that would make them runs against a real tagged commit.
import { mkdirSync, writeFileSync } from "node:fs";
import { addAction, tickAction } from "../src/actions.ts";
import type { Board } from "../src/board.ts";
import { createCard, readCard } from "../src/cards.ts";
import { addItem, checklist, LISTS, tickItem } from "../src/checklists.ts";
import { addComment } from "../src/comments.ts";
import { readConfig, writeConfig } from "../src/config.ts";
import { addDependency } from "../src/dependencies.ts";
import { appendEvent } from "../src/events.ts";
import { moveCard, orderNext } from "../src/moves.ts";
import { logPath } from "../src/releases.ts";

interface Spec {
	title: string;
	body?: string;
	parent?: string;
	criteria?: string[];
	dod?: string[];
}

function make(board: Board, spec: Spec): string {
	const { card } = createCard(board, { title: spec.title, body: spec.body, parent: spec.parent });
	for (const text of spec.criteria ?? []) addItem(board, card.id, "criteria", text);
	for (const text of spec.dod ?? []) addItem(board, card.id, "dod", text);
	return card.id;
}

// Moves a card through each column in turn, as the human would in the web UI.
function walk(board: Board, id: string, ...columns: string[]): void {
	for (const to of columns) moveCard(board, { card: id, to, source: "web" });
}

// Ticks every criterion and Definition of Done item, the board's defaults too.
function tickAll(board: Board, id: string): void {
	for (const list of LISTS) {
		const { card } = readCard(board, id);
		for (const item of checklist(board, card, list)) if (!item.ticked) tickItem(board, id, list, item.n);
	}
}

// Ticks the first `count` criteria of a card.
function tickSome(board: Board, id: string, count: number): void {
	for (let n = 0; n < count; n++) tickItem(board, id, "criteria", n);
}

function release(board: Board, release: string, tag: string, commit: string, cards: string[], passed: boolean): void {
	appendEvent(board.paths, { event: "release-started", source: "hook", release, tag, tagObject: `${commit.slice(0, 7)}0`.padEnd(40, "0"), commit, gitDir: "/sandbox/web-dev/.git", cards, run: release });
	mkdirSync(board.paths.testRuns, { recursive: true });
	const log = [
		`Release ${tag}, commit ${commit}, cards ${cards.join(", ")}`,
		"Started in the sandbox: bash claude/evals/lib/check-all.sh",
		"",
		"[hooks]     ok",
		"[roster]    ok",
		passed ? "[workflows] ok" : "[workflows] FAIL: a workflow test expected 3 phases and found 2",
		"",
		`Finished: exit ${passed ? 0 : 1}, ${passed ? "passed" : "failed"}`,
		"",
	].join("\n");
	writeFileSync(logPath(board, release), log);
	appendEvent(board.paths, { event: "test-run", source: "hook", run: release, release, commit, result: passed ? "passed" : "failed", exit: passed ? 0 : 1 });
}

// Fills all eight columns of a fresh board: parent cards with sub-issues, a
// dependency, ticked and unticked criteria and Definition of Done items,
// Actions for Human, comments, move histories and two release test runs.
export function seedBoard(board: Board): void {
	// Two default Definition of Done items on every card, so a card's list shows
	// items that belong to the board as well as its own.
	writeConfig(board.paths, { ...readConfig(board.paths), defaults: { dod: ["Tests pass", "Docs say what changed"] } });

	// Draft
	make(board, { title: "Sketch the release notes page", body: "Rough idea, nothing agreed yet.\n" });
	make(board, { title: "Keyboard shortcuts for moving cards", body: "Maybe `m` to open the move menu.\n", criteria: ["A shortcut opens the move menu"] });

	// Backlog, with a dependency that is not done, so the card is not ready.
	const darkMode = make(board, {
		title: "Dark mode polish",
		body: "The dark theme is close; the tile borders and the run log need a pass.\n",
		criteria: ["Tile borders read in the dark theme", "The run log keeps its contrast"],
	});
	const tiles = make(board, { title: "Fix tile border contrast", parent: darkMode, criteria: ["Borders pass a 3:1 contrast check"] });
	const log = make(board, { title: "Keep the run log readable in dark mode", parent: darkMode, criteria: ["Log text passes a 4.5:1 contrast check"] });
	const ship = make(board, { title: "Ship dark mode", body: "Waits on the polish above.\n", criteria: ["The theme toggle is on by default for dark systems"] });
	addDependency(board, ship, darkMode);
	for (const id of [darkMode, tiles, log, ship]) walk(board, id, "Backlog");
	const rate = make(board, { title: "Rate-limit the status endpoint", criteria: ["Over 20 requests a second get a 429", "The limit is set in config"], dod: ["Load test attached"] });
	walk(board, rate, "Backlog");
	addComment(board, rate, "Do we want the limit per client or global?", "human");

	// Next, in the human's order.
	const next = ["Show the focus binding in the header", "Paginate the history list", "Name the repo in the page title"].map((title, i) =>
		make(board, { title, body: i === 0 ? "The header should say which checkout the board is bound to.\n" : undefined, criteria: ["It matches the design", "It works with no board bound"] }),
	);
	for (const id of next) walk(board, id, "Backlog", "Next");
	orderNext(board, [next[2] as string, next[0] as string, next[1] as string], "web");
	tickSome(board, next[0] as string, 1);

	// In Progress, a parent with sub-issues in several columns.
	const sync = make(board, {
		title: "Sync the board across checkouts",
		body: "Two checkouts of one repo see the same board; a write in one should show in the other without a reload.\n",
		criteria: ["A write shows in another tab within two seconds", "A failed sync says so"],
		dod: ["Checked in two browsers"],
	});
	const poll = make(board, { title: "Poll the board every two seconds", parent: sync, criteria: ["Polling pauses in a hidden tab"] });
	const toast = make(board, { title: "Show a toast when a sync fails", parent: sync, criteria: ["The toast names the card"] });
	const docs = make(board, { title: "Document the sync interval", parent: sync, criteria: ["The README names the interval"] });
	walk(board, sync, "Backlog", "In Progress");
	tickSome(board, sync, 1);
	walk(board, poll, "Backlog", "Next", "In Progress", "Done");
	tickAll(board, poll);
	walk(board, toast, "Backlog", "In Progress");
	walk(board, docs, "Backlog");
	addComment(board, sync, "Keep this to polling; websockets are a later card.", "human");
	addComment(board, sync, "Polling is in. The toast is next.", "agent");
	// A card that once waited on the human, now back to work with its Action ticked.
	const theme = make(board, { title: "Pick the accent colour", criteria: ["The human has picked one"] });
	walk(board, theme, "Backlog");
	addAction(board, theme, "Pick between the teal and the amber accent", "web");
	tickAction(board, theme, 0);
	walk(board, theme, "In Progress");

	// Done, every item ticked.
	const empty = make(board, { title: "Show an empty state in an empty column", criteria: ["Each lane says it is empty", "A dragged card can still land there"], dod: ["Seen in the dev page"] });
	walk(board, empty, "Backlog", "Next", "In Progress", "Blocked", "In Progress", "Done");
	tickAll(board, empty);

	// Released, one card moved from Done with unticked items and so a gate bypassed.
	const fold = make(board, { title: "Fold the long columns", criteria: ["A lane folds when it is long", "The fold is remembered"], dod: ["Tested by hand"] });
	const drag = make(board, { title: "Drag a card between columns", criteria: ["A refused lane shows why"], dod: ["Tested by hand"] });
	walk(board, fold, "Backlog", "Next", "In Progress", "Done");
	tickAll(board, fold);
	walk(board, fold, "Released");
	walk(board, drag, "Backlog", "In Progress", "Done", "Released");
	addComment(board, drag, "Released before its Definition of Done was ticked; the human overrode the gate.", "human");

	// Blocked, after a release test run failed.
	const gate = make(board, { title: "Name the gate a move bypassed", criteria: ["The history says card or test"], dod: ["Tested by hand"] });
	walk(board, gate, "Backlog", "In Progress", "Done");
	tickAll(board, gate);
	walk(board, gate, "Blocked");
	addComment(board, gate, "The test run for v0.2.0 failed: a workflow test expected 3 phases and found 2. See the run's log.", "hook");

	// Blocked by Human, one card with an open Action and one with two.
	const keys = make(board, { title: "Rotate the sandbox signing key", criteria: ["The new key is in the keychain"] });
	walk(board, keys, "Backlog", "In Progress");
	addAction(board, keys, "Generate the new key; an agent cannot reach the keychain", "web");
	const copy = make(board, { title: "Choose the empty-state wording", criteria: ["The wording is agreed"] });
	walk(board, copy, "Backlog", "In Progress");
	addAction(board, copy, "Pick one of the three drafts in the card's comments", "web");
	addAction(board, copy, "Tell the agent whether to keep the joke", "web");
	tickAction(board, copy, 0);
	addComment(board, copy, "Draft A: Nothing here yet. Draft B: All clear. Draft C: Quiet.", "agent");

	release(board, "20260101T090000-sand", "v0.1.0", "3f9c2a1d7be44c0e8a5f61d2c9b07e1a4d8f3b56", [fold, drag], true);
	release(board, "20260108T090000-sand", "v0.2.0", "b81e5d03a94c7f26e0d1a3b58c64f9027e1d3a4c", [gate], false);
}
