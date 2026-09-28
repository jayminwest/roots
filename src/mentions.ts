// Deterministic mention detection (SPEC "Mentions → proposals", rule 1). Pure.
//
// A changed line mentions another idea when it contains:
//   - the idea's id (`r-a1b2`), or
//   - its slug as a phrase: `offline-sync`, "offline sync", "the offline sync
//     thing" (slugs of 2+ words; a trailing uniqueness counter like `-2` is
//     ignored; one-word slugs are too common to match on their own), or
//   - a distinctive phrase from its statement: any 3 consecutive statement
//     words, at least 2 of which are not stopwords.
// Matching is case-insensitive and on word boundaries. Only ideas are
// targets (sprouts are agent content; composted ideas are retired).

import type { ChangedLine } from "./diff.ts";

export interface MentionTarget {
	id: string;
	slug: string;
	statement: string;
}

export type MentionVia = "id" | "slug" | "phrase";

export interface Mention {
	target: string;
	/** 1-based line in the mentioning file. */
	line: number;
	/** The full mentioning line, as written. */
	text: string;
	via: MentionVia;
	/** What matched (id, slug phrase, or statement phrase). */
	match: string;
}

const STOPWORDS = new Set(
	(
		"a an the and or but if then so to of in on at by for with from into onto over under " +
		"is are was were be been being it its this that these those there here we i you he she " +
		"they them our my your their not no do does did has have had can could should would will " +
		"just very all any some each every more most less as than too also only about up down out " +
		"when where what which who why how while always never"
	).split(" "),
);

export function tokens(text: string): string[] {
	return text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

function isContent(word: string): boolean {
	return !STOPWORDS.has(word) && word.length > 1;
}

/** Slug words used as a phrase, or null when the slug is not distinctive. */
export function slugPhrase(slug: string): string[] | null {
	const parts = slug.split("-").filter((p) => p !== "");
	if (parts.length >= 3 && /^\d+$/.test(parts[parts.length - 1] ?? "")) parts.pop();
	if (parts.length < 2 || parts.filter(isContent).length === 0) return null;
	return parts;
}

/** Distinctive 3-word phrases from a statement. */
export function statementPhrases(statement: string): string[][] {
	const words = tokens(statement);
	const out: string[][] = [];
	for (let i = 0; i + 3 <= words.length; i++) {
		const gram = words.slice(i, i + 3);
		if (gram.filter(isContent).length >= 2) out.push(gram);
	}
	return out;
}

function containsPhrase(lineWords: string, phrase: string[]): boolean {
	return ` ${lineWords} `.includes(` ${phrase.join(" ")} `);
}

function idPattern(id: string): RegExp {
	return new RegExp(`(^|[^a-z0-9-])${id.replace(/-/g, "\\-")}(?![a-z0-9])`, "i");
}

interface CompiledTarget {
	target: MentionTarget;
	id: RegExp;
	slug: string[] | null;
	phrases: string[][];
}

function compile(target: MentionTarget): CompiledTarget {
	return {
		target,
		id: idPattern(target.id),
		slug: slugPhrase(target.slug),
		phrases: statementPhrases(target.statement),
	};
}

function matchLine(
	c: CompiledTarget,
	line: ChangedLine,
): Omit<Mention, "target" | "line" | "text"> | null {
	if (c.id.test(line.text)) return { via: "id", match: c.target.id };
	const words = tokens(line.text).join(" ");
	if (c.slug && containsPhrase(words, c.slug)) return { via: "slug", match: c.slug.join(" ") };
	const phrase = c.phrases.find((p) => containsPhrase(words, p));
	return phrase ? { via: "phrase", match: phrase.join(" ") } : null;
}

/** The first mention of each target in `lines` (targets other than `selfId`). */
export function findMentions(
	lines: readonly ChangedLine[],
	targets: readonly MentionTarget[],
	selfId: string,
): Mention[] {
	const out: Mention[] = [];
	for (const t of targets) {
		if (t.id === selfId) continue;
		const c = compile(t);
		for (const line of lines) {
			const m = matchLine(c, line);
			if (!m) continue;
			out.push({ target: t.id, line: line.line, text: line.text, ...m });
			break;
		}
	}
	return out;
}
