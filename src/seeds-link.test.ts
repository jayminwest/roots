import { describe, expect, test } from "bun:test";
import { citedIdeaIds, citesIdea, shortLine, stringsIn } from "./idea-refs.ts";
import { learningsFor, readCitingRecords } from "./mulch-link.ts";
import { issueLinks, linkedIssues, readSeedsIssues, readyToMarkBuilt } from "./seeds-link.ts";
import { tempDir, writeMulch, writeSeeds } from "./test-helpers.ts";
import type { Graph, NodeRecord } from "./types.ts";

function idea(id: string, status: NodeRecord["status"] = "committed"): NodeRecord {
	return {
		type: "node",
		id,
		kind: "idea",
		slug: id,
		status,
		author: "human:t",
		createdAt: "2026-01-01T00:00:00Z",
	};
}

describe("idea-refs", () => {
	test("exact r- tokens only", () => {
		expect(citedIdeaIds("fixes r-a1b2. see (r-c3d4), r-a1b2 again")).toEqual(["r-a1b2", "r-c3d4"]);
		expect(citedIdeaIds("sr-a1b2 r-a1b2-x xr-a1b2 r-A1B2 r-a1b")).toEqual([]);
		expect(citesIdea("realizes r-a1b2c3", "r-a1b2")).toBe(false);
		expect(citesIdea("realizes r-a1b2c3", "r-a1b2c3")).toBe(true);
	});

	test("stringsIn walks nested values; shortLine trims", () => {
		expect(stringsIn({ a: "x", b: ["y", { c: "z" }], n: 1 })).toEqual(["x", "y", "z"]);
		expect(shortLine("\n  first line  \nsecond")).toBe("first line");
		expect(shortLine("x".repeat(20), 10)).toBe(`${"x".repeat(9)}…`);
	});
});

describe("seeds-link", () => {
	test("reads issues: dedup last wins, malformed lines and missing dir tolerated", () => {
		const root = tempDir();
		expect(readSeedsIssues(root)).toEqual([]);
		writeSeeds(
			root,
			[
				{ id: "s-1", title: "old", status: "open", extra: { unknown: true } },
				{ id: "s-2", title: "two", status: "open" },
				{ id: "s-1", title: "new", status: "closed" },
				{ title: "no id" },
			],
			"<<<<<<< HEAD\n",
		);
		const issues = readSeedsIssues(root);
		expect(issues.map((i) => [i.id, i.title, i.status])).toEqual([
			["s-1", "new", "closed"],
			["s-2", "two", "open"],
		]);
	});

	test("intent field wins over text mentions; string, array and extensions.intent", () => {
		const base = { title: "", status: "open" };
		expect(issueLinks({ ...base, id: "a", intent: "r-a1b2", description: "r-c3d4" })).toEqual({
			ids: ["r-a1b2"],
			via: "intent",
		});
		expect(issueLinks({ ...base, id: "b", intent: ["r-a1b2", "r-c3d4", 7] })).toEqual({
			ids: ["r-a1b2", "r-c3d4"],
			via: "intent",
		});
		expect(issueLinks({ ...base, id: "c", extensions: { intent: "r-e5f6" } }).ids).toEqual([
			"r-e5f6",
		]);
		expect(
			issueLinks({ ...base, id: "d", title: "for r-a1b2", labels: ["r-c3d4"], description: "x" }),
		).toEqual({ ids: ["r-a1b2", "r-c3d4"], via: "mention" });
	});

	test("readyToMarkBuilt: committed ideas whose linked issues are all closed", () => {
		const graph: Graph = {
			nodes: [idea("r-aaaa"), idea("r-bbbb"), idea("r-cccc", "shaping"), idea("r-dddd")],
			edges: [],
		};
		const issues = [
			{ id: "1", title: "r-aaaa part 1", status: "closed" },
			{ id: "2", title: "r-aaaa part 2", status: "closed" },
			{ id: "3", title: "r-bbbb", status: "closed" },
			{ id: "4", title: "r-bbbb", status: "in_progress" },
			{ id: "5", title: "r-cccc", status: "closed" },
		];
		const ready = readyToMarkBuilt(graph, issues);
		expect(ready.map((r) => [r.node.id, r.issues.map((i) => i.id)])).toEqual([
			["r-aaaa", ["1", "2"]],
		]);
		expect(linkedIssues(issues, "r-bbbb").map((i) => i.closed)).toEqual([true, false]);
	});
});

describe("mulch-link", () => {
	test("records citing an idea in any string field; archived skipped; dedup by id", () => {
		const root = tempDir();
		expect(readCitingRecords(root)).toEqual([]);
		writeMulch(root, "cli", [
			{ id: "mx-1", type: "convention", content: "Always r-a1b2\nmore", recorded_at: "t" },
			{ id: "mx-2", type: "pattern", name: "p", description: "nothing", recorded_at: "t" },
			{ id: "mx-3", type: "decision", title: "Pick X", rationale: "", relates_to: ["r-a1b2"] },
			{ id: "mx-4", type: "failure", description: "gone r-a1b2", archived_at: "t" },
			{ id: "mx-5", type: "guide", name: "old", description: "r-a1b2" },
			{ id: "mx-5", type: "guide", name: "new", description: "r-c3d4" },
		]);
		writeMulch(root, "store", [
			{ type: "reference", name: "ref", description: "d", evidence: { seeds: "x r-a1b2" } },
		]);
		expect(learningsFor(root, "r-a1b2")).toEqual([
			{ id: "mx-1", domain: "cli", type: "convention", summary: "Always r-a1b2" },
			{ id: "mx-3", domain: "cli", type: "decision", summary: "Pick X" },
			{ id: null, domain: "store", type: "reference", summary: "ref" },
		]);
		expect(learningsFor(root, "r-c3d4").map((l) => l.summary)).toEqual(["new"]);
	});
});
