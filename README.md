# omlxctl ⚡

A fast, scriptable CLI + SDK for inspecting and controlling a local [oMLX](https://github.com/mx-shift/omlx) inference server. A keyboard-driven complement to the oMLX web dashboard — built for terminals and agents alike.

## ✨ Features

- 🔍 **Query everything** — server health, loaded models, memory pressure, active requests, throughput stats, logs
- ⚙️ **Control the server** — restart, reload, load/unload models, clear stats and cache
- 💬 **Chat** — one-shot prompts via `/v1/chat/completions`
- 📡 **Live follow** — poll any SDK expression and stream changes as JSONL
- 🤖 **Agent-friendly** — JSON output when piped, pretty output on TTY, stable exit codes
- 🎨 **Beautiful TTY output** — colored panels, aligned tables, memory bars, relative times
- 🔌 **Zero config** — autoloads `~/.omlx/settings.json`

## 📦 Setup

```bash
bun install
bun link        # installs `omlxctl` on your PATH
```

Config is resolved in this order: CLI flags → env vars (`OMLX_BASE_URL`, `OMLX_API_KEY`) → `~/.omlx/settings.json` → defaults (`http://127.0.0.1:8000`).

## 🚀 Usage

```bash
omlxctl status              # server identity, memory, active requests, throughput
omlxctl models              # list all models (size, engine, loaded state)
omlxctl models --loaded     # only loaded models
omlxctl stats               # token counters and TPS (session scope)
omlxctl stats --scope alltime

omlxctl restart             # restart the server (polls until healthy)
omlxctl load <model>        # load a model (fuzzy match, settles before returning)
omlxctl unload <model>      # unload a model

omlxctl exec '<code>'       # one-shot SDK eval — the escape hatch ⭐
omlxctl follow '<code>'     # poll + change-detect, emit JSONL on each change ⭐

omlxctl help                # full help (syntax-highlighted via bat)
omlxctl help sdk            # SDK method reference
```

### 🔧 exec examples

```bash
omlxctl exec 'await omlx.server()'
omlxctl exec '(await omlx.models()).filter(m => m.loaded).map(m => m.id)'
omlxctl exec 'await omlx.chat("Qwen3.6-27B-UD-MLX-6bit", "hello")'
omlxctl exec 'await omlx.clearStats("session")'
```

### 📡 follow examples

```bash
omlxctl follow 'await omlx.activeRequests()'          # watch live request queue
omlxctl follow --interval 500 'await omlx.memory()'   # memory every 500ms
omlxctl follow --count 10 'await omlx.stats()'        # stop after 10 changes
```

## 🌐 Global flags

| Flag | Description |
|---|---|
| `--json` | Force JSON output (even on TTY) |
| `--no-color` | Disable ANSI colors |
| `--yes` | Skip confirmation prompts |
| `--base-url <url>` | Override server base URL |
| `--api-key <key>` | Override API key |

## 🏗️ Architecture

```
CLI  (omlxctl)
  └─ SDK / domain taxonomy  (class Omlx)
       └─ Low-level endpoint clients  (1 fn ↔ 1 endpoint, typed)
            └─ Transport + Auth  (config · session cookie · bearer)
                 └─ In-process TTL cache  (collapses redundant getStats fetches)
```

```
src/
├─ cli.ts               # arg parsing + subcommand dispatch
├─ commands/            # one file per subcommand
├─ sdk.ts               # class Omlx (query + action methods)
├─ client/
│  ├─ config.ts         # resolve api_key / base url / paths
│  ├─ transport.ts      # auth, session cookie, request()
│  ├─ endpoints.ts      # typed low-level endpoint functions
│  └─ cache.ts          # short-TTL in-process cache
├─ types/               # api.ts + errors.ts
└─ render/              # TTY pretty-print vs JSON/JSONL
```

## 🤖 Claude Code integration

`@`-include `OMLXCTL.md` in your project's `CLAUDE.md` to give Claude reliable access to oMLX status and control:

```md
@./omlxctl/OMLXCTL.md
```

## 📋 Phases

| Phase | Status |
|---|---|
| 0 — Foundation (config, auth, transport) | ✅ Done |
| 1 — Query API (read-only SDK + subcommands) | ✅ Done |
| 2 — Actions (restart, load/unload, chat, clears) | ✅ Done |
| 3 — Polish (watch/follow, TTL cache, beautiful TTY) | ✅ Done |
| CC integration (OMLXCTL.md) | ✅ Done |

See [`docs/PLAN.md`](./docs/PLAN.md) for design rationale and [`docs/OMLX_PAGES.md`](./docs/OMLX_PAGES.md) for the full API endpoint catalog.
