// Zero-dependency ANSI styling. Disabled when NO_COLOR is set, when stdout is
// not a TTY, or in --json mode.

export interface Colors {
	enabled: boolean;
	bold: (s: string) => string;
	dim: (s: string) => string;
	red: (s: string) => string;
	green: (s: string) => string;
	yellow: (s: string) => string;
	blue: (s: string) => string;
	magenta: (s: string) => string;
	cyan: (s: string) => string;
	/** Accent for IDs. */
	id: (s: string) => string;
}

function wrap(enabled: boolean, open: string, close: string): (s: string) => string {
	if (!enabled) return (s) => s;
	return (s) => `\x1b[${open}m${s}\x1b[${close}m`;
}

export function makeColors(enabled: boolean): Colors {
	return {
		enabled,
		bold: wrap(enabled, "1", "22"),
		dim: wrap(enabled, "2", "22"),
		red: wrap(enabled, "31", "39"),
		green: wrap(enabled, "32", "39"),
		yellow: wrap(enabled, "33", "39"),
		blue: wrap(enabled, "34", "39"),
		magenta: wrap(enabled, "35", "39"),
		cyan: wrap(enabled, "36", "39"),
		id: wrap(enabled, "38;5;179", "39"),
	};
}

export function colorEnabled(env: Record<string, string | undefined>, isTTY: boolean): boolean {
	if (env.NO_COLOR !== undefined && env.NO_COLOR !== "") return false;
	if (env.FORCE_COLOR !== undefined && env.FORCE_COLOR !== "" && env.FORCE_COLOR !== "0") {
		return true;
	}
	return isTTY;
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: ESC byte is needed to match ANSI sequences
const ANSI = /\x1b\[[0-9;]*m/g;

export function stripAnsi(s: string): string {
	return s.replace(ANSI, "");
}

/** Visible width of a string (ANSI stripped). */
export function visibleLength(s: string): number {
	return [...stripAnsi(s)].length;
}

export function padEnd(s: string, width: number): string {
	const len = visibleLength(s);
	return len >= width ? s : s + " ".repeat(width - len);
}
