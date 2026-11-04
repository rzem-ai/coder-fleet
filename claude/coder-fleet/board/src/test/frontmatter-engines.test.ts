import { afterEach, describe, expect, it } from "bun:test";
import { readCommittedItem } from "../git/operations.ts";
import { parseFrontmatter } from "../markdown/frontmatter.ts";

// gray-matter evaluates a `---js` or `---javascript` block as code. A card is
// data anyone with commit access can plant, so no read of one may run it.
const planted = (lang: string) =>
	`---${lang}\n{ id: (globalThis.__boardPwned = "${lang}", "CF-9"), title: "T" }\n---\nbody`;

const flag = () => (globalThis as { __boardPwned?: string }).__boardPwned;

afterEach(() => {
	delete (globalThis as { __boardPwned?: string }).__boardPwned;
});

describe("frontmatter engines", () => {
	for (const lang of ["js", "javascript"]) {
		it(`refuses ${lang} frontmatter without running it`, () => {
			expect(() => parseFrontmatter(planted(lang))).toThrow();
			expect(flag()).toBeUndefined();
		});

		it(`gives a commit no item from ${lang} frontmatter, and runs nothing`, () => {
			expect(readCommittedItem(planted(lang))).toBeNull();
			expect(flag()).toBeUndefined();
		});
	}

	it("still reads YAML, and JSON", () => {
		expect(parseFrontmatter("---\nid: CF-1\ntitle: A\n---\nx").data).toEqual({ id: "CF-1", title: "A" });
		expect(parseFrontmatter('---json\n{"id": "CF-2"}\n---\nx').data).toEqual({ id: "CF-2" });
	});
});
