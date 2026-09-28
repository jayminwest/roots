import { describe, expect, test } from "bun:test";
import type { IdeaAttention } from "./attention.ts";
import {
	buildTrail,
	enterAction,
	type FlowCard,
	flowEvents,
	flowKey,
	initialCard,
	parseFlowKeys,
	rankPicks,
} from "./flow.ts";
import type { EventRecord, Graph, HeadingRecord, NodeRecord, QuestionRecord } from "./types.ts";

const H = "human:jay";
const at = "2026-09-28T22:00:00Z";
const now = new Date("2026-09-28T23:00:00Z");

function node(id: string, slug: string, status: NodeRecord["status"] = "shaping"): NodeRecord {
	return { id, kind: "idea", slug, status, author: H, createdAt: at, updatedAt: at } as NodeRecord;
}

const graph: Graph = {
	nodes: [
		node("r-aaaa", "principal"),
		node("r-bbbb", "no-secrets"),
		node("r-cccc", "grants", "planted"),
	],
	edges: [],
} as unknown as Graph;

function ev(type: EventRecord["type"], extra: Record<string, unknown> = {}, by = H): EventRecord {
	return { type, by, at, ...extra };
}

function q(id: string, nodeId: string, status: QuestionRecord["status"]): QuestionRecord {
	return { id, node: nodeId, text: "?", by: "agent:x", status, createdAt: at } as QuestionRecord;
}

describe("trail", () => {
	const events: EventRecord[] = [
		ev("session.end", { node: "r-cccc", answered: 9 }),
		ev("flow.start", { flow: "fl-1" }),
		ev("session.end", { node: "r-aaaa", answered: 3 }),
		ev("sprout", { node: "s-1" }, "agent:x"),
		ev("plant", { node: "r-dddd", sprout: "s-1" }),
		ev("accept", { proposal: "p-1" }),
		ev("plant", { node: "r-eeee" }),
		ev("session.end", { node: "r-bbbb", answered: 1 }),
		ev("flow.end", { flow: "fl-1" }),
		ev("session.end", { node: "r-cccc", answered: 1 }),
	];

	test("only this flow's human events count", () => {
		expect(flowEvents(events, "fl-1").map((e) => e.type)).toEqual([
			"session.end",
			"plant",
			"accept",
			"plant",
			"session.end",
		]);
		expect(flowEvents(events, "fl-2")).toEqual([]);
	});

	test("entries in touch order with answered and open counts", () => {
		const t = buildTrail(
			events,
			graph,
			[q("q-1", "r-bbbb", "open"), q("q-2", "r-bbbb", "answered")],
			"fl-1",
			now,
		);
		expect(t.entries).toEqual([
			{ id: "r-aaaa", slug: "principal", status: "shaping", sessions: 1, answered: 3, open: 0 },
			{ id: "r-bbbb", slug: "no-secrets", status: "shaping", sessions: 1, answered: 1, open: 1 },
		]);
		expect(t).toMatchObject({
			current: "r-bbbb",
			adopted: ["r-dddd"],
			planted: ["r-eeee"],
			accepted: 1,
		});
	});
});

function attention(n: NodeRecord, due = 0, candidates = 0, sessions = 1): IdeaAttention {
	return {
		node: n,
		statement: n.slug,
		due: Array.from({ length: due }, (_, i) => q(`q-${i}`, n.id, "open")),
		candidates: Array.from({ length: candidates }, () => ({ rule: "orphan" })),
		activity: { sessions, lastTouched: at },
	} as unknown as IdeaAttention;
}

describe("rankPicks", () => {
	const [a, b, c] = graph.nodes as [NodeRecord, NodeRecord, NodeRecord];
	const ranked = [attention(a, 1), attention(b, 0, 2), attention(c, 0, 1, 0)];

	test("untouched first, touched last, with reasons", () => {
		const picks = rankPicks(ranked, new Set(["r-aaaa"]), graph);
		expect(picks.map((p) => [p.id, p.reason])).toEqual([
			["r-bbbb", "2 new questions"],
			["r-cccc", "never thought"],
			["r-aaaa", "1 open question"],
		]);
	});

	test("the heading's next goes first; a live idea not in need is added", () => {
		expect(rankPicks(ranked, new Set(), graph, "r-cccc")[0]).toMatchObject({
			id: "r-cccc",
			fromHeading: true,
		});
		const g = { ...graph, nodes: [...graph.nodes, node("r-ffff", "calm")] } as Graph;
		expect(rankPicks(ranked, new Set(), g, "r-ffff")[0]).toMatchObject({
			id: "r-ffff",
			reason: "the heading suggests it",
		});
		expect(rankPicks(ranked, new Set(), g, "r-zzzz")).toHaveLength(3);
	});
});

describe("transition card keys", () => {
	const heading = { id: "h-1" } as HeadingRecord;
	const card: FlowCard = {
		...initialCard(),
		picks: [
			{ id: "r-aaaa", slug: "a", reason: "", fromHeading: false },
			{ id: "r-bbbb", slug: "b", reason: "", fromHeading: false },
		],
	};

	test("enter reviews the inbox first, else thinks the pick, else plants", () => {
		expect(enterAction({ ...card, inbox: 2 })).toEqual({ type: "tend" });
		expect(enterAction(card)).toEqual({ type: "think", id: "r-aaaa" });
		expect(enterAction(initialCard())).toEqual({ type: "plant" });
	});

	test("o cycles picks; n thinks the current; x dismisses a shown heading; q ends", () => {
		const o = flowKey(card, "o").card;
		expect(flowKey(o, "n").action).toEqual({ type: "think", id: "r-bbbb" });
		expect(flowKey(flowKey(o, "o").card, "n").action).toEqual({ type: "think", id: "r-aaaa" });
		expect(flowKey(card, "x").card.notice).toBe("no heading to dismiss");
		expect(flowKey({ ...card, heading: { kind: "shown", heading } }, "x").action).toEqual({
			type: "dismiss",
			heading: "h-1",
		});
		expect(flowKey(initialCard(), "o").card.notice).toContain("no other idea");
		expect(flowKey(initialCard(), "n").action).toBeNull();
		const q = flowKey(card, "q");
		expect(q.card.ended).toBe(true);
		expect(q.action).toEqual({ type: "quit" });
		expect(flowKey(card, "p").action).toEqual({ type: "plant" });
	});

	test("parseFlowKeys", () => {
		expect(parseFlowKeys("\rNox\x03zP\n")).toEqual(["enter", "n", "o", "x", "q", "p", "enter"]);
	});
});
