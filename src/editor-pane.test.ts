import { describe, expect, test } from "bun:test";
import { type EditorPane, isVimFamily, showInEditorPane } from "./editor-pane.ts";
import type { Spawner } from "./split.ts";

function recorder(replies: Record<string, { status: number | null; stdout: string }> = {}) {
	const calls: string[][] = [];
	const spawn: Spawner = (argv) => {
		calls.push(argv);
		return replies[argv[1] ?? ""] ?? { status: 0, stdout: "" };
	};
	return { calls, spawn };
}

const TMUX = { TMUX: "1", EDITOR: "nvim" };

describe("showInEditorPane", () => {
	test("first call opens a split and remembers the pane id", () => {
		const r = recorder({ "split-window": { status: 0, stdout: "%7\n" } });
		const pane: EditorPane = { id: null };
		expect(showInEditorPane(TMUX, pane, "a/idea.md", "/p", r.spawn)).toEqual({
			mux: "tmux",
			ok: true,
		});
		expect(pane.id).toBe("%7");
		expect(r.calls[0]).toEqual([
			"tmux",
			"split-window",
			"-h",
			"-P",
			"-F",
			"#{pane_id}",
			"-c",
			"/p",
			"nvim a/idea.md",
		]);
	});

	test("later calls switch the running vim to the next file", () => {
		const r = recorder({ "display-message": { status: 0, stdout: "nvim\n" } });
		const pane: EditorPane = { id: "%7" };
		expect(showInEditorPane(TMUX, pane, "b/idea.md", "/p", r.spawn).ok).toBe(true);
		expect(r.calls.map((c) => c[1])).toEqual(["display-message", "send-keys", "select-pane"]);
		expect(r.calls[1]).toEqual([
			"tmux",
			"send-keys",
			"-t",
			"%7",
			"Escape",
			":update | edit b/idea.md",
			"Enter",
		]);
	});

	test("a closed pane or a non-vim editor opens a new split", () => {
		const gone = recorder({
			"display-message": { status: 1, stdout: "" },
			"split-window": { status: 0, stdout: "%9" },
		});
		const pane: EditorPane = { id: "%7" };
		showInEditorPane(TMUX, pane, "b/idea.md", "/p", gone.spawn);
		expect(pane.id).toBe("%9");
		const code = recorder({ "split-window": { status: 0, stdout: "%3" } });
		showInEditorPane({ TMUX: "1", EDITOR: "code -w" }, { id: "%1" }, "b.md", "/p", code.spawn);
		expect(code.calls.map((c) => c[1])).toEqual(["split-window"]);
	});

	test("zellij and no multiplexer fall back to launchEditorSplit", () => {
		const r = recorder();
		expect(showInEditorPane({}, { id: null }, "f.md", "/p", r.spawn)).toEqual({
			mux: null,
			ok: false,
		});
		showInEditorPane({ ZELLIJ: "0", EDITOR: "nvim" }, { id: null }, "f.md", "/p", r.spawn);
		expect(r.calls[0]?.[0]).toBe("zellij");
	});

	test("isVimFamily", () => {
		expect(isVimFamily("/usr/bin/nvim -u NONE")).toBe(true);
		expect(isVimFamily("vi")).toBe(true);
		expect(isVimFamily("code -w")).toBe(false);
	});
});
