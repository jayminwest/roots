// CLI runner: argv → command → exit code. Pure with respect to process
// globals (everything goes through Io) so tests can run it in-process.

import { parseArgs } from "./args.ts";
import { colorEnabled, makeColors } from "./color.ts";
import { EXIT, RootsError, UsageError } from "./errors.ts";
import type { Io } from "./io.ts";
import { errorEnvelope, Output } from "./output.ts";
import { COMMANDS } from "./register-all.ts";
import { type CommandDef, GLOBAL_FLAGS, renderCommandHelp, renderRootHelp } from "./registry.ts";
import { closest } from "./suggestions.ts";
import { NAME, VERSION } from "./version.ts";

export function findCommand(name: string): CommandDef | undefined {
	return COMMANDS.find((c) => c.name === name);
}

function colorsFor(io: Io) {
	return makeColors(colorEnabled(io.env, io.stdoutIsTTY));
}

async function printVersion(io: Io, json: boolean): Promise<number> {
	if (json) {
		const body = { success: true, command: "version", name: NAME, version: VERSION };
		await io.stdout(`${JSON.stringify(body, null, 2)}\n`);
	} else {
		await io.stdout(`${VERSION}\n`);
	}
	return EXIT.ok;
}

async function printRootHelp(io: Io, json: boolean): Promise<number> {
	if (json) {
		const commands = COMMANDS.map((c) => ({ name: c.name, usage: c.usage, summary: c.summary }));
		const body = { success: true, command: "help", version: VERSION, commands };
		await io.stdout(`${JSON.stringify(body, null, 2)}\n`);
		return EXIT.ok;
	}
	await io.stdout(renderRootHelp(COMMANDS, VERSION, colorsFor(io)));
	return EXIT.ok;
}

async function reportError(
	io: Io,
	err: unknown,
	command: string | undefined,
	json: boolean,
): Promise<number> {
	const known = err instanceof RootsError;
	const message = err instanceof Error ? err.message : String(err);
	const code = known ? err.code : "internal";
	const exitCode = known ? err.exitCode : EXIT.error;
	const detail = known ? err.detail : undefined;
	if (json) {
		await io.stdout(errorEnvelope(command, message, code, detail));
	} else {
		io.stderr(`${colorsFor(io).red("error:")} ${message}\n`);
		if (!known && err instanceof Error && io.env.ROOTS_DEBUG && err.stack) {
			io.stderr(`${err.stack}\n`);
		}
	}
	return exitCode;
}

function checkArity(def: CommandDef, count: number): void {
	const min = def.minArgs ?? 0;
	if (count < min) throw new UsageError(`missing argument; usage: roots ${def.usage}`);
	if (def.maxArgs !== undefined && count > def.maxArgs) {
		throw new UsageError(`too many arguments; usage: roots ${def.usage}`);
	}
}

async function runCommand(def: CommandDef, argv: string[], io: Io): Promise<number> {
	const parsed = parseArgs(argv, { ...GLOBAL_FLAGS, ...def.flags });
	if (parsed.flags.help === true) {
		await io.stdout(renderCommandHelp(def, colorsFor(io)));
		return EXIT.ok;
	}
	checkArity(def, parsed.positionals.length);
	const out = new Output(io, {
		command: def.name,
		json: parsed.flags.json === true,
		quiet: parsed.flags.quiet === true,
	});
	await def.run({ io, out, args: parsed.positionals, flags: parsed.flags });
	return EXIT.ok;
}

function unknownCommand(name: string): UsageError {
	const hint = closest(
		name,
		COMMANDS.map((c) => c.name),
	);
	return new UsageError(
		`unknown command: ${name}${hint ? `. Did you mean \`roots ${hint}\`?` : ""}`,
		{
			suggestion: hint ?? null,
		},
	);
}

export async function runCli(argv: string[], io: Io): Promise<number> {
	const json = argv.includes("--json");
	const [first, ...rest] = argv;
	if (first === "--version" || first === "-v") return printVersion(io, json);
	if (first === undefined || first === "--help" || first === "-h" || first === "--json") {
		return printRootHelp(io, json);
	}
	if (first === "help") {
		const target = rest[0] ? findCommand(rest[0]) : undefined;
		if (target) return runCommand(target, ["--help"], io);
		return printRootHelp(io, json);
	}
	const def = findCommand(first);
	try {
		if (!def) throw unknownCommand(first);
		return await runCommand(def, rest, io);
	} catch (err) {
		return reportError(io, err, def?.name ?? first, json);
	}
}
