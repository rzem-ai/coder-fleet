import { accessSync, constants } from "node:fs";
import { BOARD_ROOT_ENV } from "../board-root.ts";
import type { PortBinding } from "../server/port.ts";

/**
 * The web UI served by the board binary, for a session whose board server runs
 * from source without its packages.
 *
 * board.sh runs `bun src/cli.ts` when the release build for this plugin version
 * is not on the machine yet, which on the first session after an update means
 * the SessionStart hook is still fetching it. That server answers every task
 * tool, but it cannot bundle the page. board.sh exports where the release build
 * will land as BOARD_BINARY_ENV, so when board_serve finds the page broken and
 * the binary has arrived since, the binary serves the UI instead, as a child of
 * this process: started and stopped through the same tools, and gone with the
 * session, because it exits once its parent is no longer the one named in
 * BOARD_PARENT_PID_ENV.
 */

/** Set by board.sh when it falls back to source: the path the release build for this version is fetched to, without `.exe`. */
export const BOARD_BINARY_ENV = "CODER_FLEET_BOARD_BINARY";
/** Set on a handed-over `board serve`: the pid it serves for. It reports one JSON line and exits when that parent goes. */
export const BOARD_PARENT_PID_ENV = "CODER_FLEET_BOARD_PARENT_PID";

/** How long the binary has to report where it serves. */
const START_TIMEOUT_MS = 30_000;

/** What a handed-over `board serve` prints as its one line on stdout. */
export type ServeReport = { url: string; host: string; port: number; portBinding: PortBinding | null };

/** The release build for this version when it is on the machine and executable, else null. */
export function arrivedBoardBinary(env: NodeJS.ProcessEnv = process.env): string | null {
	const base = env[BOARD_BINARY_ENV]?.trim();
	if (!base) return null;
	for (const candidate of [base, `${base}.exe`]) {
		try {
			accessSync(candidate, constants.X_OK);
			return candidate;
		} catch {}
	}
	return null;
}

export class BinaryWebUi {
	private constructor(
		private readonly proc: Bun.Subprocess<"ignore", "pipe", "ignore">,
		private readonly report: ServeReport,
	) {}

	get url(): string | null {
		return this.proc.exitCode === null && this.proc.signalCode === null ? this.report.url : null;
	}

	get host(): string {
		return this.report.host;
	}

	get port(): number {
		return this.report.port;
	}

	get portBinding(): PortBinding | null {
		return this.report.portBinding;
	}

	/**
	 * Run `<binary> serve` for the board at `root` and wait for its report.
	 * Throws, with nothing left running, when it exits or stays silent first.
	 */
	static async start(binary: string, root: string): Promise<BinaryWebUi> {
		const proc = Bun.spawn([binary, "serve"], {
			cwd: root,
			env: { ...process.env, [BOARD_ROOT_ENV]: root, [BOARD_PARENT_PID_ENV]: String(process.pid) },
			stdin: "ignore",
			stdout: "pipe",
			stderr: "ignore",
		});
		const reader = proc.stdout.getReader();
		const decoder = new TextDecoder();
		let buffered = "";
		let timer: ReturnType<typeof setTimeout> | undefined;
		const firstLine = (async (): Promise<string | null> => {
			for (;;) {
				const newline = buffered.indexOf("\n");
				if (newline >= 0) return buffered.slice(0, newline);
				const { value, done } = await reader.read();
				if (done) return null;
				buffered += decoder.decode(value, { stream: true });
			}
		})();
		const line = await Promise.race([
			firstLine,
			new Promise<null>((resolve) => {
				timer = setTimeout(() => resolve(null), START_TIMEOUT_MS);
			}),
		]);
		clearTimeout(timer);
		let report: ServeReport | null = null;
		try {
			report = line ? (JSON.parse(line) as ServeReport) : null;
		} catch {}
		if (!report || typeof report.url !== "string") {
			proc.kill();
			await proc.exited;
			throw new Error(
				`the board binary at ${binary} did not start the web UI (${proc.exitCode !== null ? `it exited ${proc.exitCode}` : "no report"})`,
			);
		}
		// Keep reading, so nothing it prints later can fill the pipe and block it.
		void (async () => {
			try {
				while (!(await reader.read()).done) {}
			} catch {}
		})();
		return new BinaryWebUi(proc, report);
	}

	async stop(): Promise<void> {
		if (this.proc.exitCode !== null || this.proc.signalCode !== null) return;
		this.proc.kill();
		await Promise.race([this.proc.exited, new Promise((resolve) => setTimeout(resolve, 3000))]);
		if (this.proc.exitCode === null && this.proc.signalCode === null) this.proc.kill("SIGKILL");
	}
}
