# Roots

Git-native intent for projects. Humans write ideas in small pieces over time. Agents help by asking questions and proposing structure. Agents never author human intent.

Seeds tracks *what to do*. Mulch records *what we learned*. Roots holds *why, and toward what*.

## Why

Project vision lives in one of two places, and both fail:

- **In your head.** Agents can't see it and it drifts. Nobody writes the 1000-line vision doc.
- **In agent-generated planning docs.** They are large, confident and unattributed. After two sessions nobody can tell what the human wanted from what the model invented.

Roots makes intent cheap to add (one line, one question, a few minutes) and keeps provenance explicit: every idea, edge and question has one author, and human and agent content can never be mistaken for each other.

## Design Principles

1. **The human is in charge but not burdened.** Humans write prose and answer yes/no. They never hand-author structure.
2. **Human and agent content never mix.** They use separate directories, separate ID namespaces and separate record types. There is no command that turns agent text into human text.
3. **Prose is plain.** Human files are plain Markdown: no frontmatter, no IDs, no link syntax. All structure lives in CLI-owned JSONL.
4. **The CLI is deterministic.** `roots` contains no LLM. Agents are clients that call the CLI. The CLI checks every agent write (caps, citations, tier).
5. **Slop is prevented by hard limits, not by good intentions.** Proposals are capped, expire and must cite human text. Nothing unaccepted appears in views.
6. **Ecosystem fit.** Same stack and conventions as seeds and mulch: Bun/TS, zero deps, JSONL + advisory locks, `--json` on every command.

## Vocabulary

| Term | Meaning |
|---|---|
| **Idea** | Atomic unit of intent. Human-authored. One claim, stated in one sentence. ID `r-xxxx`. |
| **Sprout** | An idea proposed by an agent. Lives only in the agent tree. ID `s-xxxx`. Never becomes an idea. |
| **Edge** | A typed relationship between two nodes. |
| **Proposal** | A pending agent suggestion (edge, split, merge). Not part of the graph until a human accepts it. |
| **Question** | A prompt that guides thinking about one idea. Asked by the agent or by deterministic rules. |
| **Session** | One `roots think` run on one idea. |
| **View** | A compiled document rendered from ideas and accepted edges. |

## On-Disk Format

```
.roots/
  config.yaml
  graph.jsonl            # nodes + accepted edges (CLI-owned)
  proposals.jsonl        # pending agent proposals (CLI-owned, capped)
  questions.jsonl        # asked questions + status (CLI-owned)
  events.jsonl           # append-only log of every mutation
  headings.jsonl         # agent headings for `roots flow` (CLI-owned, advisory)
  human/
    a1b2-offline-sync/
      idea.md            # human prose only
      assets/            # images, sketches, html — added by the human
  agent/
    sprouts/
      9f3e-conflict-ui/
        sprout.md        # agent prose
        assets/
    notes/
      a1b2/              # agent artifacts about human idea r-a1b2 (research, diagrams)
        2026-09-28-sync-prior-art.md
  .gitignore             # *.lock
```

`.gitattributes` (appended to project root):

```
.roots/*.jsonl merge=union
```

Dedup on read, last occurrence wins (same as seeds).

### The human/agent boundary

The separation is enforced at every layer:

| Layer | Human | Agent |
|---|---|---|
| Directory | `.roots/human/` | `.roots/agent/` |
| ID prefix | `r-` | `s-` (sprouts), `p-` (proposals), `q-` (questions) |
| Node kind | `idea` | `sprout` |
| Rendering | normal | always labeled `[agent]`, dimmed, separate section |
| Write path | `$EDITOR` in an interactive TTY | non-interactive CLI commands |

Guards:

1. **Commands that create human content require a TTY.** `roots plant`, `roots think` and `roots adopt` refuse to run without an interactive terminal. Agents in harnesses have no TTY.
2. **Agent commands never write to `human/`.** No code path in `roots` for `propose`, `sprout`, `ask` or `note` touches that tree.
3. **Harness hooks block direct file edits.** `roots setup claude` installs a PreToolUse hook that denies Write/Edit on `.roots/human/**`.
4. **Hash ledger.** Every `think` session records a content hash of `idea.md` when it ends. `roots verify` reports human files whose content changed outside a recorded session or a human-authored commit.

This threat model covers *accidental* mixing: an agent that is too helpful, or a user who forgets which file is which. It does not defend against a deliberately malicious actor with shell access.

### Adopting a sprout

`roots adopt s-9f3e` does **not** copy text. It:

1. Creates a new idea `r-xxxx` with an empty `idea.md`.
2. Opens it in `$EDITOR` with the sprout shown in the watch pane for reference.
3. The human writes the idea in their own words. If the file is saved empty, the adoption is cancelled.
4. Records an edge `r-xxxx derives s-9f3e` and sets the sprout's status to `adopted`.

The sprout stays in `agent/` permanently. The lineage is visible, but the texts never merge.

### Actors

Every record that says who did something uses one `by` format:

| Actor | Format | Source |
|---|---|---|
| Human | `human:<name>` | `ROOTS_USER`, else `git config user.name` slugified (e.g. `human:jaymin-west`) |
| Agent | `agent:<model>` | passed by the harness (`--as agent:claude-opus-5-5`) or `ROOTS_AGENT` |
| Deterministic | `roots` or `roots:<rule>` | the CLI itself |

Human commands require a resolvable name and refuse to run without one. Agent commands refuse `--as human:*`. The `human:` prefix is what marks human content. The name identifies which human wrote it.

### IDs and slugs

- ID: `r-` + 4 hex characters from a random hash (collision check, extend to 6 when needed). The ID is stable forever.
- Slug: kebab-case, taken from the idea's first line when the idea is planted. The human can change it.
- Directory name: `<hex>-<slug>` (e.g. `a1b2-offline-sync`). Humans see the slug. Tools use the hex.
- Resolution: every command accepts `r-a1b2`, `a1b2`, `offline-sync` or a unique prefix of any of them.
- `roots mv <id> <new-slug>` renames the directory. Because edges reference IDs, no link breaks. A manual `mv` in the shell also works: on the next read, `roots` matches directories by hex prefix and fixes up the slug.

### idea.md

Plain Markdown. The **first non-empty line is the statement**: the one-sentence claim. Everything after it is free-form prose.

```markdown
Sync works fully offline, and nobody loses work when the network drops.

Field users lose signal for hours. Today they see a spinner and then an error,
and anything typed during that time is gone.

Done means: I can edit for a day in airplane mode, reconnect, and nothing is lost
or duplicated.

Not trying to solve: real-time collaboration while offline.
```

No frontmatter. No markers written by roots. No `[[links]]`. If the human mentions another idea in prose ("this pulls against the auth idea"), roots turns that into a link proposal automatically (see [Mentions → proposals](#mentions--proposals)).

### graph.jsonl

One record per line. There are two record types.

Node:

```json
{"type":"node","id":"r-a1b2","kind":"idea","slug":"offline-sync","status":"shaping","author":"human:jaymin-west","createdAt":"2026-09-28T10:00:00Z","updatedAt":"2026-09-28T10:00:00Z"}
{"type":"node","id":"s-9f3e","kind":"sprout","slug":"conflict-ui","status":"open","author":"agent:claude-opus-5-5","createdAt":"2026-09-28T11:00:00Z"}
```

`author` is whoever planted the node: always `human:*` for ideas and always `agent:*` for sprouts. `roots verify` rejects any other combination. Later contributors to an idea (other humans editing in `think` sessions) are recorded in `events.jsonl`, so `roots show` can list everyone who shaped an idea.

The statement (first line of `idea.md`) is not stored in the JSONL. It is read from the file, so the file stays the single source of truth for prose.

Edge:

```json
{"type":"edge","id":"e-77c1","from":"r-a1b2","to":"r-c3d4","rel":"serves","by":"human:jaymin-west","createdAt":"2026-09-28T12:00:00Z"}
{"type":"edge","id":"e-81d0","from":"r-a1b2","to":"r-e5f6","rel":"tension","by":"human:jaymin-west","proposedBy":"agent:claude-opus-5-5","proposal":"p-3b21","createdAt":"2026-09-28T12:05:00Z"}
```

`by` is always the party who made the edge real: a `human:*` actor, either directly or by accepting a proposal. `proposedBy` keeps the agent's contribution visible.

### Edge types

Kept small on purpose. Rich edge typing is where graphs turn to slop.

| rel | Meaning | Constraint |
|---|---|---|
| `serves` | A is a means to B | acyclic |
| `tension` | A and B pull against each other | symmetric; stored once |
| `replaces` | A supersedes B; B moves to `composted` | acyclic |
| `derives` | idea A was adopted from sprout B | from `r-` to `s-` only; created by `adopt` |

**Anchors** are ideas with no outgoing `serves`. They are the top-level goals of the project. Nobody declares them. They come from the graph.

### proposals.jsonl

```json
{"id":"p-3b21","kind":"edge","from":"r-a1b2","to":"r-e5f6","rel":"tension","reason":"offline writes conflict with 'server is the source of truth'","cites":[{"node":"r-a1b2","quote":"nobody loses work when the network drops"},{"node":"r-e5f6","quote":"the server is always authoritative"}],"by":"agent:claude-opus-5-5","status":"pending","createdAt":"2026-09-28T11:30:00Z","expiresAt":"2026-10-12T11:30:00Z"}
```

Proposal kinds:

- `edge`: add an edge between two existing nodes.
- `split`: an idea looks like two claims. Accepting it starts a `think` session on the idea, with the proposed split shown as guidance. The human does the split. The agent never does.
- `merge`: two ideas look like duplicates. Accepting it lets the human choose which idea survives, and the other gets `replaces`.
- `compost`: an idea looks stale or already covered by others.

Validation at `propose` time (deterministic, rejects the call on failure):

1. The tier allows proposals.
2. The pending count is below `limits.proposals`.
3. Every `cites[].quote` is an exact substring of the cited node's current prose.
4. There are at least 2 citations for `edge`/`merge` and at least 1 for `split`/`compost`.
5. No human rejection of the same `(kind, from, to, rel)` exists. Rejections are permanent memory.

States: `pending → accepted | rejected | expired`. Accepting or rejecting records `decidedBy: human:<name>` and an optional reason.

### Mentions → proposals

When a human mentions another idea in prose, that mention becomes a link proposal automatically. The human never has to go back and wire it up.

After each `think` session (and on `roots scan` for edits made outside a session), roots looks for mentions in the lines that changed:

1. **Deterministic match** (every tier, `by: roots:mention`): the changed text contains another node's slug, ID, or a distinctive phrase from its statement (e.g. "the offline sync thing" matches `offline-sync`). Roots files an `edge` proposal with `rel: null`. The human picks the relation in `tend` (`[1] serves  [2] tension  [3] replaces`).
2. **Agent match** (tier ≥ 2): the context packet for the session end includes the changed spans and a list of candidate ideas. The agent proposes edges for fuzzy mentions ("this pulls against the auth idea") and suggests a `rel`.

Both kinds of proposal must cite the mentioning line as the source quote. That citation makes the human's own words the evidence. Deterministic and agent proposals for the same pair are merged into one card. A mention-derived proposal needs only one citation (the mentioning line) plus the target's statement, which roots fills in.

### questions.jsonl

```json
{"id":"q-5e10","node":"r-a1b2","text":"What happens to an edit made offline on a record someone else deleted?","by":"agent:claude-opus-5-5","status":"open","createdAt":"2026-09-28T10:05:00Z"}
{"id":"q-5e11","node":"r-a1b2","text":"What would make this done?","by":"roots:missing-done","status":"answered","answeredBy":"human:jaymin-west","answeredAt":"2026-09-28T10:09:00Z","session":"ss-12ab"}
```

- `by: roots:<rule>` means a deterministic rule asked it. `by: agent:<model>` means an agent asked it.
- States: `open → answered | dismissed | snoozed | delegated`, and `delegated → open` when findings arrive or the research run ends without them. See [Delegating a question](#delegating-a-question).
- `findings: [{note, by, at}]` lists the agent's research notes on a delegated question, newest last.
- Answers are **not** stored here. The answer is whatever the human wrote in `idea.md` during that question's session. The `answer` event in `events.jsonl` records the diff span and `lines`: a 12-hex hash (sha256, whitespace-trimmed) of each non-blank line the save added. Hashes, not text, so human prose is never cached in JSONL. `roots blame` uses them to show which question each line answered.

### events.jsonl

An append-only audit log, one line per mutation: `plant`, `session.start`, `session.end` (with the content hash), `ask`, `answer`, `dismiss`, `snooze`, `delegate`, `undelegate`, `note`, `propose`, `accept`, `reject`, `expire`, `sprout`, `adopt`, `mv`, `status`, `compost`, `flow.start`, `flow.end`, `heading`, `heading.dismiss`. Every event has `by`. This is the traceable history of how intent evolved, and it is independent of git history (git remains the backup).

### config.yaml

```yaml
project: myapp
version: "1"
tier: 2                    # see Agent Tiers
agent:
  command: "claude -p --model claude-opus-5-5"   # optional; used by `think` to get questions
limits:
  proposals: 10            # max pending proposals
  sprouts: 5               # max open sprouts
  questionsPerSession: 3
  proposalTtlDays: 14
  sproutTtlDays: 30
view:
  write: false             # true → `roots view` also writes ROOTS.md at repo root
flow:
  heading: true            # `roots flow`: the agent says where the session is going
```

## Idea Lifecycle

```
planted → shaping → committed → built
                                   ↘
      (any) ──────────────────────→ composted
```

| Status | Meaning | How it changes |
|---|---|---|
| `planted` | Captured, one line | `roots plant` |
| `shaping` | Being thought about | Automatically after the first `think` session |
| `committed` | The human stands behind it | `roots commit <id>`, human only |
| `built` | Realized | `roots status <id> built`, or derived when all linked seeds issues close |
| `composted` | Retired or replaced | `roots compost <id>`, or a `replaces` edge |

Only a human can change status. Agents can propose `compost`.

Sprouts: `open → adopted | rejected | expired`.

## Agent Tiers

Tiers only widen what an agent may *suggest*. At no tier can an agent write to `human/`, change status, accept a proposal, or create an edge directly.

| Tier | Name | Agent may |
|---|---|---|
| 0 | off | nothing. Only deterministic questions |
| 1 | ask | ask questions (`roots ask`), attach notes (`roots note`) |
| 2 | propose | tier 1 + proposals (`roots propose`) + sprouts (`roots sprout`) |
| 3 | observe | tier 2 + may run from harness hooks on repo activity (drift checks) |

A per-idea override (`roots tier <id> 0`) keeps the agent out of ideas the human wants to think about alone.

## Questions: guiding thinking

Questions drive the rustlings loop. They come from two sources and are merged into one queue per session.

**Deterministic rules** (always on, cheap):

| Rule | Trigger | Example |
|---|---|---|
| `missing-done` | no "done" language after N sessions | "What would make this done?" |
| `missing-scope` | no "not"/"won't" language | "What is this *not* trying to solve?" |
| `too-big` | statement contains "and" / body > N lines | "Is this one idea or two?" |
| `orphan` | idea has no edges after N days | "What does this serve?" |
| `tension-open` | unresolved `tension` edge | "Which of these wins when they conflict?" |
| `stale` | not touched in N days while `committed` | "Is this still true?" |

**Agent questions** (tier ≥ 1) are dynamic from the first session. Before a session, `roots` builds a context packet (`roots context <id> --json`): the idea's prose, neighbors, prior questions and dismissals, rejected proposals, and relevant repo state. It then either:

- runs `agent.command` with that packet and a fixed instruction to call `roots ask` up to `limits.questionsPerSession` times, or
- waits for an already-running harness (e.g. Claude Code in another pane) to call `roots ask`.

The questions an agent should ask are specific to *this* idea ("What happens to an offline edit on a deleted record?"), never generic. Dismissed questions go into the next context packet so the agent learns what not to ask.

## The `think` Loop (UX)

Two panes. `roots think` runs in one. nvim runs in the other (or `roots think` launches `$EDITOR` in a split when running inside tmux or zellij).

```
┌─ roots think offline-sync ─────────────┐┌─ nvim .roots/human/a1b2-offline-sync/idea.md ─┐
│ r-a1b2  offline-sync        shaping    ││ Sync works fully offline, and nobody loses   │
│ "Sync works fully offline, and…"       ││ work when the network drops.                  │
│                                        ││                                               │
│ serves   → r-c3d4 local-first          ││ Field users lose signal for hours…            │
│ tension  ↔ r-e5f6 server-authoritative ││                                               │
│                                        ││ █                                             │
│ ── question 2/3 ── [agent] ─────────── ││                                               │
│ What happens to an offline edit on a   ││                                               │
│ record someone else deleted?           ││                                               │
│                                        ││                                               │
│ [save] answer  [d] dismiss  [z] snooze ││                                               │
│ [s] skip       [a] ask agent           ││                                               │
│ [q] end session                        ││                                               │
└────────────────────────────────────────┘└───────────────────────────────────────────────┘
```

- The watcher detects saves. A save that changes the file marks the current question `answered`, records the diff span, and moves to the next question.
- Nothing is ever inserted into `idea.md`. Questions exist only in the pane.
- The session ends after `questionsPerSession` questions or on `q`. The session end records the content hash (for `verify`).
- `[a] ask agent` (tier ≥ 1) hands the current question to the agent. See [Delegating a question](#delegating-a-question).
- At session end, roots scans the changed lines for mentions of other ideas and files proposals ([Mentions → proposals](#mentions--proposals)). At tier ≥ 2 the agent may also file proposals based on what changed. All of them go to `tend`, not to this session, so thinking and structuring stay separate.

### Delegating a question

Some questions are better researched than answered cold: "what does Postgres do on a conflicting upsert?", "which of our services already sync?". `[a]` hands the current question to the agent. The agent researches; the human still decides.

1. `[a]` sets the question to `delegated` (a `delegate` event by the human) and moves on. Delegated questions are not asked again until they come back.
2. After `session.end`, if `agent.command` is set, it runs with the idea's context packet and a "Delegated questions" section. `roots think` waits for it with a status line. `roots flow` runs it in the background, and the card shows it as running work. Without `agent.command`, delegated questions are listed in `roots context` for a harness to pick up.
3. The agent attaches one Markdown or text note per question: `roots note <id> --question <q-id> --file findings.md`. The question must be delegated and belong to that idea. The same write sets it back to `open` with the note in `findings` (the `note` event carries `question`).
4. A question the run leaves without findings goes back to `open` (an `undelegate` event by `roots` with the reason). It never stays stuck.
5. Questions with findings come first in their idea's next session, and ideas with findings rank first in the queue ("agent findings ready"). Under the question the screen shows the note's first paragraph (headings skipped, at most 5 lines) and its path:

```
│ ── question 1/3 ── [missing-done] ─────│
│ Which of our services already sync?    │
│                                        │
│ ── findings ── [agent] ────────────────│
│ Three services sync today: api, worker │
│ and mobile. Mobile queues writes in    │
│ SQLite and replays them on reconnect.  │
│ full: .roots/agent/notes/a1b2/2026-…md │
```

The human answers in `idea.md` as usual. Agreeing can take one line; `[d]` dismisses the question and `[a]` hands it back for another pass (earlier findings go into the next packet). Findings never enter `idea.md`, `view` or `prime`. They stay agent notes.

## Flow: one session, no break points

Single commands leave the human to work out what comes next ("I ran think, now what? Do I need an agent to look?"). `roots flow` removes those break points. It runs think sessions one after another and never drops to the shell between them.

1. **Think.** The same loop as `roots think`, with one change: the agent never blocks. The session starts at once with rule questions, and agent questions arrive while the human writes.
2. **Transition card.** When the questions run out, the session does not exit. It shows a card:

```
┌─ roots flow ── warren ── 23m ── inbox 3 ─────────────────────────────┐
│ trail                                                                │
│   r-c818 team-agent-platform    3 answered · 1 open  shaping         │
│   r-7e52 no-long-lived-secret   1 answered · 2 open  shaping  ← last │
│   + adopted r-0c3e, r-506b · accepted 2                              │
│                                                                      │
│ ── heading ── [agent] ─────────────────────────────── [x] dismiss ── │
│ You're converging on "every action has a named principal" (r-c818)   │
│ enforced by keeping credentials outside the sandbox (r-7e52). Still  │
│ unsaid: whose limits bound an unattended run (q-c364).               │
│                                                                      │
│ … linking what changed in no-long-lived-secret                       │
│ ✓ no-long-lived-secret done · 1 answered, 2 skipped                  │
│                                                                      │
│ [enter] review inbox (3)                                             │
│ [n] next: r-c818 team-agent-platform · 1 open question ← heading     │
│ [o] other idea (1 more)                                              │
│ [p] plant   [x] dismiss heading   [q] end flow                       │
└──────────────────────────────────────────────────────────────────────┘
```

- **Trail**: what this flow did, read back from `events.jsonl` (the human's events between `flow.start` and `flow.end`). It is deterministic and has no LLM.
- **Heading** (tier ≥ 1, `agent.command` set, `flow.heading: true`): the agent's read on where the thinking is converging and what is still unsaid. See [Headings](#headings).
- **Background work**: after each session, the proposal run (tier ≥ 2) and the heading run start in the background. The card refreshes as their results land.
- **Inbox**: pending proposals and sprouts. `[enter]` reviews them first, inline, with the same cards as `tend`. An adopted sprout opens `$EDITOR` on an empty file, as in `adopt`.
- **Next pick**: the heading's `--next` suggestion first, then ideas this flow has not touched (in `roots queue` order), then touched ideas with open questions. A just-planted idea comes first until it is thought about.

Keys: `[enter]` does the recommended step (review the inbox, else think about the pick), `[n]` think about the pick, `[o]` other pick, `[p]` plant, `[x]` dismiss the heading, `[q]` end the flow. On exit, roots waits for agent runs that are still going, then prints the trail and a `next:` line.

Under tmux with vi/vim/nvim, one editor pane follows the flow: later sessions switch it to the next `idea.md` with `:update | edit <file>` instead of opening a new split.

Every human command (`think`, `tend`, `adopt`, `plant`, `accept`, `reject`, `flow`) ends with one dim `next:` line: `roots tend` when cards wait, else `roots think <id>` for the idea most in need, else `roots plant`.

### Headings

A heading is advisory agent text, labeled `[agent]` and shown only on the flow card. It is never shown in `view`, `prime`, or any human file. It is held to the same rules as proposals:

- The agent files it with `roots heading <text> --cite <id>:<quote> ... [--next <id>]`, only during a live flow (`$ROOTS_FLOW`).
- It is at most 2 sentences and 280 characters.
- It has at least one citation. Every quote must be an exact substring of a live idea, and every `r-` id in the text must be cited. Every `q-` id must exist.
- The tier must be ≥ 1 for the project and for every cited idea.
- A heading with the same text as a dismissed heading is refused. Dismissed headings go into the next heading run's packet.
- The newest active heading of a flow is the one shown. `[x]` dismisses it (`heading.dismiss` event).

The heading run's packet contains the trail, the full prose of the ideas touched in this flow, the statements of the other ideas, the open questions, the accepted links, the current heading, and the dismissed headings. Ideas with a per-idea tier 0 are left out of the packet.

`headings.jsonl`:

```json
{"id":"h-3c1d","flow":"fl-9a02","text":"Converging on r-c818 enforced by r-7e52; unsaid: q-c364.","cites":[{"node":"r-c818","quote":"every action has a named principal"},{"node":"r-7e52","quote":"No long-lived secret"}],"next":"r-c818","by":"agent:claude-opus-5-5","status":"active","createdAt":"2026-09-28T22:21:30Z"}
```

## CLI

Binary name: `roots`. Every command supports `--json`. Commands marked **(human)** require a TTY. Commands marked **(agent)** are checked against the tier and limits and never touch `human/`.

### Capture and think (human)

```
roots init                               Initialize .roots/
roots plant [<statement>]                Create an idea. With no argument, opens $EDITOR
roots think [<id>]                       Run a think session. With no id, picks from the queue
roots flow [<id>]                        Think, review and plant in one session (see Flow)
roots adopt <sprout-id>                  Create a new idea from a sprout (human rewrites; see above)
roots mv <id> <new-slug>                 Rename (ID is stable)
```

### Structure (human)

```
roots tend                               Interactive review: proposals, sprouts, expiring items
roots accept <p-id|s-id>                 Accept a proposal (non-interactive form)
roots reject <p-id|s-id> [--reason <t>]  Reject; remembered permanently
roots link <a> <b> <rel>                 Add an edge directly
roots scan [<id>]                        Find mentions in edits made outside a session
roots unlink <edge-id>
roots commit <id>                        Set status to committed
roots status <id> <status>
roots compost <id> [--reason <t>]
roots tier <id> <0-3>                    Per-idea agent tier override
```

`tend` shows one card at a time, and each takes one keystroke:

```
┌ proposal p-3b21 ── [agent] claude-opus-5-5 ── expires in 11d ─┐
│ offline-sync  ↔ tension ↔  server-authoritative                │
│                                                                │
│ "offline writes conflict with 'server is the source of truth'" │
│   r-a1b2: "nobody loses work when the network drops"           │
│   r-e5f6: "the server is always authoritative"                 │
│                                                                │
│ [y] accept  [n] reject  [r] reject w/ reason  [s] skip          │
└────────────────────────────────────────────────────────────────┘
```

### Agent-facing (agent)

```
roots context <id>                       Context packet for one idea (prose, neighbors, history)
roots prime [--scope <id>]               Accepted graph as agent context (anchors → committed ideas)
roots ask <id> <question>                Queue a question                          tier ≥ 1
roots note <id> --file <path>            Attach an artifact under agent/notes/<id>/ tier ≥ 1
  [--question <q-id>]                    ... as findings on a delegated question (.md/.txt)
roots propose edge <a> <b> <rel> --reason <t> --cite <id>:<quote> ...          tier ≥ 2
roots propose split|merge|compost ...                                          tier ≥ 2
roots sprout <statement> [--file <md>]   Propose a new idea (agent tree)           tier ≥ 2
roots heading <text> --cite <id>:<quote> ... [--next <id>]   Flow heading       tier ≥ 1
```

### Read (anyone)

```
roots show <id>                          Idea/sprout with edges, questions, history
roots list [--status <s>] [--kind idea|sprout] [--orphans] [--anchors]
roots queue                              What needs attention: open questions, pending proposals
roots view [--from <id>] [--sprouts] [--html]   Compiled culmination
roots blame <id>                         idea.md with the question each line answered
roots log [<id>]                         Event history
roots verify                             Check the human/agent boundary + graph invariants
```

### JSON output

Same shape as seeds:

```json
{ "success": true, "command": "propose", "id": "p-3b21" }
{ "success": false, "command": "propose", "error": "cite quote not found in r-e5f6" }
```

## Views: the culmination

`roots view` compiles one readable document from the graph:

1. Find the anchors (`committed`/`shaping` ideas with no outgoing `serves`).
2. For each anchor, print its statement and prose, then walk the incoming `serves` edges depth-first in topological order.
3. An idea that serves more than one anchor is printed in full once. Later occurrences are back-references.
4. After the tree: **Tensions** (all unresolved `tension` pairs) and **Open questions**.
5. `composted` ideas and all sprouts are excluded. `--sprouts` appends a separate section labeled **Agent proposals (not accepted)**.

A paragraph that answered a think question is preceded by that question as a quoted `**Q:**` line with its id and asker (the attribution `roots blame` uses). The question is labeled, not mixed into the prose: an agent's question renders `[agent]`.

It contains only human prose and human-accepted structure. The output goes to stdout by default. `--html` renders a static page with a graph visual and a timeline per idea from `events.jsonl`. With `view.write: true` it also writes `ROOTS.md` at the repo root, so PR diffs show how intent changed.

## Integration

### Claude Code (and other harnesses)

`roots setup claude` installs:

```json
{
  "hooks": {
    "SessionStart": [{ "command": "roots prime" }],
    "PreToolUse": [{
      "matcher": "Write|Edit|MultiEdit",
      "command": "roots guard",
      "description": "Deny agent writes to .roots/human/**"
    }]
  }
}
```

At tier 3, it also installs a Stop hook: `roots drift --diff HEAD` hands the agent a context packet of the ideas the diff touches, so the agent can `ask` "does this still hold?". It never blocks.

Other harnesses use the same CLI. Only the hook wiring differs.

### Seeds

- `sd create --intent r-a1b2` links an issue to an idea (a seeds-side field).
- `roots show` lists the linked issues. When every linked issue is closed, `roots queue` prompts the human to mark the idea `built`.
- Committing an idea can prompt "Create seeds issues?" at tier ≥ 2, and the agent proposes them as sprout-like drafts in seeds.

### Mulch

Mulch records may cite `r-` IDs. `roots show` lists mulch learnings attached to an idea.

## What Roots Does NOT Do

- **No LLM inside.** Agents call `roots`. `roots` calls an agent only through the user-configured `agent.command`.
- **No agent-authored human content.** No tier, flag or config enables it.
- **No hierarchy.** No folders of folders and no parent field. Structure is edges only.
- **No frontmatter, and no markers in human prose.**
- **No auto-accept.** Every edge in the graph was made or accepted by a human.
- **No daemon.** `think` is a foreground process for one session.
- **No git automation.** Roots does not commit. The human commits, the same as with code.

## Tech Stack

| Concern | Choice |
|---|---|
| Runtime | Bun |
| Language | TypeScript (strict) |
| Dependencies | Zero runtime |
| Storage | JSONL + plain Markdown |
| Locking | Advisory file locks, atomic writes (seeds pattern) |
| TUI | Raw ANSI, `fs.watch` for saves |
| Testing | `bun test`, real I/O |

## Build Order

1. `init`, `plant`, `show`, `list`, `mv`, ID/slug resolution, `graph.jsonl`, `events.jsonl`.
2. `think` with deterministic questions only (tier 0). Validate that the loop feels good before adding agents.
3. `ask`, `context`, `agent.command`: dynamic agent questions (tier 1).
4. `propose` with citation validation, `tend`, `link`, `accept`/`reject`, deterministic mention detection (tier 2).
5. `sprout`, `adopt`, `note`.
6. `view` (text, then `--html`), `verify`, `guard`, `setup claude`.
7. Seeds/mulch integration, `drift` (tier 3).

## Open Questions

- **Assets.** Can agents attach HTML/PNG artifacts to human ideas only through `agent/notes/`, or should an idea's pane show them inline?
- **Evolution vs edit.** When a human rewrites an idea's statement, is that the same idea, or should the tool offer `replaces`? The default is the same idea, and `events.jsonl` keeps the old statement hash.

## Future: `roots lsp`

A language server for `idea.md` files, so related ideas appear while you type:

- **Hover** on a phrase that matches another idea shows that idea's statement and status.
- **Inlay hints / code lens** at the end of a paragraph: `related: offline-sync, local-first`.
- **Diagnostics** (hint level): "this paragraph may be a second idea", "mentions r-e5f6, which is in tension with this idea".
- **Go-to-definition** on a mention opens the other idea's file.

Relatedness is computed by `roots related <id|--text>`: deterministic token overlap (BM25 over statements and prose, zero deps), with optional agent reranking. The LSP is read-only: it never writes into the file and never creates proposals by itself. Mentions still become proposals only through the session-end scan.
