import { isAbsolute, resolve } from "node:path";

// A board's key: which repo it belongs to, recorded in its config.yml. The
// board's directory is named by its prefix, not by its key. A repo with an
// origin remote is keyed by that remote's URL, normalised so every spelling
// git accepts for the same repository (scp-like SSH, ssh://, https://,
// http://, git://, with or without a user, a port, a trailing slash or .git)
// gives the same key. The host is kept as written: an ssh alias is not
// resolved, so a clone made through one has its own key. A repo without an
// origin is keyed by the absolute path of its shared git directory.
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

// Returns the normalised remote, or null for an empty one. A local path or a
// file:// remote keeps its absolute path, resolved against `base` when it is
// relative, under a file: prefix so it never meets a host's key.
export function normaliseRemote(url: string, base = process.cwd()): string | null {
	const u = url.trim();
	if (!u) return null;
	if (/^file:\/\//i.test(u)) return `file:${cleanLocal(decodeURIComponent(u.replace(/^file:\/\/[^/]*/i, "")))}`;
	const scheme = SCHEME_URL.exec(u);
	if (scheme) {
		const [, , host = "", path = ""] = scheme;
		return `${host.toLowerCase()}/${cleanRepoPath(path)}`;
	}
	const scp = SCP_LIKE.exec(u);
	if (scp && !isAbsolute(u)) {
		const [, host = "", path = ""] = scp;
		return `${host.toLowerCase()}/${cleanRepoPath(path)}`;
	}
	return `file:${cleanLocal(isAbsolute(u) ? u : resolve(base, u))}`;
}

function cleanLocal(p: string): string {
	return p.replace(/\/+$/, "").replace(/\/\.git$/, "") || "/";
}

export function makeKey(kind: KeyKind, value: string): BoardKey {
	return { kind, value };
}
