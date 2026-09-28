// Deterministic question rules (SPEC "Questions: guiding thinking"). Pure.
//
// Each rule looks at one idea and may produce a question candidate. Rules
// never re-ask a question the human dismissed for that idea, and never
// duplicate one that is still open or snoozed. Content rules (missing-done,
// missing-scope, too-big, tension-open) ask once: after an answer they stay
// quiet. Time rules (orphan, stale) may ask again once their threshold has
// passed since the last answer, because the answer itself was a touch.
//
// Thresholds come from config.yaml `questions:` (see QuestionThresholds).

import type { QuestionThresholds } from "./config.ts";
import { parseProse } from "./prose.ts";
import type { EdgeRecord, NodeRecord, QuestionRecord } from "./types.ts";

/** Rule names in the order a session asks them. */
export const RULES = [
	"stale",
	"missing-done",
	"missing-scope",
	"too-big",
	"tension-open",
	"orphan",
] as const;

export type RuleName = (typeof RULES)[number];

const TIME_RULES: ReadonlySet<RuleName> = new Set(["orphan", "stale"]);

export interface RuleCandidate {
	rule: RuleName;
	text: string;
	/** Rule-specific subject (tension-open: the edge id). */
	ref?: string;
}

export interface RuleContext {
	node: NodeRecord;
	/** Current idea.md content. */
	text: string;
	/** Accepted edges that touch the node. */
	edges: EdgeRecord[];
	/** Look up another node (for tension-open wording and composted checks). */
	lookup: (id: string) => NodeRecord | undefined;
	/** Number of this session, counting the one about to start (completed + 1). */
	sessionNumber: number;
	/** Last human activity on the idea (ISO). */
	lastTouched: string;
	now: Date;
	thresholds: QuestionThresholds;
}

const DAY_MS = 86_400_000;

export function daysSince(iso: string, now: Date): number {
	const t = Date.parse(iso);
	return Number.isNaN(t) ? 0 : (now.getTime() - t) / DAY_MS;
}

const DONE_RE =
	/\b(done|finished|complete[ds]?|success(ful)?|ship(s|ped)?|good enough|definition of done)\b/i;
const SCOPE_RE = /\b(not|won['’]?t|out of scope|non-goals?)\b/i;
const AND_RE = /\band\b/i;

export function hasDoneLanguage(text: string): boolean {
	return DONE_RE.test(text);
}

export function hasScopeLanguage(text: string): boolean {
	return SCOPE_RE.test(text);
}

export function bodyLineCount(text: string): number {
	return parseProse(text)
		.body.split("\n")
		.filter((l) => l.trim() !== "").length;
}

export function looksTooBig(text: string, maxBodyLines: number): boolean {
	return AND_RE.test(parseProse(text).statement) || bodyLineCount(text) > maxBodyLines;
}

function contentRules(ctx: RuleContext): RuleCandidate[] {
	const out: RuleCandidate[] = [];
	const t = ctx.thresholds;
	if (ctx.sessionNumber >= t.doneAfterSessions && !hasDoneLanguage(ctx.text)) {
		out.push({ rule: "missing-done", text: "What would make this done?" });
	}
	if (!hasScopeLanguage(ctx.text)) {
		out.push({ rule: "missing-scope", text: "What is this not trying to solve?" });
	}
	if (looksTooBig(ctx.text, t.bigBodyLines)) {
		out.push({ rule: "too-big", text: "Is this one idea or two?" });
	}
	return out;
}

function tensionRules(ctx: RuleContext): RuleCandidate[] {
	const out: RuleCandidate[] = [];
	for (const e of ctx.edges) {
		if (e.rel !== "tension") continue;
		const other = ctx.lookup(e.from === ctx.node.id ? e.to : e.from);
		if (!other || other.status === "composted") continue;
		out.push({
			rule: "tension-open",
			text: `Which of these wins when it conflicts with ${other.slug}?`,
			ref: e.id,
		});
	}
	return out;
}

function timeRules(ctx: RuleContext): RuleCandidate[] {
	const out: RuleCandidate[] = [];
	const t = ctx.thresholds;
	const stale =
		ctx.node.status === "committed" && daysSince(ctx.lastTouched, ctx.now) >= t.staleAfterDays;
	if (stale) out.push({ rule: "stale", text: "Is this still true?" });
	const orphan =
		ctx.edges.length === 0 && daysSince(ctx.node.createdAt, ctx.now) >= t.orphanAfterDays;
	if (orphan) out.push({ rule: "orphan", text: "What does this serve?" });
	return out;
}

/** Every rule that fires for the idea right now, in session order. */
export function evaluateRules(ctx: RuleContext): RuleCandidate[] {
	if (ctx.node.kind !== "idea" || ctx.node.status === "composted") return [];
	const all = [...contentRules(ctx), ...tensionRules(ctx), ...timeRules(ctx)];
	return all.sort((a, b) => RULES.indexOf(a.rule) - RULES.indexOf(b.rule));
}

export function ruleActor(rule: RuleName): string {
	return `roots:${rule}`;
}

/** The rule behind a question, or null for agent/other questions. */
export function ruleOf(q: Pick<QuestionRecord, "by">): RuleName | null {
	const m = /^roots:(.+)$/.exec(q.by);
	const name = m?.[1];
	return name && (RULES as readonly string[]).includes(name) ? (name as RuleName) : null;
}

export function questionKey(q: { node: string; by: string; ref?: string }): string {
	return `${q.node}|${q.by}|${q.ref ?? ""}`;
}

function thresholdDays(rule: RuleName, t: QuestionThresholds): number {
	return rule === "stale" ? t.staleAfterDays : t.orphanAfterDays;
}

/** True when an existing question with the same key means the rule stays quiet. */
function blocks(q: QuestionRecord, cand: RuleCandidate, ctx: RuleContext): boolean {
	if (q.status !== "answered") return true; // open, snoozed, dismissed (permanent)
	if (!TIME_RULES.has(cand.rule)) return true;
	const at = q.answeredAt ?? q.createdAt;
	return daysSince(at, ctx.now) < thresholdDays(cand.rule, ctx.thresholds);
}

/** Candidates that should become new questions, given what was already asked. */
export function newCandidates(ctx: RuleContext, existing: QuestionRecord[]): RuleCandidate[] {
	const byKey = new Map<string, QuestionRecord[]>();
	for (const q of existing) {
		if (q.node !== ctx.node.id) continue;
		const k = questionKey(q);
		byKey.set(k, [...(byKey.get(k) ?? []), q]);
	}
	return evaluateRules(ctx).filter((cand) => {
		const key = questionKey({ node: ctx.node.id, by: ruleActor(cand.rule), ref: cand.ref });
		return !(byKey.get(key) ?? []).some((q) => blocks(q, cand, ctx));
	});
}
