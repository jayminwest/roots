// Output helpers. One Output per command invocation.
//
// --json: exactly one JSON document on stdout, shaped like seeds:
//   {"success": true, "command": "<name>", ...}
//   {"success": false, "command": "<name>", "error": "...", "code": "..."}
// Human mode: text on stdout, warnings on stderr. --quiet silences
// success/info chatter but never the primary output of read commands.

import { type Colors, colorEnabled, makeColors } from "./color.ts";
import type { Io } from "./io.ts";

export interface OutputOptions {
	command: string;
	json: boolean;
	quiet: boolean;
}

export class Output {
	readonly command: string;
	readonly json: boolean;
	readonly quiet: boolean;
	readonly c: Colors;
	private readonly io: Io;

	constructor(io: Io, opts: OutputOptions) {
		this.io = io;
		this.command = opts.command;
		this.json = opts.json;
		this.quiet = opts.quiet;
		this.c = makeColors(!opts.json && colorEnabled(io.env, io.stdoutIsTTY));
	}

	/** Emit the success envelope (json mode only; no-op otherwise). */
	async result(data: Record<string, unknown> = {}): Promise<void> {
		if (!this.json) return;
		await this.io.stdout(
			`${JSON.stringify({ success: true, command: this.command, ...data }, null, 2)}\n`,
		);
	}

	/** Primary human output line (suppressed in json mode). */
	async line(text = ""): Promise<void> {
		if (this.json) return;
		await this.io.stdout(`${text}\n`);
	}

	async lines(texts: string[]): Promise<void> {
		if (this.json || texts.length === 0) return;
		await this.io.stdout(`${texts.join("\n")}\n`);
	}

	async success(msg: string): Promise<void> {
		if (this.json || this.quiet) return;
		await this.io.stdout(`${this.c.green("✓")} ${msg}\n`);
	}

	async info(msg: string): Promise<void> {
		if (this.json || this.quiet) return;
		await this.io.stdout(`${msg}\n`);
	}

	warn(msg: string): void {
		if (this.quiet) return;
		this.io.stderr(`${this.c.yellow("!")} ${msg}\n`);
	}
}

export function errorEnvelope(
	command: string | undefined,
	message: string,
	code: string,
	detail?: Record<string, unknown>,
): string {
	const body = { success: false, command: command ?? null, error: message, code, ...detail };
	return `${JSON.stringify(body, null, 2)}\n`;
}
