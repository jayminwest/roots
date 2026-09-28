import { describe, expect, test } from "bun:test";
import { allLines, changedLines, diffSpan, formatSpan, splitLines } from "./diff.ts";

describe("diff", () => {
	test("splitLines drops the trailing newline only", () => {
		expect(splitLines("")).toEqual([]);
		expect(splitLines("a\nb\n")).toEqual(["a", "b"]);
		expect(splitLines("a\r\n\nb")).toEqual(["a", "", "b"]);
	});

	test("diffSpan: insert, replace, delete, unchanged", () => {
		expect(diffSpan("a\nb\n", "a\nb\n")).toBeNull();
		expect(diffSpan("a\nc\n", "a\nb\nc\n")).toEqual({ from: 2, to: 2, removed: 0 });
		expect(diffSpan("a\nb\nc\n", "a\nX\nY\nc\n")).toEqual({ from: 2, to: 3, removed: 1 });
		expect(diffSpan("a\nb\nc\n", "a\nc\n")).toEqual({ from: 2, to: 1, removed: 1 });
		expect(diffSpan("a\n", "a\nb\nc\n")).toEqual({ from: 2, to: 3, removed: 0 });
		expect(diffSpan("", "x\n")).toEqual({ from: 1, to: 1, removed: 0 });
	});

	test("changedLines is a multiset difference that skips blanks", () => {
		expect(changedLines("a\nb\n", "a\n\nb\nnew\na\n")).toEqual([
			{ line: 4, text: "new" },
			{ line: 5, text: "a" },
		]);
		expect(allLines("x\n\ny\n")).toEqual([
			{ line: 1, text: "x" },
			{ line: 3, text: "y" },
		]);
	});

	test("formatSpan", () => {
		expect(formatSpan({ from: 3, to: 3, removed: 0 })).toBe("line 3");
		expect(formatSpan({ from: 3, to: 5, removed: 0 })).toBe("lines 3–5");
		expect(formatSpan({ from: 3, to: 2, removed: 2 })).toBe("deleted 2 lines");
	});
});
