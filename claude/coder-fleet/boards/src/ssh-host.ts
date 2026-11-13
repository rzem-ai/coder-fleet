import type { Env } from "./paths.ts";

// How long `ssh -G` may take before the host is kept as written. It reads
// config files and never connects, so this is generous.
export const SSH_TIMEOUT_MS = 2000;

// The real host behind an ssh alias, from the hostname line of `ssh -G
// <host>`, which applies ~/.ssh/config without connecting. Null when ssh is
// not on the PATH, fails, times out or prints no hostname: the caller then
// keeps the host as written.
export function sshHostname(host: string, env: Env = process.env): string | null {
	// A host starting with a dash would be read as an option.
	if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(host)) return null;
	const ssh = Bun.which("ssh", { PATH: env.PATH ?? "" });
	if (!ssh) return null;
	try {
		const p = Bun.spawnSync([ssh, "-G", host], {
			env: env as Record<string, string>,
			stdin: "ignore",
			stdout: "pipe",
			stderr: "ignore",
			timeout: SSH_TIMEOUT_MS,
		});
		if (p.exitCode !== 0) return null;
		const line = p.stdout
			.toString()
			.split("\n")
			.find((l) => /^hostname\s/i.test(l));
		const name = line?.replace(/^hostname\s+/i, "").trim();
		return name ? name.toLowerCase() : null;
	} catch {
		return null;
	}
}
