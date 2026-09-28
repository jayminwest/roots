import { describe, expect, test } from "bun:test";
import { startStatus } from "./spinner.ts";

describe("startStatus", () => {
	test("animated frames never exceed the terminal width", () => {
		const out: string[] = [];
		const s = startStatus((t) => out.push(t), "asking agent:claude-opus about a-long-slug", {
			animate: true,
			intervalMs: 1_000_000,
			columns: () => 20,
		});
		s.stop();
		const frame = (out[0] ?? "").replace("\r\x1b[2K", "");
		expect([...frame].length).toBeLessThan(20);
		expect(frame.endsWith("…")).toBe(true);
	});

	test("short lines are untouched; plain mode prints one line", () => {
		const out: string[] = [];
		startStatus((t) => out.push(t), "hi", { animate: true, columns: () => 80 }).stop("done");
		expect(out[0]).toBe("\r\x1b[2K⠋ hi 0s");
		expect(out.at(-1)).toBe("done\n");
		const plain: string[] = [];
		startStatus((t) => plain.push(t), "hi", { animate: false }).stop();
		expect(plain).toEqual(["hi\n"]);
	});
});
