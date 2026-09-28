// graph.jsonl access and pure graph queries.

import type { RootsPaths } from "./paths.ts";
import { dedupById, readJsonlFile, withLock, writeJsonlFile } from "./store.ts";
import type { EdgeRecord, Graph, GraphRecord, NodeRecord } from "./types.ts";

export function graphFromRecords(records: GraphRecord[]): Graph {
	const nodes = dedupById(records.filter((r): r is NodeRecord => r.type === "node"));
	const edges = dedupById(records.filter((r): r is EdgeRecord => r.type === "edge"));
	return { nodes, edges };
}

export function readGraph(paths: RootsPaths): Graph {
	return graphFromRecords(readJsonlFile<GraphRecord>(paths.graph));
}

export function graphRecords(graph: Graph): GraphRecord[] {
	return [...graph.nodes, ...graph.edges];
}

export interface GraphUpdate<R> {
	/** Rewrite graph.jsonl with `graph` (compacted). */
	write: boolean;
	result: R;
}

/**
 * Locked read-modify-write of graph.jsonl. `fn` receives the current graph
 * and may mutate it in place; return `write: true` to persist.
 */
export async function updateGraph<R>(
	paths: RootsPaths,
	fn: (graph: Graph) => Promise<GraphUpdate<R>> | GraphUpdate<R>,
): Promise<R> {
	return withLock(paths.graph, async () => {
		const graph = readGraph(paths);
		const { write, result } = await fn(graph);
		if (write) await writeJsonlFile(paths.graph, graphRecords(graph));
		return result;
	});
}

export function replaceNode(graph: Graph, node: NodeRecord): void {
	const idx = graph.nodes.findIndex((n) => n.id === node.id);
	if (idx === -1) graph.nodes.push(node);
	else graph.nodes[idx] = node;
}

export function findNode(graph: Graph, id: string): NodeRecord | undefined {
	return graph.nodes.find((n) => n.id === id);
}

export function outgoingEdges(graph: Graph, id: string): EdgeRecord[] {
	return graph.edges.filter((e) => e.from === id);
}

export function incomingEdges(graph: Graph, id: string): EdgeRecord[] {
	return graph.edges.filter((e) => e.to === id);
}

export function hasAnyEdge(graph: Graph, id: string): boolean {
	return graph.edges.some((e) => e.from === id || e.to === id);
}

/** Ideas that are not composted and have no outgoing `serves`. */
export function isAnchor(graph: Graph, node: NodeRecord): boolean {
	if (node.kind !== "idea" || node.status === "composted") return false;
	return !graph.edges.some((e) => e.from === node.id && e.rel === "serves");
}

/** Nodes with no edges in either direction. */
export function isOrphan(graph: Graph, node: NodeRecord): boolean {
	return !hasAnyEdge(graph, node.id);
}
