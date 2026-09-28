// Node directories and prose files (idea.md / sprout.md).
//
// Directory name: `<hex>-<slug>`. Tools find a node's directory by its hex
// prefix (the part before the first `-`), so a human's manual `mv` in the
// shell never loses the file. The statement is the first non-empty line of
// the prose file. It is always read from disk and never cached in JSONL.

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { hexOf } from "./ids.ts";
import { kindDir, proseFileName, type RootsPaths } from "./paths.ts";
import type { NodeRecord } from "./types.ts";

const HEX_RE = /^[0-9a-f]{4,8}$/;

/** hex → directory names (sorted) found under one parent directory. */
export type DirIndex = Map<string, string[]>;

export interface NodeDirs {
	idea: DirIndex;
	sprout: DirIndex;
}

/** Hex part of a node directory name, or null when it isn't one. */
export function dirHex(name: string): string | null {
	const dash = name.indexOf("-");
	const hex = dash === -1 ? name : name.slice(0, dash);
	return HEX_RE.test(hex) ? hex : null;
}

/** Slug part of a node directory name ("" when the dir is just the hex). */
export function dirSlug(name: string): string {
	const dash = name.indexOf("-");
	return dash === -1 ? "" : name.slice(dash + 1);
}

export function scanDir(parent: string): DirIndex {
	const index: DirIndex = new Map();
	if (!existsSync(parent)) return index;
	for (const entry of readdirSync(parent, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		const hex = dirHex(entry.name);
		if (!hex) continue;
		const list = index.get(hex) ?? [];
		list.push(entry.name);
		index.set(hex, list.sort());
	}
	return index;
}

export function scanNodeDirs(paths: RootsPaths): NodeDirs {
	return { idea: scanDir(paths.human), sprout: scanDir(paths.sprouts) };
}

export function dirNameFor(node: Pick<NodeRecord, "id" | "slug">): string {
	return `${hexOf(node.id)}-${node.slug}`;
}

/** Directory names on disk for this node's hex. */
export function dirCandidates(dirs: NodeDirs, node: Pick<NodeRecord, "id" | "kind">): string[] {
	return dirs[node.kind].get(hexOf(node.id)) ?? [];
}

/** Absolute directory for a node: the canonical name if present, else any hex match. */
export function locateNodeDir(
	paths: RootsPaths,
	node: Pick<NodeRecord, "id" | "kind" | "slug">,
	dirs: NodeDirs = scanNodeDirs(paths),
): string | null {
	const names = dirCandidates(dirs, node);
	const canonical = dirNameFor(node);
	const name = names.includes(canonical) ? canonical : names[0];
	return name === undefined ? null : join(kindDir(paths, node.kind), name);
}

export function canonicalNodeDir(
	paths: RootsPaths,
	node: Pick<NodeRecord, "id" | "kind" | "slug">,
) {
	return join(kindDir(paths, node.kind), dirNameFor(node));
}

export interface Prose {
	statement: string;
	body: string;
}

/** First non-empty line is the statement; the rest (leading blanks trimmed) is the body. */
export function parseProse(text: string): Prose {
	const lines = text.split(/\r?\n/);
	const idx = lines.findIndex((l) => l.trim() !== "");
	if (idx === -1) return { statement: "", body: "" };
	const statement = (lines[idx] ?? "").trim();
	const body = lines
		.slice(idx + 1)
		.join("\n")
		.replace(/^\s*\n/, "")
		.trimEnd();
	return { statement, body };
}

export function contentHash(text: string): string {
	return `sha256:${createHash("sha256").update(text).digest("hex")}`;
}

export interface NodeProse {
	/** Absolute path of the prose file, or null when the directory is missing. */
	path: string | null;
	exists: boolean;
	text: string;
	statement: string;
	body: string;
}

export function readNodeProse(
	paths: RootsPaths,
	node: Pick<NodeRecord, "id" | "kind" | "slug">,
	dirs?: NodeDirs,
): NodeProse {
	const dir = locateNodeDir(paths, node, dirs);
	const path = dir === null ? null : join(dir, proseFileName(node.kind));
	if (path === null || !existsSync(path)) {
		return { path, exists: false, text: "", statement: "", body: "" };
	}
	const text = readFileSync(path, "utf8");
	return { path, exists: true, text, ...parseProse(text) };
}
