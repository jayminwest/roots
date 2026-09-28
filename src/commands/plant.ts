// roots plant [<statement>] (human, TTY): create an idea.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { resolveHumanActor } from "../actor.ts";
import { flagString } from "../args.ts";
import { openEditor } from "../editor.ts";
import { CancelledError, UsageError } from "../errors.ts";
import { appendEvent, makeEvent } from "../events.ts";
import { updateGraph } from "../graph.ts";
import { requireTty } from "../guard.ts";
import type { Io } from "../io.ts";
import { createNode } from "../node-create.ts";
import type { RootsPaths } from "../paths.ts";
import { contentHash, parseProse } from "../prose.ts";
import type { CommandDef } from "../registry.ts";
import type { Actor, NodeRecord } from "../types.ts";
import { openWorkspace } from "../workspace.ts";

/** Open $EDITOR on an empty temp idea.md and return what the human saved. */
export function composeInEditor(io: Io): string {
	const dir = mkdtempSync(join(tmpdir(), "roots-plant-"));
	const file = join(dir, "idea.md");
	try {
		writeFileSync(file, "");
		openEditor(file, io);
		return readFileSync(file, "utf8");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

export interface PlantInput {
	text: string;
	statement: string;
	slug?: string;
	by: Actor;
}

/** Create the node + idea.md under the graph lock. Returns the new node and file. */
export async function plantIdea(
	paths: RootsPaths,
	input: PlantInput,
): Promise<{ node: NodeRecord; file: string }> {
	return updateGraph(paths, (graph) => {
		const created = createNode(paths, graph, { ...input, kind: "idea", status: "planted" });
		return { write: true, result: created };
	});
}

function textFromArgs(args: string[]): string {
	const statement = args.join(" ").trim();
	if (statement === "") throw new UsageError("statement is empty");
	return `${statement}\n`;
}

export const plantCommand: CommandDef = {
	name: "plant",
	group: "capture",
	summary: "Create an idea. With no argument, opens $EDITOR",
	usage: "plant [<statement>]",
	description:
		"The first non-empty line of the idea is its statement: one claim, one sentence.\n" +
		"Requires an interactive terminal and a human name (ROOTS_USER or git user.name).",
	flags: {
		slug: {
			type: "string",
			placeholder: "<slug>",
			description: "Slug to use instead of one derived from the statement",
		},
	},
	async run({ io, out, args, flags }) {
		requireTty(io, "plant");
		const by = resolveHumanActor(io);
		const { paths } = await openWorkspace(io.cwd);
		const text = args.length > 0 ? textFromArgs(args) : composeInEditor(io);
		const { statement } = parseProse(text);
		if (statement === "") throw new CancelledError("empty idea; nothing planted");
		const { node, file } = await plantIdea(paths, {
			text,
			statement,
			slug: flagString(flags, "slug"),
			by,
		});
		await appendEvent(
			paths,
			makeEvent("plant", by, { node: node.id, slug: node.slug, hash: contentHash(text) }),
		);
		const rel = relative(paths.root, file);
		await out.result({
			id: node.id,
			slug: node.slug,
			status: node.status,
			author: by,
			path: rel,
			statement,
		});
		await out.success(`planted ${out.c.id(node.id)} ${node.slug}`);
		await out.info(`  ${out.c.dim(rel)}`);
	},
};
