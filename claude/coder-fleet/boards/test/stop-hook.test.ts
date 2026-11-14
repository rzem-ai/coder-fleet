import { afterAll, describe, expect, it } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { addAction, tickAction } from "../src/actions.ts";
import { createBoard } from "../src/board.ts";
import { cardPath, createCard } from "../src/cards.ts";
import { tickItem } from "../src/checklists.ts";
import { readConfig, writeConfig } from "../src/config.ts";
import { clearFocus, setFocus } from "../src/focus.ts";
import { moveCard } from "../src/moves.ts";
import { World } from "./fixtures.ts";

// CF-4: the Stop hook sends the lead back once when its focused card has an
// unticked acceptance criterion and nothing waits on the human, and otherwise
// lets the stop through, saying nothing. Each case drives the hook's own
// script with the JSON Claude Code sends a Stop hook.
const HOOK = join(import.meta.dir, "..", "src", "hooks", "stop.ts");
const w = new World("stop-hook");
afterAll(() => w.dispose());
const env = { ...w.env, XDG_STATE_HOME: join(w.root, "state") };
const repo = w.repo("st", "git@example.com:o/st.git");
const board = createBoard(repo, "ST", env);

function stopHook(input: Record<string, unknown>): { out: string; err: string } {
	const p = Bun.spawnSync(["bun", HOOK], {
		cwd: repo,
		env: { ...env, CLAUDE_PROJECT_DIR: repo } as Record<string, string>,
		stdin: new TextEncoder().encode(JSON.stringify({ session_id: "s1", cwd: repo, hook_event_name: "Stop", stop_hook_active: false, last_assistant_message: "Done for now.", background_tasks: [], session_crons: [], ...input })),
		stdout: "pipe",
		stderr: "pipe",
	});
	expect(p.exitCode).toBe(0);
	return { out: p.stdout.toString(), err: p.stderr.toString() };
}

const silent = { out: "", err: "" };

// A card in In Progress with two criteria, the first ticked when `ticked`.
function focusedCard(ticked = false): string {
	const { id } = createCard(board, { title: "work", fields: { criteria: [{ text: "first", ticked: false }, { text: "second", ticked: false }] } }).card;
	moveCard(board, { card: id, to: "Backlog", source: "web" });
	moveCard(board, { card: id, to: "In Progress", source: "web" });
	if (ticked) tickItem(board, id, "criteria", 0);
	setFocus(repo, id, env);
	return id;
}

describe("the Stop hook", () => {
	it("sends the lead back once, naming the card and the criteria still open (criterion 1)", () => {
		const id = focusedCard(true);
		const { out, err } = stopHook({});
		expect(err).toBe("");
		const said = JSON.parse(out);
		expect(said.decision).toBe("block");
		expect(said.reason).toContain(`${id} is this checkout's focus`);
		expect(said.reason).toContain('1 "second"');
		expect(said.reason).not.toContain('"first"');
	});

	it("lets the continued stop through, so one stop costs at most one extra turn (criterion 2)", () => {
		focusedCard();
		expect(JSON.parse(stopHook({}).out).decision).toBe("block");
		expect(stopHook({ stop_hook_active: true })).toEqual(silent);
	});

	it("lets the stop through with no focus (criterion 3)", () => {
		focusedCard();
		clearFocus(repo, env);
		expect(stopHook({})).toEqual(silent);
	});

	it("lets the stop through when every criterion is ticked (criterion 3)", () => {
		const id = focusedCard(true);
		tickItem(board, id, "criteria", 1);
		expect(stopHook({})).toEqual(silent);
	});

	it("lets the stop through when the card has an unticked Action for Human (criterion 3)", () => {
		const id = focusedCard();
		const { card } = createCard(board, { title: "draft with action" });
		addAction(board, card.id, "which way?", "web");
		setFocus(repo, card.id, env);
		expect(stopHook({})).toEqual(silent);
		setFocus(repo, id, env);
		expect(JSON.parse(stopHook({}).out).decision).toBe("block");
	});

	it("lets the stop through when the card is Blocked or Blocked by Human (criterion 3)", () => {
		const blocked = focusedCard();
		moveCard(board, { card: blocked, to: "Blocked", source: "web" });
		expect(stopHook({})).toEqual(silent);
		const byHuman = focusedCard();
		addAction(board, byHuman, "which way?", "web");
		tickAction(board, byHuman, 0);
		expect(stopHook({})).toEqual(silent);
	});

	it("lets the stop through when the lead's last message asked the human a question (criterion 3)", () => {
		focusedCard();
		expect(stopHook({ last_assistant_message: "Built the reader.\n\nShould the switch live in config.yml?" })).toEqual(silent);
	});

	it("lets the stop through while a subagent or background command runs (criterion 3)", () => {
		focusedCard();
		expect(stopHook({ background_tasks: [{ id: "a1", type: "subagent", status: "running", description: "build", agent_type: "coder-fleet:coder" }] })).toEqual(silent);
		expect(stopHook({ background_tasks: [{ id: "b1", type: "shell", status: "running", description: "suite", command: "bash check-all.sh" }] })).toEqual(silent);
	});

	it("does not hold a /drain under /goal open once its last card is accounted for (criterion 4)", () => {
		const drained =
			"In Progress drained: 0 ready to merge (-), 0 parked (-), 0 skipped (-), 0 not reached (-). Next drained: 1 ready to merge (ST-1), 1 parked (ST-2), 0 skipped (-), 0 not reached (-).";
		// drain.md step 3 clears the focus after each card.
		focusedCard();
		clearFocus(repo, env);
		expect(stopHook({ last_assistant_message: drained })).toEqual(silent);
		// A last card parked with its question on the card.
		const parked = focusedCard();
		addAction(board, parked, "which way?", "mcp");
		expect(stopHook({ last_assistant_message: drained })).toEqual(silent);
		// Focus left on a ready-to-merge card with criteria open: one send-back, then through.
		focusedCard();
		expect(JSON.parse(stopHook({ last_assistant_message: drained }).out).decision).toBe("block");
		expect(stopHook({ last_assistant_message: drained, stop_hook_active: true })).toEqual(silent);
	});

	it("changes nothing on the board (criterion 6)", () => {
		const id = focusedCard();
		const before = [readFileSync(cardPath(board, id), "utf8"), readFileSync(board.paths.events, "utf8")];
		expect(JSON.parse(stopHook({}).out).decision).toBe("block");
		expect([readFileSync(cardPath(board, id), "utf8"), readFileSync(board.paths.events, "utf8")]).toEqual(before);
	});

	it("lets the stop through and logs why when the card cannot be read (criterion 6)", () => {
		const id = focusedCard();
		const path = cardPath(board, id);
		const was = readFileSync(path, "utf8");
		writeFileSync(path, "---\n: not: yaml: [\n---\n");
		try {
			const { out, err } = stopHook({});
			expect(out).toBe("");
			expect(err).toContain("board: the stop check let the stop through: could not read the focus or its card:");
		} finally {
			writeFileSync(path, was);
		}
	});

	it("is switched off by sendBackAtStop: false in the board's config.yml (criterion 7)", () => {
		focusedCard();
		const cfg = readConfig(board.paths);
		writeConfig(board.paths, { ...cfg, sendBackAtStop: false });
		try {
			expect(stopHook({})).toEqual(silent);
		} finally {
			writeConfig(board.paths, cfg);
		}
		expect(JSON.parse(stopHook({}).out).decision).toBe("block");
	});
});
