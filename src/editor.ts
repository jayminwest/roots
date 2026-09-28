// Launch the human's editor ($VISUAL, then $EDITOR, then vi) on a file.

import { spawnSync } from "node:child_process";
import { RootsError } from "./errors.ts";
import type { Io } from "./io.ts";

export function resolveEditor(env: Io["env"]): string {
	return env.VISUAL?.trim() || env.EDITOR?.trim() || "vi";
}

/**
 * Run the editor with an inherited terminal and wait for it to exit. The
 * editor string may contain arguments (e.g. "code -w"), so it runs via sh.
 */
export function openEditor(file: string, io: Pick<Io, "cwd" | "env">): void {
	const editor = resolveEditor(io.env);
	const r = spawnSync("sh", ["-c", `${editor} "$1"`, "roots-editor", file], {
		cwd: io.cwd,
		env: io.env as NodeJS.ProcessEnv,
		stdio: "inherit",
	});
	if (r.error) throw new RootsError(`could not start editor "${editor}": ${r.error.message}`);
	if (r.status !== 0) throw new RootsError(`editor "${editor}" exited with status ${r.status}`);
}
