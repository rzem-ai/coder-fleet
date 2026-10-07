// Git identity is runner configuration, not part of individual test behavior.
// Keeping it here avoids two subprocesses for every temporary repository.
process.env.GIT_AUTHOR_NAME = "Test User";
process.env.GIT_AUTHOR_EMAIL = "test@example.com";
process.env.GIT_COMMITTER_NAME = "Test User";
process.env.GIT_COMMITTER_EMAIL = "test@example.com";

// Every board write whose commit is skipped or fails appends a line to the
// hooks log (src/git/board-log.ts), and most test boards have auto_commit off.
// Without this the suite would write thousands of lines into the human's own
// ~/.local/state/coder-fleet/log/hooks.log. Child processes inherit it.
{
	const { mkdtempSync } = await import("node:fs");
	const { tmpdir } = await import("node:os");
	const { join } = await import("node:path");
	process.env.BOARD_LOG_FILE = join(mkdtempSync(join(tmpdir(), "board-test-log-")), "hooks.log");
}

// The react-dom/jsdom preload is skipped for CI passes whose test files never
// touch the DOM. Importing jsdom re-runs per isolated realm and its
// jsdom -> undici -> node:assert chain constructs process.stderr, which inside
// `bun test --parallel` workers on Linux can die with an uncatchable
// "EEXIST: file already exists, epoll_ctl" that fails whole unrelated test
// files (BACK-585). scripts/run-ci-tests.ts sets the variable for those passes.
if (!process.env.BACKLOG_TEST_SKIP_DOM_PRELOAD) {
	await import("./react-dom-preload.ts");
}
