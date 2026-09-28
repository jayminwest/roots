// `roots tend`, pure renderer: draws the current card as a box (SPEC
// "Structure (human)" card mockup). Split out of tend.ts (cards + reducer).

import type { Colors } from "./color.ts";
import { edgeLabel, truncate } from "./format.ts";
import {
	cardKeys,
	currentCard,
	daysLeft,
	expiringSoon,
	type ProposalCard,
	SPROUT_BODY_LINES,
	type SproutCard,
	type TendCard,
	type TendState,
} from "./tend.ts";
import { wrapText } from "./think-screen.ts";
import type { Actor } from "./types.ts";

export const CARD_MIN_WIDTH = 40;
export const CARD_MAX_WIDTH = 80;

function sourceLabel(sources: readonly Actor[]): string {
	return sources
		.map((s) => (s.startsWith("agent:") ? `[agent] ${s.slice("agent:".length)}` : s))
		.map((s) => (s === "roots:mention" ? "mention" : s))
		.join(" + ");
}

function relationLine(card: ProposalCard): string {
	const a = card.from.slug;
	const b = card.to?.slug ?? "";
	if (card.kind === "edge") {
		if (!card.rel) return `${a}  ─?─  ${b}`;
		const { label, arrow } = edgeLabel(card.rel, "out");
		return `${a}  ${arrow} ${label} ${arrow}  ${b}`;
	}
	if (card.kind === "merge") return `merge  ${a}  ⇄  ${b}`;
	return `${card.kind}  ${a}`;
}

function sproutBody(card: SproutCard, inner: number, c: Colors): string[] {
	const lines = wrapText(card.statement || "(empty)", inner).map((l) => c.bold(l));
	const body = card.body.split("\n").filter((l) => l.trim() !== "");
	if (body.length > 0) {
		lines.push("");
		const wrapped = body.flatMap((l) => wrapText(l, inner));
		lines.push(...wrapped.slice(0, SPROUT_BODY_LINES).map((l) => c.dim(l)));
		if (wrapped.length > SPROUT_BODY_LINES) lines.push(c.dim(`… (roots show ${card.id})`));
	}
	lines.push(
		"",
		...wrapText("adopt = write it as your own idea in $EDITOR; nothing is copied", inner).map((l) =>
			c.dim(l),
		),
	);
	return lines;
}

function cardBody(card: TendCard, inner: number, c: Colors): string[] {
	if (card.type === "sprout") return sproutBody(card, inner, c);
	return proposalBody(card, inner, c);
}

function proposalBody(card: ProposalCard, inner: number, c: Colors): string[] {
	const rel = relationLine(card);
	const relLines = [...rel].length <= inner ? [rel] : wrapText(rel, inner);
	const lines = [...relLines.map((l) => c.bold(l)), ""];
	if (card.reason) lines.push(...wrapText(`"${card.reason}"`, inner));
	for (const n of card.notes) lines.push(...wrapText(n, inner).map((l) => c.dim(l)));
	for (const cite of card.cites) {
		lines.push(...wrapText(`${cite.node}: "${cite.quote}"`, inner - 2).map((l) => `  ${l}`));
	}
	if (card.pickRel && card.rel) lines.push("", c.dim(`suggested: ${card.rel}; or pick one`));
	return lines;
}

function keyLines(card: TendCard, inner: number, c: Colors): string[] {
	const cells = cardKeys(card).map((k) => ({
		plain: `[${k.key}] ${k.label}`,
		key: k.key,
		label: k.label,
	}));
	const rows: string[] = [];
	let cur = "";
	let used = 0;
	for (const cell of cells) {
		const w = cell.plain.length;
		if (used > 0 && used + 2 + w > inner) {
			rows.push(cur);
			cur = "";
			used = 0;
		}
		cur += `${used > 0 ? "  " : ""}${c.cyan(`[${cell.key}]`)} ${cell.label}`;
		used += (used > 0 ? 2 : 0) + w;
	}
	if (cur) rows.push(cur);
	return rows;
}

function visible(s: string): number {
	// biome-ignore lint/suspicious/noControlCharactersInRegex: strip ANSI to measure
	return [...s.replace(/\x1b\[[0-9;]*m/g, "")].length;
}

function boxLine(content: string, inner: number): string {
	const len = visible(content);
	const text = len > inner ? truncate(content, inner) : content;
	return `│ ${text}${" ".repeat(Math.max(0, inner - visible(text)))} │`;
}

function header(card: TendCard, now: Date, width: number, c: Colors): string {
	const days = daysLeft(card.expiresAt, now);
	const head = card.type === "sprout" ? `sprout ${card.id}` : `proposal ${card.ids.join(" + ")}`;
	const sources = card.type === "sprout" ? [card.author] : card.sources;
	const tail = days === null ? "" : ` ── expires in ${days}d`;
	// The sources give way first on narrow screens; the id and expiry stay.
	const room = width - 8 - [...head].length - [...tail].length - 4;
	const src = room > 3 ? ` ── ${truncate(sourceLabel(sources), room)}` : "";
	const title = truncate(` ${head}${src}${tail} `, width - 4);
	const fill = "─".repeat(Math.max(0, width - 3 - [...title].length));
	const colored = expiringSoon(card, now) ? c.yellow(title) : title;
	return `${c.dim("┌─")}${colored}${c.dim(`${fill}┐`)}`;
}

export interface TendView {
	state: TendState;
	now: Date;
	/** Proposals expired at the start of this tend run. */
	expired: number;
	/** Sprouts expired at the start of this tend run. */
	expiredSprouts?: number;
}

export function renderTend(v: TendView, columns: number, c: Colors): string[] {
	const width = Math.max(CARD_MIN_WIDTH, Math.min(CARD_MAX_WIDTH, columns));
	const inner = width - 4;
	const card = currentCard(v.state);
	const top = [c.bold(`roots tend`) + c.dim(`  card ${v.state.index + 1}/${v.state.cards.length}`)];
	if (v.expired > 0) top.push(c.dim(`${v.expired} proposal${v.expired === 1 ? "" : "s"} expired`));
	const es = v.expiredSprouts ?? 0;
	if (es > 0) top.push(c.dim(`${es} sprout${es === 1 ? "" : "s"} expired`));
	if (!card) return top;
	const body = [...cardBody(card, inner, c), "", ...keyLines(card, inner, c)];
	const lines = [
		...top,
		"",
		header(card, v.now, width, c),
		...body.map((l) => boxLine(l, inner)),
		c.dim(`└${"─".repeat(width - 2)}┘`),
	];
	const s = v.state;
	if (s.reason !== null) lines.push(`reason: ${s.reason}█`, c.dim("[enter] reject  [esc] cancel"));
	if (s.busy) lines.push(c.dim("working…"));
	if (s.error) lines.push(c.red(`! ${s.error}`));
	else if (s.notice) lines.push(c.green(`✓ ${s.notice}`));
	lines.push(c.dim("[q] quit"));
	return lines;
}
