// events.jsonl: append-only audit log. Every mutation appends exactly one event.

import type { RootsPaths } from "./paths.ts";
import { appendJsonlFile, dedupBy, readJsonlFile, withLock } from "./store.ts";
import { isoNow } from "./time.ts";
import type { Actor, EventRecord, EventType } from "./types.ts";

export function makeEvent(
	type: EventType,
	by: Actor,
	fields: { at?: string; node?: string; refs?: string[]; [extra: string]: unknown } = {},
): EventRecord {
	const { at, ...rest } = fields;
	return { type, by, at: at ?? isoNow(), ...rest };
}

export async function appendEvent(paths: RootsPaths, event: EventRecord): Promise<void> {
	await withLock(paths.events, () => appendJsonlFile(paths.events, [event]));
}

/**
 * All events in file order. Events have no id, so exact duplicate lines
 * (possible after a union merge) collapse to one.
 */
export function readEvents(paths: RootsPaths): EventRecord[] {
	return dedupBy(readJsonlFile<EventRecord>(paths.events), (e) => JSON.stringify(e));
}

/** Events whose subject is `id` or that reference it. */
export function eventsFor(events: EventRecord[], id: string): EventRecord[] {
	return events.filter((e) => e.node === id || (Array.isArray(e.refs) && e.refs.includes(id)));
}

/**
 * Distinct human/agent actors in first-seen order, starting with `author`.
 * The CLI's own `roots:*` bookkeeping is not a contribution.
 */
export function contributors(events: EventRecord[], author?: Actor): Actor[] {
	const seen = new Set<Actor>();
	if (author) seen.add(author);
	for (const e of events) {
		if (typeof e.by === "string" && !/^roots(:|$)/.test(e.by)) seen.add(e.by);
	}
	return [...seen];
}
