import { afterAll, describe, expect, it } from "bun:test";
import { mkdirSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { createBoard } from "../src/board.ts";
import type { Env } from "../src/paths.ts";
import { resolveBoard } from "../src/resolve.ts";
import { SSH_TIMEOUT_MS, sshHostname } from "../src/ssh-host.ts";
import { World } from "./fixtures.ts";

// Criterion 4, through ssh host aliases: a remote written with an alias from
// ~/.ssh/config reaches the same board as the real host's HTTPS URL. The
// fixture's stub ssh stands in for `ssh -G`.
const w = new World("ssh-alias");
afterAll(() => w.dispose());
const aliased: Env = { ...w.env, STUB_SSH_ALIASES: "github-work=github.com,gh2=GitHub.com" };
const keyOf = (cwd: string, env: Env = aliased) => resolveBoard(cwd, env)?.key.value;

describe("an ssh host alias", () => {
	const https = w.repo("real-https", "https://github.com/owner/aliased");
	const board = createBoard(https, "AL", w.env);

	it("reaches the board of the host it stands for, scp-like or ssh://", () => {
		for (const [name, origin] of [
			["alias-scp", "git@github-work:owner/aliased.git"],
			["alias-url", "ssh://git@gh2/owner/aliased"],
		] as const) {
			const repo = w.repo(name, origin);
			expect(keyOf(repo)).toBe("github.com/owner/aliased");
			expect(resolveBoard(repo, aliased)?.found?.paths.dir).toBe(board.paths.dir);
		}
	});

	it("leaves a host that is no alias as written", () => {
		expect(keyOf(w.repo("plain", "git@gitlab.example:o/r.git"))).toBe("gitlab.example/o/r");
	});

	it("never sends an https host through ssh", () => {
		expect(keyOf(w.repo("https-alias", "https://github-work/owner/aliased"))).toBe("github-work/owner/aliased");
	});
});

describe("when ssh cannot say", () => {
	const repo = w.repo("kept", "git@github-work:owner/kept.git");

	it("keeps the host as written when ssh is not on the PATH", () => {
		const bin = join(w.root, "git-only");
		mkdirSync(bin);
		const git = Bun.which("git", { PATH: process.env.PATH ?? "" });
		symlinkSync(git ?? "/usr/bin/git", join(bin, "git"));
		expect(sshHostname("github-work", { ...aliased, PATH: bin })).toBeNull();
		expect(keyOf(repo, { ...aliased, PATH: bin })).toBe("github-work/owner/kept");
	});

	it("keeps the host as written when ssh fails", () => {
		expect(keyOf(repo, { ...aliased, STUB_SSH_MODE: "fail" })).toBe("github-work/owner/kept");
	});

	it("keeps the host as written when ssh takes too long, within a bounded wait", () => {
		const start = Date.now();
		expect(sshHostname("github-work", { ...aliased, STUB_SSH_MODE: "slow" })).toBeNull();
		expect(Date.now() - start).toBeLessThan(SSH_TIMEOUT_MS + 3000);
	});

	it("refuses a host that could be read as an ssh option", () => {
		for (const h of ["-oProxyCommand=x", "-v", "a b"]) expect(sshHostname(h, aliased)).toBeNull();
	});
});
