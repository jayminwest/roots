import { describe, expect, test } from "bun:test";
import { DEFAULT_QUESTION_THRESHOLDS } from "./config.ts";
import {
	evaluateRules,
	hasDoneLanguage,
	hasScopeLanguage,
	looksTooBig,
	newCandidates,
	questionKey,
	type RuleContext,
	ruleOf,
} from "./rules.ts";
import type { EdgeRecord, NodeRecord, QuestionRecord } from "./types.ts";

const NOW = new Date("2026-09-28T12:00:00Z");

function node(over: Partial<NodeRecord> = {}): NodeRecord {
	return {
		type: "node",
		id: "r-a1b2",
		kind: "idea",
		slug: "offline-sync",
		status: "planted",
		author: "human:t",
		createdAt: "2026-09-28T10:00:00Z",
		...over,
	};
}

function ctx(over: Partial<RuleContext> = {}): RuleContext {
	return {
		node: node(),
		text: "Sync works offline\n",
		edges: [],
		lookup: () => undefined,
		sessionNumber: 1,
		lastTouched: "2026-09-28T10:00:00Z",
		now: NOW,
		thresholds: DEFAULT_QUESTION_THRESHOLDS,
		...over,
	};
}

const rules = (c: RuleContext) => evaluateRules(c).map((r) => r.rule);

function question(over: Partial<QuestionRecord>): QuestionRecord {
	return {
		id: "q-0001",
		node: "r-a1b2",
		text: "?",
		by: "roots:missing-done",
		status: "open",
		createdAt: "2026-09-28T10:00:00Z",
		...over,
	};
}

describe("rule predicates", () => {
	test("done / scope / too-big language", () => {
		expect(hasDoneLanguage("Done means: nothing lost")).toBe(true);
		expect(hasDoneLanguage("It has shipped when x")).toBe(true);
		expect(hasDoneLanguage("Sync is fast")).toBe(false);
		expect(hasScopeLanguage("Not trying to solve: collab")).toBe(true);
		expect(hasScopeLanguage("We won’t do realtime")).toBe(true);
		expect(hasScopeLanguage("Nothing here")).toBe(false);
		expect(looksTooBig("Fast and offline\n", 30)).toBe(true);
		expect(looksTooBig("Android sync\n", 30)).toBe(false);
		expect(looksTooBig("One\n\na\nb\nc\n", 2)).toBe(true);
	});
});

describe("evaluateRules", () => {
	test("fresh one-liner: done + scope, in session order", () => {
		expect(rules(ctx())).toEqual(["missing-done", "missing-scope"]);
	});

	test("missing-done waits for the Nth session", () => {
		const t = { ...DEFAULT_QUESTION_THRESHOLDS, doneAfterSessions: 3 };
		expect(rules(ctx({ thresholds: t, sessionNumber: 2 }))).not.toContain("missing-done");
		expect(rules(ctx({ thresholds: t, sessionNumber: 3 }))).toContain("missing-done");
	});

	test("orphan after N days without edges; stale only when committed", () => {
		const old = node({ createdAt: "2026-09-01T00:00:00Z", status: "committed" });
		const r = rules(
			ctx({ node: old, text: "X is done, not Y\n", lastTouched: "2026-08-01T00:00:00Z" }),
		);
		expect(r).toEqual(["stale", "orphan"]);
		const shaping = node({ createdAt: "2026-09-01T00:00:00Z", status: "shaping" });
		expect(
			rules(ctx({ node: shaping, text: "done, not\n", lastTouched: "2026-01-01T00:00:00Z" })),
		).toEqual(["orphan"]);
	});

	test("tension-open once per live tension edge, naming the other idea", () => {
		const other = node({ id: "r-e5f6", slug: "server-authoritative" });
		const edges: EdgeRecord[] = [
			{
				type: "edge",
				id: "e-1",
				from: "r-a1b2",
				to: "r-e5f6",
				rel: "tension",
				by: "h",
				createdAt: "",
			},
			{
				type: "edge",
				id: "e-2",
				from: "r-a1b2",
				to: "r-dead",
				rel: "tension",
				by: "h",
				createdAt: "",
			},
		];
		const lookup = (id: string) =>
			id === "r-e5f6" ? other : id === "r-dead" ? node({ status: "composted" }) : undefined;
		const out = evaluateRules(ctx({ text: "done, not\n", edges, lookup }));
		expect(out).toEqual([
			{
				rule: "tension-open",
				text: "Which of these wins when it conflicts with server-authoritative?",
				ref: "e-1",
			},
		]);
	});

	test("composted ideas and sprouts get nothing", () => {
		expect(rules(ctx({ node: node({ status: "composted" }) }))).toEqual([]);
		expect(rules(ctx({ node: node({ kind: "sprout", status: "open" }) }))).toEqual([]);
	});
});

describe("newCandidates", () => {
	test("open, snoozed and dismissed questions block; answered content rules stay quiet", () => {
		for (const status of ["open", "snoozed", "dismissed", "answered"] as const) {
			const out = newCandidates(ctx(), [question({ status, answeredAt: NOW.toISOString() })]);
			expect(out.map((c) => c.rule)).toEqual(["missing-scope"]);
		}
	});

	test("questions on other ideas do not block", () => {
		const out = newCandidates(ctx(), [question({ node: "r-other" })]);
		expect(out.map((c) => c.rule)).toEqual(["missing-done", "missing-scope"]);
	});

	test("time rules re-ask once the threshold passed since the answer", () => {
		const c = ctx({ node: node({ createdAt: "2026-01-01T00:00:00Z" }), text: "done, not\n" });
		const recent = question({
			by: "roots:orphan",
			status: "answered",
			answeredAt: "2026-09-27T00:00:00Z",
		});
		expect(newCandidates(c, [recent])).toEqual([]);
		const old = { ...recent, answeredAt: "2026-09-01T00:00:00Z" };
		expect(newCandidates(c, [old]).map((x) => x.rule)).toEqual(["orphan"]);
		expect(newCandidates(c, [{ ...old, status: "dismissed" }])).toEqual([]);
	});

	test("ruleOf and questionKey", () => {
		expect(ruleOf({ by: "roots:too-big" })).toBe("too-big");
		expect(ruleOf({ by: "roots:mention" })).toBeNull();
		expect(ruleOf({ by: "agent:x" })).toBeNull();
		expect(questionKey({ node: "r-1", by: "roots:tension-open", ref: "e-1" })).toBe(
			"r-1|roots:tension-open|e-1",
		);
	});
});
