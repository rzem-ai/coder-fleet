import { isAbsolute, resolve } from "node:path";

// A board's key: which repo it belongs to, recorded in its config.yml. The
// board's directory is named by its prefix, not by its key. A repo with an
// origin remote is keyed by that remote's URL, normalised so every spelling
// git accepts for the same repository (scp-like SSH, ssh://, https://,
// http://, git://, with or without a user, a port, a trailing slash or .git,
// through an ssh host alias or not) gives the same key. A repo
// without one is keyed by the absolute path of its shared git directory.
export type KeyKind = "url" | "path";

export interface BoardKey {
	kind: KeyKind;
	value: string; // github.com/owner/repo, or /abs/path/.git
}

const SCHEME_URL = /^([a-z][a-z0-9+.-]*):\/\/(?:[^@/]*@)?(\[[^\]]+\]|[^/:?#]+)(?::\d*)?(\/[^?#]*)?/i;
// git's own rule: user@host:path is scp-like only when no slash comes before
// the first colon, so /a/b:c stays a local path.
const SCP_LIKE = /^(?:[^@/]+@)?([^/:]+):(.+)$/;

function cleanRepoPath(p: string): string {
	let out = p.replace(/\/{2,}/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
	out = out.replace(/\.git$/, "").replace(/\/+$/, "");
	return out;
}

// Maps an ssh host as written to the host it really reaches (an alias from
// ~/.ssh/config to its HostName), or null to keep it as written.
export type SshHostMap = (host: string) => string | null;

const SSH_SCHEMES = new Set(["ssh", "git+ssh", "ssh+git"]);

// Returns the normalised remote, or null for an empty one. The host of an
// ssh remote (scp-like or ssh://) goes through `sshHost` first, so an alias
// such as github-work reaches the same key as https://github.com. A local
// path or a file:// remote keeps its absolute path, resolved against `base`
// when it is relative, under a file: prefix so it never meets a host's key.
export function normaliseRemote(url: string, base = process.cwd(), sshHost?: SshHostMap): string | null {
	const u = url.trim();
	if (!u) return null;
	const viaSsh = (host: string) => (sshHost?.(host) ?? host).toLowerCase();
	if (/^file:\/\//i.test(u)) return `file:${cleanLocal(decodeURIComponent(u.replace(/^file:\/\/[^/]*/i, "")))}`;
	const scheme = SCHEME_URL.exec(u);
	if (scheme) {
		const [, proto = "", host = "", path = ""] = scheme;
		const h = SSH_SCHEMES.has(proto.toLowerCase()) ? viaSsh(host) : host.toLowerCase();
		return `${h}/${cleanRepoPath(path)}`;
	}
	const scp = SCP_LIKE.exec(u);
	if (scp && !isAbsolute(u)) {
		const [, host = "", path = ""] = scp;
		return `${viaSsh(host)}/${cleanRepoPath(path)}`;
	}
	return `file:${cleanLocal(isAbsolute(u) ? u : resolve(base, u))}`;
}

function cleanLocal(p: string): string {
	return p.replace(/\/+$/, "").replace(/\/\.git$/, "") || "/";
}

export function makeKey(kind: KeyKind, value: string): BoardKey {
	return { kind, value };
}
