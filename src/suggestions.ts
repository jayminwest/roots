// Did-you-mean helpers (Levenshtein, seeds pattern).

export function levenshtein(a: string, b: string): number {
	const m = a.length;
	const n = b.length;
	if (m === 0) return n;
	if (n === 0) return m;
	let prev: number[] = Array.from({ length: n + 1 }, (_, j) => j);
	for (let i = 1; i <= m; i++) {
		const curr: number[] = [i];
		for (let j = 1; j <= n; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			curr.push(Math.min((curr[j - 1] ?? 0) + 1, (prev[j] ?? 0) + 1, (prev[j - 1] ?? 0) + cost));
		}
		prev = curr;
	}
	return prev[n] ?? 0;
}

/** Closest candidate within `maxDistance` edits, or undefined. Prefix matches win. */
export function closest(
	input: string,
	candidates: readonly string[],
	maxDistance = 2,
): string | undefined {
	if (input.length >= 2) {
		const prefixed = candidates.filter((c) => c.startsWith(input));
		if (prefixed.length === 1) return prefixed[0];
	}
	let best: string | undefined;
	let bestDist = Number.POSITIVE_INFINITY;
	for (const c of candidates) {
		const d = levenshtein(input, c);
		if (d < bestDist) {
			bestDist = d;
			best = c;
		}
	}
	return bestDist <= maxDistance ? best : undefined;
}
