// Compile the board binary with Bun.build, so that bun-plugin-tailwind runs.
// The `bun build --compile` CLI does not pick the plugin up from bunfig.toml,
// which leaves src/web/index.html's stylesheet bundled as an empty chunk.
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import tailwind from "bun-plugin-tailwind";

const outfile = process.env.BOARD_BUILD_OUTFILE ?? "bin/board";
const version = process.env.BOARD_BUILD_VERSION ?? "dev";
// A Bun compile target such as bun-linux-arm64 or bun-windows-x64, for the
// release workflow's cross-compiles. Unset builds for the machine running it.
const target = (process.env.BOARD_BUILD_TARGET || undefined) as Bun.Build.CompileTarget | undefined;

await mkdir(dirname(outfile), { recursive: true });

const result = await Bun.build({
	entrypoints: ["src/cli.ts"],
	target: "bun",
	minify: true,
	define: {
		__EMBEDDED_VERSION__: JSON.stringify(version),
		"process.env.NODE_ENV": JSON.stringify("production"),
	},
	plugins: [tailwind],
	compile: target ? { outfile, target } : { outfile },
	throw: false,
});

if (!result.success) {
	for (const log of result.logs) console.error(log);
	process.exit(1);
}
