import { describe, expect, test } from "bun:test";
import {
	findNode,
	graphFromRecords,
	hasAnyEdge,
	incomingEdges,
	isAnchor,
	isOrphan,
	outgoingEdges,
	readGraph,
	replaceNode,
	updateGraph,
} from "./graph.ts";
import { rootsPaths } from "./paths.ts";
import { tempDir } from "./test-helpers.ts";
import type { EdgeRecord, GraphRecord, NodeRecord } from "./types.ts";

const at = "2026-09-28T10:00:00Z";
const idea = (id: string, status: NodeRecord["status"] = "planted"): NodeRecord => ({
	type: "node",
	id,
	kind: "idea",
	slug: id,
	status,
	author: "human:a",
	createdAt: at,
});
const edge = (id: string, from: string, to: string, rel: EdgeRecord["rel"]): EdgeRecord => ({
	type: "edge",
	id,
	from,
	to,
	rel,
	by: "human:a",
	createdAt: at,
});

describe("graph", () => {
	test("dedup nodes and edges separately, last wins", () => {
		const g = graphFromRecords([
			idea("r-1"),
			edge("e-1", "r-1", "r-2", "serves"),
			idea("r-2"),
			idea("r-1", "shaping"),
		] as GraphRecord[]);
		expect(g.nodes.map((n) => [n.id, n.status])).toEqual([
			["r-1", "shaping"],
			["r-2", "planted"],
		]);
		expect(g.edges).toHaveLength(1);
	});

	test("anchors, orphans, edge queries", () => {
		const g = graphFromRecords([
			idea("r-1"),
			idea("r-2"),
			idea("r-3"),
			idea("r-4", "composted"),
			edge("e-1", "r-1", "r-2", "serves"),
			edge("e-2", "r-2", "r-3", "tension"),
		]);
		const n = (id: string) => findNode(g, id) as NodeRecord;
		expect(isAnchor(g, n("r-1"))).toBe(false);
		expect(isAnchor(g, n("r-2"))).toBe(true);
		expect(isAnchor(g, n("r-4"))).toBe(false);
		expect(isOrphan(g, n("r-4"))).toBe(true);
		expect(isOrphan(g, n("r-3"))).toBe(false);
		expect(hasAnyEdge(g, "r-3")).toBe(true);
		expect(outgoingEdges(g, "r-2").map((e) => e.id)).toEqual(["e-2"]);
		expect(incomingEdges(g, "r-2").map((e) => e.id)).toEqual(["e-1"]);
		replaceNode(g, idea("r-5"));
		replaceNode(g, idea("r-5", "built"));
		expect(g.nodes.filter((x) => x.id === "r-5").map((x) => x.status)).toEqual(["built"]);
	});

	test("updateGraph persists only on write and compacts", async () => {
		const paths = rootsPaths(tempDir());
		await updateGraph(paths, (g) => {
			g.nodes.push(idea("r-1"));
			return { write: false, result: null };
		});
		expect(readGraph(paths).nodes).toEqual([]);
		await updateGraph(paths, (g) => {
			g.nodes.push(idea("r-1"), idea("r-1", "built"));
			return { write: true, result: null };
		});
		expect(readGraph(paths).nodes).toEqual([idea("r-1", "built")]);
	});
});
