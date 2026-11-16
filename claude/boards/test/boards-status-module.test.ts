import { describe, expect, it, mock } from "bun:test";
import { join } from "node:path";
import { binaryPath, HOOK_GRACE_MS, lockPath } from "../../coder-fleet/hooks/boards-state.ts";

// CF-27: the hooks module's own fetch, driven through session.start,
// classic.SessionStart, a load in a running session and a reload, with a
// fake `$`. `$.state` is a map kept across loads, as the host keeps it across
// a reload; each load is a fresh copy of the module, as a reload makes one.

type Value = unknown;
type Atom = { key: string; initial: Value };
type Fake = ReturnType<typeof engine>;

mock.module("claude-code", () => ({
	atom: (ref: { key: string }, initial: Value): Atom => ({ key: ref.key, initial }),
	read: async ($: Fake, a: Atom) => ($.state.has(a.key) ? $.state.get(a.key) : a.initial),
	update: async ($: Fake, a: Atom, fn: (v: Value) => Value) => {
		$.state.set(a.key, fn($.state.has(a.key) ? $.state.get(a.key) : a.initial));
	},
}));

const MODULE = join(import.meta.dir, "..", "..", "coder-fleet", "hooks", "boards-status.ts");
const VERSION = "9.9.4";
const ROOT = `/c/.claude/plugins/cache/rzem/coder-fleet/${VERSION}`;
const DATA = "/c/.claude/plugins/data/coder-fleet-rzem";
const BIN = binaryPath(DATA, VERSION);

type Child = { argv: readonly string[]; env: Record<string, string>; exit: (code: number | null) => void; kill: () => void };

// A child whose stream yields nothing and ends when the test says: an exit,
// or a stream closed early, as a module unloading closes it.
function child(argv: readonly string[], env: Record<string, string>, spawns: Child[]) {
	let settle: (r: { code: number | null; signal: string | null } | Error) => void = () => {};
	const done = new Promise<{ code: number | null; signal: string | null } | Error>((r) => {
		settle = r;
	});
	const result = done.then((r) => {
		if (r instanceof Error) throw r;
		return r;
	});
	result.catch(() => undefined);
	const stream = (async function* () {
		yield* [];
		return await result;
	})();
	spawns.push({ argv, env, exit: (code) => settle({ code, signal: code === null ? "SIGTERM" : null }), kill: () => settle(new Error("stream closed")) });
	return Object.assign(stream, { result });
}

// The engine one session's loads share: its files, clock, state and spawns.
function engine() {
	const files = new Map<string, { text: string; mtimeMs: number }>([[`${ROOT}/.claude-plugin/plugin.json`, { text: `{"version":"${VERSION}"}`, mtimeMs: 0 }]]);
	const state = new Map<string, Value>();
	const spawns: Child[] = [];
	const timers: Array<{ at: number; fn: () => void; every?: number }> = [];
	const clock = { now: 1_800_000_000_000 };
	const missing = () => Promise.reject(new Error("ENOENT"));
	return {
		files,
		state,
		spawns,
		timers,
		clock,
		plugin: { root: ROOT, name: "coder-fleet" },
		fs: {
			read: (p: string) => (files.has(p) ? Promise.resolve(files.get(p)?.text ?? "") : missing()),
			exists: (p: string) => Promise.resolve(files.has(p)),
			stat: (p: string) => (files.has(p) ? Promise.resolve({ mtimeMs: files.get(p)?.mtimeMs ?? 0 }) : missing()),
		},
		env: { get: (name: string) => Promise.resolve(name === "HOME" ? "/c" : undefined) },
		process: {
			run: () => Promise.resolve({ exitCode: 1, stdout: "", stderr: "", isStdoutTruncated: false, isStderrTruncated: false }),
			spawn: (r: { argv: readonly string[]; env?: Record<string, string> }) => child(r.argv, r.env ?? {}, spawns),
		},
		session: {
			usage: () => Promise.resolve({ startedAt: 0, context: { window: 1_000_000 } }),
			cwd: () => Promise.resolve("/w"),
			model: () => Promise.resolve("claude-opus-5-5"),
		},
		agent: { list: () => Promise.resolve([]) },
	};
}

// `$` for one load: the engine's, with a clock whose timers the test runs.
function dollar(e: Fake) {
	return {
		...e,
		clock: {
			now: () => Promise.resolve(e.clock.now),
			every: (ms: number, fn: () => void) => e.timers.push({ at: e.clock.now + ms, fn, every: ms }),
			after: (ms: number, fn: () => void) => e.timers.push({ at: e.clock.now + ms, fn }),
		},
	};
}

const settle = async () => {
	for (let i = 0; i < 20; i++) await Bun.sleep(0);
};

// Moves the clock on and runs every timer due, as the host would.
async function advance(e: Fake, ms: number) {
	e.clock.now += ms;
	for (const t of [...e.timers]) {
		if (t.at > e.clock.now) continue;
		t.fn();
		if (t.every) t.at = e.clock.now + t.every;
		else e.timers.splice(e.timers.indexOf(t), 1);
	}
	await settle();
}

type Hook = ($: unknown, ev: unknown, next: (ev: unknown) => Promise<unknown>) => Promise<unknown>;
// An element as the host's `h` makes it, the component by name.
type El = { type: string; props: Record<string, unknown>; children: Array<El | string> };
(globalThis as { h?: unknown }).h = (type: string, props: Record<string, unknown> | null, ...children: Array<El | string>): El => ({ type, props: props ?? {}, children });
const textOf = (n: El | string): string => (typeof n === "string" ? n : n.children.map(textOf).join(""));
const texts = (n: El | string): El[] => (typeof n === "string" ? [] : [...(n.type === "Text" ? [n] : []), ...n.children.flatMap(texts)]);
let loads = 0;

// A fresh copy of the module, its hooks registered.
async function load(e: Fake) {
	const mod = (await import(`${MODULE}?load=${++loads}`)) as { register: (on: unknown) => void };
	const hooks = new Map<string, Hook>();
	mod.register((event: string, a: unknown, b?: unknown) => {
		hooks.set(event, (typeof a === "function" ? a : b) as Hook);
		return { catch: () => undefined };
	});
	const $ = dollar(e);
	return {
		sessionStart: async () => {
			await hooks.get("session.start")?.($, { cwd: "/w" }, async () => ({ cwd: "/w" }));
			await settle();
		},
		// The PromptHint render in a terminal `columns` wide, Claude Code's own
		// hint standing in for what `next` draws.
		render: (columns: number) =>
			hooks.get("ui.render")?.(
				{ ...$, ui: { resolve: () => ({ Box: "Box", Text: "Text", Link: "Link", Button: "Button" }), toast: () => undefined } },
				{ surface: "terminal", viewport: { columns } },
				async () => "hint",
			) as Promise<El>,
		// The SessionStart command hooks run inside `next`, which the test holds.
		classicStart: (hook: () => Promise<void>) =>
			hooks.get("classic.SessionStart")?.($, {}, async () => {
				await hook();
				return {};
			}) as Promise<{ additionalContext?: string[] }>,
	};
}

const boot = (e: Fake) => e.state.get("lines-boot") as { kind: string; why?: string } | undefined;

describe("the hooks module's own fetch", () => {
	it("leaves a session's first start to its SessionStart hook, however long the hook takes, and never fetches beside it", async () => {
		const e = engine();
		const m = await load(e);
		await m.sessionStart();
		expect(e.spawns).toHaveLength(0);
		let finish: () => void = () => {};
		const held = new Promise<void>((r) => {
			finish = r;
		});
		const hook = m.classicStart(async () => {
			await held;
		});
		await settle();
		// Well past the grace and with no lock yet, the hook is still running.
		await advance(e, HOOK_GRACE_MS * 4);
		expect(e.spawns).toHaveLength(0);
		expect(boot(e)?.kind).toBe("downloading");
		// The hook's fetch installs the binary.
		e.files.set(BIN, { text: "", mtimeMs: e.clock.now });
		finish();
		const out = await hook;
		await advance(e, HOOK_GRACE_MS);
		expect(e.spawns).toHaveLength(0);
		expect(out.additionalContext?.at(-1)).toBe(`coder-fleet v${VERSION}: boards binary ready`);
	});

	it("waits out a hook's fetch that holds the lock after the hook returns, and starts none of its own", async () => {
		const e = engine();
		const m = await load(e);
		await m.sessionStart();
		await m.classicStart(async () => {
			e.files.set(lockPath(DATA), { text: "", mtimeMs: e.clock.now });
		});
		await advance(e, HOOK_GRACE_MS * 2);
		expect(e.spawns).toHaveLength(0);
	});

	it("fetches once the grace passes in a load with no SessionStart hook and no mark (an update from v0.76.0, an enable)", async () => {
		const e = engine();
		const m = await load(e);
		await m.sessionStart();
		expect(e.spawns).toHaveLength(0);
		await advance(e, HOOK_GRACE_MS + 200);
		expect(e.spawns).toHaveLength(1);
		expect(e.spawns[0]?.argv).toEqual(["/bin/bash", `${ROOT}/hooks/boards-binary.sh`]);
		expect(e.spawns[0]?.env).toEqual({ CLAUDE_PLUGIN_ROOT: ROOT, CLAUDE_PLUGIN_DATA: DATA });
		expect(boot(e)?.kind).toBe("downloading");
		e.files.set(BIN, { text: "", mtimeMs: e.clock.now });
		e.spawns[0]?.exit(0);
		await advance(e, 500);
		expect(boot(e)?.kind).toBe("ready");
		await advance(e, HOOK_GRACE_MS);
		expect(e.spawns).toHaveLength(1);
	});

	it("fetches at once in a later load of the session, and again after a reload killed its fetch", async () => {
		const e = engine();
		await (await load(e)).sessionStart();
		await advance(e, 1000);
		// /reload-plugins: a new load, no SessionStart hook.
		const second = await load(e);
		await second.sessionStart();
		expect(e.spawns).toHaveLength(1);
		// The next reload kills the child: no exit of its own, so no failure kept.
		e.spawns[0]?.kill();
		await settle();
		expect(e.state.get("lines-session")).toEqual({ loaded: true, fetch: { version: VERSION, exitCode: null } });
		await (await load(e)).sessionStart();
		expect(e.spawns).toHaveLength(2);
		expect(boot(e)?.kind).toBe("downloading");
		// A signal's end is no result either.
		e.spawns[1]?.exit(null);
		await settle();
		expect((e.state.get("lines-session") as { fetch: unknown }).fetch).toEqual({ version: VERSION, exitCode: null });
	});

	it("says no binary fetched when its own fetch exits cleanly and leaves nothing, and fetch failed for a non-zero exit, once per version", async () => {
		for (const [code, why] of [
			[0, "no binary fetched"],
			[1, "fetch failed"],
		] as const) {
			const e = engine();
			e.state.set("lines-session", { loaded: true, fetch: null });
			const m = await load(e);
			await m.sessionStart();
			expect(e.spawns).toHaveLength(1);
			e.spawns[0]?.exit(code);
			await advance(e, 500);
			expect(boot(e)).toEqual({ kind: "unavailable", version: VERSION, why });
			await advance(e, HOOK_GRACE_MS * 2);
			expect(e.spawns).toHaveLength(1);
		}
	});
});

// CF-31: line 2 under the prompt ends where its text ends, so the row's
// space-between puts the button at its right end. Spaces padded out to the
// viewport's width overran the row, which Claude Code draws narrower, and it
// cut the row with an ellipsis before the button.
describe("the lines under the prompt", () => {
	it("draws row 2 as line 2's segments and the board button, with no padding", async () => {
		const e = engine();
		e.state.set("lines-board", { board: true, next: null, blockedByHuman: 0, web: null, focus: null });
		const m = await load(e);
		const out = await m.render(200);
		const row2 = out.children[2] as El;
		expect(row2.type).toBe("Box");
		expect(row2.props.justifyContent).toBe("space-between");
		expect(row2.children).toHaveLength(2);
		const [line2, button] = row2.children as [El, El];
		expect(button.type).toBe("Button");
		expect(textOf(button)).toBe("board ↗");
		expect(line2.children.length).toBeGreaterThan(0);
		for (const seg of line2.children) expect(textOf(seg).trim()).not.toBe("");
		expect(texts(row2).filter((t) => textOf(t) !== "" && textOf(t).trim() === "")).toEqual([]);
		expect(textOf(line2)).toBe("· no agents working  ·  blocked by human 0");
	});
});
