import { describe, expect, it } from "bun:test";
import { parseTask } from "../markdown/parser.ts";
import { serializeTask } from "../markdown/serializer.ts";
import type { AcceptanceCriterion, Task } from "../types/index.ts";

// CF-25: the Actions for Human section is a marked checklist at the very top of the task body.
// These tests reach it only through parseTask and serializeTask, so they pin the file format:
// where the section sits, that it survives a round trip byte for byte, and that other checklists
// and a stray heading never read as actions.

type WithActions = Task & { actionsForHumanItems?: AcceptanceCriterion[] };

const actionsOf = (task: Task): AcceptanceCriterion[] => (task as WithActions).actionsForHumanItems ?? [];

const withActions = (task: Task, items: AcceptanceCriterion[]): Task =>
	({ ...task, actionsForHumanItems: items }) as WithActions;

const TWO_ACTIONS: AcceptanceCriterion[] = [
	{ index: 1, text: "Which key should the refresh use?", checked: false },
	{ index: 2, text: "[not a question] Pick the session lifetime", checked: true },
];

/** A file in the shape the binary writes, with every section present, the actions first. */
const CANONICAL = [
	"---",
	"id: BD-1",
	"title: Blocked card",
	"status: Blocked by human",
	"assignee: []",
	"created_date: '2026-09-27 10:00'",
	"labels: []",
	"dependencies: []",
	"---",
	"",
	"## Actions for Human",
	"<!-- ACTIONS:BEGIN -->",
	"- [ ] #1 Which key should the refresh use?",
	"- [x] #2 [not a question] Pick the session lifetime",
	"<!-- ACTIONS:END -->",
	"",
	"## Description",
	"",
	"<!-- SECTION:DESCRIPTION:BEGIN -->",
	"Body text",
	"<!-- SECTION:DESCRIPTION:END -->",
	"",
	"## Acceptance Criteria",
	"<!-- AC:BEGIN -->",
	"- [ ] #1 First criterion",
	"<!-- AC:END -->",
	"",
	"## Definition of Done",
	"<!-- DOD:BEGIN -->",
	"- [x] #1 Tests pass",
	"<!-- DOD:END -->",
	"",
	"## Comments",
	"",
	"<!-- COMMENTS:BEGIN -->",
	"author: @lead",
	"created: 2026-09-27 10:05",
	"---",
	"A comment",
	"---",
	"<!-- COMMENTS:END -->",
	"",
].join("\n");

function baseTask(overrides: Partial<Task> = {}): Task {
	return {
		id: "BD-1",
		title: "Blocked card",
		status: "Blocked by human",
		assignee: [],
		createdDate: "2026-09-27 10:00",
		labels: [],
		dependencies: [],
		rawContent: "",
		description: "Body text",
		acceptanceCriteriaItems: [{ index: 1, text: "First criterion", checked: false }],
		definitionOfDoneItems: [{ index: 1, text: "Tests pass", checked: true }],
		implementationPlan: "The plan",
		implementationNotes: "The notes",
		comments: [{ index: 1, body: "A comment", createdDate: "2026-09-27 10:05", author: "@lead" }],
		finalSummary: "The summary",
		...overrides,
	};
}

/** The body after the frontmatter's closing rule. */
function bodyOf(file: string): string {
	return file.replace(/^---\n[\s\S]*?\n---\n+/, "");
}

describe("the Actions for Human section in the task file", () => {
	it("round-trips-with-section: a binary-written file and the canonical fixture survive parse and serialise byte for byte", () => {
		const written = serializeTask(withActions(baseTask(), TWO_ACTIONS));
		expect(written).toContain(
			"## Actions for Human\n<!-- ACTIONS:BEGIN -->\n- [ ] #1 Which key should the refresh use?\n- [x] #2 [not a question] Pick the session lifetime\n<!-- ACTIONS:END -->",
		);
		expect(serializeTask(parseTask(written))).toBe(written);

		const parsed = parseTask(CANONICAL);
		expect(actionsOf(parsed)).toEqual(TWO_ACTIONS);
		expect(serializeTask(parsed)).toBe(CANONICAL);
	});

	it("round-trips-with-section: a hand-written section is left exactly as written while its items are unchanged", () => {
		// A blank line after the heading, and the section below the Description: both parse, and a
		// rewrite would normalise them, so only an untouched section keeps these bytes.
		const handWritten = CANONICAL.replace(
			/## Actions for Human\n<!-- ACTIONS:BEGIN -->\n[\s\S]*?<!-- ACTIONS:END -->\n\n/,
			"",
		).replace(
			"<!-- SECTION:DESCRIPTION:END -->\n\n",
			"<!-- SECTION:DESCRIPTION:END -->\n\n## Actions for Human\n\n<!-- ACTIONS:BEGIN -->\n- [ ] #1 Which key should the refresh use?\n- [x] #2 [not a question] Pick the session lifetime\n<!-- ACTIONS:END -->\n\n",
		);
		const parsed = parseTask(handWritten);
		expect(actionsOf(parsed)).toEqual(TWO_ACTIONS);
		expect(serializeTask(parsed)).toBe(handWritten);
		expect(serializeTask({ ...parsed, labels: ["changed"] })).toContain(
			"<!-- SECTION:DESCRIPTION:END -->\n\n## Actions for Human\n\n<!-- ACTIONS:BEGIN -->",
		);
	});

	it("round-trips-without-section:a file without actions is written back without a heading or a marker", () => {
		const written = serializeTask(baseTask());
		const again = serializeTask(parseTask(written));
		expect(again).toBe(written);
		expect(again).not.toContain("Actions for Human");
		expect(again).not.toContain("ACTIONS:");
		expect(actionsOf(parseTask(again))).toEqual([]);
	});

	it("section-is-first: the section precedes the Description and every other section", () => {
		const written = serializeTask(withActions(baseTask(), TWO_ACTIONS));
		expect(bodyOf(written).startsWith("## Actions for Human\n")).toBe(true);
		const actionsAt = written.indexOf("## Actions for Human");
		for (const title of [
			"## Description",
			"## Acceptance Criteria",
			"## Definition of Done",
			"## Implementation Plan",
			"## Implementation Notes",
			"## Comments",
			"## Final Summary",
		]) {
			expect(written.indexOf(title)).toBeGreaterThan(actionsAt);
		}
	});

	it("description-edit-keeps-order: rewriting the description keeps the section first", () => {
		const parsed = parseTask(CANONICAL);
		const rewritten = serializeTask({ ...parsed, description: "A new body" });
		expect(rewritten).toContain("A new body");
		expect(bodyOf(rewritten).startsWith("## Actions for Human\n<!-- ACTIONS:BEGIN -->")).toBe(true);
		expect(rewritten.indexOf("## Actions for Human")).toBeLessThan(rewritten.indexOf("## Description"));
		expect(actionsOf(parseTask(rewritten))).toEqual(TWO_ACTIONS);
	});

	it("description-edit-keeps-order: adding a description to a card that has only actions puts it after them", () => {
		const onlyActions = serializeTask(
			withActions(
				baseTask({
					description: undefined,
					acceptanceCriteriaItems: [],
					definitionOfDoneItems: [],
					implementationPlan: undefined,
					implementationNotes: undefined,
					comments: [],
					finalSummary: undefined,
				}),
				TWO_ACTIONS,
			),
		);
		const withDescription = serializeTask({ ...parseTask(onlyActions), description: "Late description" });
		expect(bodyOf(withDescription).startsWith("## Actions for Human\n")).toBe(true);
		expect(withDescription.indexOf("## Description")).toBeGreaterThan(withDescription.indexOf("<!-- ACTIONS:END -->"));
	});

	it("ac-and-dod-edits-keep-section: criteria and Definition of Done edits leave the section untouched and first", () => {
		const parsed = parseTask(CANONICAL);
		const edited = serializeTask({
			...parsed,
			acceptanceCriteriaItems: [
				{ index: 1, text: "First criterion", checked: true },
				{ index: 2, text: "Second criterion", checked: false },
			],
			definitionOfDoneItems: [{ index: 1, text: "Tests pass", checked: false }],
		});
		expect(edited).toContain("- [x] #1 First criterion\n- [ ] #2 Second criterion");
		expect(edited).toContain("- [ ] #1 Tests pass");
		expect(bodyOf(edited).startsWith(bodyOf(CANONICAL).slice(0, bodyOf(CANONICAL).indexOf("## Description")))).toBe(
			true,
		);
		expect(actionsOf(parseTask(edited))).toEqual(TWO_ACTIONS);
	});

	it("clear-removes-heading-and-markers: an empty list removes the section whole", () => {
		const cleared = serializeTask(withActions(parseTask(CANONICAL), []));
		expect(cleared).not.toContain("Actions for Human");
		expect(cleared).not.toContain("ACTIONS:");
		expect(bodyOf(cleared).startsWith("## Description\n")).toBe(true);
		expect(actionsOf(parseTask(cleared))).toEqual([]);
	});

	it("unmarked-heading-not-read: a stray heading with checkbox lines is never parsed as actions", () => {
		const stray = CANONICAL.replace(
			/## Actions for Human\n<!-- ACTIONS:BEGIN -->\n[\s\S]*?<!-- ACTIONS:END -->\n\n/,
			"## Actions for Human\n\n- [ ] #1 Not an action\n\n",
		);
		expect(stray).not.toContain("ACTIONS:");
		const parsed = parseTask(stray);
		expect(actionsOf(parsed)).toEqual([]);
		expect(serializeTask(parsed)).toBe(stray);
	});

	it("other-checklists-mask-actions: a marker pair inside a comment is not read, and criteria inside actions are not read", () => {
		const commentBody = [
			"Quoting an old card:",
			"## Actions for Human",
			"<!-- ACTIONS:BEGIN -->",
			"- [ ] #1 Hidden in a comment?",
			"<!-- ACTIONS:END -->",
		].join("\n");
		const inComment = serializeTask(
			withActions(
				baseTask({ comments: [{ index: 1, body: commentBody, createdDate: "2026-09-27 10:05", author: "@lead" }] }),
				[TWO_ACTIONS[0] as AcceptanceCriterion],
			),
		);
		expect(actionsOf(parseTask(inComment))).toEqual([TWO_ACTIONS[0] as AcceptanceCriterion]);

		const criteriaInside = CANONICAL.replace(
			"- [x] #2 [not a question] Pick the session lifetime\n",
			"- [x] #2 [not a question] Pick the session lifetime\n## Acceptance Criteria\n<!-- AC:BEGIN -->\n- [ ] #1 Hidden criterion\n<!-- AC:END -->\n",
		).replace("## Acceptance Criteria\n<!-- AC:BEGIN -->\n- [ ] #1 First criterion\n<!-- AC:END -->\n\n", "");
		const parsed = parseTask(criteriaInside);
		expect(parsed.acceptanceCriteriaItems).toEqual([]);
		expect(actionsOf(parsed)).toEqual(TWO_ACTIONS);
	});

	it("tick-untick-byte-stable: ticking then unticking an action returns the original bytes", () => {
		const ticked = serializeTask(
			withActions(
				parseTask(CANONICAL),
				TWO_ACTIONS.map((item) => (item.index === 1 ? { ...item, checked: true } : item)),
			),
		);
		expect(ticked).toContain("- [x] #1 Which key should the refresh use?");
		expect(ticked).not.toBe(CANONICAL);

		const unticked = serializeTask(
			withActions(
				parseTask(ticked),
				TWO_ACTIONS.map((item) => ({ ...item })),
			),
		);
		expect(unticked).toBe(CANONICAL);
	});
});
