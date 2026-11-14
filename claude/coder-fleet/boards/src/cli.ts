#!/usr/bin/env bun
// The board's CLI, as far as it is built: create a board, say where it is,
// file, list, move and delete cards, give the card to take next, and read a
// card's move history. Every command
// acts on the board of the repo the current directory is in.
import { assertCanCreate, CLI_COMMAND, createBoard, NoBoardError, noBoardMessage, requireBoard } from "./board.ts";
import { createCard, deleteCard, listCards } from "./cards.ts";
import { COLUMNS } from "./columns.ts";
import { cardHistory } from "./events.ts";
import { moveCard, takeNext } from "./moves.ts";
import { resolveBoard } from "./resolve.ts";

const USAGE = `Usage: ${CLI_COMMAND} <command>, from inside the repo

  init                 create this repo's board; asks for its id prefix
  where                print this repo's board key, prefix and directory
  new <title> [--parent <ID>]
                       file a card, or a sub-issue of <ID>, and print its id
  list                 print every card's id and title
  move <ID> <column>   move a card; the CLI moves a card only from Draft to Backlog
  next                 print the card to take: the top of Next, else the first in Backlog
  delete <ID>          delete a card
  history <ID>         print a card's column moves, oldest first
`;

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
			for (const { card } of listCards(requireBoard(cwd, process.env))) console.log(`${card.id}\t${card.title}`);
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
