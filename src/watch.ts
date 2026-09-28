// Watch one prose file for saves.
//
// Editors save in different ways: in place (write + truncate), or by writing
// a temp file and renaming it over the original (vim's default, many IDEs).
// A watch on the file itself loses track after a rename, so this watches the
// parent directory and re-reads the file by path on any event there. Events are debounced (one
// save can fire several events), and a slow poll backs up fs.watch on
// filesystems where it is unreliable. `onChange` fires only when the content
// actually differs from the last text seen; a missing file (mid-rename) is
// ignored until it reappears.

import { existsSync, type FSWatcher, readFileSync, watch } from "node:fs";
import { dirname } from "node:path";

export interface WatchOptions {
	debounceMs?: number;
	/** Poll interval as a fallback for fs.watch; 0 disables polling. */
	pollMs?: number;
}

export interface FileWatcher {
	/** Re-read now (bypasses the debounce). */
	check(): void;
	close(): void;
}

export const DEFAULT_DEBOUNCE_MS = 120;
export const DEFAULT_POLL_MS = 1000;

function readIfExists(path: string): string | null {
	try {
		return existsSync(path) ? readFileSync(path, "utf8") : null;
	} catch {
		return null;
	}
}

function startFsWatch(dir: string, onEvent: () => void): FSWatcher | null {
	try {
		const w = watch(dir, () => onEvent());
		w.on("error", () => {
			// fall back to polling
		});
		return w;
	} catch {
		return null;
	}
}

export function watchFile(
	path: string,
	initialText: string,
	onChange: (text: string) => void,
	opts: WatchOptions = {},
): FileWatcher {
	const debounceMs = opts.debounceMs ?? DEFAULT_DEBOUNCE_MS;
	const pollMs = opts.pollMs ?? DEFAULT_POLL_MS;
	let last = initialText;
	let closed = false;
	let timer: ReturnType<typeof setTimeout> | null = null;

	const check = () => {
		if (closed) return;
		const text = readIfExists(path);
		if (text === null || text === last) return;
		last = text;
		onChange(text);
	};
	const schedule = () => {
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => {
			timer = null;
			check();
		}, debounceMs);
	};
	// Any event in the directory triggers a re-read: on macOS a rename over
	// the file is often reported under the temp file's name only.
	const fsw = startFsWatch(dirname(path), schedule);
	const poll = pollMs > 0 ? setInterval(check, pollMs) : null;
	poll?.unref?.();

	return {
		check,
		close() {
			closed = true;
			if (timer) clearTimeout(timer);
			if (poll) clearInterval(poll);
			fsw?.close();
		},
	};
}
