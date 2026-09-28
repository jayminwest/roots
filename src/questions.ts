// questions.jsonl: asked questions and their status (SPEC "questions.jsonl").
//
// Answers are never stored here: the answer is what the human wrote in
// idea.md; the `answer` event records the diff span. Each mutation logs
// exactly one event: `ask` (new question), `answer`, `dismiss`, `snooze`,
// `delegate` (the human hands it to the agent), `undelegate` (the agent run
// ended without findings; roots puts it back). Findings arrive with the
// agent's `note` event (notes.ts).

import { isHumanActor } from "./actor.ts";
import type { RootsConfig } from "./config.ts";
import type { DiffSpan } from "./diff.ts";
import { appendEvent, makeEvent } from "./events.ts";
import { findNode } from "./graph.ts";
import { generateId, hexSet } from "./ids.ts";
import type { RootsPaths } from "./paths.ts";
import { type RuleCandidate, type RuleContext, ruleActor } from "./rules.ts";
import { readTable, updateTable } from "./store.ts";
import { isoNow } from "./time.ts";
import type { Actor, EventRecord, Graph, NodeRecord, QuestionRecord } from "./types.ts";

export function readQuestions(paths: RootsPaths): QuestionRecord[] {
	return readTable<QuestionRecord>(paths.questions);
}

/** Open, or snoozed and past snoozedUntil: ready to be asked. */
export function isDue(q: QuestionRecord, now: Date): boolean {
	if (q.status === "open") return true;
	if (q.status !== "snoozed") return false;
	return q.snoozedUntil === undefined || Date.parse(q.snoozedUntil) <= now.getTime();
}

export function hasFindings(q: Pick<QuestionRecord, "findings">): boolean {
	return (q.findings?.length ?? 0) > 0;
}

/** Due questions for one node: those with agent findings first, then oldest first. */
export function dueQuestions(
	rows: readonly QuestionRecord[],
	node: string,
	now: Date,
): QuestionRecord[] {
	return rows
		.filter((q) => q.node === node && isDue(q, now))
		.sort(
			(a, b) =>
				Number(hasFindings(b)) - Number(hasFindings(a)) || a.createdAt.localeCompare(b.createdAt),
		);
}

/** Questions handed to the agent and still waiting for findings. */
export function delegatedQuestions(rows: readonly QuestionRecord[], node?: string) {
	return rows.filter((q) => q.status === "delegated" && (node === undefined || q.node === node));
}

export interface NodeActivity {
	/** Completed think sessions. */
	sessions: number;
	/** Last human event on the node, else updatedAt/createdAt. */
	lastTouched: string;
}

export function nodeActivity(events: readonly EventRecord[], node: NodeRecord): NodeActivity {
	let sessions = 0;
	let lastTouched = node.updatedAt ?? node.createdAt;
	for (const e of events) {
		if (e.node !== node.id) continue;
		if (e.type === "session.end") sessions++;
		if (isHumanActor(e.by) && e.at > lastTouched) lastTouched = e.at;
	}
	return { sessions, lastTouched };
}

export function ruleContextFor(
	graph: Graph,
	node: NodeRecord,
	text: string,
	events: readonly EventRecord[],
	config: RootsConfig,
	now: Date,
): RuleContext {
	const activity = nodeActivity(events, node);
	return {
		node,
		text,
		edges: graph.edges.filter((e) => e.from === node.id || e.to === node.id),
		lookup: (id) => findNode(graph, id),
		sessionNumber: activity.sessions + 1,
		lastTouched: activity.lastTouched,
		now,
		thresholds: config.questions,
	};
}

export interface SessionPlan {
	/** Existing due questions to ask again (asked first). */
	reuse: QuestionRecord[];
	/** New rule questions to create. */
	create: RuleCandidate[];
}

/** Fill up to `cap` slots: pending questions first, then new rule candidates. */
export function planQuestions(
	due: readonly QuestionRecord[],
	candidates: readonly RuleCandidate[],
	cap: number,
): SessionPlan {
	const reuse = due.slice(0, cap);
	return { reuse, create: candidates.slice(0, Math.max(0, cap - reuse.length)) };
}

export interface QuestionDraft {
	node: string;
	text: string;
	by: Actor;
	ref?: string;
}

export function draftFromCandidate(node: string, c: RuleCandidate): QuestionDraft {
	return { node, text: c.text, by: ruleActor(c.rule), ...(c.ref ? { ref: c.ref } : {}) };
}

/** Append new open questions; logs one `ask` event per question. */
export async function addQuestions(
	paths: RootsPaths,
	drafts: readonly QuestionDraft[],
	opts: {
		session?: string;
		now?: Date;
		/** Runs under the questions lock before writing; throw to refuse (caps, dedup). */
		validate?: (rows: readonly QuestionRecord[]) => void;
	} = {},
): Promise<QuestionRecord[]> {
	if (drafts.length === 0) return [];
	const at = isoNow(opts.now);
	const created = await updateTable<QuestionRecord, QuestionRecord[]>(paths.questions, (rows) => {
		opts.validate?.(rows);
		const taken = hexSet(rows.map((r) => r.id));
		const out: QuestionRecord[] = [];
		for (const d of drafts) {
			const id = generateId("q", taken);
			taken.add(id.slice(2));
			const q: QuestionRecord = { id, ...d, status: "open", createdAt: at };
			if (opts.session) q.session = opts.session;
			out.push(q);
		}
		return { rows: [...rows, ...out], write: true, result: out };
	});
	for (const q of created) {
		await appendEvent(
			paths,
			makeEvent("ask", q.by, { at, node: q.node, question: q.id, session: opts.session }),
		);
	}
	return created;
}

async function patchQuestion(
	paths: RootsPaths,
	id: string,
	patch: (q: QuestionRecord) => void,
): Promise<QuestionRecord> {
	return updateTable<QuestionRecord, QuestionRecord>(paths.questions, (rows) => {
		const q = rows.find((r) => r.id === id);
		if (!q) throw new Error(`question ${id} disappeared`);
		patch(q);
		return { rows, write: true, result: q };
	});
}

export interface QuestionAct {
	by: Actor;
	session: string;
	at?: Date;
}

/** Close a question as answered or dismissed and log one event for it. */
async function closeQuestion(
	paths: RootsPaths,
	id: string,
	act: QuestionAct,
	kind: "answer" | "dismiss",
	extra: Record<string, unknown> = {},
): Promise<QuestionRecord> {
	const at = isoNow(act.at);
	const q = await patchQuestion(paths, id, (r) => {
		if (kind === "answer") {
			r.status = "answered";
			r.answeredBy = act.by;
			r.answeredAt = at;
		} else {
			r.status = "dismissed";
			r.dismissedBy = act.by;
			r.dismissedAt = at;
		}
		r.session = act.session;
		delete r.snoozedUntil;
	});
	await appendEvent(
		paths,
		makeEvent(kind, act.by, { at, node: q.node, question: id, session: act.session, ...extra }),
	);
	return q;
}

export function answerQuestion(
	paths: RootsPaths,
	id: string,
	act: QuestionAct & { span: DiffSpan; lines?: string[] },
): Promise<QuestionRecord> {
	const extra = act.lines ? { span: act.span, lines: act.lines } : { span: act.span };
	return closeQuestion(paths, id, act, "answer", extra);
}

export function dismissQuestion(
	paths: RootsPaths,
	id: string,
	act: QuestionAct,
): Promise<QuestionRecord> {
	return closeQuestion(paths, id, act, "dismiss");
}

const DAY_MS = 86_400_000;

export async function snoozeQuestion(
	paths: RootsPaths,
	id: string,
	act: QuestionAct & { days: number },
): Promise<QuestionRecord> {
	const now = act.at ?? new Date();
	const until = isoNow(new Date(now.getTime() + act.days * DAY_MS));
	const q = await patchQuestion(paths, id, (r) => {
		r.status = "snoozed";
		r.snoozedUntil = until;
		r.session = act.session;
	});
	await appendEvent(
		paths,
		makeEvent("snooze", act.by, {
			at: isoNow(now),
			node: q.node,
			question: id,
			session: act.session,
			until,
		}),
	);
	return q;
}

/** [a] in think: hand the question to the agent for research (one `delegate` event). */
export async function delegateQuestion(
	paths: RootsPaths,
	id: string,
	act: QuestionAct,
): Promise<QuestionRecord> {
	const at = isoNow(act.at);
	const q = await patchQuestion(paths, id, (r) => {
		r.status = "delegated";
		r.delegatedBy = act.by;
		r.delegatedAt = at;
		r.session = act.session;
		delete r.snoozedUntil;
	});
	await appendEvent(
		paths,
		makeEvent("delegate", act.by, { at, node: q.node, question: id, session: act.session }),
	);
	return q;
}

/**
 * The agent run ended without findings: the question goes back to the human
 * (one `undelegate` event by `roots`). No-op when it is no longer delegated.
 */
export async function undelegateQuestion(
	paths: RootsPaths,
	id: string,
	reason: string,
	now?: Date,
): Promise<QuestionRecord | null> {
	const at = isoNow(now);
	const q = await updateTable<QuestionRecord, QuestionRecord | null>(paths.questions, (rows) => {
		const row = rows.find((r) => r.id === id);
		if (row?.status !== "delegated") return { rows, write: false, result: null };
		row.status = "open";
		return { rows, write: true, result: row };
	});
	if (q) {
		await appendEvent(
			paths,
			makeEvent("undelegate", "roots", { at, node: q.node, question: id, reason }),
		);
	}
	return q;
}
