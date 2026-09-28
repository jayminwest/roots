// ID generation and parsing.
//
// Node IDs are `<prefix>-<hex>` where hex is 4 chars, extended to 6 when 4-char
// candidates keep colliding (SPEC "IDs and slugs"). Ideas (r-) and sprouts
// (s-) share one hex namespace so a bare hex like `a1b2` always resolves to a
// single node and directory names never clash.

import { randomBytes } from "node:crypto";

export const ID_PREFIX = {
	idea: "r",
	sprout: "s",
	proposal: "p",
	question: "q",
	edge: "e",
	session: "ss",
	heading: "h",
	flow: "fl",
} as const;

export type IdPrefix = (typeof ID_PREFIX)[keyof typeof ID_PREFIX];

const ID_RE = /^(r|s|p|q|e|ss|h|fl)-([0-9a-f]{4,8})$/;

export type RandomHex = (length: number) => string;

export const randomHex: RandomHex = (length) =>
	randomBytes(Math.ceil(length / 2))
		.toString("hex")
		.slice(0, length);

/** Attempts at 4 hex chars before extending to 6 (then 8 as a last resort). */
export const SHORT_ATTEMPTS = 20;

/**
 * Generate a hex string not in `taken`. Tries 4 chars first, then 6, then 8.
 * `rand` is injectable for tests.
 */
export function generateHex(taken: ReadonlySet<string>, rand: RandomHex = randomHex): string {
	for (const len of [4, 6]) {
		for (let i = 0; i < SHORT_ATTEMPTS; i++) {
			const hex = rand(len);
			if (!taken.has(hex)) return hex;
		}
	}
	for (;;) {
		const hex = rand(8);
		if (!taken.has(hex)) return hex;
	}
}

export function makeId(prefix: IdPrefix, hex: string): string {
	return `${prefix}-${hex}`;
}

/** Generate a full id whose hex part is not in `takenHex`. */
export function generateId(
	prefix: IdPrefix,
	takenHex: ReadonlySet<string>,
	rand: RandomHex = randomHex,
): string {
	return makeId(prefix, generateHex(takenHex, rand));
}

/** Hex part of an id, e.g. `r-a1b2` → `a1b2`. */
export function hexOf(id: string): string {
	const dash = id.indexOf("-");
	return dash === -1 ? id : id.slice(dash + 1);
}

export function prefixOf(id: string): string | undefined {
	return ID_RE.exec(id)?.[1];
}

export function isId(s: string, prefix?: IdPrefix): boolean {
	const m = ID_RE.exec(s);
	return m !== null && (prefix === undefined || m[1] === prefix);
}

export function hexSet(ids: Iterable<string>): Set<string> {
	const out = new Set<string>();
	for (const id of ids) out.add(hexOf(id));
	return out;
}
