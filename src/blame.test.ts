import { describe, expect, test } from "bun:test";
import { answerBlocks, buildBlame, lineHash, spanLines } from "./blame.ts";
import type { EventRecord, QuestionRecord } from "./types.ts";

const q = (id: string, text: string): QuestionRecord => ({
	id,
	node: "r-a1b2",
	text,
	by: "roots:missing-done",
	status: "answered",
	createdAt: "2026-09-28T10:00:00Z",
});

const answer = (question: string, lines?: string[], node = "r-a1b2"): EventRecord => ({
	type: "answer",
	by: "human:h",
	at: "2026-09-28T10:05:00Z",
	node,
	question,
	session: "ss-0001",
	span: { from: 1, to: 1, removed: 0 },
	...(lines ? { lines: lines.map(lineHash) } : {}),
});

describe("buildBlame", () => {
	test("matches lines by content, not position; later answers take over rewritten lines", () => {
		const text = "Sync works offline\n\nNew line on top\nDone: airplane mode.\nDeleted wins.\n";
		const b = buildBlame(
			"r-a1b2",
			text,
			[
				answer("q-1", ["Done: airplane mode.", "Deletes are hard."]),
				answer("q-2", ["Deleted wins."]),
				answer("q-9", ["Done: airplane mode."], "r-other"),
			],
			[q("q-1", "What would make this done?"), q("q-2", "What about deletes?")],
		);
		expect(b.lines.map((l) => l.question)).toEqual([null, null, null, "q-1", "q-2"]);
		expect(b.answers.map((a) => [a.question, a.lines])).toEqual([
			["q-1", 1],
			["q-2", 1],
		]);
		expect(b.answers[0]?.text).toBe("What would make this done?");
		expect(b.untracked).toBe(0);
	});

	test("whitespace-only edits keep attribution; blank lines never attribute", () => {
		const b = buildBlame("r-a1b2", "  Done: x  \n\n", [answer("q-1", ["Done: x", ""])], []);
		expect(b.lines.map((l) => l.question)).toEqual(["q-1", null]);
		expect(b.answers[0]?.text).toBe("(question not found)");
	});

	test("answers without line hashes are counted as untracked", () => {
		const b = buildBlame("r-a1b2", "x\n", [answer("q-1")], [q("q-1", "Q?")]);
		expect(b.untracked).toBe(1);
		expect(b.answers[0]?.lines).toBe(0);
	});

	test("spanLines replays later spans: insertions shift, replacements take over", () => {
		const owner = spanLines([
			{ question: "q-1", span: { from: 3, to: 4, removed: 0 } },
			{ question: "q-2", span: { from: 1, to: 2, removed: 0 } }, // inserted above: q-1 → 5–6
			{ question: "q-3", span: { from: 6, to: 6, removed: 1 } }, // rewrote q-1's last line
		]);
		expect([...owner.entries()].sort((a, b) => a[0] - b[0])).toEqual([
			[1, "q-2"],
			[2, "q-2"],
			[5, "q-1"],
			[6, "q-3"],
		]);
	});

	test("answerBlocks groups the body by question; blank lines stay with the run above", () => {
		const text = "Statement\n\nfree\n\nans one\nans two\n\nmore free\n";
		const b = buildBlame("r-a1b2", text, [answer("q-1", ["ans one", "ans two"])], []);
		expect(answerBlocks(b)).toEqual([
			{ question: null, text: "free" },
			{ question: "q-1", text: "ans one\nans two" },
			{ question: null, text: "more free" },
		]);
		expect(answerBlocks(buildBlame("r-a1b2", "", [], []))).toEqual([]);
	});
});
