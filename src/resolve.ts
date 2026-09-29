// Resolve a user-supplied node reference to exactly one node.
//
// Accepted forms (roots-4143): full id `r-a1b2`, bare hex `a1b2`,
// slug `offline-sync`, or a unique prefix of any of them. Exact matches win
// over prefix matches, in the order id > hex > slug. More than one match is
// an AmbiguousError listing the candidates.

import { AmbiguousError, NotFoundError, UsageError } from "./errors.ts";
import { hexOf } from "./ids.ts";
import { closest } from "./suggestions.ts";
import type { NodeKind, NodeRecord } from "./types.ts";

export interface ResolveOptions {
	/** Only accept nodes of this kind. */
	kind?: NodeKind;
}

function describe(n: NodeRecord): string {
	return `${n.id} ${n.slug}`;
}

function ambiguous(query: string, matches: NodeRecord[]): AmbiguousError {
	const list = matches.map(describe);
	return new AmbiguousError(
		`"${query}" is ambiguous; it matches: ${list.join(", ")}`,
		matches.map((m) => m.id),
	);
}

function pick(query: string, matches: NodeRecord[]): NodeRecord | undefined {
	if (matches.length > 1) throw ambiguous(query, matches);
	return matches[0];
}

/** All nodes a query could refer to, following the precedence rules. */
export function matchNodes(nodes: readonly NodeRecord[], query: string): NodeRecord[] {
	const q = query.trim().toLowerCase();
	if (q === "") return [];
	const byId = nodes.filter((n) => n.id === q);
	if (byId.length > 0) return byId;
	const byHex = nodes.filter((n) => hexOf(n.id) === q);
	if (byHex.length > 0) return byHex;
	const bySlug = nodes.filter((n) => n.slug === q);
	if (bySlug.length > 0) return bySlug;
	return nodes.filter(
		(n) => n.id.startsWith(q) || hexOf(n.id).startsWith(q) || n.slug.startsWith(q),
	);
}

function notFound(nodes: readonly NodeRecord[], query: string, kind?: NodeKind): NotFoundError {
	const what = kind ?? "node";
	const hint = closest(
		query.toLowerCase(),
		nodes.map((n) => n.slug),
		3,
	);
	const suffix = hint ? ` Did you mean ${hint}?` : "";
	return new NotFoundError(`no ${what} matches "${query}".${suffix}`, { query });
}

export function resolveNode(
	nodes: readonly NodeRecord[],
	query: string,
	opts: ResolveOptions = {},
): NodeRecord {
	if (query.trim() === "") throw new UsageError("empty node reference");
	const pool = opts.kind ? nodes.filter((n) => n.kind === opts.kind) : nodes;
	const found = pick(query, matchNodes(pool, query));
	if (found) return found;
	if (opts.kind) {
		const other = matchNodes(nodes, query);
		if (other.length === 1 && other[0]) {
			throw new UsageError(`${other[0].id} is a ${other[0].kind}, not an ${opts.kind}`);
		}
	}
	throw notFound(pool, query, opts.kind);
}
