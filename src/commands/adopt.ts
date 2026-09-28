// roots adopt <sprout-id> (human, TTY): create a new idea from a sprout. The
// human writes it in their own words: $EDITOR opens on an EMPTY idea.md and
// the sprout is shown only for reference (a read-only pager in a split pane
// when tmux/zellij is detected, and always printed to stderr before
// the editor opens). Sprout text is never copied into idea.md. Saving an
// empty file cancels: no node, no files, no events. See src/adopt.ts.

import { relative } from "node:path";
import { completeAdoption, requireOpenSprout } from "../adopt.ts";
import { flagBool, flagString } from "../args.ts";
import type { Decision } from "../decide.ts";
import { requireHumanCommand, requireTty } from "../guard.ts";
import type { Io } from "../io.ts";
import { printNext } from "../next.ts";
import type { RootsPaths } from "../paths.ts";
import { readNodeProse } from "../prose.ts";
import type { CommandDef } from "../registry.ts";
import { resolveNode } from "../resolve.ts";
import { launchInSplit, resolvePager, type Spawner, type SplitLaunch } from "../split.ts";
import { sproutDecision } from "../sprout-decide.ts";
import type { Actor, NodeRecord } from "../types.ts";
import { openWorkspace } from "../workspace.ts";
import { composeInEditor } from "./plant.ts";

export interface AdoptionOptions {
	by: Actor;
	/** Try a split pane for the reference (default true). */
	split: boolean;
	slug?: string;
	spawn?: Spawner;
}

function referenceBlock(io: Io, sprout: NodeRecord, text: string, launch: SplitLaunch | null) {
	const who = sprout.author.replace(/^agent:/, "");
	const lines = [
		`── [agent] sprout ${sprout.id} ${sprout.slug} (${who}) · reference only ──`,
		...text.trimEnd().split("\n"),
		"──",
	];
	if (launch?.ok) lines.push(`(also open read-only in a ${launch.mux} pane; quit it with q)`);
	lines.push(
		"Write the idea in your own words in the editor. Do not paste the sprout.",
		"Save an empty file to cancel.",
		"",
	);
	io.stderr(`${lines.join("\n")}\n`);
}

/**
 * The interactive adoption: show the sprout, open $EDITOR on an empty file,
 * record the idea + `derives` edge. Throws CancelledError on an empty save.
 * Shared by `roots adopt`, `roots accept s-…` on a TTY and `roots tend`.
 */
export async function runAdoption(
	io: Io,
	paths: RootsPaths,
	sproutId: string,
	opts: AdoptionOptions,
): Promise<Decision> {
	const sprout = await requireOpenSprout(paths, sproutId);
	const prose = readNodeProse(paths, sprout);
	const file = prose.path ? relative(paths.root, prose.path) : "";
	const launch =
		opts.split && file
			? launchInSplit(
					io.env,
					{ command: resolvePager(io.env), file, cwd: paths.root, focus: false },
					opts.spawn,
				)
			: null;
	referenceBlock(io, sprout, prose.text || "(sprout.md missing)", launch);
	const text = composeInEditor(io);
	const r = await completeAdoption(paths, {
		sprout: sprout.id,
		text,
		by: opts.by,
		slug: opts.slug,
	});
	const d = sproutDecision(sprout.id, "accept", r.sprout, r.idea, relative(paths.root, r.file));
	d.edge = r.edge;
	return d;
}

export const adoptCommand: CommandDef = {
	name: "adopt",
	group: "capture",
	summary: "Create a new idea from a sprout (you rewrite it)",
	usage: "adopt <sprout-id>",
	description:
		"Opens $EDITOR on an EMPTY idea.md; the sprout is shown for reference only (in a\n" +
		"split pane under tmux/zellij, and printed before the editor opens). Write\n" +
		"the idea in your own words; nothing is copied. Saving an empty file cancels.\n" +
		"Records `<new idea> derives <sprout>` and marks the sprout adopted. Needs an\n" +
		"interactive terminal and a human name (ROOTS_USER or git user.name).",
	flags: {
		slug: {
			type: "string",
			placeholder: "<slug>",
			description: "Slug for the new idea (default: from your first line)",
		},
		"no-split": { type: "boolean", description: "Do not open the sprout in a split pane" },
	},
	minArgs: 1,
	maxArgs: 1,
	async run({ io, out, args, flags }) {
		requireTty(io, "adopt");
		const by = requireHumanCommand(io, "adopt");
		const ws = await openWorkspace(io.cwd);
		const sprout = resolveNode(ws.graph.nodes, args[0] ?? "", { kind: "sprout" });
		const d = await runAdoption(io, ws.paths, sprout.id, {
			by,
			split: !flagBool(flags, "no-split"),
			slug: flagString(flags, "slug"),
		});
		const idea = d.sprout?.idea;
		await out.result({
			id: idea?.id,
			slug: idea?.slug,
			path: d.sprout?.file,
			sprout: d.sprout?.node,
			edge: d.edge,
		});
		await out.success(
			`adopted ${out.c.id(sprout.id)} as ${out.c.id(idea?.id ?? "")} ${idea?.slug}`,
		);
		await out.info(
			`  ${out.c.dim(`${d.sprout?.file ?? ""} · ${d.edge?.id} derives ${sprout.id}`)}`,
		);
		await printNext(out, ws.paths);
	},
};
