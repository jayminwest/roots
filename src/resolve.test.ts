import { describe, expect, test } from "bun:test";
import { AmbiguousError, NotFoundError, UsageError } from "./errors.ts";
import { matchNodes, resolveNode } from "./resolve.ts";
import type { NodeKind, NodeRecord } from "./types.ts";

function node(id: string, slug: string, kind: NodeKind = "idea"): NodeRecord {
	return {
		type: "node",
		id,
		kind,
		slug,
		status: kind === "idea" ? "planted" : "open",
		author: kind === "idea" ? "human:a" : "agent:m",
		createdAt: "2026-09-28T10:00:00Z",
	};
}

const nodes = [
	node("r-a1b2", "offline-sync"),
	node("r-c3d4", "offline-first"),
	node("r-e5f6", "server-authoritative"),
	node("s-9f3e", "conflict-ui", "sprout"),
	node("r-cafe", "beef"),
	node("r-beef", "cafe-menu"),
];

describe("resolveNode", () => {
	test("full id, bare hex, slug", () => {
		expect(resolveNode(nodes, "r-a1b2").id).toBe("r-a1b2");
		expect(resolveNode(nodes, "a1b2").id).toBe("r-a1b2");
		expect(resolveNode(nodes, "offline-sync").id).toBe("r-a1b2");
		expect(resolveNode(nodes, "9f3e").id).toBe("s-9f3e");
		expect(resolveNode(nodes, "  OFFLINE-SYNC ").id).toBe("r-a1b2");
	});

	test("unique prefixes of id, hex or slug", () => {
		expect(resolveNode(nodes, "r-e5").id).toBe("r-e5f6");
		expect(resolveNode(nodes, "e5").id).toBe("r-e5f6");
		expect(resolveNode(nodes, "server").id).toBe("r-e5f6");
		expect(resolveNode(nodes, "offline-s").id).toBe("r-a1b2");
		expect(resolveNode(nodes, "s-9").id).toBe("s-9f3e");
	});

	test("exact hex beats slug, exact slug beats prefix", () => {
		expect(resolveNode(nodes, "beef").id).toBe("r-beef");
		expect(resolveNode(nodes, "cafe").id).toBe("r-cafe");
	});

	test("ambiguous prefix lists candidates", () => {
		try {
			resolveNode(nodes, "offline");
			throw new Error("expected throw");
		} catch (err) {
			expect(err).toBeInstanceOf(AmbiguousError);
			const e = err as AmbiguousError;
			expect(e.message).toContain("r-a1b2 offline-sync");
			expect(e.message).toContain("r-c3d4 offline-first");
			expect(e.detail).toEqual({ candidates: ["r-a1b2", "r-c3d4"] });
		}
	});

	test("not found suggests a close slug", () => {
		expect(() => resolveNode(nodes, "ofline-sync")).toThrow(/Did you mean offline-sync/);
		expect(() => resolveNode(nodes, "zzzz")).toThrow(NotFoundError);
		expect(() => resolveNode(nodes, "  ")).toThrow(UsageError);
	});

	test("kind filter", () => {
		expect(resolveNode(nodes, "9f3e", { kind: "sprout" }).id).toBe("s-9f3e");
		expect(() => resolveNode(nodes, "9f3e", { kind: "idea" })).toThrow(/s-9f3e is a sprout/);
		expect(() => resolveNode(nodes, "nope", { kind: "idea" })).toThrow(/no idea matches/);
	});

	test("matchNodes returns nothing for an empty query", () => {
		expect(matchNodes(nodes, "")).toEqual([]);
	});
});
