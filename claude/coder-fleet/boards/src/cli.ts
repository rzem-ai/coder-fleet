#!/usr/bin/env bun
// The board's CLI, as far as it is built: create a board, say where it is,
// file, list, show, move and delete cards, give the card to take next, read a
// card's move history, and edit its checklists, Actions for Human and
// dependencies. Every command acts on the board of the repo the current
// directory is in.
import { actionsOf, addAction, tickAction } from "./actions.ts";
import { join } from "node:path";
import { assertCanCreate, CLI_COMMAND, createBoard, NoBoardError, noBoardMessage, requireBoard, shellQuote } from "./board.ts";
import { createCard, deleteCard, listCards, readCard } from "./cards.ts";
import { addItem, checklist, editItem, isListName, LIST_TITLES, LISTS, removeItem, tickItem, untickItem } from "./checklists.ts";
import { COLUMNS } from "./columns.ts";
import { existsSync, readFileSync } from "node:fs";
import { addDependency, dependenciesDone, dependenciesOf, removeDependency } from "./dependencies.ts";
import { cardHistory } from "./events.ts";
import { moveCard, takeNext } from "./moves.ts";
import { logPath, testRuns } from "./releases.ts";
import { resolveBoard } from "./resolve.ts";
import { serveMcp } from "./mcp.ts";
import { testRunner } from "./test-runner.ts";
import { DIST, pageBuilt, startWebUI } from "./web.ts";
import { webServer } from "./web-server.ts";
import { restoreCallerCwd } from "./self.ts";

const USAGE = `Usage: ${CLI_COMMAND} <command>, from inside the repo

  init                 create this repo's board; asks for its id prefix
  where                print this repo's board key, prefix and directory
  new <title> [--parent <ID>]
                       file a card, or a sub-issue of <ID>, and print its id
  list [--ready]       print every card's id and title; --ready prints only the
                       cards whose dependencies are all in Done or Released
  show <ID>            print a card with its numbered lists, counted from 0
  move <ID> <column>   move a card; the CLI moves a card only from Draft to Backlog
  next                 print the card to take: the top of Next, else the first in Backlog
  delete <ID>          delete a card
  history <ID>         print a card's column moves, oldest first
  add <list> <ID> <text>
                       add an item to a list: criteria, dod or actions; an
                       action moves the card to Blocked by Human
  tick <list> <ID> <n> tick item n of a list, counted from 0
  untick <list> <ID> <n>
                       untick item n of criteria or dod, counted from 0
  edit <list> <ID> <n> <text>
                       change the text of the card's own item n of criteria or dod
  remove <list> <ID> <n>
                       remove the card's own item n of criteria or dod
  depend <ID> <on>     record that card <ID> depends on card <on>
  undepend <ID> <on>   drop that dependency
  runs                 print the board's release test runs: id, tag, commit,
                       state and log
  run-log <run>        print a test run's log, while it runs or after
  web                  start the board's web UI on this machine, or reuse the
                       running one, and print its address
  mcp                  serve the board's MCP tools over stdio, for Claude Code
`;

// Every command the CLI runs. A word not here is an unknown command, whatever
// the switch in main has a case for. The usage leaves out the last four:
// test-runner and web-server are the board's own background processes, which
// it starts as this program again (src/self.ts), and fleet runs the fleet's
// rules and helper scripts (src/fleet/), which the plugin's shims call, and
// hook runs the board's hooks (src/hooks/), which hooks.json calls.
export const COMMANDS = [
	"init",
	"where",
	"new",
	"list",
	"show",
	"move",
	"next",
	"delete",
	"history",
	"add",
	"tick",
	"untick",
	"edit",
	"remove",
	"depend",
	"undepend",
	"runs",
	"run-log",
	"web",
	"mcp",
	"test-runner",
	"web-server",
	"fleet",
	"hook",
] as const;
type Command = (typeof COMMANDS)[number];

function isCommand(word: string): word is Command {
	return (COMMANDS as readonly string[]).includes(word);
}

const HELP = ["help", "--help", "-h"];

const LIST_ARGS = [...LISTS, "actions"].join(", ");

// A 0-based item number as typed: digits only.
function itemNumber(word: string | undefined): number {
	if (!word || !/^[0-9]+$/.test(word)) throw new Error(`"${word ?? ""}" is not an item number; items are counted from 0`);
	return Number(word);
}

function box(ticked: boolean): string {
	return ticked ? "[x]" : "[ ]";
}

async function ask(question: string): Promise<string> {
	process.stdout.write(question);
	for await (const line of console) return line;
	return "";
}

export async function main(argv: string[]): Promise<number> {
	const [cmd, ...rest] = argv;
	const cwd = process.cwd();
	if (cmd === undefined || HELP.includes(cmd)) {
		process.stdout.write(USAGE);
		return cmd === undefined ? 1 : 0;
	}
	if (!isCommand(cmd)) {
		process.stderr.write(`Unknown command: ${cmd}\n\n${USAGE}`);
		return 1;
	}
	switch (cmd) {
		case "init": {
			assertCanCreate(cwd, process.env);
			const prefix = await ask("Id prefix for this board, a letter then up to nine letters or digits (for example XY): ");
			if (!prefix.trim()) throw new Error("No prefix given, so no board was created");
			const board = createBoard(cwd, prefix, process.env, "cli");
			console.log(`\nCreated the board for ${board.config.key}, prefix ${board.config.prefix}, at ${board.paths.dir}`);
			return 0;
		}
		case "where": {
			const res = resolveBoard(cwd, process.env);
			if (!res) throw new NoBoardError("This directory is not inside a git repository.");
			console.log(`key: ${res.key.value} (${res.key.kind})`);
			if (res.shadowed) console.log(`shadowed: ${res.shadowed}`);
			if (!res.found) throw new NoBoardError(noBoardMessage(res));
			console.log(`prefix: ${res.found.config.prefix}`);
			console.log(`dir: ${res.found.paths.dir}`);
			return 0;
		}
		case "new": {
			const at = rest.indexOf("--parent");
			const parent = at >= 0 ? rest[at + 1] : undefined;
			if (at >= 0 && !parent) throw new Error("--parent needs a card id");
			const title = rest.filter((_, i) => at < 0 || (i !== at && i !== at + 1)).join(" ");
			const { card } = createCard(requireBoard(cwd, process.env), { title, parent });
			console.log(card.id);
			return 0;
		}
		case "list": {
			const board = requireBoard(cwd, process.env);
			const cards = rest[0] === "--ready" ? dependenciesDone(board) : listCards(board).map((f) => f.card);
			for (const card of cards) console.log(`${card.id}\t${card.title}`);
			return 0;
		}
		case "show": {
			const id = rest[0];
			if (!id) throw new Error("show needs a card id");
			const board = requireBoard(cwd, process.env);
			const { card, body } = readCard(board, id);
			console.log(`${card.id}\t${card.title}`);
			console.log(`column: ${String(card.column)}`);
			if (card.parent) console.log(`parent: ${card.parent}`);
			const deps = dependenciesOf(card);
			if (deps.length) console.log(`depends on: ${deps.join(", ")}`);
			for (const list of LISTS) {
				console.log(`\n${LIST_TITLES[list]}:`);
				for (const i of checklist(board, card, list)) console.log(`${i.n} ${box(i.ticked)} ${i.text}${i.fromDefaults ? " (board default)" : ""}`);
			}
			console.log("\nActions for Human:");
			actionsOf(card).forEach((a, n) => {
				console.log(`${n} ${box(a.ticked)} ${a.text}`);
			});
			if (body.trim()) console.log(`\n${body.trimEnd()}`);
			return 0;
		}
		case "add": {
			const [list, id, ...words] = rest;
			const text = words.join(" ");
			if (!list || !id || !text) throw new Error(`add needs a list (${LIST_ARGS}), a card id and the item's text`);
			const board = requireBoard(cwd, process.env);
			if (list === "actions") {
				const n = actionsOf(addAction(board, id, text, "cli")).length - 1;
				console.log(`Added Action for Human ${n} to ${id}; it is in ${String(readCard(board, id).card.column)}.`);
				return 0;
			}
			if (!isListName(list)) throw new Error(`"${list}" is not a list: use ${LIST_ARGS}`);
			const own = checklist(board, addItem(board, id, list, text), list).filter((i) => !i.fromDefaults);
			console.log(`Added ${LIST_TITLES[list]} item ${own.length - 1} to ${id}.`);
			return 0;
		}
		case "tick": {
			const [list, id, word] = rest;
			if (!list || !id) throw new Error(`tick needs a list (${LIST_ARGS}), a card id and an item number, counted from 0`);
			const n = itemNumber(word);
			const board = requireBoard(cwd, process.env);
			if (list === "actions") tickAction(board, id, n);
			else if (isListName(list)) tickItem(board, id, list, n);
			else throw new Error(`"${list}" is not a list: use ${LIST_ARGS}`);
			console.log(`Ticked ${list} item ${n} on ${id}.`);
			return 0;
		}
		case "untick": {
			const [list, id, word] = rest;
			if (!isListName(list) || !id) throw new Error(`untick needs a list (${LISTS.join(" or ")}), a card id and an item number, counted from 0`);
			const n = itemNumber(word);
			untickItem(requireBoard(cwd, process.env), id, list, n);
			console.log(`Unticked ${list} item ${n} on ${id}.`);
			return 0;
		}
		case "edit": {
			const [list, id, word, ...words] = rest;
			const text = words.join(" ");
			if (!isListName(list) || !id || !text) throw new Error(`edit needs a list (${LISTS.join(" or ")}), a card id, an item number counted from 0, and the new text`);
			const n = itemNumber(word);
			editItem(requireBoard(cwd, process.env), id, list, n, text);
			console.log(`Changed ${list} item ${n} on ${id}.`);
			return 0;
		}
		case "remove": {
			const [list, id, word] = rest;
			if (!isListName(list) || !id) throw new Error(`remove needs a list (${LISTS.join(" or ")}), a card id and an item number, counted from 0`);
			const n = itemNumber(word);
			removeItem(requireBoard(cwd, process.env), id, list, n);
			console.log(`Removed ${list} item ${n} from ${id}.`);
			return 0;
		}
		case "depend":
		case "undepend": {
			const [id, on] = rest;
			if (!id || !on) throw new Error(`${cmd} needs a card id and the id of the card it depends on`);
			const board = requireBoard(cwd, process.env);
			const deps = dependenciesOf(cmd === "depend" ? addDependency(board, id, on) : removeDependency(board, id, on));
			console.log(`${id} depends on ${deps.length ? deps.join(", ") : "no card"}.`);
			return 0;
		}
		case "move": {
			const [id, ...words] = rest;
			const to = words.join(" ");
			if (!id || !to) throw new Error(`move needs a card id and a column: ${COLUMNS.join(", ")}`);
			const ev = moveCard(requireBoard(cwd, process.env), { card: id, to, source: "cli" });
			console.log(`Moved ${id} from ${ev.from} to ${ev.to}.`);
			return 0;
		}
		case "next": {
			const card = takeNext(requireBoard(cwd, process.env));
			if (!card) {
				console.log("Nothing to take: Next and Backlog are empty.");
				return 0;
			}
			console.log(`${card.id}\t${card.column}\t${card.title}`);
			return 0;
		}
		case "delete": {
			const id = rest[0];
			if (!id) throw new Error("delete needs a card id");
			deleteCard(requireBoard(cwd, process.env), id, "cli");
			console.log(`Deleted ${id}.`);
			return 0;
		}
		case "history": {
			const id = rest[0];
			if (!id) throw new Error("history needs a card id");
			for (const e of cardHistory(requireBoard(cwd, process.env).paths, id)) {
				console.log([e.time, `${e.from} -> ${e.to}`, e.source, e.actor ?? "-", e.gate ? `bypassed the ${e.gate} gate` : ""].join("\t").trimEnd());
			}
			return 0;
		}
		case "runs": {
			for (const r of testRuns(requireBoard(cwd, process.env))) {
				console.log([r.release, r.tag, r.commit.slice(0, 12), r.state, r.log].join("\t"));
			}
			return 0;
		}
		case "run-log": {
			const run = rest[0];
			if (!run || !/^[A-Za-z0-9-]+$/.test(run)) throw new Error("run-log needs a run id, as `runs` prints it");
			const log = logPath(requireBoard(cwd, process.env), run);
			if (!existsSync(log)) throw new Error(`No log for run ${run}: ${log} does not exist`);
			process.stdout.write(readFileSync(log, "utf8"));
			return 0;
		}
		case "web": {
			// The session the UI stays up for: the Claude Code process this runs
			// under, else the shell the human typed this in.
			const claude = /^[1-9][0-9]*$/.test(process.env.CLAUDE_PID ?? "") ? Number(process.env.CLAUDE_PID) : 0;
			const { url, reused } = startWebUI(cwd, claude || process.ppid, process.env);
			console.log(`${reused ? "The board's web UI is running" : "Started the board's web UI"}: ${url}`);
			if (!pageBuilt()) {
				console.log(`It is not built yet, so it shows only how to build it: run \`bun install --frozen-lockfile && bun run build\` in ${shellQuote(join(DIST, ".."))}.`);
			}
			return 0;
		}
		case "mcp":
			await serveMcp(cwd, process.env);
			return 0;
		case "test-runner":
			return testRunner(rest);
		case "web-server":
			return webServer(rest);
		case "fleet": {
			const { runFleet } = await import("./fleet/cli.ts");
			return runFleet(rest);
		}
		case "hook": {
			const { runHook } = await import("./hooks/run.ts");
			return runHook(rest);
		}
	}
}

// Runs one command line and exits with its status.
export async function runCli(argv: string[]): Promise<never> {
	try {
		process.exit(await main(argv));
	} catch (e) {
		process.stderr.write(`${(e as Error).message}\n`);
		process.exit(1);
	}
}

// Run as a command, not when a test imports COMMANDS. The compiled binary
// enters through src/main.ts instead.
if (import.meta.main) {
	restoreCallerCwd();
	await runCli(process.argv.slice(2));
}
