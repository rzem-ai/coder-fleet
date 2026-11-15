// What a fleet hook may hand to git before it talks to a remote, ported from
// hooks/lib/remote-guard.sh, now a shim onto `boards fleet remote-guard`:
// the repository-config keys known to run no command, which URLs are reached,
// and how git's own words are cut down before they are logged. The fast-forward
// hook (fast-forward.ts) uses it before it fetches.
import { lstatSync, readdirSync, readFileSync, statSync } from "node:fs";

// Anything that reaches the log has the userinfo cut out of every URL in it.
export function redact(s: string): string {
	return [
		...s
			.replace(/[\r\n\t]/g, " ")
			.replace(/(:\/\/)[^/ ]*@/g, "$1***@")
			.replace(/ {2,}/g, " ")
			.replace(/^ /, "")
			.replace(/ $/, ""),
	]
		.slice(0, 500)
		.join("");
}

// .git/config is shared by every worktree, so an agent session can write to
// it, and these hooks run outside every agent's sandbox and scope hook. A key
// there that names a command would run at the next session start or board
// commit, so the repository's own config may hold only the keys below, which
// run nothing; any other key and the hook fetches, pushes and moves nothing.
// The human's global and system config is trusted as it is.
const ALLOWED = [
	"core.repositoryformatversion",
	"core.bare",
	"core.filemode",
	"core.logallrefupdates",
	"core.ignorecase",
	"core.precomposeunicode",
	"core.symlinks",
	"core.autocrlf",
	"core.eol",
	"core.sparsecheckout",
	"core.sparsecheckoutcone",
	"index.sparse",
	// husky writes core.hooksPath, and every call overrides it with
	// /dev/null; git lfs install writes lfs.repositoryformatversion, while
	// its filter.lfs.* keys run a command and stay refused.
	"core.hookspath",
	"lfs.repositoryformatversion",
	// gh writes these; neither is read by a fetch or a merge, and the one
	// push names its remote and refspec, so git never consults pushremote.
	"remote.*.gh-resolved",
	"branch.*.pushremote",
	"extensions.worktreeconfig",
	"extensions.objectformat",
	"extensions.refstorage",
	"extensions.relativeworktrees",
	"remote.*.url",
	"remote.*.fetch",
	"remote.*.pushurl",
	"remote.*.prune",
	"remote.*.tagopt",
	"remote.*.mirror",
	"branch.*.remote",
	"branch.*.merge",
	"branch.*.rebase",
	"branch.*.description",
	"branch.*.vscode-merge-base",
	"pull.rebase",
	"pull.ff",
	"push.default",
	"merge.ff",
	"merge.autostash",
	"user.name",
	"user.email",
	"init.defaultbranch",
	"gc.auto",
	"maintenance.auto",
	"rerere.enabled",
	"worktree.guessremote",
	"submodule.*.url",
	"submodule.*.active",
].map((g) => new RegExp(`^${g.replace(/\./g, "\\.").replace(/\*/g, "[\\s\\S]*")}$`));

export function allowedKey(key: string): boolean {
	// A remote section must be named like a remote: git takes a URL it is
	// given as a remote name first, so a section named for a URL redirects a
	// fetch or push that names that URL. Only letters, digits, '.', '_' and '-'.
	if (/^remote\.[\s\S]*\.[\s\S]*$/.test(key)) {
		const sub = key.slice("remote.".length).replace(/\.[^.]*$/, "");
		if (!/^[A-Za-z0-9._-]+$/.test(sub)) return false;
	}
	return ALLOWED.some((re) => re.test(key));
}

// True when the common git dir's remotes/ or branches/ holds anything: git
// resolves a remote name from a file there, which no config check sees.
export function legacyRemoteFiles(common: string): boolean {
	for (const d of [`${common}/remotes`, `${common}/branches`]) {
		let st: ReturnType<typeof lstatSync>;
		try {
			st = lstatSync(d);
		} catch {
			continue;
		}
		if (st.isSymbolicLink()) return true;
		let isDir = false;
		try {
			isDir = statSync(d).isDirectory();
		} catch {}
		if (isDir) {
			try {
				if (readdirSync(d).length) return true;
			} catch {}
		} else return true;
	}
	return false;
}

// ok, helper, path or unknown. A control character makes it unknown before
// anything else is read, and the scp-like form is matched against the whole
// string, never line by line.
const SCP_LIKE = /^([A-Za-z0-9._~+-]+@)?[A-Za-z0-9._-]+:[^/]/;

export function urlKind(url: string): string {
	if (/[\x00-\x1f\x7f]/.test(url)) return "unknown";
	if (/^(https|ssh|git|git\+ssh|ssh\+git):\/\//.test(url)) return "ok";
	if (url.includes("::")) return "helper";
	if (/^(\/|\.\/|\.\.\/|file:|~)/.test(url)) return "path";
	if (url.includes("://")) return "unknown";
	return SCP_LIKE.test(url) ? "ok" : "unknown";
}

const USAGE = "usage: boards fleet remote-guard allowed-key <key> | allowed-keys < NUL-separated keys | legacy-remote-files <common git dir> | url-kind <url> | redact <text>";

export function remoteGuardCommand(args: string[]): number {
	const [op, arg = ""] = args;
	switch (op) {
		// Each answer is printed as a word, so a crash, which exits non-zero
		// with nothing printed, is never read as the permissive one.
		case "allowed-key":
			process.stdout.write(allowedKey(arg) ? "allowed" : "refused");
			return 0;
		// Every NUL-separated key on stdin, judged in one call: a hook asks
		// about each key of the repository's config before it acts, and one
		// process per key was the bulk of its time. Each key is printed back as
		// "allowed\0<key>\0" or "refused\0<key>\0", then "end\0", so a reader
		// that never sees the end knows the answer was cut short.
		case "allowed-keys": {
			const keys = readFileSync(0, "latin1").split("\0").filter((k) => k !== "");
			process.stdout.write(`${keys.map((k) => `${allowedKey(k) ? "allowed" : "refused"}\0${k}\0`).join("")}end\0`);
			return 0;
		}
		case "legacy-remote-files":
			process.stdout.write(legacyRemoteFiles(arg) ? "present" : "absent");
			return 0;
		case "url-kind":
			process.stdout.write(urlKind(arg));
			return 0;
		case "redact":
			process.stdout.write(redact(arg));
			return 0;
		default:
			process.stderr.write(`${USAGE}\n`);
			return 2;
	}
}
