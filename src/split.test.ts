import { describe, expect, test } from "bun:test";
import {
	detectMultiplexer,
	editorHint,
	launchEditorSplit,
	type Spawner,
	shellQuote,
	splitArgv,
} from "./split.ts";

function recorder(results: Array<{ status: number | null; stdout?: string }>) {
	const calls: string[][] = [];
	const spawn: Spawner = (argv) => {
		calls.push(argv);
		const r = results.shift() ?? { status: 0 };
		return { status: r.status, stdout: r.stdout ?? "" };
	};
	return { calls, spawn };
}

describe("split", () => {
	test("detectMultiplexer", () => {
		expect(detectMultiplexer({ TMUX: "/tmp/tmux-1/default,1,0" })).toBe("tmux");
		expect(detectMultiplexer({ ZELLIJ: "0" })).toBe("zellij");
		expect(detectMultiplexer({ HERDR_PANE_ID: "w:p", HERDR_ENV: "1" })).toBeNull();
		expect(detectMultiplexer({})).toBeNull();
	});

	test("tmux and zellij argv", () => {
		expect(splitArgv("tmux", "nvim", "a b/idea.md", "/p")).toEqual([
			"tmux",
			"split-window",
			"-h",
			"-c",
			"/p",
			"nvim 'a b/idea.md'",
		]);
		expect(splitArgv("zellij", "code -w", "x.md", "/p").slice(-4)).toEqual([
			"-c",
			'code -w "$1"',
			"roots-editor",
			"x.md",
		]);
		expect(shellQuote("it's")).toBe("'it'\\''s'");
	});

	test("launch via tmux uses $EDITOR; no multiplexer does nothing", () => {
		const { calls, spawn } = recorder([{ status: 0 }]);
		expect(launchEditorSplit({ TMUX: "1", EDITOR: "nvim" }, "f.md", "/p", spawn)).toEqual({
			mux: "tmux",
			ok: true,
		});
		expect(calls[0]?.at(-1)).toBe("nvim f.md");
		const none = recorder([]);
		expect(launchEditorSplit({}, "f.md", "/p", none.spawn)).toEqual({ mux: null, ok: false });
		expect(none.calls).toEqual([]);
	});

	test("editorHint", () => {
		expect(editorHint({ mux: "tmux", ok: true }, "f.md")).toBe(
			"Editing f.md in a tmux pane. Save to answer.",
		);
		expect(editorHint(null, "f.md")).toBe(
			"Open f.md in your editor in another pane. Save to answer.",
		);
		expect(editorHint({ mux: "zellij", ok: false }, "f.md")).toContain(
			"could not open a zellij split",
		);
	});
});
