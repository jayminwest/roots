import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { rootsPaths } from "./paths.ts";
import {
	canonicalNodeDir,
	contentHash,
	dirHex,
	dirNameFor,
	dirSlug,
	locateNodeDir,
	parseProse,
	readNodeProse,
	scanDir,
	scanNodeDirs,
} from "./prose.ts";
import { tempDir } from "./test-helpers.ts";

describe("parseProse", () => {
	test("first non-empty line is the statement", () => {
		const p = parseProse(
			"\n\n  Sync works offline.  \n\nField users lose signal.\n\nDone means X.\n\n",
		);
		expect(p.statement).toBe("Sync works offline.");
		expect(p.body).toBe("Field users lose signal.\n\nDone means X.");
	});

	test("statement only, empty, CRLF", () => {
		expect(parseProse("One line")).toEqual({ statement: "One line", body: "" });
		expect(parseProse("  \n\n")).toEqual({ statement: "", body: "" });
		expect(parseProse("A\r\nB\r\n")).toEqual({ statement: "A", body: "B" });
	});
});

describe("node directories", () => {
	test("dir name parsing", () => {
		expect(dirHex("a1b2-offline-sync")).toBe("a1b2");
		expect(dirSlug("a1b2-offline-sync")).toBe("offline-sync");
		expect(dirHex("a1b2")).toBe("a1b2");
		expect(dirSlug("a1b2")).toBe("");
		expect(dirHex("notes")).toBeNull();
		expect(dirHex("A1B2-x")).toBeNull();
		expect(dirNameFor({ id: "r-a1b2", slug: "x" })).toBe("a1b2-x");
	});

	test("locate by canonical name, then by hex prefix", () => {
		const paths = rootsPaths(tempDir());
		mkdirSync(join(paths.human, "a1b2-renamed"), { recursive: true });
		mkdirSync(join(paths.human, "c3d4-x"), { recursive: true });
		writeFileSync(join(paths.human, "ffff-a-file"), "not a dir");
		mkdirSync(join(paths.sprouts, "9f3e-conflict-ui"), { recursive: true });
		const dirs = scanNodeDirs(paths);
		expect([...dirs.idea.keys()].sort()).toEqual(["a1b2", "c3d4"]);
		expect(locateNodeDir(paths, { id: "r-a1b2", kind: "idea", slug: "orig" }, dirs)).toBe(
			join(paths.human, "a1b2-renamed"),
		);
		expect(locateNodeDir(paths, { id: "r-9f3e", kind: "idea", slug: "x" }, dirs)).toBeNull();
		expect(locateNodeDir(paths, { id: "s-9f3e", kind: "sprout", slug: "conflict-ui" })).toBe(
			join(paths.sprouts, "9f3e-conflict-ui"),
		);
		expect(canonicalNodeDir(paths, { id: "r-a1b2", kind: "idea", slug: "y" })).toBe(
			join(paths.human, "a1b2-y"),
		);
		expect(scanDir(join(paths.dir, "missing")).size).toBe(0);
	});

	test("readNodeProse reads idea.md / sprout.md and reports missing files", () => {
		const paths = rootsPaths(tempDir());
		const dir = join(paths.human, "a1b2-x");
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, "idea.md"), "Statement.\n\nBody.\n");
		const idea = readNodeProse(paths, { id: "r-a1b2", kind: "idea", slug: "x" });
		expect(idea).toMatchObject({ exists: true, statement: "Statement.", body: "Body." });
		const missing = readNodeProse(paths, { id: "r-0000", kind: "idea", slug: "x" });
		expect(missing).toMatchObject({ exists: false, path: null, statement: "" });
		mkdirSync(join(paths.sprouts, "9f3e-s"), { recursive: true });
		const noFile = readNodeProse(paths, { id: "s-9f3e", kind: "sprout", slug: "s" });
		expect(noFile.exists).toBe(false);
		expect(noFile.path).toBe(join(paths.sprouts, "9f3e-s", "sprout.md"));
	});

	test("contentHash is stable sha256", () => {
		expect(contentHash("x")).toBe(contentHash("x"));
		expect(contentHash("x")).toMatch(/^sha256:[0-9a-f]{64}$/);
	});
});
