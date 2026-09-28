# Changelog

All notable changes to Roots are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

First implementation of [SPEC.md](SPEC.md), built in the spec's build order (stages 1-7).

### Added
- **Core (stage 1).** `init`, `plant`, `show`, `list`, `mv`, `log`. `.roots/` layout with
  CLI-owned `graph.jsonl` and append-only `events.jsonl` (one event with `by` per mutation).
  IDs `r-xxxx` resolve by id, hex, slug or unique prefix; a manual directory rename is fixed up
  on the next read. JSONL with advisory locks, atomic writes and last-wins dedup (seeds pattern).
  `--json` envelope on every command, did-you-mean for unknown commands, zero runtime deps.
- **Think loop, tier 0 (stage 2).** `think [<id>]`: two-pane session that watches `idea.md` for
  saves; a save that changes the file answers the current question. Keys `[d]` dismiss,
  `[z]` snooze, `[s]` skip, `[q]` end. Opens `$EDITOR` in a split inside tmux, zellij or herdr.
  Deterministic question rules (`missing-done`, `missing-scope`, `too-big`, `orphan`,
  `tension-open`, `stale`) with thresholds in `config.yaml`. Session end records the content hash.
  `queue` ranks what needs thinking.
- **Agent questions, tier 1 (stage 3).** `ask`, `context` (the per-idea packet), and
  `agent.command`: `think` runs the configured agent with the packet before the session (with a
  timeout) or waits for a harness to call `roots ask`. Per-idea tier override with `tier`.
- **Structure, tier 2 (stage 4).** `propose edge|split|merge|compost` with exact-substring
  citation checks, caps, TTL and permanent rejections. `tend` (one card per decision, one
  keystroke each), `accept`, `reject`, `link`, `unlink`, `commit`, `status`, `compost`.
  Deterministic mention detection at session end and in `scan` files link proposals.
  Edge invariants (`serves`/`replaces`/`derives` acyclic; `replaces` composts its target).
- **Sprouts and notes (stage 5).** `sprout` (agent tree, capped, expiring), `adopt` (the human
  rewrites the sprout in their own words; a `derives` edge keeps the lineage), `note` (agent
  artifacts under `agent/notes/<hex>/`).
- **Views and boundary (stage 6).** `view` (deterministic Markdown; `--html` page with graph and
  timelines; optional `ROOTS.md`), `verify` (human/agent boundary, graph invariants, hash
  ledger), `guard` (PreToolUse hook), `setup claude` (installs SessionStart `roots prime` and the
  guard hook; a Stop `roots drift` hook at tier 3).
- **Integrations, tier 3 (stage 7).** Read-only seeds link (`sd create --intent r-xxxx`; `show`
  lists linked issues; `queue` suggests `built` when all close), mulch learnings that cite an
  `r-` id in `show`, `drift [--diff <rev>]`, and `prime [--scope <id>]`.
- Fleet `check:all` gate suite (`bun run verify`): lint, typecheck, AGENTS.md accuracy,
  duplication, unused deps, file-size and debt-marker ratchets, coverage floors, CI parity.
  GitHub CI, Dependabot, issue/PR templates, labels.

### Changed
- Pending proposals that became moot (an endpoint idea composted or gone, or an endpoint sprout
  no longer open) are now handled like overdue ones: read paths (`queue`, `tend`, `show`, the
  agent proposal budget) hide them at once, and the next write that expires proposals (`tend`,
  `accept`, `reject`, filing) marks them `expired` with an `expire` event whose `reason` is
  `moot: <why>` (overdue ones log `reason: ttl`).

### Fixed
- Flaky `fs.watch` test: the rename test started writing before macOS FSEvents was live
  (about 1 run in 10 under load). Tests now wait until the watcher reports a change.
