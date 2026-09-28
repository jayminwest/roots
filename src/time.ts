// Timestamps are ISO-8601 UTC with second precision, e.g. 2026-09-28T10:00:00Z.

export function isoNow(date: Date = new Date()): string {
	return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** YYYY-MM-DD HH:MM for human-readable logs. */
export function shortTime(iso: string): string {
	const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(iso);
	return m ? `${m[1]} ${m[2]}` : iso;
}
