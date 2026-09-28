import { describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { appendEvent, contributors, eventsFor, makeEvent, readEvents } from "./events.ts";
import { rootsPaths } from "./paths.ts";
import { tempDir } from "./test-helpers.ts";

describe("events", () => {
	test("makeEvent puts type/by/at first and defaults at", () => {
		const e = makeEvent("plant", "human:a", { node: "r-1", slug: "x" });
		expect(Object.keys(e).slice(0, 3)).toEqual(["type", "by", "at"]);
		expect(e.at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
		expect(makeEvent("mv", "human:a", { at: "2020-01-01T00:00:00Z" }).at).toBe(
			"2020-01-01T00:00:00Z",
		);
	});

	test("append-only file; exact duplicates collapse on read", async () => {
		const paths = rootsPaths(tempDir());
		const e1 = makeEvent("plant", "human:a", { node: "r-1", at: "2026-01-01T00:00:00Z" });
		const e2 = makeEvent("link", "human:b", {
			node: "r-2",
			refs: ["r-1"],
			at: "2026-01-02T00:00:00Z",
		});
		await appendEvent(paths, e1);
		await appendEvent(paths, e2);
		writeFileSync(paths.events, `${readFileSync(paths.events, "utf8")}${JSON.stringify(e1)}\n`);
		expect(readEvents(paths)).toEqual([e1, e2]);
		expect(eventsFor(readEvents(paths), "r-1")).toEqual([e1, e2]);
		expect(eventsFor(readEvents(paths), "r-2")).toEqual([e2]);
	});

	test("contributors: author first, roots bookkeeping excluded", () => {
		const events = [
			makeEvent("plant", "human:a"),
			makeEvent("mv", "roots:dir-rename"),
			makeEvent("ask", "agent:m"),
			makeEvent("session.end", "human:b"),
			makeEvent("expire", "roots"),
		];
		expect(contributors(events, "human:a")).toEqual(["human:a", "agent:m", "human:b"]);
		expect(contributors([])).toEqual([]);
	});
});
