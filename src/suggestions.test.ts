import { describe, expect, test } from "bun:test";
import { closest, levenshtein } from "./suggestions.ts";

describe("suggestions", () => {
	test("levenshtein", () => {
		expect(levenshtein("", "abc")).toBe(3);
		expect(levenshtein("abc", "")).toBe(3);
		expect(levenshtein("kitten", "sitting")).toBe(3);
		expect(levenshtein("same", "same")).toBe(0);
	});

	test("closest", () => {
		const cmds = ["init", "plant", "show", "list", "log", "mv"];
		expect(closest("lst", cmds)).toBe("list");
		expect(closest("plnt", cmds)).toBe("plant");
		expect(closest("pl", cmds)).toBe("plant");
		expect(closest("xyzzy", cmds)).toBeUndefined();
	});
});
