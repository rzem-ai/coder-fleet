// Builds the compiled `boards` binary: one file carrying the CLI, the MCP
// tools, the test gate's runner, the web server and the built web page.
//
//   bun scripts/build.ts [<out dir>] [<platform>... | all]
//
// It installs this package's and web/'s locked packages, builds the page into
// web/dist, then compiles src/main.ts once per platform into
// <out dir>/boards-<platform> (default out dir bin/, default platform this
// machine's). The platforms are darwin-arm64, darwin-x64, linux-x64 and
// linux-arm64; any of them is cross-compiled from any machine, with Bun
// fetching that platform's runtime the first time.
import { readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = join(import.meta.dir, "..");

export const PLATFORMS = ["darwin-arm64", "darwin-x64", "linux-x64", "linux-arm64"] as const;
export type Platform = (typeof PLATFORMS)[number];

export function hostPlatform(): Platform {
	const p = `${process.platform}-${process.arch}`;
	if (!(PLATFORMS as readonly string[]).includes(p)) throw new Error(`No boards build for ${p}: the builds are ${PLATFORMS.join(", ")}`);
	return p as Platform;
}

function files(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const p = join(dir, name);
		return statSync(p).isDirectory() ? files(p) : [p];
	});
}

// The `boards:page` module src/main.ts imports: each file under `dist`, by
// its path from the page's root, embedded in the binary as a file.
function pageModule(dist: string): string {
	const all = files(dist);
	if (!all.some((f) => relative(dist, f) === "index.html")) throw new Error(`${dist} holds no index.html; build the page first`);
	const imports = all.map((f, i) => `import f${i} from ${JSON.stringify(f)} with { type: "file" };`);
	const entries = all.map((f, i) => `${JSON.stringify(`/${relative(dist, f).split("\\").join("/")}`)}: f${i}`);
	return `${imports.join("\n")}\nexport default { ${entries.join(", ")} };\n`;
}

// Compiles the binary for `platform` to `outfile`, carrying the page built in
// `dist`.
export async function compile(outfile: string, dist: string, platform: Platform = hostPlatform()): Promise<void> {
	const page = pageModule(resolve(dist));
	const result = await Bun.build({
		entrypoints: [join(ROOT, "src", "main.ts")],
		target: "bun",
		minify: true,
		// This machine's build is the running Bun itself, so it needs no fetch.
		compile: platform === `${process.platform}-${process.arch}` ? { outfile } : { outfile, target: `bun-${platform}` as Bun.Build.CompileTarget },
		plugins: [
			{
				name: "boards-page",
				setup(build) {
					build.onResolve({ filter: /^boards:page$/ }, () => ({ path: "page", namespace: "boards-page" }));
					build.onLoad({ filter: /.*/, namespace: "boards-page" }, () => ({ contents: page, loader: "ts" }));
				},
			},
		],
		throw: false,
	});
	if (!result.success) throw new Error(`The build for ${platform} failed:\n${result.logs.map(String).join("\n")}`);
}

function run(cwd: string, cmd: string[]): void {
	const p = Bun.spawnSync(cmd, { cwd, stdout: "inherit", stderr: "inherit" });
	if (p.exitCode !== 0) throw new Error(`\`${cmd.join(" ")}\` in ${cwd} failed`);
}

if (import.meta.main) {
	const [outArg, ...names] = process.argv.slice(2);
	const out = resolve(outArg ?? join(ROOT, "bin"));
	const wanted = names.includes("all") ? [...PLATFORMS] : names.length ? names : [hostPlatform()];
	const unknown = wanted.filter((n) => !(PLATFORMS as readonly string[]).includes(n));
	if (unknown.length) throw new Error(`Not a platform: ${unknown.join(", ")}. Use ${PLATFORMS.join(", ")} or all`);
	const platforms = wanted as Platform[];
	run(ROOT, ["bun", "install", "--frozen-lockfile"]);
	const web = join(ROOT, "web");
	run(web, ["bun", "install", "--frozen-lockfile"]);
	run(web, ["bun", "run", "build"]);
	for (const platform of platforms) {
		const outfile = join(out, `boards-${platform}`);
		await compile(outfile, join(web, "dist"), platform);
		console.log(`built ${outfile}`);
	}
}
