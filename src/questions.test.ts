import { describe, expect, test } from "bun:test";
import { collectAttention, rankAttention } from "./attention.ts";
import { defaultConfig } from "./config.ts";
import { readEvents } from "./events.ts";
import { readGraph } from "./graph.ts";
import { rootsPaths } from "./paths.ts";
import { scanNodeDirs } from "./prose.ts";
import {
	addQuestions,
	answerQuestion,
	dismissQuestion,
	dueQuestions,
	isDue,
	nodeActivity,
	planQuestions,
	readQuestions,
	snoozeQuestion,
} from "./questions.ts";
import { initProject, plant } from "./test-helpers.ts";
import type { EventRecord, QuestionRecord } from "./types.ts";

const NOW = new Date("2026-09-28T12:00:00Z");
const ACT = { by: "human:t", session: "ss-0001", at: NOW };

describe("question store", () => {
	test("add/answer/dismiss/snooze each log one event", async () => {
		const root = await initProject();
		const id = await plant(root, "Sync works offline");
		const paths = rootsPaths(root);
		const qs = await addQuestions(
			paths,
			[
				{ node: id, text: "a?", by: "roots:missing-done" },
				{ node: id, text: "b?", by: "roots:missing-scope" },
				{ node: id, text: "c?", by: "roots:tension-open", ref: "e-1" },
			],
			{ session: "ss-0001", now: NOW },
		);
		expect(qs.map((q) => q.status)).toEqual(["open", "open", "open"]);
		expect(new Set(qs.map((q) => q.id)).size).toBe(3);
		expect(qs[2]?.ref).toBe("e-1");
		const [a, b, c] = qs.map((q) => q.id) as [string, string, string];
		await answerQuestion(paths, a, { ...ACT, span: { from: 2, to: 3, removed: 0 } });
		await dismissQuestion(paths, b, ACT);
		await snoozeQuestion(paths, c, { ...ACT, days: 7 });
		const byId = new Map(readQuestions(paths).map((q) => [q.id, q]));
		expect(byId.get(a)).toMatchObject({
			status: "answered",
			answeredBy: "human:t",
			session: "ss-0001",
		});
		expect(byId.get(b)).toMatchObject({ status: "dismissed", dismissedBy: "human:t" });
		expect(byId.get(c)).toMatchObject({ status: "snoozed", snoozedUntil: "2026-10-05T12:00:00Z" });
		const types = readEvents(paths).map((e) => e.type);
		expect(types).toEqual(["init", "plant", "ask", "ask", "ask", "answer", "dismiss", "snooze"]);
		const answer = readEvents(paths).find((e) => e.type === "answer");
		expect(answer).toMatchObject({ question: a, node: id, span: { from: 2, to: 3, removed: 0 } });
	});

	test("isDue / dueQuestions / planQuestions", () => {
		const q = (over: Partial<QuestionRecord>): QuestionRecord => ({
			id: "q-1",
			node: "r-1",
			text: "?",
			by: "roots:x",
			status: "open",
			createdAt: "2026-09-02T00:00:00Z",
			...over,
		});
		expect(isDue(q({}), NOW)).toBe(true);
		expect(isDue(q({ status: "snoozed", snoozedUntil: "2026-10-01T00:00:00Z" }), NOW)).toBe(false);
		expect(isDue(q({ status: "snoozed", snoozedUntil: "2026-09-01T00:00:00Z" }), NOW)).toBe(true);
		expect(isDue(q({ status: "answered" }), NOW)).toBe(false);
		const rows = [
			q({ id: "q-2", createdAt: "2026-09-03T00:00:00Z" }),
			q({}),
			q({ id: "q-3", node: "r-2" }),
		];
		expect(dueQuestions(rows, "r-1", NOW).map((x) => x.id)).toEqual(["q-1", "q-2"]);
		const done = { rule: "missing-done" as const, text: "d" };
		const cands = [done, { rule: "missing-scope" as const, text: "s" }];
		expect(planQuestions([q({})], cands, 2)).toEqual({ reuse: [q({})], create: [done] });
		expect(planQuestions([q({}), q({}), q({})], cands, 2).create).toEqual([]);
	});

	test("nodeActivity counts completed sessions and human touches", () => {
		const node = {
			type: "node" as const,
			id: "r-1",
			kind: "idea" as const,
			slug: "x",
			status: "shaping" as const,
			author: "human:t",
			createdAt: "2026-09-01T00:00:00Z",
		};
		const ev = (type: EventRecord["type"], by: string, at: string): EventRecord => ({
			type,
			by,
			at,
			node: "r-1",
		});
		const act = nodeActivity(
			[
				ev("session.end", "human:t", "2026-09-10T00:00:00Z"),
				ev("mv", "roots:dir-rename", "2026-09-20T00:00:00Z"),
				ev("session.end", "human:t", "2026-09-12T00:00:00Z"),
			],
			node,
		);
		expect(act).toEqual({ sessions: 2, lastTouched: "2026-09-12T00:00:00Z" });
	});
});

describe("attention", () => {
	test("ideas with due questions first, then by need, then planted first", async () => {
		const root = await initProject();
		const paths = rootsPaths(root);
		const settled = await plant(root, "Done when it ships, not before");
		const fresh = await plant(root, "Sync works offline");
		const asked = await plant(root, "Fast startup is done when under 1s, not more");
		await addQuestions(paths, [{ node: asked, text: "?", by: "agent:x" }]);
		const list = collectAttention(
			paths,
			readGraph(paths),
			scanNodeDirs(paths),
			defaultConfig("p"),
			NOW,
		);
		const ranked = rankAttention(list).map((a) => a.node.id);
		expect(ranked).toEqual([asked, fresh]);
		expect(ranked).not.toContain(settled);
		const freshEntry = list.find((a) => a.node.id === fresh);
		expect(freshEntry?.candidates.map((c) => c.rule)).toEqual(["missing-done", "missing-scope"]);
	});
});
