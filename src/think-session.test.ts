import { describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { makeColors } from "./color.ts";
import { defaultConfig } from "./config.ts";
import { readEvents } from "./events.ts";
import { findNode, readGraph } from "./graph.ts";
import { rootsPaths } from "./paths.ts";
import { readProposals } from "./proposals.ts";
import { contentHash, readNodeProse } from "./prose.ts";
import { readQuestions } from "./questions.ts";
import { fakeTerminal, initProject, plant, waitFor } from "./test-helpers.ts";
import { runThinkSession, type ThinkDeps } from "./think-session.ts";

const WATCH = { debounceMs: 20, pollMs: 50 };

async function setup(statement = "Sync works offline") {
	const root = await initProject();
	const id = await plant(root, statement);
	const paths = rootsPaths(root);
	return { root, id, paths };
}

function deps(paths: ReturnType<typeof rootsPaths>, id: string, over: Partial<ThinkDeps> = {}) {
	const node = findNode(readGraph(paths), id);
	if (!node) throw new Error("no node");
	const terminal = fakeTerminal(60);
	const d: ThinkDeps = {
		paths,
		config: defaultConfig("p"),
		node,
		by: "human:test-human",
		terminal,
		colors: makeColors(false),
		editorHint: "Open idea.md in another pane.",
		watch: WATCH,
		...over,
	};
	return { d, terminal: d.terminal as ReturnType<typeof fakeTerminal> };
}

function ideaFile(paths: ReturnType<typeof rootsPaths>, id: string): string {
	const node = findNode(readGraph(paths), id);
	const p = node ? readNodeProse(paths, node).path : null;
	if (!p) throw new Error("no file");
	return p;
}

describe("runThinkSession", () => {
	test("save answers, d dismisses, last question ends; ledger + status recorded", async () => {
		const { paths, id } = await setup();
		const { d, terminal } = deps(paths, id);
		const running = runThinkSession(d);
		await waitFor(() => terminal.screen().includes("question 1/2"), 3000, "first question");
		expect(terminal.screen()).toContain("[missing-done]");
		expect(terminal.screen()).toContain("What would make this done?");
		const file = ideaFile(paths, id);
		writeFileSync(file, "Sync works offline\n\nDone means: a day in airplane mode.\n");
		await waitFor(() => terminal.screen().includes("question 2/2"), 3000, "second question");
		expect(terminal.screen()).toContain("✓ answered (lines 2–3)");
		terminal.send("d");
		const s = await running;
		expect(terminal.stopped).toBe(true);
		expect(s.reason).toBe("completed");
		expect(s.tally).toMatchObject({ answered: 1, dismissed: 1 });
		expect(s.statusChange).toEqual({ from: "planted", to: "shaping" });
		expect(s.hash).toBe(contentHash(readFileSync(file, "utf8")));
		expect(s.session).toMatch(/^ss-[0-9a-f]{4}$/);

		const qs = readQuestions(paths);
		expect(qs.map((q) => [q.by, q.status])).toEqual([
			["roots:missing-done", "answered"],
			["roots:missing-scope", "dismissed"],
		]);
		expect(qs[0]).toMatchObject({ answeredBy: "human:test-human", session: s.session });
		const events = readEvents(paths).slice(2); // init, plant
		expect(events.map((e) => e.type)).toEqual([
			"session.start",
			"ask",
			"ask",
			"answer",
			"dismiss",
			"status",
			"session.end",
		]);
		expect(events[3]).toMatchObject({ span: { from: 2, to: 3, removed: 0 }, question: qs[0]?.id });
		expect(events.at(-1)).toMatchObject({ hash: s.hash, session: s.session, changed: true });
		expect(findNode(readGraph(paths), id)?.status).toBe("shaping");
	});

	test("q ends early; open questions persist and come first next time; dismissed never return", async () => {
		const { paths, id } = await setup();
		const first = deps(paths, id);
		const run1 = runThinkSession(first.d);
		await waitFor(() => first.terminal.screen().includes("question 1/2"));
		first.terminal.send("d"); // dismiss missing-done
		await waitFor(() => first.terminal.screen().includes("question 2/2"));
		first.terminal.send("q");
		const s1 = await run1;
		expect(s1.reason).toBe("quit");
		expect(s1.tally).toMatchObject({ dismissed: 1, unasked: 1 });
		expect(s1.changed).toBe(false);

		const second = deps(paths, id);
		const run2 = runThinkSession(second.d);
		await waitFor(() => second.terminal.screen().includes("question 1/1"));
		expect(second.terminal.screen()).toContain("[missing-scope]");
		second.terminal.send("z");
		const s2 = await run2;
		expect(s2.statusChange).toBeNull(); // already shaping
		expect(readQuestions(paths).map((q) => q.status)).toEqual(["dismissed", "snoozed"]);
		// Snoozed and dismissed: nothing to ask in a third session.
		const third = deps(paths, id);
		const run3 = runThinkSession(third.d);
		await waitFor(() => third.terminal.screen().includes("no questions"));
		third.terminal.send("q");
		expect((await run3).questions).toEqual([]);
		expect(readQuestions(paths)).toHaveLength(2);
	});

	test("respects questionsPerSession; skip leaves the question open", async () => {
		const { paths, id } = await setup("Fast and offline");
		const config = defaultConfig("p");
		config.limits.questionsPerSession = 1;
		const { d, terminal } = deps(paths, id, { config });
		const running = runThinkSession(d);
		await waitFor(() => terminal.screen().includes("question 1/1"));
		terminal.send("s");
		const s = await running;
		expect(s.tally).toMatchObject({ skipped: 1 });
		expect(readQuestions(paths).map((q) => q.status)).toEqual(["open"]);
	});

	test("mentions in changed lines become edge proposals at session end", async () => {
		const root = await initProject();
		const paths = rootsPaths(root);
		const other = await plant(root, "The server is always authoritative");
		const id = await plant(root, "Sync works offline");
		const { d, terminal } = deps(paths, id);
		const running = runThinkSession(d);
		await waitFor(() => terminal.frames.length > 0);
		const file = ideaFile(paths, id);
		const line = "This pulls against server-always-authoritative.";
		writeFileSync(file, `Sync works offline\n\n${line}\n`);
		await waitFor(() => terminal.screen().includes("question 2/2"));
		terminal.send("q");
		const s = await running;
		expect(s.mentions?.result.filed).toHaveLength(1);
		expect(readProposals(paths)).toMatchObject([
			{
				kind: "edge",
				from: id,
				to: other,
				rel: null,
				by: "roots:mention",
				status: "pending",
				cites: [
					{ node: id, quote: line },
					{ node: other, quote: "The server is always authoritative" },
				],
			},
		]);
		const types = readEvents(paths).map((e) => e.type);
		expect(types.slice(-3)).toEqual(["propose", "status", "session.end"]);
	});

	test("vim-style rename saves are answers too", async () => {
		const { paths, id } = await setup();
		const { d, terminal } = deps(paths, id);
		const running = runThinkSession(d);
		await waitFor(() => terminal.frames.length > 0);
		const file = ideaFile(paths, id);
		const { renameSync } = await import("node:fs");
		writeFileSync(`${file}.swp`, "Sync works offline\nNot for realtime collab.\n");
		renameSync(`${file}.swp`, file);
		await waitFor(() => terminal.screen().includes("question 2/2"));
		terminal.send("q");
		expect((await running).tally.answered).toBe(1);
	});

	test("terminal is restored when something fails mid-session", async () => {
		const { paths, id } = await setup();
		const { d, terminal } = deps(paths, id);
		let calls = 0;
		terminal.columns = () => {
			calls++;
			if (calls > 1) throw new Error("boom");
			return 60;
		};
		const running = runThinkSession(d);
		await waitFor(() => terminal.started);
		terminal.send("s");
		await expect(running).rejects.toThrow("boom");
		expect(terminal.stopped).toBe(true);
	});
});
