import { describe, expect, test } from "bun:test";
import { parseScalar, parseYaml, stringifyYaml, YamlError } from "./yaml.ts";

describe("parseYaml", () => {
	test("nested mappings, scalars and comments", () => {
		const doc = parseYaml(`# top
project: myapp
version: "1"
tier: 2                    # trailing comment
agent:
  command: "claude -p --model x"   # quoted with spaces
limits:
  proposals: 10
  ratio: 1.5
view:
  write: false
empty:
`);
		expect(doc).toEqual({
			project: "myapp",
			version: "1",
			tier: 2,
			agent: { command: "claude -p --model x" },
			limits: { proposals: 10, ratio: 1.5 },
			view: { write: false },
			empty: null,
		});
	});

	test("a key whose block holds only comments is null", () => {
		expect(parseYaml("agent:\n  # command: x\nlimits:\n  a: 1\n")).toEqual({
			agent: null,
			limits: { a: 1 },
		});
	});

	test("sequences: block and flow", () => {
		expect(parseYaml("a:\n  - x\n  - 2\nb: [c, 'd e', 3]\nc: []\n")).toEqual({
			a: ["x", 2],
			b: ["c", "d e", 3],
			c: [],
		});
	});

	test("hash inside quotes is not a comment", () => {
		expect(parseYaml(`a: "x # y"\nb: 'it''s'`)).toEqual({ a: "x # y", b: "it's" });
	});

	test("empty document", () => {
		expect(parseYaml("")).toEqual({});
		expect(parseYaml("# only a comment\n")).toEqual({});
	});

	test("errors carry line numbers", () => {
		expect(() => parseYaml("a: 1\nnot a mapping\n")).toThrow(/line 2/);
		expect(() => parseYaml("a:\n\tb: 1\n")).toThrow(YamlError);
		expect(() => parseYaml("- a\n")).toThrow(/top-level sequences/);
		expect(() => parseYaml("a: 1\n    b: 2\n")).toThrow(/indentation/);
		expect(() => parseYaml("a:\n  - k: v\n")).toThrow(/scalar sequence/);
	});

	test("scalars", () => {
		expect(parseScalar("~")).toBeNull();
		expect(parseScalar("null")).toBeNull();
		expect(parseScalar("true")).toBe(true);
		expect(parseScalar("-3")).toBe(-3);
		expect(parseScalar("{}")).toEqual({});
		expect(parseScalar("bare words")).toBe("bare words");
		expect(() => parseScalar("{a: 1}")).toThrow(/flow mappings/);
		expect(() => parseScalar("[a")).toThrow(/unclosed/);
	});
});

describe("stringifyYaml", () => {
	test("round-trips", () => {
		const data = {
			project: "my app",
			version: "1",
			tier: 2,
			n: null,
			agent: { command: "claude -p: x" },
			empty: {},
			list: ["a", "b c", 1],
			flags: { write: true },
		};
		expect(parseYaml(stringifyYaml(data))).toEqual(data);
	});

	test("quotes ambiguous strings", () => {
		const out = stringifyYaml({ a: "true", b: "12", c: "", d: "-x", e: "#x" });
		expect(parseYaml(out)).toEqual({ a: "true", b: "12", c: "", d: "-x", e: "#x" });
		expect(out).toContain('a: "true"');
	});
});
