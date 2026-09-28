import { describe, expect, test } from "bun:test";
import { allLines } from "./diff.ts";
import { findMentions, type MentionTarget, slugPhrase, statementPhrases } from "./mentions.ts";

const OFFLINE: MentionTarget = {
	id: "r-a1b2",
	slug: "offline-sync",
	statement: "Sync works fully offline, and nobody loses work when the network drops.",
};
const AUTH: MentionTarget = { id: "r-e5f6", slug: "auth", statement: "Login uses passkeys." };
const SERVER: MentionTarget = {
	id: "r-c3d4",
	slug: "server-authoritative-2",
	statement: "The server is always authoritative.",
};

const find = (text: string, self = "r-self") =>
	findMentions(allLines(text), [OFFLINE, AUTH, SERVER], self);

describe("mentions", () => {
	test("slug phrase: hyphenated or spaced, counter suffix ignored", () => {
		expect(find("This builds on the offline sync thing.")).toEqual([
			{
				target: "r-a1b2",
				line: 1,
				text: "This builds on the offline sync thing.",
				via: "slug",
				match: "offline sync",
			},
		]);
		expect(find("see offline-sync")[0]?.via).toBe("slug");
		expect(find("Pulls against server authoritative writes.")[0]?.target).toBe("r-c3d4");
	});

	test("id match on word boundaries, case-insensitive", () => {
		expect(find("x\nrelated: R-E5F6.")).toMatchObject([{ target: "r-e5f6", line: 2, via: "id" }]);
		expect(find("r-e5f6a is not it")).toEqual([]);
	});

	test("distinctive statement phrase", () => {
		const m = find("Remember: nobody loses work, ever.");
		expect(m).toMatchObject([{ target: "r-a1b2", via: "phrase", match: "nobody loses work" }]);
		// Stopword-heavy phrases do not count.
		expect(find("when the network is slow")).toEqual([]);
	});

	test("one-word slugs, self mentions and unrelated text do not match", () => {
		expect(find("auth is hard")).toEqual([]);
		expect(find("offline sync", "r-a1b2")).toEqual([]);
		expect(find("Nothing related here.")).toEqual([]);
	});

	test("first mention per target only", () => {
		expect(find("offline sync\nagain offline sync")).toHaveLength(1);
	});

	test("helpers", () => {
		expect(slugPhrase("auth")).toBeNull();
		expect(slugPhrase("offline-sync-2")).toEqual(["offline", "sync"]);
		expect(slugPhrase("of-the")).toBeNull();
		expect(statementPhrases("The server is always authoritative")).toEqual([]);
		expect(statementPhrases("Field users lose signal")).toEqual([
			["field", "users", "lose"],
			["users", "lose", "signal"],
		]);
	});
});
