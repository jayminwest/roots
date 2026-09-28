import { describe, expect, test } from "bun:test";
import { type FlagSpecs, flagBool, flagInt, flagList, flagString, parseArgs } from "./args.ts";
import { UsageError } from "./errors.ts";

const specs: FlagSpecs = {
	json: { type: "boolean", description: "" },
	help: { type: "boolean", short: "h", description: "" },
	status: { type: "string", description: "" },
	limit: { type: "string", short: "n", description: "" },
	cite: { type: "string", multiple: true, description: "" },
};

describe("parseArgs", () => {
	test("positionals and flags in any order", () => {
		const r = parseArgs(["show", "--json", "x", "--status", "planted", "-n", "3"], specs);
		expect(r.positionals).toEqual(["show", "x"]);
		expect(r.flags).toEqual({ json: true, status: "planted", limit: "3" });
	});

	test("--flag=value, repeatable flags, --", () => {
		const r = parseArgs(
			["--status=a=b", "--cite", "r-1:x", "--cite=r-2:y", "--", "--json", "-h"],
			specs,
		);
		expect(r.flags).toEqual({ status: "a=b", cite: ["r-1:x", "r-2:y"] });
		expect(r.positionals).toEqual(["--json", "-h"]);
	});

	test("lone dash and negative numbers are positionals", () => {
		expect(parseArgs(["-", "-5"], specs).positionals).toEqual(["-", "-5"]);
	});

	test("errors", () => {
		expect(() => parseArgs(["--stauts", "x"], specs)).toThrow(/Did you mean --status/);
		expect(() => parseArgs(["-z"], specs)).toThrow(UsageError);
		expect(() => parseArgs(["--status"], specs)).toThrow(/requires a value/);
		expect(() => parseArgs(["--status", "--status"], specs)).toThrow(/--status=--status/);
		expect(() => parseArgs(["--json=1"], specs)).toThrow(/does not take a value/);
	});

	test("accessors", () => {
		const { flags } = parseArgs(["--json", "--limit", "5", "--cite", "a"], specs);
		expect(flagBool(flags, "json")).toBe(true);
		expect(flagBool(flags, "help")).toBe(false);
		expect(flagString(flags, "limit")).toBe("5");
		expect(flagString(flags, "json")).toBeUndefined();
		expect(flagInt(flags, "limit")).toBe(5);
		expect(flagInt(flags, "status")).toBeUndefined();
		expect(flagList(flags, "cite")).toEqual(["a"]);
		expect(flagList({ x: "one" }, "x")).toEqual(["one"]);
		expect(flagList(flags, "status")).toEqual([]);
		expect(() => flagInt({ limit: "-1" }, "limit")).toThrow(/non-negative integer/);
	});
});
