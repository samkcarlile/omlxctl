# Phase 4 — Claude Code integration

Goal: let Claude Code reliably use `omlxctl` to monitor/manage oMLX-served local models when
relevant — with the **least machinery**.

## Decision: `@`-includable Markdown doc (no skill)

Ship a concise **`OMLXCTL.md`** at the repo root. The user `@`-includes it in a project's
`CLAUDE.md` (or their global `~/.claude/CLAUDE.md`) when working against local oMLX models:

```md
# In CLAUDE.md
@./omlxctl/OMLXCTL.md
```

### Why not a skill?
- A skill's value is **auto-trigger**, but "working with oMLX local models" has no reliable textual
  trigger — it's ambient context, not a phrase. Trigger reliability would be poor for this niche.
- An `@`-include is **explicit and deterministic**: when present, the guidance is always in context;
  when not, zero overhead. The user controls scope per-project.
- Lower maintenance: one short doc, no `SKILL.md` frontmatter/trigger tuning.

(If auto-trigger ever becomes desirable, the same `OMLXCTL.md` body can be promoted into a skill
later with no rewrite.)

## `OMLXCTL.md` contents (outline)
Keep it short and instruction-dense — it's loaded into context:
1. **What it is** — one line: a CLI to inspect/control the local oMLX server.
2. **When to reach for it** — checking server health, what models are loaded, active/queued
   requests, throughput, tailing logs, loading/unloading a model, quick prompting.
3. **The 6 commands** — `status`, `models`, `stats`, `exec`, `follow`, `restart` with a one-liner
   each.
4. **Agent usage rules:**
   - Prefer `--json` (or rely on non-TTY auto-JSON) for parseable output.
   - Use `exec '<sdk>'` for anything not covered; `help sdk` lists the surface.
   - Use `follow` only when watching a change; it emits JSONL per change when piped.
   - Don't run destructive actions (`restart`, `clear*`) without explicit user intent.
5. **Pointers** — `omlxctl help` for full docs; link to OMLX_PAGES.md for data model.

## Done when
- [ ] `OMLXCTL.md` exists, < ~50 lines, accurate to the shipped CLI.
- [ ] Verified by `@`-including it in a scratch `CLAUDE.md` and confirming Claude uses `omlxctl`
      correctly for a monitoring task.
