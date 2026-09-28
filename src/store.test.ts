import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	acquireLock,
	appendJsonlFile,
	atomicWrite,
	dedupById,
	parseJsonl,
	readJsonlFile,
	readTable,
	releaseLock,
	serializeJsonl,
	updateTable,
	withLock,
	writeJsonlFile,
} from "./store.ts";
import { tempDir } from "./test-helpers.ts";

describe("parseJsonl", () => {
	test("skips blanks, malformed lines and non-objects", () => {
		const rows = parseJsonl<{ id: string }>(
			'{"id":"a"}\n\n<<<<<<< HEAD\n{"id":"b"}\n[1,2]\nnull\n{"id":"c"}',
		);
		expect(rows.map((r) => r.id)).toEqual(["a", "b", "c"]);
	});
});

describe("dedup", () => {
	test("last occurrence wins, first-seen order kept", () => {
		const rows = dedupById([
			{ id: "a", v: 1 },
			{ id: "b", v: 1 },
			{ id: "a", v: 2 },
		]);
		expect(rows).toEqual([
			{ id: "a", v: 2 },
			{ id: "b", v: 1 },
		]);
	});
});

describe("files", () => {
	test("atomicWrite creates parents and leaves no temp files", async () => {
		const dir = tempDir();
		const file = join(dir, "a", "b", "x.txt");
		await atomicWrite(file, "hello");
		expect(readFileSync(file, "utf8")).toBe("hello");
		expect(readdirSync(join(dir, "a", "b"))).toEqual(["x.txt"]);
	});

	test("write, append (fixing a missing trailing newline), read", async () => {
		const file = join(tempDir(), "t.jsonl");
		expect(readJsonlFile(file)).toEqual([]);
		await writeJsonlFile(file, [{ id: "a" }]);
		writeFileSync(file, readFileSync(file, "utf8").trimEnd()); // simulate hand edit
		await appendJsonlFile(file, [{ id: "b" }]);
		await appendJsonlFile(file, []);
		expect(readFileSync(file, "utf8")).toBe('{"id":"a"}\n{"id":"b"}\n');
		await writeJsonlFile(file, []);
		expect(readFileSync(file, "utf8")).toBe("");
		expect(serializeJsonl([])).toBe("");
	});

	test("readTable dedups a union-merged file", () => {
		const file = join(tempDir(), "t.jsonl");
		writeFileSync(file, '{"id":"p-1","s":"pending"}\n{"id":"p-2"}\n{"id":"p-1","s":"accepted"}\n');
		expect(readTable<{ id: string; s?: string }>(file)).toEqual([
			{ id: "p-1", s: "accepted" },
			{ id: "p-2" },
		]);
	});

	test("updateTable writes compacted rows only when asked", async () => {
		const file = join(tempDir(), "t.jsonl");
		writeFileSync(file, '{"id":"a","n":1}\n{"id":"a","n":2}\n');
		const r1 = await updateTable<{ id: string; n: number }, number>(file, (rows) => ({
			rows,
			write: false,
			result: rows.length,
		}));
		expect(r1).toBe(1);
		expect(readFileSync(file, "utf8").split("\n").filter(Boolean)).toHaveLength(2);
		await updateTable<{ id: string; n: number }, void>(file, (rows) => ({
			rows: [...rows, { id: "b", n: 3 }],
			write: true,
			result: undefined,
		}));
		expect(readFileSync(file, "utf8")).toBe('{"id":"a","n":2}\n{"id":"b","n":3}\n');
	});
});

describe("locks", () => {
	test("withLock serializes concurrent read-modify-write", async () => {
		const file = join(tempDir(), "counter.jsonl");
		const bump = () =>
			withLock(file, async () => {
				const rows = readJsonlFile<{ id: string }>(file);
				await new Promise((r) => setTimeout(r, 2));
				await writeJsonlFile(file, [...rows, { id: String(rows.length) }]);
			});
		await Promise.all(Array.from({ length: 12 }, bump));
		expect(readJsonlFile(file)).toHaveLength(12);
		expect(existsSync(`${file}.lock`)).toBe(false);
	});

	test("lock is released when fn throws", async () => {
		const file = join(tempDir(), "x.jsonl");
		await expect(
			withLock(file, () => {
				throw new Error("boom");
			}),
		).rejects.toThrow("boom");
		expect(existsSync(`${file}.lock`)).toBe(false);
	});

	test("stale locks are reclaimed", async () => {
		const file = join(tempDir(), "x.jsonl");
		writeFileSync(`${file}.lock`, "");
		const old = new Date(Date.now() - 60_000);
		utimesSync(`${file}.lock`, old, old);
		await acquireLock(file, { timeoutMs: 1000 });
		expect(existsSync(`${file}.lock`)).toBe(true);
		releaseLock(file);
		expect(readdirSync(join(file, "..")).filter((f) => f.includes(".stale."))).toEqual([]);
	});

	test("a fresh lock held elsewhere times out", async () => {
		const file = join(tempDir(), "x.jsonl");
		writeFileSync(`${file}.lock`, "");
		await expect(acquireLock(file, { timeoutMs: 80 })).rejects.toThrow(/timeout/);
	});
});
