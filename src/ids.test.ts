import { describe, expect, test } from "bun:test";
import {
	generateHex,
	generateId,
	hexOf,
	hexSet,
	isId,
	makeId,
	prefixOf,
	randomHex,
	SHORT_ATTEMPTS,
} from "./ids.ts";

function scripted(values: string[]): (len: number) => string {
	let i = 0;
	return (len) => {
		const v = values[i++];
		if (v === undefined) throw new Error("ran out of scripted values");
		expect(v.length).toBe(len);
		return v;
	};
}

describe("ids", () => {
	test("random hex has the requested length", () => {
		for (const n of [4, 5, 6, 8]) expect(randomHex(n)).toMatch(new RegExp(`^[0-9a-f]{${n}}$`));
	});

	test("4 hex chars by default", () => {
		expect(generateId("r", new Set())).toMatch(/^r-[0-9a-f]{4}$/);
		expect(generateId("ss", new Set())).toMatch(/^ss-[0-9a-f]{4}$/);
	});

	test("retries on collision", () => {
		expect(generateHex(new Set(["aaaa"]), scripted(["aaaa", "bbbb"]))).toBe("bbbb");
	});

	test("extends to 6 chars when 4-char candidates keep colliding", () => {
		const rand = scripted([...Array(SHORT_ATTEMPTS).fill("aaaa"), "abcdef"]);
		expect(generateHex(new Set(["aaaa"]), rand)).toBe("abcdef");
	});

	test("falls back to 8 chars as a last resort", () => {
		const rand = scripted([
			...Array(SHORT_ATTEMPTS).fill("aaaa"),
			...Array(SHORT_ATTEMPTS).fill("aaaaaa"),
			"aaaaaaaa",
			"12345678",
		]);
		expect(generateHex(new Set(["aaaa", "aaaaaa", "aaaaaaaa"]), rand)).toBe("12345678");
	});

	test("parsing helpers", () => {
		expect(makeId("r", "a1b2")).toBe("r-a1b2");
		expect(hexOf("r-a1b2")).toBe("a1b2");
		expect(hexOf("ss-12ab")).toBe("12ab");
		expect(hexOf("a1b2")).toBe("a1b2");
		expect(prefixOf("ss-12ab")).toBe("ss");
		expect(prefixOf("x-12ab")).toBeUndefined();
		expect(isId("r-a1b2")).toBe(true);
		expect(isId("r-a1b2", "s")).toBe(false);
		expect(isId("r-a1")).toBe(false);
		expect(isId("offline-sync")).toBe(false);
		expect([...hexSet(["r-a1b2", "s-a1b2", "e-0000"])]).toEqual(["a1b2", "0000"]);
	});
});
