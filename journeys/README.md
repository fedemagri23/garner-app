# Journeys

Two running notebooks kept alongside the code.

| Notebook | What goes in it |
| --- | --- |
| [`bugs.md`](bugs.md) | Defects found and repaired: what broke, why, and the fix |
| [`considerations.md`](considerations.md) | Deliberate limits, trade-offs and simplifications, and when to revisit them |

Both are appended to **before every push**, so a reader can reconstruct why the
system is the way it is without reading every diff.

## Notation

Entries are numbered in the order they were recorded (`BUG-001`, `CON-001`)
and never renumbered — an id, once written, points at the same thing forever.
A superseded entry stays and gains a `**Superseded by:**` line.

### A bug entry

```markdown
### BUG-000 — One-line summary in the past tense
- **Phase:** 4 · **Area:** pricing/ingestion · **Scope:** production code · **Found by:** e2e test · **Fixed in:** abc1234
- **Symptom:** What was observed, in terms someone could reproduce.
- **Cause:** The actual reason, not the symptom restated.
- **Fix:** What changed, briefly.
```

- **Scope** is `production code` or `test` — a wrong test is worth recording,
  and worth distinguishing from a wrong system.
- **Found by** says what caught it: `unit test`, `e2e test`, `typecheck`,
  `review`, `production`.
- **Fixed in** is the commit the fix shipped in.

### A consideration entry

```markdown
### CON-000 — One-line summary of the decision or limit
- **Phase:** 7 · **Area:** optimization/travel · **Status:** accepted
- **What:** The decision or limitation, stated plainly.
- **Why:** The reasoning, including what was traded away.
- **Revisit when:** The condition that makes this worth changing.
```

- **Status** is `accepted` (a deliberate trade-off), `deferred` (will be done,
  not yet), or `resolved` (no longer true — keep the entry, add how it was
  resolved).
