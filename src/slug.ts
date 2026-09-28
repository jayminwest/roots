// Slugs: kebab-case names derived from an idea's first line.

const STOPWORDS = new Set([
	"a",
	"an",
	"the",
	"and",
	"or",
	"but",
	"of",
	"to",
	"in",
	"on",
	"at",
	"for",
	"with",
	"by",
	"is",
	"are",
	"was",
	"were",
	"be",
	"been",
	"it",
	"its",
	"this",
	"that",
	"we",
	"i",
	"our",
	"should",
	"must",
	"can",
	"will",
	"so",
	"as",
	"from",
	"into",
]);

export const SLUG_MAX_WORDS = 4;
export const SLUG_MAX_LENGTH = 40;

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Slugs that would be mistaken for an id during resolution. */
const ID_LIKE_RE = /^(r|s|p|q|e|ss)-[0-9a-f]{4,8}$/;

function words(text: string): string[] {
	return text
		.normalize("NFKD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim()
		.split(" ")
		.filter((w) => w !== "");
}

function joinWithin(parts: string[], maxLength: number): string {
	let out = "";
	for (const w of parts) {
		const next = out === "" ? w : `${out}-${w}`;
		if (next.length > maxLength) break;
		out = next;
	}
	// A single over-long word: hard cut.
	if (out === "" && parts[0]) out = parts[0].slice(0, maxLength);
	return out;
}

/** Kebab-case every word (used for actor names like "Jaymin West" → "jaymin-west"). */
export function kebab(text: string): string {
	return words(text).join("-");
}

/**
 * Derive a short slug from a statement: drop stopwords (unless that leaves
 * nothing), keep the first few words, cap the length at a word boundary.
 */
export function slugify(text: string): string {
	const all = words(text);
	const content = all.filter((w) => !STOPWORDS.has(w));
	const chosen = (content.length > 0 ? content : all).slice(0, SLUG_MAX_WORDS);
	return joinWithin(chosen, SLUG_MAX_LENGTH);
}

export function isValidSlug(s: string): boolean {
	return s.length <= 64 && SLUG_RE.test(s) && !ID_LIKE_RE.test(s);
}

/** Append -2, -3, ... until the slug is not in `taken`. */
export function uniqueSlug(base: string, taken: ReadonlySet<string>): string {
	if (!taken.has(base)) return base;
	for (let n = 2; ; n++) {
		const candidate = `${base}-${n}`;
		if (!taken.has(candidate)) return candidate;
	}
}
