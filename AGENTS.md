# AGENTS.md

**Roots**: git-native intent for projects. Humans write ideas. Agents ask questions and propose structure. Agents never write human intent. `SPEC.md` is the design source of truth. Read it before you change behavior. If code and spec disagree, raise it. Do not quietly pick one.

Part of os-eco. Seeds = what to do, Mulch = what we learned, Roots = why.

## Commands

```bash
bun install
bun run verify        # lint + typecheck + test; must pass before commit
bun test              # single: bun test src/foo.test.ts
bun run lint:fix
bun src/index.ts ...  # run the CLI (binary: roots)
```

## Stack

Bun, strict TypeScript, **zero runtime deps** (devDeps only). Biome: tabs, 100 cols, kebab-case filenames. `bun test` with real I/O in temp dirs, no mocks. Put tests next to code as `*.test.ts`. Follow seeds/mulch patterns (`../seeds/src/store.ts`) for JSONL, advisory locks, atomic writes and output helpers.

## Layout

```
src/index.ts        CLI entry + router (keep thin)
src/commands/       one file per subcommand
src/*.ts            store, ids, config, output, graph, etc.
.roots/             (in user projects) format defined in SPEC.md
```

## Invariants (do not break)

1. **Human/agent separation.** No agent command (`ask`, `note`, `propose`, `sprout`, `context`, `prime`) writes under `.roots/human/`. Human commands (`plant`, `think`, `adopt`) require a TTY.
2. **No LLM in the CLI.** An agent runs only through the user-configured `agent.command`.
3. **Human prose is untouched.** Roots never writes frontmatter, IDs or markers into `idea.md`. The statement is read from the file and is never cached in JSONL.
4. **Every agent write is validated.** Check tier, caps, TTL, exact-substring citations and permanent rejections, then fail with a clear error.
5. **Nothing auto-accepts.** Only humans create edges, change status or accept proposals.
6. `--json` on every command, same shape as seeds: `{success, command, ...}` / `{success:false, error}`.
7. `events.jsonl` is append-only. Every mutation logs one event with `by`.
8. JSONL is merge=union. Dedup on read, last occurrence wins.

## Workflow

- Start: `ml prime`, `sd prime`, `sd ready`.
- Build in the order in SPEC.md "Build Order". Make the tier-0 `think` loop feel good before you add agent features.
- Track work in `sd`. Record learnings with `ml record <domain>`. Domains: `cli store graph think agent view`.
- Before you finish: `bun run verify`, `sd close <id>`, `ml sync`, then commit. Commit only when asked.
