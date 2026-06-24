# omlxctl — Design & Implementation Plan

A Bun-based CLI + SDK for inspecting and controlling a local **oMLX** inference server, built on
top of oMLX's own admin JSON API. A complement to the web dashboard — fast, scriptable, and
agent-friendly.

> **Read first:** [`../OMLX_PAGES.md`](../OMLX_PAGES.md) — the reverse-engineered map of oMLX's
> data and action endpoints. Everything here builds on it.

## Guiding principles

1. **JSON API, not HTML.** The dashboard is a client-rendered SPA; its data lives in
   `/admin/api/*`. We consume that directly. (Bun HTML parsing is unnecessary and would find no
   state — see OMLX_PAGES.md.)
2. **Layered, with a DX taxonomy on top.** Raw endpoint clients underneath; a clean domain SDK
   (`server`, `models`, `memory`, `activeRequests`, `stats`, `logs`) on top that hides "which page
   has what."
3. **Two audiences, one tool.** Pretty output for humans on a TTY; clean JSON/JSONL when piped, so
   agents get deterministic, parseable output.
4. **Phased.** Query first (stable foundation) → actions → polish. Each phase can ship.
5. **Minimal surface, maximal escape hatch.** A few ergonomic subcommands, plus `exec`/`follow`
   that expose the full SDK for anything not covered.

## Architecture at a glance

```
┌─────────────────────────────────────────────────────────────┐
│ CLI  (bin: omlxctl)   help · restart · models · stats ·      │
│                       exec · follow                          │
├─────────────────────────────────────────────────────────────┤
│ SDK / Taxonomy  (class Omlx)                                 │
│   query:  server() models() memory() activeRequests()        │
│           stats() cache() logs() settings()                  │
│   action: restart() reload() loadModel() unloadModel()       │
│           chat() clearStats() clearCache()                   │
│   polish: watch() + TTL cache                                │
├─────────────────────────────────────────────────────────────┤
│ Low-level endpoint clients  (1 fn ⇄ 1 endpoint, typed)       │
│   getServerInfo() getStats() getModels() getLogs() …         │
├─────────────────────────────────────────────────────────────┤
│ Transport + Auth                                             │
│   config resolution · /admin/api/login session · /v1 bearer  │
└─────────────────────────────────────────────────────────────┘
```

### Proposed repo layout
```
omlxctl/
├─ package.json            # { "bin": { "omlxctl": "src/cli.ts" } }  → bun link
├─ OMLX_PAGES.md
├─ docs/                   # this plan + the endpoint catalog
├─ src/
│  ├─ cli.ts               # arg parsing + subcommand dispatch
│  ├─ commands/            # one file per subcommand
│  ├─ sdk.ts               # class Omlx (the taxonomy layer)
│  ├─ client/
│  │  ├─ config.ts         # resolve api_key / base url / paths
│  │  ├─ transport.ts      # auth, session cookie, request()
│  │  └─ endpoints.ts      # low-level typed endpoint fns
│  ├─ types/               # endpoint + domain types
│  └─ render/              # pretty vs json output, bat-piping
└─ OMLXCTL.md              # @-includable Claude Code doc (phase-4)
```

## Decisions locked (from kickoff Q&A)

| Topic | Decision |
| --- | --- |
| Data source | oMLX admin **JSON API** `/admin/api/*` (not HTML) |
| Admin auth | CLI POSTs autoloaded `api_key` → `/admin/api/login` → caches session cookie; re-login on 401 |
| Config autoload | api_key + host/port resolved from `~/.omlx/settings.json` (overridable by env/flags) |
| Distribution | `package.json` `bin` + `bun link` (run from source; no compile step) |
| `exec` / `follow` | `exec <code>` one-shot SDK eval; `follow <code>` = same eval, polled + change-detected (first-class, absorbs the "watch flag" idea) |
| Claude Code | `@`-includable `OMLXCTL.md` doc (no skill) |
| Out of scope | model download, quantization (oQ), uploads, benchmarking |

## Phases

| Phase | Goal | Status |
| --- | --- | --- |
| **0 — Foundation** | Config resolution, auth/session, `request()` transport | ✅ Done |
| **1 — Query API** | Low-level endpoint clients + domain taxonomy SDK (read-only) | ✅ Done |
| **2 — Actions** | Control surface: restart, load/unload, chat, clears | ✅ Done |
| **3 — Polish** | `watch()` polling/subscribe + caching | ✅ Done |
| **CLI** | `omlxctl` subcommands, output discipline, help | ✅ Done |
| **CC integration** | `OMLXCTL.md` for `@`-include | ✅ Done |

> CLI work is interleaved with the phases — each phase exposes new subcommands — because output
> discipline and help apply across all of it.

## Sequencing

```
Phase 0 ──▶ Phase 1 ──▶ (CLI: help, status, models, stats) ──┐
                                                              ├─▶ ship "query" build
Phase 2 ──▶ (CLI: restart, load/unload, chat) ───────────────┤
Phase 3 ──▶ (CLI: follow; caching) ──────────────────────────┘──▶ Phase 4: OMLXCTL.md
```

## Open items to resolve during implementation (not blockers)
- **Login contract** (Phase 0): exact `/admin/api/login` body field + `Set-Cookie` name.
  Quick confirm: `! curl -i -X POST .../admin/api/login -H 'Content-Type: application/json' -d '{"api_key":"…"}'`.
- **Live request shape** (Phase 1): re-capture `stats.active_models.models[]` with a model loaded
  and actively serving, to type per-request/queue detail.
- **Mutation contracts** (Phase 2): confirm method/body for `models/{id}/load|unload` and
  `server/restart` by observing one manual action in the dashboard Network tab.
