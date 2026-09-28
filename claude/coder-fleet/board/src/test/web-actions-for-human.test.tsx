import { afterEach, describe, expect, it } from "bun:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import type { AcceptanceCriterion, Task } from "../types/index.ts";
import TaskCard from "../web/components/TaskCard.tsx";
import { TaskDetailsModal } from "../web/components/TaskDetailsModal.tsx";
import { ThemeProvider } from "../web/contexts/ThemeContext.tsx";
import { apiClient } from "../web/lib/api.ts";

// CF-25 in the web UI: the modal shows the numbered actions above the Description with a checkbox
// that sends one number, and the kanban card shows the first open action's text, truncated with the
// flag prefix intact.

let activeRoot: Root | null = null;
let activeDom: JSDOM | null = null;

const setupDom = () => {
	activeDom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "http://localhost" });
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	globalThis.window = activeDom.window as unknown as Window & typeof globalThis;
	globalThis.document = activeDom.window.document as unknown as Document;
	globalThis.navigator = activeDom.window.navigator as unknown as Navigator;
	globalThis.localStorage = activeDom.window.localStorage as unknown as Storage;
	globalThis.HTMLElement = activeDom.window.HTMLElement;
	globalThis.HTMLInputElement = activeDom.window.HTMLInputElement;
	if (!window.matchMedia) {
		window.matchMedia = () =>
			({
				matches: false,
				media: "",
				onchange: null,
				addListener: () => {},
				removeListener: () => {},
				addEventListener: () => {},
				removeEventListener: () => {},
				dispatchEvent: () => false,
			}) as MediaQueryList;
	}
};

afterEach(() => {
	if (activeRoot) {
		act(() => {
			activeRoot?.unmount();
		});
		activeRoot = null;
	}
	activeDom?.window.close();
	activeDom = null;
});

const makeTask = (actions: AcceptanceCriterion[] | undefined, overrides: Partial<Task> = {}): Task =>
	({
		id: "BD-1",
		title: "Blocked card",
		status: "Blocked by human",
		assignee: [],
		createdDate: "2026-09-27",
		labels: [],
		dependencies: [],
		description: "The description body",
		...(actions && { actionsForHumanItems: actions }),
		...overrides,
	}) as Task;

const TWO: AcceptanceCriterion[] = [
	{ index: 1, text: "Which key should the refresh use?", checked: false },
	{ index: 2, text: "[not a question] Pick the session lifetime", checked: true },
];

const renderModalHtml = (task: Task) =>
	renderToString(
		<ThemeProvider>
			<TaskDetailsModal task={task} isOpen={true} onClose={() => {}} />
		</ThemeProvider>,
	);

const renderCard = (task: Task): HTMLElement => {
	setupDom();
	const container = document.getElementById("root") as HTMLElement;
	activeRoot = createRoot(container);
	act(() => {
		activeRoot?.render(<TaskCard task={task} onUpdate={() => {}} onEdit={() => {}} />);
	});
	return container;
};

describe("the task modal", () => {
	it("modal-renders-before-description: the section sits above the Description, numbered and ticked", () => {
		setupDom();
		const html = renderModalHtml(makeTask(TWO));
		const doc = new JSDOM(html).window.document;
		const section = doc.querySelector("[data-actions-for-human]");
		expect(section).toBeTruthy();
		expect(section?.textContent).toContain("Actions for Human");
		expect(section?.textContent).toContain("1 of 2 answered");
		expect(section?.textContent).toContain("#1");
		expect(section?.textContent).toContain("Which key should the refresh use?");
		expect(section?.textContent).toContain("#2");
		const boxes = Array.from(section?.querySelectorAll("input[type='checkbox']") ?? []) as HTMLInputElement[];
		expect(boxes.map((box) => box.hasAttribute("checked"))).toEqual([false, true]);
		expect(html.indexOf("data-actions-for-human")).toBeLessThan(html.indexOf("The description body"));
		expect(html.indexOf("Actions for Human")).toBeLessThan(html.indexOf(">Description<"));
	});

	it("modal-renders-nothing-when-empty: no actions, no section", () => {
		setupDom();
		for (const task of [makeTask(undefined), makeTask([])]) {
			const html = renderModalHtml(task);
			expect(html).not.toContain("Actions for Human");
			expect(html).not.toContain("data-actions-for-human");
		}
	});

	it("modal-checkbox-sends-index: ticking an action sends that one number", async () => {
		setupDom();
		const sent: unknown[] = [];
		const original = apiClient.updateTask.bind(apiClient);
		apiClient.updateTask = async (_id, updates) => {
			sent.push(updates);
			return makeTask(TWO);
		};
		try {
			const container = document.getElementById("root") as HTMLElement;
			activeRoot = createRoot(container);
			await act(async () => {
				activeRoot?.render(
					<ThemeProvider>
						<TaskDetailsModal task={makeTask(TWO)} isOpen={true} onClose={() => {}} />
					</ThemeProvider>,
				);
				await Promise.resolve();
			});
			const boxes = Array.from(
				document.querySelectorAll("[data-actions-for-human] input[type='checkbox']"),
			) as HTMLInputElement[];
			expect(boxes.length).toBe(2);
			await act(async () => {
				boxes[0]?.click();
				await Promise.resolve();
			});
			await act(async () => {
				boxes[1]?.click();
				await Promise.resolve();
			});
			expect(sent).toEqual([{ actionsCheck: [1] }, { actionsUncheck: [2] }]);
		} finally {
			apiClient.updateTask = original;
		}
	});
});

describe("the kanban card", () => {
	it("card-first-unticked-truncated: the first open action shows under the title, prefix intact, at most 80 characters", () => {
		const long = `[not a question] ${"Decide which of the two refresh strategies ships first ".repeat(3)}`.trim();
		expect(long.length).toBeGreaterThan(100);
		const container = renderCard(
			makeTask([
				{ index: 1, text: "Already answered?", checked: true },
				{ index: 2, text: long, checked: false },
				{ index: 3, text: "Third ask?", checked: false },
			]),
		);
		const shown = container.querySelector("[data-first-action]") as HTMLElement | null;
		expect(shown).toBeTruthy();
		const text = shown?.textContent ?? "";
		expect(text.startsWith("[not a question] ")).toBe(true);
		expect(text.length).toBeLessThanOrEqual(80);
		expect(text.length).toBeGreaterThan(60);
		expect(shown?.getAttribute("title")).toBe(long);
		expect(container.textContent).not.toContain("Already answered?");
		expect(container.textContent).not.toContain("Third ask?");
		const title = container.querySelector("h4");
		expect(title?.compareDocumentPosition(shown as Node)).toBe(4);
	});

	it("card-first-unticked-truncated: a short ask shows whole", () => {
		const container = renderCard(makeTask([{ index: 1, text: "Which key?", checked: false }]));
		expect(container.querySelector("[data-first-action]")?.textContent).toBe("Which key?");
	});

	it("card-nothing-when-all-ticked: no open action, no action text", () => {
		const container = renderCard(makeTask(TWO.map((item) => ({ ...item, checked: true }))));
		expect(container.querySelector("[data-first-action]")).toBeNull();
		expect(container.textContent).not.toContain("Which key should the refresh use?");
	});

	it("card-nothing-when-empty: no actions, no action text", () => {
		const container = renderCard(makeTask(undefined));
		expect(container.querySelector("[data-first-action]")).toBeNull();
	});
});
