import { describe, expect, test } from "bun:test";
import {
	currentQuestion,
	initialState,
	parseKeys,
	type SessionInput,
	type SessionState,
	step,
	tally,
} from "./session.ts";
import type { QuestionRecord } from "./types.ts";

const q = (id: string): QuestionRecord => ({
	id,
	node: "r-1",
	text: `${id}?`,
	by: "roots:missing-done",
	status: "open",
	createdAt: "",
});
const SPAN = { from: 2, to: 2, removed: 0 };
const save: SessionInput = { type: "save", span: SPAN };
const key = (k: "d" | "z" | "s" | "q"): SessionInput => ({ type: "key", key: k });

function run(state: SessionState, inputs: SessionInput[]) {
	const effects = [];
	let s = state;
	for (const i of inputs) {
		const r = step(s, i, "line 2");
		s = r.state;
		effects.push(...r.effects);
	}
	return { s, effects };
}

describe("session reducer", () => {
	test("save answers and advances; last question ends the session", () => {
		const { s, effects } = run(initialState([q("q-1"), q("q-2")]), [save, key("d")]);
		expect(effects.map((e) => e.type)).toEqual(["answer", "dismiss", "end"]);
		expect(effects[0]).toEqual({ type: "answer", question: q("q-1"), span: SPAN });
		expect(s.ended).toBe("completed");
		expect(s.outcomes).toEqual({ "q-1": "answered", "q-2": "dismissed" });
		expect(currentQuestion(s)).toBeNull();
	});

	test("skip has no effect record; snooze does", () => {
		const { s, effects } = run(initialState([q("q-1"), q("q-2"), q("q-3")]), [key("s"), key("z")]);
		expect(effects.map((e) => e.type)).toEqual(["snooze"]);
		expect(currentQuestion(s)?.id).toBe("q-3");
		expect(tally(s)).toEqual({ answered: 0, dismissed: 0, snoozed: 1, skipped: 1, unasked: 1 });
	});

	test("q ends early; inputs after the end are ignored", () => {
		const { s, effects } = run(initialState([q("q-1")]), [key("q"), save, key("d")]);
		expect(effects).toEqual([{ type: "end", reason: "quit" }]);
		expect(s.ended).toBe("quit");
		expect(s.saves).toBe(0);
	});

	test("no questions: free writing, saves counted, only q ends", () => {
		const { s, effects } = run(initialState([]), [save, save, key("d")]);
		expect(effects).toEqual([]);
		expect(s.saves).toBe(2);
		expect(s.ended).toBeNull();
		expect(s.notice).toMatch(/no question/);
		expect(step(s, key("q")).effects).toEqual([{ type: "end", reason: "quit" }]);
	});

	test("notice describes what happened", () => {
		const r = step(initialState([q("q-1"), q("q-2")]), save, "lines 2–4");
		expect(r.state.notice).toBe("answered (lines 2–4)");
	});

	test("parseKeys", () => {
		expect(parseKeys("dZxs\x03q")).toEqual(["d", "z", "s", "q", "q"]);
		expect(parseKeys("\x1b[A")).toEqual([]);
	});
});

describe("agent arrivals", () => {
	const aq = (id: string): QuestionRecord => ({ ...q(id), by: "agent:opus" });
	const arrive = (qs: QuestionRecord[], cap = 3): SessionInput => ({
		type: "arrive",
		questions: qs,
		cap,
	});
	const ids = (s: SessionState) => s.questions.map((x) => x.id);

	test("queued before the first unreached rule question, never ahead of the current one", () => {
		const { s } = run(initialState([q("r1"), q("r2")]), [arrive([aq("a1")])]);
		expect(ids(s)).toEqual(["r1", "a1", "r2"]);
		expect(currentQuestion(s)?.id).toBe("r1");
		expect(s.notice).toBe("an agent asked 1 new question");
	});

	test("full queue bumps the last unreached rule question; otherwise the arrival waits", () => {
		const { s } = run(initialState([q("r1"), q("r2")]), [arrive([aq("a1"), aq("a2")], 2)]);
		expect(ids(s)).toEqual(["r1", "a1"]);
		const full = run(initialState([aq("a0"), aq("a1")]), [arrive([aq("a2")], 2)]).s;
		expect(ids(full)).toEqual(["a0", "a1"]);
		expect(full.notice).toBeNull();
	});

	test("a free-writing session gets the arrival as its current question", () => {
		const { s } = run(initialState([]), [arrive([aq("a1")]), save]);
		expect(s.outcomes).toEqual({ a1: "answered" });
		expect(s.ended).toBe("completed");
	});

	test("duplicates and arrivals after the end are ignored", () => {
		const { s } = run(initialState([aq("a1")]), [arrive([aq("a1")])]);
		expect(ids(s)).toEqual(["a1"]);
		const ended = run(initialState([q("r1")]), [key("q"), arrive([aq("a1")])]).s;
		expect(ids(ended)).toEqual(["r1"]);
	});
});
