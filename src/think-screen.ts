// The left-pane think screen (SPEC "The think Loop (UX)"). Pure: takes a
// view model, returns lines. Raw ANSI via Colors (NO_COLOR respected).

import type { Colors } from "./color.ts";
import { EDGE_LABEL_WIDTH, type EdgeDirection, edgeLabel, truncate } from "./format.ts";
import type { EdgeRel, NodeStatus } from "./types.ts";

export interface ScreenEdge {
	rel: EdgeRel;
	direction: EdgeDirection;
	id: string;
	slug: string;
}

export interface ScreenQuestion {
	text: string;
	/** Rule name, `agent`, or another source label. */
	source: string;
	/** 1-based position and total. */
	index: number;
	total: number;
}

export interface ScreenView {
	id: string;
	slug: string;
	status: NodeStatus;
	statement: string;
	edges: ScreenEdge[];
	question: ScreenQuestion | null;
	notice: string | null;
	/** Where the idea file is being edited. */
	editorHint: string;
	/** Shown above the question, e.g. an accepted split proposal (agent text, dimmed). */
	guidance?: ScreenGuidance | null;
}

export interface ScreenGuidance {
	/** Divider label, e.g. "split p-3b21". */
	label: string;
	source: string;
	text: string;
}

interface Seg {
	t: string;
	s?: (x: string) => string;
}

export const MIN_WIDTH = 32;
export const MAX_WIDTH = 100;

function wrapPara(para: string, width: number): string[] {
	const lines: string[] = [];
	let cur = "";
	for (const word of para.split(/\s+/).filter(Boolean)) {
		const chars = [...word];
		for (let i = 0; i < chars.length; i += width) {
			const piece = chars.slice(i, i + width).join("");
			const next = cur ? `${cur} ${piece}` : piece;
			if ([...next].length <= width) {
				cur = next;
				continue;
			}
			if (cur) lines.push(cur);
			cur = piece;
		}
	}
	lines.push(cur);
	return lines;
}

/** Word-wrap plain text; words longer than `width` are hard-broken. */
export function wrapText(text: string, width: number): string[] {
	return text.split("\n").flatMap((p) => wrapPara(p, width));
}

/** Fit styled segments into exactly `width` visible columns. */
function fit(segs: readonly Seg[], width: number): string {
	let used = 0;
	let out = "";
	for (const seg of segs) {
		const room = width - used;
		if (room <= 0) break;
		const len = [...seg.t].length;
		const t = len > room ? truncate(seg.t, room) : seg.t;
		used += Math.min(len, room);
		out += seg.s ? seg.s(t) : t;
	}
	return out + " ".repeat(Math.max(0, width - used));
}

function header(v: ScreenView, inner: number, c: Colors): Seg[] {
	// Status stays visible; the slug gives way on narrow panes.
	const room = Math.max(1, inner - v.id.length - v.status.length - 4);
	const slug = truncate(v.slug, room);
	const gap = Math.max(2, inner - v.id.length - 2 - [...slug].length - v.status.length);
	return [
		{ t: v.id, s: (x) => c.id(c.bold(x)) },
		{ t: `  ${slug}` },
		{ t: " ".repeat(gap) },
		{ t: v.status, s: c.cyan },
	];
}

function edgeRows(v: ScreenView, c: Colors): Seg[][] {
	if (v.edges.length === 0) return [[{ t: "(no links yet)", s: c.dim }]];
	return v.edges.map((e) => {
		const { label, arrow } = edgeLabel(e.rel, e.direction);
		return [
			{ t: `${label.padEnd(EDGE_LABEL_WIDTH)}${arrow} ` },
			{ t: e.id, s: c.id },
			{ t: ` ${e.slug}` },
		];
	});
}

function divider(label: string, source: string | null, inner: number, c: Colors): Seg[] {
	const head = `── ${label} ──${source ? ` [${source}] ` : " "}`;
	return [{ t: head + "─".repeat(Math.max(0, inner - [...head].length)), s: c.dim }];
}

function questionRows(v: ScreenView, inner: number, c: Colors): Seg[][] {
	const q = v.question;
	if (!q) {
		return [
			divider("no questions", null, inner, c),
			...wrapText("Nothing to ask right now. Write freely; saves are kept.", inner).map((t) => [
				{ t, s: c.dim },
			]),
		];
	}
	return [
		divider(`question ${q.index}/${q.total}`, q.source, inner, c),
		...wrapText(q.text, inner).map((t) => [{ t, s: c.bold }]),
	];
}

function guidanceRows(v: ScreenView, inner: number, c: Colors): Seg[][] {
	const g = v.guidance;
	if (!g) return [];
	return [
		divider(g.label, g.source, inner, c),
		...wrapText(g.text, inner).map((t) => [{ t, s: c.dim }]),
		[],
	];
}

const KEY_GAP = 2;

/**
 * Column widths when `cells` are laid out row-major, `cols` per row. The last
 * cell of each row does not widen its column (nothing follows it).
 */
function columnWidths(cells: readonly string[], cols: number): number[] {
	const widths = new Array<number>(cols).fill(0);
	cells.forEach((cell, i) => {
		const lastInRow = i % cols === cols - 1 || i === cells.length - 1;
		if (!lastInRow) widths[i % cols] = Math.max(widths[i % cols] ?? 0, cell.length);
	});
	return widths;
}

function gridWidth(cells: readonly string[], widths: readonly number[]): number {
	let max = 0;
	cells.forEach((cell, i) => {
		const col = i % widths.length;
		const offset = widths.slice(0, col).reduce((a, b) => a + b + KEY_GAP, 0);
		max = Math.max(max, offset + cell.length);
	});
	return max;
}

/** The widest grid (at most 3 per row, as in the SPEC mockup) that fits. */
function keyGrid(cells: readonly string[], inner: number): number[] {
	for (let cols = Math.min(3, cells.length); cols > 1; cols--) {
		const widths = columnWidths(cells, cols);
		if (gridWidth(cells, widths) <= inner) return widths;
	}
	return [0];
}

/** Keybind hints in aligned columns that fit `inner`. */
function keyRows(v: ScreenView, inner: number, c: Colors): Seg[][] {
	const keys: Array<[string, string]> = v.question
		? [
				["save", "answer"],
				["d", "dismiss"],
				["z", "snooze"],
				["s", "skip"],
				["q", "end session"],
			]
		: [["q", "end session"]];
	const widths = keyGrid(
		keys.map(([k, l]) => `[${k}] ${l}`),
		inner,
	);
	const rows: Seg[][] = [];
	keys.forEach(([key, label], i) => {
		const col = i % widths.length;
		if (col === 0) rows.push([]);
		const last = col === widths.length - 1 || i === keys.length - 1;
		const pad = last ? 0 : (widths[col] ?? 0) + KEY_GAP - (key.length + label.length + 3);
		rows[rows.length - 1]?.push({ t: `[${key}]`, s: c.cyan }, { t: ` ${label}${" ".repeat(pad)}` });
	});
	return rows;
}

export function screenWidth(columns: number): number {
	return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, columns));
}

export function renderScreen(v: ScreenView, columns: number, c: Colors): string[] {
	const width = screenWidth(columns);
	const inner = width - 4;
	const statement = truncate(`"${v.statement || "(empty)"}"`, inner);
	const rows: Seg[][] = [
		header(v, inner, c),
		[{ t: statement }],
		[],
		...edgeRows(v, c),
		[],
		...guidanceRows(v, inner, c),
		...questionRows(v, inner, c),
		[],
		v.notice ? [{ t: `✓ ${v.notice}`, s: c.green }] : [],
		...keyRows(v, inner, c),
	];
	const title = truncate(` roots think ${v.slug} `, width - 4);
	const top = `┌─${title}${"─".repeat(Math.max(0, width - 3 - [...title].length))}┐`;
	const body = rows.map((r) => `│ ${fit(r, inner)} │`);
	const bottom = `└${"─".repeat(width - 2)}┘`;
	const hint = wrapText(v.editorHint, width - 2).map((l) => ` ${c.dim(l)}`);
	return [c.dim(top), ...body, c.dim(bottom), ...hint];
}
