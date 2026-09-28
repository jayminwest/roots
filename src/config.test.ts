import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import {
	defaultConfig,
	loadConfig,
	parseConfig,
	renderConfig,
	renderInitialConfig,
	writeConfig,
} from "./config.ts";
import { ConfigError } from "./errors.ts";
import { rootsPaths } from "./paths.ts";
import { tempDir } from "./test-helpers.ts";

describe("config", () => {
	test("defaults mirror the SPEC example", () => {
		const c = defaultConfig("myapp");
		expect(c.tier).toBe(2);
		expect(c.limits).toEqual({
			proposals: 10,
			sprouts: 5,
			questionsPerSession: 3,
			proposalTtlDays: 14,
			sproutTtlDays: 30,
		});
		expect(c.view.write).toBe(false);
		expect(c.agent.command).toBeNull();
	});

	test("initial config (with comments) parses back to defaults", () => {
		const c = defaultConfig("my app");
		expect(parseConfig(renderInitialConfig(c), "x")).toEqual(c);
		const withAgent = {
			...c,
			agent: { command: "claude -p --model claude-opus-5-5", timeoutSeconds: 30 },
		};
		expect(parseConfig(renderInitialConfig(withAgent), "x")).toEqual(withAgent);
	});

	test("partial files are merged over defaults", () => {
		const c = parseConfig("tier: 0\nlimits:\n  proposals: 3\n", "fallback");
		expect(c.project).toBe("fallback");
		expect(c.tier).toBe(0);
		expect(c.limits.proposals).toBe(3);
		expect(c.limits.sprouts).toBe(5);
	});

	test("invalid values are rejected with the field name", () => {
		expect(() => parseConfig("tier: 7\n", "p")).toThrow(/tier/);
		expect(() => parseConfig("tier: x\n", "p")).toThrow(ConfigError);
		expect(() => parseConfig("limits:\n  proposals: -1\n", "p")).toThrow(/limits.proposals/);
		expect(() => parseConfig("limits:\n  proposalTtlDays: 0\n", "p")).toThrow(/proposalTtlDays/);
		expect(() => parseConfig("view:\n  write: yes\n", "p")).toThrow(/view.write/);
		expect(() => parseConfig("agent: 3\n", "p")).toThrow(/agent/);
		expect(() => parseConfig("agent:\n  command: [a]\n", "p")).toThrow(/agent.command/);
		expect(() => parseConfig("agent:\n  timeoutSeconds: 0\n", "p")).toThrow(/timeoutSeconds/);
		expect(() => parseConfig("project: [a]\n", "p")).toThrow(/project/);
		expect(() => parseConfig("a: 1\n  b: 2\n", "p")).toThrow(ConfigError);
	});

	test("questions thresholds: defaults, overrides, validation", () => {
		expect(defaultConfig("p").questions).toEqual({
			doneAfterSessions: 1,
			bigBodyLines: 30,
			orphanAfterDays: 3,
			staleAfterDays: 30,
			snoozeDays: 7,
		});
		const c = parseConfig("questions:\n  orphanAfterDays: 10\n", "p");
		expect(c.questions.orphanAfterDays).toBe(10);
		expect(c.questions.staleAfterDays).toBe(30);
		expect(() => parseConfig("questions:\n  bigBodyLines: 0\n", "p")).toThrow(
			/questions.bigBodyLines/,
		);
		// Stage-1 configs without a questions section stay valid.
		expect(parseConfig("tier: 0\n", "p").questions).toEqual(defaultConfig("p").questions);
	});

	test("numeric project names are kept as strings", () => {
		expect(parseConfig("project: 42\n", "p").project).toBe("42");
	});

	test("load/write round-trip; missing file yields defaults", async () => {
		const dir = tempDir();
		const paths = rootsPaths(dir);
		expect(loadConfig(paths).project).toBe(dir.split("/").pop() ?? "");
		const c = { ...defaultConfig("demo"), tier: 1 as const };
		await writeConfig(paths, c);
		expect(loadConfig(paths)).toEqual(c);
		expect(renderConfig(c)).toContain("tier: 1");
		writeFileSync(paths.config, "tier: 9\n");
		expect(() => loadConfig(paths)).toThrow(ConfigError);
	});
});
