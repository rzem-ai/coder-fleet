// The compiled `boards` binary's entry point, and the one the plugin's fleet
// shims run from source (boards.sh). `boards fleet ...` goes straight to the
// fleet's tools, loading nothing of the board, so a hook's call stays cheap
// and needs none of the board's packages. Everything else is the board's CLI,
// which from source starts at cli.ts instead: `boards:page` exists only
// inside the build (scripts/build.ts makes it from web/dist), mapping each
// file of the built page to where the binary holds it, so the web UI serves
// the page the binary carries.
//
// boards.sh runs Bun from this package's directory, so no bunfig.toml or .env
// in the caller's repository is loaded, and names the caller's directory here.
const callerCwd = process.env.BOARDS_CALLER_CWD;
if (callerCwd) {
	delete process.env.BOARDS_CALLER_CWD;
	process.chdir(callerCwd);
}
const args = process.argv.slice(2);
if (args[0] === "fleet") {
	const { runFleet } = await import("./fleet/cli.ts");
	process.exit(await runFleet(args.slice(1)));
}
// @ts-expect-error: a module scripts/build.ts makes at build time.
const { default: page } = await import("boards:page");
const { runCli } = await import("./cli.ts");
const { usePage } = await import("./web.ts");
usePage(page as Record<string, string>);
await runCli(args);
