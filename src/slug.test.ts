import { describe, expect, test } from "bun:test";
import { isValidSlug, kebab, SLUG_MAX_LENGTH, slugify, uniqueSlug } from "./slug.ts";

describe("slugify", () => {
	test("drops stopwords and keeps the first few words", () => {
		expect(slugify("Sync works fully offline, and nobody loses work")).toBe(
			"sync-works-fully-offline",
		);
		expect(slugify("The server is always authoritative")).toBe("server-always-authoritative");
	});

	test("keeps stopwords when nothing else is left", () => {
		expect(slugify("To be or not to be")).toBe("not");
		expect(slugify("It is what it is")).toBe("what");
		expect(slugify("and or the")).toBe("and-or-the");
	});

	test("strips punctuation and diacritics", () => {
		expect(slugify("Café — naïve résumé!")).toBe("cafe-naive-resume");
		expect(slugify("# Heading: v2.0 launch")).toBe("heading-v2-0-launch");
	});

	test("caps length at a word boundary", () => {
		const s = slugify("internationalization localization globalization personalization");
		expect(s.length).toBeLessThanOrEqual(SLUG_MAX_LENGTH);
		expect(s).toBe("internationalization-localization");
		expect(slugify("x".repeat(80))).toHaveLength(SLUG_MAX_LENGTH);
	});

	test("empty input gives empty slug", () => {
		expect(slugify("")).toBe("");
		expect(slugify("!!!")).toBe("");
	});

	test("kebab keeps every word", () => {
		expect(kebab("Jaymin West")).toBe("jaymin-west");
		expect(kebab("  O'Brien, Ann ")).toBe("o-brien-ann");
	});
});

describe("slug validation", () => {
	test("valid and invalid slugs", () => {
		expect(isValidSlug("offline-sync")).toBe(true);
		expect(isValidSlug("v2")).toBe(true);
		expect(isValidSlug("Offline")).toBe(false);
		expect(isValidSlug("a--b")).toBe(false);
		expect(isValidSlug("-a")).toBe(false);
		expect(isValidSlug("")).toBe(false);
		expect(isValidSlug("r-a1b2")).toBe(false);
		expect(isValidSlug("a".repeat(65))).toBe(false);
	});

	test("uniqueSlug appends a counter", () => {
		expect(uniqueSlug("a", new Set())).toBe("a");
		expect(uniqueSlug("a", new Set(["a", "a-2"]))).toBe("a-3");
	});
});
