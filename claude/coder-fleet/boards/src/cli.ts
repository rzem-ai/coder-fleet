#!/usr/bin/env bun
// The board's CLI, as far as it is built: create a board, say where it is,
// file, list, show, move and delete cards, give the card to take next, read a
// card's move history, and edit its checklists, Actions for Human and
// dependencies. Every command acts on the board of the repo the current
// directory is in.
import { actionsOf, addAction, tickAction } from "./actions.ts";
import { assertCanCreate, CLI_COMMAND, createBoard, NoBoardError, noBoardMessage, requireBoard } from "./board.ts";
import { createCard, deleteCard, listCards, readCard } from "./cards.ts";
import { addItem, checklist, isListName, LIST_TITLES, LISTS, removeItem, tickItem } from "./checklists.ts";
import { COLUMNS } from "./columns.ts";
import { addDependency, dependenciesDone, dependenciesOf, removeDependency } from "./dependencies.ts";
import { cardHistory } from "./events.ts";
import { moveCard, takeNext } from "./moves.ts";
import { resolveBoard } from "./resolve.ts";

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
  remove <list> <ID> <n>
                       remove the card's own item n of criteria or dod
  depend <ID> <on>     record that card <ID> depends on card <on>
  undepend <ID> <on>   drop that dependency
`;

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

async function main(argv: string[]): Promise<number> {
	const [cmd, ...rest] = argv;
	const cwd = process.cwd();
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
		case undefined:
		case "help":
		case "--help":
		case "-h":
			process.stdout.write(USAGE);
			return cmd === undefined ? 1 : 0;
		default:
			process.stderr.write(`Unknown command: ${cmd}\n\n${USAGE}`);
			return 1;
	}
}

try {
	process.exit(await main(process.argv.slice(2)));
} catch (e) {
	process.stderr.write(`${(e as Error).message}\n`);
	process.exit(1);
}
