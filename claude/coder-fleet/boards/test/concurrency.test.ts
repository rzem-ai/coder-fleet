import { afterAll, describe, expect, it } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createBoard } from "../src/board.ts";
import { cardPath, createCard, parseCard, readCard, updateCard } from "../src/cards.ts";
import { readEvents } from "../src/events.ts";
import { STALE_MS, WAIT_MS } from "../src/lock.ts";
import { World } from "./fixtures.ts";

// Group B, criteria 11 to 16: real processes racing on one board.
const w = new World("concurrency");
afterAll(() => w.dispose());
const repo = w.repo("conc", "git@example.com:o/conc.git");
const board = createBoard(repo, "CC", w.env);
const WORKER = join(import.meta.dir, "worker.ts");

function spawn(...args: string[]) {
	return Bun.spawn(["bun", WORKER, repo, ...args], { env: w.env as Record<string, string>, stdout: "pipe", stderr: "pipe" });
}

async function finish(p: ReturnType<typeof spawn>): Promise<{ code: number | null; signal: string | null; out: string; err: string }> {
	const [out, err] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()]);
	await p.exited;
	return { code: p.exitCode, signal: p.signalCode, out, err };
}

const lockOf = (id: string) => join(board.paths.locks, `${id}.lock`);
const holdLock = (id: string, holder: object) => writeFileSync(lockOf(id), JSON.stringify(holder));

describe("the numbering lock", () => {
	it("never gives two processes creating cards at once the same number (11)", async () => {
		const runs = await Promise.all(Array.from({ length: 8 }, () => finish(spawn("create", "10"))));
		for (const r of runs) expect(r).toMatchObject({ code: 0, err: "" });
		const ids = runs.flatMap((r) => r.out.trim().split("\n"));
		expect(ids.length).toBe(80);
		expect(new Set(ids).size).toBe(80);
		expect(JSON.parse(readFileSync(board.paths.ids, "utf8")).top).toBe(80);
	}, 60_000);
});

describe("the per-card lock", () => {
	it("serialises writers on one card, so no read-and-write is lost (12)", async () => {
		const { id } = createCard(board, { title: "counter" }).card;
		const runs = await Promise.all(Array.from({ length: 4 }, () => finish(spawn("bump", id, "25"))));
		for (const r of runs) expect(r).toMatchObject({ code: 0, err: "" });
		expect(readCard(board, id).card.count).toBe(100);
		expect(existsSync(lockOf(id))).toBe(false);
	}, 60_000);

	it("makes a writer that finds it held wait 5 seconds, then fail naming the card and the holder (13)", () => {
		const { id } = createCard(board, { title: "held" }).card;
		holdLock(id, { pid: process.pid, time: new Date().toISOString(), actor: "session-abc" });
		const start = Date.now();
		let message = "";
		try {
			updateCard(board, id, (f) => ({ ...f, body: "never\n" }));
		} catch (e) {
			message = (e as Error).message;
		}
		const waited = Date.now() - start;
		expect(WAIT_MS).toBe(5_000);
		expect(waited).toBeGreaterThanOrEqual(5_000);
		expect(waited).toBeLessThan(7_000);
		expect(message).toContain(`Card ${id}`);
		expect(message).toContain(`process ${process.pid}`);
		expect(message).toContain("session-abc");
		expect(readCard(board, id).body).toBe("");
	}, 15_000);

	it("is broken when its holder's process no longer runs, and the writer proceeds (14)", () => {
		const { id } = createCard(board, { title: "dead holder" }).card;
		const gone = Bun.spawnSync(["true"]).pid;
		holdLock(id, { pid: gone, time: new Date().toISOString() });
		const start = Date.now();
		updateCard(board, id, (f) => ({ ...f, body: "proceeded\n" }));
		expect(Date.now() - start).toBeLessThan(1_000);
		expect(readCard(board, id).body).toBe("proceeded\n");
		expect(existsSync(lockOf(id))).toBe(false);
	});

	it("is broken when older than 30 seconds, even with its holder running, and the writer proceeds (14)", () => {
		const { id } = createCard(board, { title: "old lock" }).card;
		expect(STALE_MS).toBe(30_000);
		holdLock(id, { pid: process.pid, time: new Date(Date.now() - 31_000).toISOString() });
		const start = Date.now();
		updateCard(board, id, (f) => ({ ...f, body: "proceeded\n" }));
		expect(Date.now() - start).toBeLessThan(1_000);
		expect(readCard(board, id).body).toBe("proceeded\n");
	});
});

describe("atomic writes", () => {
	it("never show a reader a partly written card while another process rewrites it (15)", async () => {
		const { id } = createCard(board, { title: "rewritten" }).card;
		const done = join(w.root, "rewrite-done");
		const writer = spawn("rewrite", id, "300", done);
		const seen = new Set<string>();
		let reads = 0;
		const deadline = Date.now() + 50_000;
		while (!existsSync(done) && Date.now() < deadline) {
			const { card, body } = parseCard(readFileSync(cardPath(board, id), "utf8"), id);
			expect(card.title).toBe("rewritten");
			expect(["", `${"a".repeat(400_000)}\n`, `${"b".repeat(900_000)}\n`]).toContain(body);
			seen.add(body.slice(0, 1));
			reads++;
		}
		expect(await finish(writer)).toMatchObject({ code: 0, err: "" });
		expect(reads).toBeGreaterThan(0);
		expect(seen.has("a") && seen.has("b")).toBe(true);
	}, 60_000);
});

describe("the card file is the source of truth", () => {
	it("is written before the event line, so a crash between them leaves the card changed and the log without it (16)", async () => {
		const { id } = createCard(board, { title: "moved" }).card;
		const r = await finish(spawn("crash", id));
		expect(r.signal).toBe("SIGKILL");
		expect(readCard(board, id).card.column).toBe("after");
		expect(readEvents(board.paths).filter((e) => e.card === id)).toEqual([]);
		// The dead writer's lock is left behind, and the next writer breaks it.
		expect(existsSync(lockOf(id))).toBe(true);
		updateCard(board, id, (f) => f);
		expect(existsSync(lockOf(id))).toBe(false);
	}, 30_000);
});
