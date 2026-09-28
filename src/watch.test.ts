import { describe, expect, test } from "bun:test";
import { renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tempDir } from "./test-helpers.ts";
import { watchFile } from "./watch.ts";

function waitFor(cond: () => boolean, ms = 3000): Promise<void> {
	const start = Date.now();
	return new Promise((resolve, reject) => {
		const tick = () => {
			if (cond()) return resolve();
			if (Date.now() - start > ms) return reject(new Error("timed out"));
			setTimeout(tick, 10);
		};
		tick();
	});
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Wait until fs.watch is live. macOS FSEvents silently drops events for a
 * short, load-dependent window right after watch() returns, so a fixed sleep
 * made the fs.watch-only tests (pollMs: 0) flaky under load (~1 in 10 runs of
 * the rename test). Rewrite the file until the watcher reports a change, then
 * forget that change.
 */
async function armed(file: string, seen: string[]): Promise<void> {
	for (let i = 0; seen.length === 0; i++) {
		if (i >= 60) throw new Error("fs.watch never fired");
		writeFileSync(file, `arm ${i}\n`);
		await sleep(80); // longer than the tests' debounce, so each write can fire
	}
	await sleep(120); // let the arming burst's debounce settle
	seen.length = 0;
}

function setup() {
	const dir = tempDir();
	const file = join(dir, "idea.md");
	writeFileSync(file, "v1\n");
	const seen: string[] = [];
	return { dir, file, seen, onChange: (t: string) => seen.push(t) };
}

describe("watchFile", () => {
	test("in-place writes are debounced into one change", async () => {
		const { file, seen, onChange } = setup();
		const w = watchFile(file, "v1\n", onChange, { debounceMs: 50, pollMs: 0 });
		await armed(file, seen);
		writeFileSync(file, "v2\n");
		writeFileSync(file, "v3\n");
		await waitFor(() => seen.length > 0);
		await sleep(120);
		w.close();
		expect(seen).toEqual(["v3\n"]);
	});

	test("replace-by-rename (vim style) is detected, repeatedly", async () => {
		const { dir, file, seen, onChange } = setup();
		const w = watchFile(file, "v1\n", onChange, { debounceMs: 30, pollMs: 0 });
		await armed(file, seen);
		for (const v of ["v2\n", "v3\n"]) {
			const tmp = join(dir, "4913");
			writeFileSync(tmp, v);
			renameSync(tmp, file);
			await waitFor(() => seen.includes(v));
		}
		w.close();
		expect(seen).toEqual(["v2\n", "v3\n"]);
	});

	test("unchanged content and missing files are ignored; close stops events", async () => {
		const { file, seen, onChange } = setup();
		const w = watchFile(file, "v1\n", onChange, { debounceMs: 20, pollMs: 25 });
		writeFileSync(file, "v1\n"); // touch, same content
		unlinkSync(file);
		await sleep(100);
		expect(seen).toEqual([]);
		writeFileSync(file, "back\n");
		await waitFor(() => seen.length === 1);
		w.close();
		writeFileSync(file, "after close\n");
		await sleep(100);
		expect(seen).toEqual(["back\n"]);
	});

	test("polling alone catches changes", async () => {
		const { file, seen, onChange } = setup();
		const w = watchFile(file, "v1\n", onChange, { debounceMs: 10_000, pollMs: 20 });
		writeFileSync(file, "polled\n");
		await waitFor(() => seen.length === 1);
		w.close();
		expect(seen).toEqual(["polled\n"]);
	});
});
