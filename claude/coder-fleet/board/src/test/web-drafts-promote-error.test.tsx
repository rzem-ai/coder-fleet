import { afterEach, describe, expect, it } from "bun:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Task } from "../types/index.ts";
import DraftsList from "../web/components/DraftsList.tsx";
import { ThemeProvider } from "../web/contexts/ThemeContext.tsx";

// CF-24.3: a refused promotion shows the server's own message, which names
// require_acceptance_criteria, rather than the bare HTTP status text.

const MESSAGE =
	"This board requires at least one acceptance criterion on every new item (require_acceptance_criteria: true in the board config).";

let activeRoot: Root | null = null;
const originalFetch = globalThis.fetch;

function setupDom(): HTMLElement {
	const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "http://localhost" });
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	globalThis.window = dom.window as unknown as Window & typeof globalThis;
	globalThis.document = dom.window.document as unknown as typeof globalThis.document;
	globalThis.navigator = dom.window.navigator as unknown as Navigator;
	globalThis.localStorage = dom.window.localStorage;
	globalThis.Element = dom.window.Element;
	globalThis.HTMLElement = dom.window.HTMLElement;
	window.matchMedia = (() => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} })) as never;
	return dom.window.document.getElementById("root") as unknown as HTMLElement;
}

const bareDraft: Task = {
	id: "DRAFT-1",
	title: "A bare draft",
	status: "Draft",
	assignee: [],
	labels: [],
	dependencies: [],
	createdDate: "2026-09-30 10:00",
};

/** GET /api/drafts serves one draft; POST .../promote answers with `promote`. */
function serve(promote: () => Response): void {
	globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
		const url = String(input);
		if (url.endsWith("/promote") && init?.method === "POST") return promote();
		return new Response(JSON.stringify([bareDraft]), { status: 200, headers: { "Content-Type": "application/json" } });
	}) as unknown as typeof globalThis.fetch;
}

async function renderAndPromote(): Promise<HTMLElement> {
	const container = setupDom();
	activeRoot = createRoot(container);
	await act(async () => {
		activeRoot?.render(
			<ThemeProvider>
				<DraftsList onEditTask={() => {}} onNewDraft={() => {}} />
			</ThemeProvider>,
		);
		await Promise.resolve();
	});
	const button = Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes("Promote"));
	expect(button).toBeTruthy();
	await act(async () => {
		button?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
		await new Promise((resolve) => setTimeout(resolve, 0));
	});
	return container;
}

afterEach(() => {
	if (activeRoot) {
		act(() => activeRoot?.unmount());
		activeRoot = null;
	}
	globalThis.fetch = originalFetch;
});

describe("DraftsList promote errors", () => {
	it("shows the server's error message when a promotion is refused", async () => {
		serve(
			() =>
				new Response(JSON.stringify({ error: MESSAGE }), {
					status: 400,
					statusText: "Bad Request",
					headers: { "Content-Type": "application/json" },
				}),
		);
		const container = await renderAndPromote();
		expect(container.textContent).toContain("require_acceptance_criteria");
	});

	it("falls back to the status text when the body carries no error", async () => {
		serve(() => new Response("oops", { status: 500, statusText: "Internal Server Error" }));
		const container = await renderAndPromote();
		expect(container.textContent).toContain("Failed to promote draft: Internal Server Error");
	});
});
