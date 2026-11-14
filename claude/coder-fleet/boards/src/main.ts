// The compiled `boards` binary's entry point, and nothing else's: from source
// the CLI starts at cli.ts. `boards:page` exists only inside the build
// (scripts/build.ts makes it from web/dist), mapping each file of the built
// page to where the binary holds it, so the web UI serves the page the binary
// carries.
// @ts-expect-error: a module scripts/build.ts makes at build time.
import page from "boards:page";
import { runCli } from "./cli.ts";
import { usePage } from "./web.ts";

usePage(page as Record<string, string>);
await runCli(process.argv.slice(2));
