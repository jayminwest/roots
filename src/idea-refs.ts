// Roots idea ids cited in free text (seeds issues, mulch records, commit
// messages). Pure.
//
// A citation is the exact token `r-<4..8 hex>` (lowercase, as roots prints
// ids) standing on its own: not glued to a letter, digit, `_` or `-` on
// either side. So "fixes r-a1b2." and "(r-a1b2)" cite r-a1b2, while
// "sr-a1b2", "r-a1b2c" (too long a match is a different id) and
// "r-a1b2-x" do not.

const TOKEN_RE = /(?<![A-Za-z0-9_-])r-[0-9a-f]{4,8}(?![A-Za-z0-9_-])/g;

/** Idea ids cited in `text`, in first-seen order, without duplicates. */
export function citedIdeaIds(text: string): string[] {
	return [...new Set(text.match(TOKEN_RE) ?? [])];
}

/** True when `text` cites exactly `id`. */
export function citesIdea(text: string, id: string): boolean {
	return citedIdeaIds(text).includes(id);
}

const MAX_DEPTH = 6;

/** Every string inside a JSON value (objects and arrays walked, depth-limited). */
export function stringsIn(value: unknown, depth = 0, into: string[] = []): string[] {
	if (typeof value === "string") into.push(value);
	else if (depth < MAX_DEPTH && Array.isArray(value)) {
		for (const v of value) stringsIn(v, depth + 1, into);
	} else if (depth < MAX_DEPTH && typeof value === "object" && value !== null) {
		for (const v of Object.values(value)) stringsIn(v, depth + 1, into);
	}
	return into;
}

/** First line of `text`, cut to `max` characters with an ellipsis. */
export function shortLine(text: string, max = 100): string {
	const line = (text.split("\n").find((l) => l.trim() !== "") ?? "").trim();
	return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}
