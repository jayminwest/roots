// Minimal, zero-dependency argument parser.
//
// Supports: --flag, --flag value, --flag=value, -x (short aliases),
// repeatable string flags, and `--` to end flag parsing. Unknown flags are a
// UsageError with a did-you-mean hint.

import { UsageError } from "./errors.ts";
import { closest } from "./suggestions.ts";

export interface FlagSpec {
	type: "boolean" | "string";
	short?: string;
	/** Repeatable string flag; value is string[]. */
	multiple?: boolean;
	description: string;
	/** Placeholder shown in help, e.g. "<status>". */
	placeholder?: string;
}

export type FlagSpecs = Record<string, FlagSpec>;
export type FlagValue = boolean | string | string[];

export interface ParsedArgs {
	positionals: string[];
	flags: Record<string, FlagValue>;
}

interface ParseState {
	specs: FlagSpecs;
	shorts: Map<string, string>;
	out: ParsedArgs;
}

function unknownFlag(raw: string, specs: FlagSpecs): UsageError {
	const hint = closest(raw.replace(/^-+/, ""), Object.keys(specs));
	const suffix = hint ? ` Did you mean --${hint}?` : "";
	return new UsageError(`unknown flag: ${raw}.${suffix}`);
}

function setFlag(state: ParseState, name: string, value: string | true): void {
	const spec = state.specs[name];
	if (!spec) return;
	if (spec.type === "boolean") {
		state.out.flags[name] = true;
		return;
	}
	if (value === true) throw new UsageError(`flag --${name} requires a value`);
	if (spec.multiple) {
		const prev = state.out.flags[name];
		state.out.flags[name] = Array.isArray(prev) ? [...prev, value] : [value];
		return;
	}
	state.out.flags[name] = value;
}

/**
 * `--diff --json` must not swallow `--json` as the value: a following token
 * that names a known flag is an error, not a value.
 */
function isKnownFlag(state: ParseState, token: string): boolean {
	if (token.startsWith("--")) {
		const name = token.slice(2).split("=")[0] ?? "";
		return name !== "" && state.specs[name] !== undefined;
	}
	return /^-[A-Za-z]$/.test(token) && state.shorts.has(token.slice(1));
}

/** Returns how many extra argv entries were consumed (0 or 1). */
function takeFlag(state: ParseState, name: string, raw: string, next: string | undefined): number {
	const eq = name.indexOf("=");
	const key = eq === -1 ? name : name.slice(0, eq);
	const spec = state.specs[key];
	if (!spec) throw unknownFlag(raw, state.specs);
	if (eq !== -1) {
		if (spec.type === "boolean") throw new UsageError(`flag --${key} does not take a value`);
		setFlag(state, key, name.slice(eq + 1));
		return 0;
	}
	if (spec.type === "boolean") {
		setFlag(state, key, true);
		return 0;
	}
	if (next === undefined || isKnownFlag(state, next)) {
		const hint =
			next === undefined ? "" : ` (got ${next}; write --${key}=${next} to pass it literally)`;
		throw new UsageError(`flag --${key} requires a value${hint}`);
	}
	setFlag(state, key, next);
	return 1;
}

function resolveShort(state: ParseState, raw: string): string {
	const long = state.shorts.get(raw.slice(1));
	if (!long) throw unknownFlag(raw, state.specs);
	return long;
}

export function parseArgs(argv: string[], specs: FlagSpecs): ParsedArgs {
	const shorts = new Map<string, string>();
	for (const [name, spec] of Object.entries(specs)) {
		if (spec.short) shorts.set(spec.short, name);
	}
	const state: ParseState = { specs, shorts, out: { positionals: [], flags: {} } };
	let i = 0;
	while (i < argv.length) {
		const arg = argv[i] ?? "";
		const next = argv[i + 1];
		if (arg === "--") {
			state.out.positionals.push(...argv.slice(i + 1));
			break;
		}
		if (arg.startsWith("--")) {
			i += 1 + takeFlag(state, arg.slice(2), arg, next);
		} else if (arg.length > 1 && arg.startsWith("-") && !/^-\d/.test(arg)) {
			i += 1 + takeFlag(state, resolveShort(state, arg), arg, next);
		} else {
			state.out.positionals.push(arg);
			i++;
		}
	}
	return state.out;
}

export function flagString(flags: Record<string, FlagValue>, name: string): string | undefined {
	const v = flags[name];
	return typeof v === "string" ? v : undefined;
}

export function flagBool(flags: Record<string, FlagValue>, name: string): boolean {
	return flags[name] === true;
}

export function flagList(flags: Record<string, FlagValue>, name: string): string[] {
	const v = flags[name];
	if (Array.isArray(v)) return v;
	return typeof v === "string" ? [v] : [];
}

/** Parse a non-negative integer flag, or throw a UsageError. */
export function flagInt(flags: Record<string, FlagValue>, name: string): number | undefined {
	const v = flagString(flags, name);
	if (v === undefined) return undefined;
	if (!/^\d+$/.test(v))
		throw new UsageError(`--${name} must be a non-negative integer (got "${v}")`);
	return Number(v);
}
