import { describe, expect, test } from "bun:test";
import { ConflictError, ValidationError } from "./errors.ts";
import { readEvents } from "./events.ts";
import { readGraph, updateGraph } from "./graph.ts";
import { rootsPaths } from "./paths.ts";
import {
	expireProposals,
	fileProposals,
	MENTION_ACTOR,
	mootReason,
	type ProposalDraft,
	pendingProposals,
	readProposals,
} from "./proposals.ts";
import { writeJsonlFile } from "./store.ts";
import { forceStatus, initProject, plant } from "./test-helpers.ts";
import type { ProposalRecord } from "./types.ts";

const NOW = new Date("2026-09-28T12:00:00Z");
const OPTS = { cap: 10, ttlDays: 14, now: NOW };

async function setup() {
	const root = await initProject();
	const a = await plant(root, "Sync works offline");
	const b = await plant(root, "The server is authoritative");
	return { root, paths: rootsPaths(root), a, b };
}

function draft(a: string, b: string, over: Partial<ProposalDraft> = {}): ProposalDraft {
	return {
		kind: "edge",
		from: a,
		to: b,
		rel: null,
		cites: [
			{ node: a, quote: "works offline" },
			{ node: b, quote: "server is authoritative" },
		],
		by: MENTION_ACTOR,
		...over,
	};
}

describe("fileProposals", () => {
	test("files a pending proposal with ttl, logs one propose event", async () => {
		const { paths, a, b } = await setup();
		const r = await fileProposals(paths, [draft(a, b)], OPTS);
		expect(r.filed).toHaveLength(1);
		expect(r.filed[0]).toMatchObject({
			kind: "edge",
			from: a,
			to: b,
			rel: null,
			status: "pending",
			by: MENTION_ACTOR,
			createdAt: "2026-09-28T12:00:00Z",
			expiresAt: "2026-10-12T12:00:00Z",
		});
		expect(r.filed[0]?.id).toMatch(/^p-[0-9a-f]{4}$/);
		expect(readProposals(paths)).toHaveLength(1);
		const ev = readEvents(paths).filter((e) => e.type === "propose");
		expect(ev).toMatchObject([{ by: MENTION_ACTOR, node: a, refs: [b], proposal: r.filed[0]?.id }]);
	});

	test("citations must be exact substrings; edge needs two", async () => {
		const { paths, a, b } = await setup();
		const bad = draft(a, b, {
			cites: [
				{ node: a, quote: "works offline" },
				{ node: b, quote: "nope" },
			],
		});
		const one = draft(a, b, { cites: [{ node: a, quote: "works offline" }] });
		const r = await fileProposals(paths, [bad, one], OPTS);
		expect(r.skipped.map((s) => [s.reason, s.message])).toEqual([
			["invalid", `cite quote not found in ${b}`],
			["invalid", "edge proposals need at least 2 citation(s)"],
		]);
		await expect(fileProposals(paths, [bad], { ...OPTS, strict: true })).rejects.toThrow(
			ValidationError,
		);
		expect(readProposals(paths)).toEqual([]);
	});

	test("same pair (either direction) is a duplicate; cap is enforced", async () => {
		const { paths, a, b } = await setup();
		const r = await fileProposals(
			paths,
			[draft(a, b), draft(b, a, { cites: draft(a, b).cites })],
			OPTS,
		);
		expect(r.filed).toHaveLength(1);
		expect(r.skipped[0]?.reason).toBe("duplicate");
		const capped = await fileProposals(paths, [draft(a, b)], { ...OPTS, cap: 1 });
		expect(capped.skipped[0]?.reason).toBe("duplicate");
		const { paths: p2, a: a2, b: b2 } = await setup();
		const c = await fileProposals(p2, [draft(a2, b2)], { ...OPTS, cap: 0 });
		expect(c.skipped[0]?.reason).toBe("cap");
		await expect(
			fileProposals(p2, [draft(a2, b2)], { ...OPTS, cap: 0, strict: true }),
		).rejects.toThrow(ConflictError);
	});

	test("human rejections are permanent; existing edges block", async () => {
		const { paths, a, b } = await setup();
		const rejected: ProposalRecord = {
			id: "p-0001",
			kind: "edge",
			from: b,
			to: a,
			rel: "tension",
			cites: [],
			by: "agent:x",
			status: "rejected",
			createdAt: "2026-01-01T00:00:00Z",
			decidedBy: "human:t",
		};
		await writeJsonlFile(paths.proposals, [rejected]);
		const r = await fileProposals(paths, [draft(a, b)], OPTS);
		expect(r.skipped[0]?.reason).toBe("rejected");
		// A different rel on the same pair is a different proposal.
		const serves = await fileProposals(
			paths,
			[draft(a, b, { rel: "serves", by: "agent:x" })],
			OPTS,
		);
		expect(serves.filed).toHaveLength(1);

		const { paths: p2, a: a2, b: b2 } = await setup();
		await updateGraph(p2, (g) => {
			g.edges.push({
				type: "edge",
				id: "e-1",
				from: a2,
				to: b2,
				rel: "serves",
				by: "human:t",
				createdAt: "",
			});
			return { write: true, result: null };
		});
		const e = await fileProposals(p2, [draft(b2, a2, { cites: draft(a2, b2).cites })], OPTS);
		expect(e.skipped[0]?.reason).toBe("exists");
	});

	test("overdue pending proposals expire (event each) and free the cap", async () => {
		const { paths, a, b } = await setup();
		await fileProposals(paths, [draft(a, b)], { ...OPTS, now: new Date("2026-01-01T00:00:00Z") });
		expect(pendingProposals(readProposals(paths), NOW)).toEqual([]);
		const r = await fileProposals(paths, [draft(a, b)], { ...OPTS, cap: 1 });
		expect(r.expired).toHaveLength(1);
		expect(r.filed).toHaveLength(1);
		expect(
			readProposals(paths)
				.map((p) => p.status)
				.sort(),
		).toEqual(["expired", "pending"]);
		expect(readEvents(paths).filter((e) => e.type === "expire")).toMatchObject([{ by: "roots" }]);
		expect(await expireProposals(paths, NOW)).toEqual([]);
	});
});

describe("moot proposals", () => {
	test("a composted endpoint hides the proposal on read and expires it (reason moot)", async () => {
		const { root, paths, a, b } = await setup();
		await fileProposals(paths, [draft(a, b)], OPTS);
		await forceStatus(root, b, "composted");
		const rows = readProposals(paths);
		const graph = readGraph(paths);
		expect(mootReason(rows[0] as ProposalRecord, graph, NOW)).toBe(`${b} is composted`);
		expect(pendingProposals(rows, NOW)).toHaveLength(1);
		expect(pendingProposals(rows, NOW, graph)).toEqual([]);

		const expired = await expireProposals(paths, NOW);
		expect(expired.map((p) => p.status)).toEqual(["expired"]);
		expect(readProposals(paths)[0]?.status).toBe("expired");
		expect(readEvents(paths).filter((e) => e.type === "expire")).toMatchObject([
			{ by: "roots", reason: `moot: ${b} is composted` },
		]);
		expect(await expireProposals(paths, NOW)).toEqual([]);
	});

	test("an overdue proposal expires with reason ttl", async () => {
		const { paths, a, b } = await setup();
		await fileProposals(paths, [draft(a, b)], { ...OPTS, now: new Date("2026-01-01T00:00:00Z") });
		await expireProposals(paths, NOW);
		expect(readEvents(paths).filter((e) => e.type === "expire")).toMatchObject([{ reason: "ttl" }]);
	});

	test("a sprout endpoint that is no longer open, or a missing node, is moot", async () => {
		const { paths, a, b } = await setup();
		await fileProposals(paths, [draft(a, b)], OPTS);
		const p = readProposals(paths)[0] as ProposalRecord;
		const sprout = {
			type: "node" as const,
			id: "s-0001",
			kind: "sprout" as const,
			slug: "a-sprout",
			status: "open" as const,
			author: "agent:claude",
			createdAt: "2026-09-27T00:00:00Z",
			expiresAt: "2026-10-01T00:00:00Z",
		};
		const withSprout = (status: "open" | "adopted", expiresAt = sprout.expiresAt) => ({
			nodes: [...readGraph(paths).nodes, { ...sprout, status, expiresAt }],
			edges: [],
		});
		const toSprout = { ...p, to: "s-0001" };
		expect(mootReason(toSprout, withSprout("open"), NOW)).toBeNull();
		expect(mootReason(toSprout, withSprout("adopted"), NOW)).toBe(
			"sprout s-0001 is no longer open",
		);
		expect(mootReason(toSprout, withSprout("open", "2026-09-01T00:00:00Z"), NOW)).toBe(
			"sprout s-0001 is no longer open",
		);
		expect(mootReason({ ...p, to: "r-dead" }, readGraph(paths), NOW)).toBe("r-dead is gone");
	});

	test("filing expires moot proposals first, freeing the cap", async () => {
		const { root, paths, a, b } = await setup();
		const c = await plant(root, "Conflicts resolve by last write");
		await fileProposals(paths, [draft(a, b)], OPTS);
		await forceStatus(root, b, "composted");
		const cites = [
			{ node: a, quote: "works offline" },
			{ node: c, quote: "last write" },
		];
		const r = await fileProposals(paths, [draft(a, c, { cites })], { ...OPTS, cap: 1 });
		expect(r.expired).toHaveLength(1);
		expect(r.expiredWhy).toEqual([`moot: ${b} is composted`]);
		expect(r.filed).toHaveLength(1);
	});
});
