// Agent notes (`roots note`, tier ≥ 1): artifacts an agent attaches to a
// human idea (research, diagrams). Stored at
//   .roots/agent/notes/<hex>/YYYY-MM-DD-<slug>.<ext>
// where <hex> is the idea's hex, <slug> comes from --name (else the source
// file name) and a collision gets -2, -3, ... before the extension. The name
// is rebuilt from sanitized parts, so no input can steer the path; the write
// still goes through boundary.ts (no traversal, no symlinks, never human/)
// and is exclusive (O_EXCL). Files are copied byte for byte, up to
// NOTE_MAX_BYTES. One `note` event per note.

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, extname, join, relative, resolve } from "node:path";
import { agentWriteExclusive, isInside, realOrSelf } from "./boundary.ts";
import { loadConfig } from "./config.ts";
import { GuardError, NotFoundError, UsageError, ValidationError } from "./errors.ts";
import { appendEvent, makeEvent } from "./events.ts";
import { hexOf } from "./ids.ts";
import type { RootsPaths } from "./paths.ts";
import { slugify } from "./slug.ts";
import { requireTier } from "./tier.ts";
import { isoNow } from "./time.ts";
import type { Actor, NodeRecord } from "./types.ts";

export const NOTE_MAX_BYTES = 1024 * 1024;
const EXT_RE = /^[a-z0-9]{1,10}$/;

export interface NoteEntry {
	name: string;
	/** Relative to the project root. */
	path: string;
	bytes: number;
}

export function notesDir(paths: RootsPaths, node: Pick<NodeRecord, "id">): string {
	return join(paths.notes, hexOf(node.id));
}

/** Notes attached to an idea, sorted by name (oldest date first). */
export function listNotes(paths: RootsPaths, node: Pick<NodeRecord, "id">): NoteEntry[] {
	const dir = notesDir(paths, node);
	if (!existsSync(dir)) return [];
	try {
		const out: NoteEntry[] = [];
		for (const name of readdirSync(dir).sort()) {
			if (name.startsWith(".")) continue;
			const st = statSync(join(dir, name));
			if (!st.isFile()) continue;
			out.push({ name, path: relative(paths.root, join(dir, name)), bytes: st.size });
		}
		return out;
	} catch {
		return [];
	}
}

/** Lowercase alphanumeric extension of `name`, or "" when it has none (or a strange one). */
export function noteExt(name: string): string {
	const ext = extname(name).slice(1).toLowerCase();
	return EXT_RE.test(ext) ? ext : "";
}

/** `YYYY-MM-DD-<slug>[.<ext>]`, unique among `taken` (collision suffix before the extension). */
export function noteFileName(
	name: string,
	date: Date,
	taken: ReadonlySet<string>,
	fallbackExt = "",
): string {
	const own = noteExt(name);
	const ext = own || fallbackExt;
	const stem = own ? name.slice(0, -(own.length + 1)) : name;
	const base = `${isoNow(date).slice(0, 10)}-${slugify(stem) || "note"}`;
	const suffix = ext ? `.${ext}` : "";
	for (let n = 1; ; n++) {
		const candidate = `${base}${n === 1 ? "" : `-${n}`}${suffix}`;
		if (!taken.has(candidate)) return candidate;
	}
}

function readSource(file: string): Buffer {
	let st: ReturnType<typeof statSync>;
	try {
		st = statSync(file);
	} catch {
		throw new NotFoundError(`no such file: ${file}`);
	}
	if (!st.isFile()) throw new UsageError(`${file} is not a regular file`);
	if (st.size > NOTE_MAX_BYTES) {
		throw new ValidationError(
			`${file} is ${st.size} bytes; notes are limited to ${NOTE_MAX_BYTES} bytes (1 MiB)`,
			{ bytes: st.size, limit: NOTE_MAX_BYTES },
		);
	}
	return readFileSync(file);
}

function checkTarget(node: NodeRecord): void {
	if (node.kind !== "idea") {
		throw new ValidationError(`${node.id} is a sprout; notes are attached to human ideas`);
	}
	if (node.status === "composted") throw new ValidationError(`${node.id} is composted`);
}

export interface NoteInput {
	node: NodeRecord;
	/** Source file (absolute, or relative to cwd). */
	file: string;
	cwd: string;
	/** Display name for the note (default: the source file name). */
	name?: string;
	by: Actor;
	now?: Date;
}

export interface NoteResult {
	note: NoteEntry;
	node: string;
}

/** Validate and copy one note into .roots/agent/notes/<hex>/. */
export async function attachNote(paths: RootsPaths, input: NoteInput): Promise<NoteResult> {
	if (!input.by.startsWith("agent:")) throw new GuardError("only agents attach notes");
	checkTarget(input.node);
	requireTier(loadConfig(paths), 1, "`roots note`", input.node);
	const src = resolve(input.cwd, input.file);
	if (isInside(paths.dir, src) || isInside(paths.dir, realOrSelf(src))) {
		throw new UsageError("a note is an outside artifact; files under .roots/ cannot be attached");
	}
	const data = readSource(src);
	const now = input.now ?? new Date();
	const dir = notesDir(paths, input.node);
	const taken = new Set(listNotes(paths, input.node).map((n) => n.name));
	const display = input.name?.trim() || basename(src);
	const name = noteFileName(display, now, taken, noteExt(basename(src)));
	const target = join(dir, name);
	agentWriteExclusive(paths, target, data);
	const note: NoteEntry = { name, path: relative(paths.root, target), bytes: data.length };
	await appendEvent(
		paths,
		makeEvent("note", input.by, {
			node: input.node.id,
			file: note.path,
			bytes: note.bytes,
			hash: `sha256:${createHash("sha256").update(data).digest("hex")}`,
		}),
	);
	return { note, node: input.node.id };
}
