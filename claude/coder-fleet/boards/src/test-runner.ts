// A release's background test run, the CLI's hidden `test-runner` subcommand,
// started detached by the test gate (src/releases.ts) with the board's
// directory and the release's id. It outlives the hook and the session that
// started it, and writes its result to the event trail and its output to the
// board's test-runs/<id>.log.
import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { runRelease } from "./releases.ts";

export async function testRunner(args: string[]): Promise<number> {
	const [boardDir, release] = args;
	try {
		if (!boardDir || !release) throw new Error("usage: test-runner <board directory> <release id>");
		await runRelease(boardDir, release);
		return 0;
	} catch (e) {
		// Nobody reads this process's stderr, so the failure goes in the run's log;
		// with no result recorded, the next session start starts the run again.
		if (boardDir && release) appendFileSync(join(boardDir, "test-runs", `${release}.log`), `\nThe run stopped: ${(e as Error).message}\n`);
		return 1;
	}
}
