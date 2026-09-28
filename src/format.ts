// Human-readable rendering of nodes and edges (shared by show/list/log and
// later by think/tend/view).

import type { Colors } from "./color.ts";
import type { EdgeRecord, NodeRecord, NodeStatus } from "./types.ts";

export function statusColor(c: Colors, status: NodeStatus): (s: string) => string {
	switch (status) {
		case "planted":
			return c.green;
		case "shaping":
			return c.cyan;
		case "committed":
			return c.magenta;
		case "built":
			return c.blue;
		case "open":
			return c.yellow;
		default:
			return c.dim;
	}
}

export function formatStatus(c: Colors, status: NodeStatus): string {
	return statusColor(c, status)(status);
}

/** `r-a1b2 offline-sync`, with sprouts labeled [agent] and dimmed. */
export function formatNodeRef(c: Colors, node: Pick<NodeRecord, "id" | "slug" | "kind">): string {
	const ref = `${c.id(node.id)} ${node.slug}`;
	return node.kind === "sprout" ? `${c.dim("[agent]")} ${c.dim(ref)}` : ref;
}

export function truncate(s: string, max: number): string {
	const chars = [...s];
	return chars.length <= max ? s : `${chars.slice(0, max - 1).join("")}…`;
}

export type EdgeDirection = "out" | "in";

/** Label + arrow for an edge seen from one of its ends (SPEC think/tend mockups). */
export function edgeLabel(
	rel: EdgeRecord["rel"],
	dir: EdgeDirection,
): { label: string; arrow: string } {
	if (rel === "tension") return { label: "tension", arrow: "↔" };
	if (dir === "out") return { label: rel, arrow: "→" };
	const inbound: Record<string, string> = {
		serves: "served by",
		replaces: "replaced by",
		derives: "adopted as",
	};
	return { label: inbound[rel] ?? rel, arrow: "←" };
}

export const EDGE_LABEL_WIDTH = 11;
