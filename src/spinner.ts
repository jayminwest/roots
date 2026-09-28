// A one-line status for slow steps (waiting on agent.command before a think
// session). Animated on an interactive terminal; a plain line otherwise.

export interface StatusLine {
	/** Clear the line; print `final` if given. Idempotent. */
	stop(final?: string): void;
}

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const CLEAR_LINE = "\r\x1b[2K";

export interface SpinnerOptions {
	animate: boolean;
	intervalMs?: number;
}

export function startStatus(
	write: (text: string) => void,
	text: string,
	opts: SpinnerOptions,
): StatusLine {
	const started = Date.now();
	let stopped = false;
	let frame = 0;
	const draw = () => {
		const secs = Math.floor((Date.now() - started) / 1000);
		write(`${CLEAR_LINE}${FRAMES[frame % FRAMES.length]} ${text} ${secs}s`);
		frame++;
	};
	let timer: ReturnType<typeof setInterval> | null = null;
	if (opts.animate) {
		draw();
		timer = setInterval(draw, opts.intervalMs ?? 100);
		timer.unref?.();
	} else {
		write(`${text}\n`);
	}
	return {
		stop(final) {
			if (stopped) return;
			stopped = true;
			if (timer) clearInterval(timer);
			if (opts.animate) write(CLEAR_LINE);
			if (final) write(`${final}\n`);
		},
	};
}
