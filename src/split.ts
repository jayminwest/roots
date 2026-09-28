// Open $EDITOR (or, for `roots adopt`, a pager on the sprout) in a split
// pane next to roots, when a terminal
// multiplexer is detectable. Detection: $TMUX (tmux), $ZELLIJ (zellij),
// $HERDR_PANE_ID / $HERDR_ENV (herdr). Otherwise the human opens the file in
// another pane themselves; think prints the path.

import { spawnSync } from "node:child_process";
import { resolveEditor } from "./editor.ts";
import type { Io } from "./io.ts";

export type Multiplexer = "tmux" | "zellij" | "herdr";

export function detectMultiplexer(env: Io["env"]): Multiplexer | null {
	if (env.TMUX) return "tmux";
	if (env.ZELLIJ !== undefined && env.ZELLIJ !== "") return "zellij";
	if (env.HERDR_PANE_ID || env.HERDR_ENV === "1") return "herdr";
	return null;
}

export function shellQuote(s: string): string {
	return /^[A-Za-z0-9_./-]+$/.test(s) ? s : `'${s.replace(/'/g, "'\\''")}'`;
}

/**
 * argv that opens `editor file` in a new pane to the right (tmux/zellij).
 * `focus: false` keeps focus in the current pane where the multiplexer allows
 * it (tmux `-d`); zellij focuses the new pane regardless.
 */
export function splitArgv(
	mux: "tmux" | "zellij",
	editor: string,
	file: string,
	cwd: string,
	focus = true,
) {
	if (mux === "tmux") {
		const detach = focus ? [] : ["-d"];
		return ["tmux", "split-window", "-h", ...detach, "-c", cwd, `${editor} ${shellQuote(file)}`];
	}
	return [
		"zellij",
		"run",
		"--direction",
		"right",
		"--cwd",
		cwd,
		"--",
		"sh",
		"-c",
		`${editor} "$1"`,
		"roots-editor",
		file,
	];
}

export interface SpawnResult {
	status: number | null;
	stdout: string;
}

export type Spawner = (argv: string[], cwd: string) => SpawnResult;

export const realSpawner: Spawner = (argv, cwd) => {
	const [cmd = "", ...rest] = argv;
	const r = spawnSync(cmd, rest, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
	return { status: r.error ? null : r.status, stdout: r.stdout ?? "" };
};

function herdrPaneId(stdout: string): string | null {
	try {
		const body = JSON.parse(stdout) as { result?: { pane?: { pane_id?: unknown } } };
		const id = body.result?.pane?.pane_id;
		return typeof id === "string" && id !== "" ? id : null;
	} catch {
		return null;
	}
}

function launchHerdr(
	spawn: Spawner,
	editor: string,
	file: string,
	cwd: string,
	focus: boolean,
): boolean {
	const argv = ["herdr", "pane", "split", "--current", "--direction", "right", "--cwd", cwd];
	const split = spawn(focus ? [...argv, "--focus"] : argv, cwd);
	const pane = split.status === 0 ? herdrPaneId(split.stdout) : null;
	if (!pane) return false;
	return spawn(["herdr", "pane", "run", pane, `${editor} ${shellQuote(file)}`], cwd).status === 0;
}

export interface SplitLaunch {
	mux: Multiplexer | null;
	ok: boolean;
}

export interface SplitCommand {
	command: string;
	file: string;
	cwd: string;
	/** Move focus to the new pane (default true: the editor case). */
	focus?: boolean;
}

/** Open `command file` in a split pane when a multiplexer is detected. */
export function launchInSplit(
	env: Io["env"],
	cmd: SplitCommand,
	spawn: Spawner = realSpawner,
): SplitLaunch {
	const mux = detectMultiplexer(env);
	if (!mux) return { mux, ok: false };
	const focus = cmd.focus ?? true;
	if (mux === "herdr") {
		return { mux, ok: launchHerdr(spawn, cmd.command, cmd.file, cmd.cwd, focus) };
	}
	const argv = splitArgv(mux, cmd.command, cmd.file, cmd.cwd, focus);
	return { mux, ok: spawn(argv, cmd.cwd).status === 0 };
}

/** Try to open the editor in a split. `file` is relative to `cwd`. */
export function launchEditorSplit(
	env: Io["env"],
	file: string,
	cwd: string,
	spawn: Spawner = realSpawner,
): SplitLaunch {
	return launchInSplit(env, { command: resolveEditor(env), file, cwd }, spawn);
}

/** Read-only pager for reference text (`roots adopt` shows the sprout this way). */
export function resolvePager(env: Io["env"]): string {
	return env.PAGER?.trim() || "less";
}

/** One-line hint for the think screen. */
export function editorHint(launch: SplitLaunch | null, file: string): string {
	if (launch?.ok) return `Editing ${file} in a ${launch.mux} pane. Save to answer.`;
	const failed = launch?.mux ? ` (could not open a ${launch.mux} split)` : "";
	return `Open ${file} in your editor in another pane${failed}. Save to answer.`;
}
