// The single command registry. Add new subcommands here.

import { acceptCommand, rejectCommand } from "./commands/accept.ts";
import { adoptCommand } from "./commands/adopt.ts";
import { askCommand } from "./commands/ask.ts";
import { blameCommand } from "./commands/blame.ts";
import { contextCommand } from "./commands/context.ts";
import { driftCommand } from "./commands/drift.ts";
import { flowCommand } from "./commands/flow.ts";
import { guardCommand } from "./commands/guard.ts";
import { headingCommand } from "./commands/heading.ts";
import { initCommand } from "./commands/init.ts";
import { commitCommand, compostCommand, statusCommand } from "./commands/lifecycle.ts";
import { linkCommand, unlinkCommand } from "./commands/link.ts";
import { listCommand } from "./commands/list.ts";
import { logCommand } from "./commands/log.ts";
import { mvCommand } from "./commands/mv.ts";
import { noteCommand } from "./commands/note.ts";
import { plantCommand } from "./commands/plant.ts";
import { primeCommand } from "./commands/prime.ts";
import { proposeCommand } from "./commands/propose.ts";
import { queueCommand } from "./commands/queue.ts";
import { scanCommand } from "./commands/scan.ts";
import { setupCommand } from "./commands/setup.ts";
import { showCommand } from "./commands/show.ts";
import { sproutCommand } from "./commands/sprout.ts";
import { tendCommand } from "./commands/tend.ts";
import { thinkCommand } from "./commands/think.ts";
import { tierCommand } from "./commands/tier.ts";
import { verifyCommand } from "./commands/verify.ts";
import { viewCommand } from "./commands/view.ts";
import type { CommandDef } from "./registry.ts";
import "./sprout-decide.ts";

export const COMMANDS: readonly CommandDef[] = [
	initCommand,
	setupCommand,
	guardCommand,
	plantCommand,
	thinkCommand,
	flowCommand,
	adoptCommand,
	mvCommand,
	tendCommand,
	acceptCommand,
	rejectCommand,
	linkCommand,
	scanCommand,
	unlinkCommand,
	commitCommand,
	statusCommand,
	compostCommand,
	tierCommand,
	contextCommand,
	primeCommand,
	driftCommand,
	askCommand,
	noteCommand,
	proposeCommand,
	sproutCommand,
	headingCommand,
	showCommand,
	blameCommand,
	listCommand,
	queueCommand,
	logCommand,
	viewCommand,
	verifyCommand,
];
