import { describe, expect, test } from "bun:test";
import { makeColors, visibleLength } from "./color.ts";
import { renderScreen, type ScreenView, wrapText } from "./think-screen.ts";

const plain = makeColors(false);

const VIEW: ScreenView = {
	id: "r-a1b2",
	slug: "offline-sync",
	status: "shaping",
	statement: "Sync works fully offline, and nobody loses work when the network drops.",
	edges: [
		{ rel: "serves", direction: "out", id: "r-c3d4", slug: "local-first" },
		{ rel: "tension", direction: "in", id: "r-e5f6", slug: "server-authoritative" },
	],
	question: {
		text: "What happens to an offline edit on a record someone else deleted?",
		source: "agent",
		index: 2,
		total: 3,
	},
	notice: "answered (lines 3–5)",
	editorHint: "Editing .roots/human/a1b2-offline-sync/idea.md in a tmux pane.",
};

describe("think screen", () => {
	test("matches the SPEC mockup layout at 42 columns", () => {
		const lines = renderScreen(VIEW, 42, plain);
		expect(lines.join("\n")).toBe(
			[
				"┌─ roots think offline-sync ─────────────┐",
				"│ r-a1b2  offline-sync           shaping │",
				'│ "Sync works fully offline, and nobody… │',
				"│                                        │",
				"│ serves     → r-c3d4 local-first        │",
				"│ tension    ↔ r-e5f6 server-authoritat… │",
				"│                                        │",
				"│ ── question 2/3 ── [agent] ─────────── │",
				"│ What happens to an offline edit on a   │",
				"│ record someone else deleted?           │",
				"│                                        │",
				"│ ✓ answered (lines 3–5)                 │",
				"│ [save] answer  [d] dismiss  [z] snooze │",
				"│ [s] skip       [q] end session         │",
				"└────────────────────────────────────────┘",
				" Editing",
				" .roots/human/a1b2-offline-sync/idea.md",
				" in a tmux pane.",
			].join("\n"),
		);
	});

	test("every box line has the same visible width, with color on", () => {
		const lines = renderScreen(VIEW, 60, makeColors(true));
		const box = lines.slice(0, lines.findIndex((l) => l.includes("└")) + 1);
		expect(new Set(box.map(visibleLength))).toEqual(new Set([60]));
	});

	test("no question and no edges", () => {
		const text = renderScreen({ ...VIEW, question: null, edges: [], notice: null }, 50, plain).join(
			"\n",
		);
		expect(text).toContain("(no links yet)");
		expect(text).toContain("── no questions ──");
		expect(text).toContain("[q] end session");
		expect(text).not.toContain("[d] dismiss");
	});

	test("wrapText", () => {
		expect(wrapText("a bb ccc", 4)).toEqual(["a bb", "ccc"]);
		expect(wrapText("abcdefghij", 4)).toEqual(["abcd", "efgh", "ij"]);
		expect(wrapText("x\ny", 10)).toEqual(["x", "y"]);
	});
});

describe("think screen, narrow", () => {
	test("status survives, borders align, keys wrap instead of truncating", () => {
		const lines = renderScreen({ ...VIEW, slug: "sync-works-offline-nobody" }, 34, plain);
		const box = lines.slice(0, lines.findIndex((l) => l.includes("└")) + 1);
		expect(new Set(box.map((l) => [...l].length))).toEqual(new Set([34]));
		expect(box[1]).toMatch(/shaping │$/);
		const text = box.join("\n");
		for (const k of ["[save] answer", "[d] dismiss", "[z] snooze", "[s] skip", "[q] end session"]) {
			expect(text).toContain(k);
		}
	});
});
