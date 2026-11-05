import matter from "gray-matter";

/**
 * The only place in the codebase that talks to gray-matter.
 *
 * gray-matter keeps a module-level cache of parse results keyed by the input string and hands the
 * same `data` object back to every later caller, so one caller mutating its result silently changes
 * what the next parse of identical content returns, and a malformed file only throws on its first
 * parse. Passing an options object skips the cache entirely (gray-matter 4.x only reads and writes
 * the cache when `options` is falsy), so every call here passes one.
 */
export function parseFrontmatter(content: string): { data: Record<string, unknown>; content: string } {
	const file = matter(content, { engines: refusedEngines() });
	return { data: file.data, content: file.content };
}

/**
 * gray-matter evaluates a `---js` or `---javascript` block as code and would
 * run a `---coffee` one, and a card is data anyone who can commit to the
 * repository can plant, so those engines throw instead: such a file fails to
 * parse, as any malformed card does. YAML and JSON are left as they are. A
 * fresh object per call, since gray-matter is handed it to keep.
 */
function refusedEngines(): Record<string, (input: string) => never> {
	const refuse = (): never => {
		throw new Error("frontmatter that is code is refused; write it as YAML");
	};
	return { js: refuse, javascript: refuse, coffee: refuse, coffeescript: refuse, cson: refuse };
}

/** Serialize `data` as frontmatter above `content`. */
export function stringifyFrontmatter(content: string, data: Record<string, unknown>): string {
	return matter.stringify(content, data, {});
}
