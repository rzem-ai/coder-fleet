import { writeFileSync } from "node:fs";
import { requireBoard } from "../src/board.ts";
import { createCard, updateCard } from "../src/cards.ts";
import { COLUMNS } from "../src/columns.ts";
import { MoveRefused, moveCard } from "../src/moves.ts";

// A second process for the concurrency tests: `bun worker.ts <repo> <op> ...`,
// with the test's world in its environment.
const [repo, op, ...args] = process.argv.slice(2);
if (!repo || !op) throw new Error("usage: worker.ts <repo> <op> ...");
const board = requireBoard(repo);

switch (op) {
	// create <n>: files n cards and prints their ids.
	case "create": {
		for (let i = 0; i < Number(args[0]); i++) console.log(createCard(board, { title: `w${process.pid}-${i}` }).card.id);
		break;
	}
	// bump <id> <n>: adds one to the card's rank n times, each a read and a write.
	case "bump": {
		const [id, n] = args as [string, string];
		for (let i = 0; i < Number(n); i++) {
			updateCard(board, id, (f) => ({ ...f, card: { ...f.card, rank: Number(f.card.rank ?? 0) + 1 } }));
		}
		break;
	}
	// rewrite <id> <n> <done>: rewrites the card n times, alternating a body of
	// a's and a longer one of b's, then writes the file <done>.
	case "rewrite": {
		const [id, n, done] = args as [string, string, string];
		const bodies = [`${"a".repeat(400_000)}\n`, `${"b".repeat(900_000)}\n`];
		for (let i = 0; i < Number(n); i++) updateCard(board, id, (f) => ({ ...f, body: bodies[i % 2] as string }));
		writeFileSync(done, "");
		break;
	}
	// crash <id>: changes the card with an event to log, and is killed while
	// that event is being written, after the card is.
	case "crash": {
		const [id] = args as [string];
		const event = {
			event: "card-moved",
			source: "hook" as const,
			get to() {
				process.kill(process.pid, "SIGKILL");
				return "never";
			},
		};
		updateCard(board, id, (f) => ({ ...f, card: { ...f.card, title: "after" } }), { event, actor: "session-crash" });
		break;
	}
	// shuffle <id> <n> <offset>: moves the card n times through the web UI,
	// round every column but Draft from <offset>; a move to the column it is
	// already in is refused and skipped.
	case "shuffle": {
		const [id, n, offset] = args as [string, string, string];
		const targets = COLUMNS.filter((c) => c !== "Draft");
		for (let i = 0; i < Number(n); i++) {
			try {
				moveCard(board, { card: id, to: targets[(i + Number(offset)) % targets.length] as string, source: "web" });
			} catch (e) {
				if (!(e instanceof MoveRefused)) throw e;
			}
		}
		break;
	}
	default:
		throw new Error(`unknown op ${op}`);
}
