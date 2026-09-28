import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	isAgentActor,
	isHumanActor,
	parseActor,
	resolveAgentActor,
	resolveHumanActor,
	rootsActor,
} from "./actor.ts";
import { GuardError } from "./errors.ts";
import { hasInteractiveTty, requireTty, ttyForcedForTests } from "./guard.ts";
import { tempDir } from "./test-helpers.ts";

/** An env with git isolated from the developer's own config. */
function isolatedGit(dir: string, userName?: string): Record<string, string | undefined> {
	const gitconfig = join(dir, "gitconfig");
	writeFileSync(gitconfig, userName ? `[user]\n\tname = ${userName}\n` : "");
	return {
		PATH: process.env.PATH,
		HOME: dir,
		GIT_CONFIG_NOSYSTEM: "1",
		GIT_CONFIG_GLOBAL: gitconfig,
	};
}

describe("parseActor", () => {
	test("recognizes the three actor forms", () => {
		expect(parseActor("human:jaymin-west")).toEqual({ kind: "human", name: "jaymin-west" });
		expect(parseActor("agent:claude-opus-5-5")).toEqual({ kind: "agent", name: "claude-opus-5-5" });
		expect(parseActor("roots")).toEqual({ kind: "roots", name: "" });
		expect(parseActor("roots:missing-done")).toEqual({ kind: "roots", name: "missing-done" });
		expect(parseActor("bot:x")).toBeNull();
		expect(parseActor("human:")).toBeNull();
		expect(parseActor("jaymin")).toBeNull();
		expect(isHumanActor("human:a")).toBe(true);
		expect(isAgentActor("human:a")).toBe(false);
		expect(rootsActor()).toBe("roots");
		expect(rootsActor("orphan")).toBe("roots:orphan");
	});
});

describe("resolveHumanActor", () => {
	test("ROOTS_USER wins and is kebab-cased", () => {
		const dir = tempDir();
		const env = { ...isolatedGit(dir, "Git Person"), ROOTS_USER: "Jaymin West" };
		expect(resolveHumanActor({ cwd: dir, env })).toBe("human:jaymin-west");
		expect(resolveHumanActor({ cwd: dir, env: { ...env, ROOTS_USER: "human:ann" } })).toBe(
			"human:ann",
		);
	});

	test("falls back to git user.name", () => {
		const dir = tempDir();
		expect(resolveHumanActor({ cwd: dir, env: isolatedGit(dir, "Git Person") })).toBe(
			"human:git-person",
		);
	});

	test("uses repo-local git config", () => {
		const dir = tempDir();
		const env = isolatedGit(dir);
		spawnSync("git", ["init", "-q"], { cwd: dir, env: env as NodeJS.ProcessEnv });
		spawnSync("git", ["config", "user.name", "Repo Local"], {
			cwd: dir,
			env: env as NodeJS.ProcessEnv,
		});
		expect(resolveHumanActor({ cwd: dir, env })).toBe("human:repo-local");
	});

	test("refuses when no name is available", () => {
		const dir = tempDir();
		expect(() => resolveHumanActor({ cwd: dir, env: isolatedGit(dir) })).toThrow(GuardError);
	});

	test("refuses non-human values in ROOTS_USER", () => {
		const dir = tempDir();
		const env = { ...isolatedGit(dir), ROOTS_USER: "agent:claude" };
		expect(() => resolveHumanActor({ cwd: dir, env })).toThrow(/must be a human name/);
		expect(() =>
			resolveHumanActor({ cwd: dir, env: { ...isolatedGit(dir), ROOTS_USER: "!!!" } }),
		).toThrow(/usable name/);
	});
});

describe("resolveAgentActor", () => {
	test("--as beats ROOTS_AGENT; bare model names get the agent: prefix", () => {
		expect(resolveAgentActor("agent:claude-opus-5-5", { env: { ROOTS_AGENT: "agent:x" } })).toBe(
			"agent:claude-opus-5-5",
		);
		expect(resolveAgentActor(undefined, { env: { ROOTS_AGENT: "agent:x" } })).toBe("agent:x");
		expect(resolveAgentActor(undefined, { env: { ROOTS_AGENT: "gpt-5" } })).toBe("agent:gpt-5");
	});

	test("refuses human identities and junk", () => {
		expect(() => resolveAgentActor("human:jaymin", { env: {} })).toThrow(/cannot act as a human/);
		expect(() => resolveAgentActor(undefined, { env: { ROOTS_AGENT: "human:x" } })).toThrow(
			GuardError,
		);
		expect(() => resolveAgentActor("roots:rule", { env: {} })).toThrow(/expected agent/);
		expect(() => resolveAgentActor("agent:", { env: {} })).toThrow(GuardError);
		expect(() => resolveAgentActor(undefined, { env: {} })).toThrow(/--as agent:<model>/);
	});
});

describe("TTY guard", () => {
	test("requires an interactive stdin", () => {
		expect(() => requireTty({ env: {}, stdinIsTTY: false }, "plant")).toThrow(GuardError);
		expect(() => requireTty({ env: {}, stdinIsTTY: true }, "plant")).not.toThrow();
	});

	test("test override needs both ROOTS_FORCE_TTY=1 and NODE_ENV=test", () => {
		expect(ttyForcedForTests({ ROOTS_FORCE_TTY: "1" })).toBe(false);
		expect(ttyForcedForTests({ ROOTS_FORCE_TTY: "1", NODE_ENV: "production" })).toBe(false);
		expect(ttyForcedForTests({ ROOTS_FORCE_TTY: "1", NODE_ENV: "test" })).toBe(true);
		expect(
			hasInteractiveTty({ env: { ROOTS_FORCE_TTY: "1", NODE_ENV: "test" }, stdinIsTTY: false }),
		).toBe(true);
	});
});
