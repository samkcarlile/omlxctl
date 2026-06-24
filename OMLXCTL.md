# omlxctl — CLI + SDK for inspecting and controlling a local oMLX inference server

## When to reach for it

- Check server health, version, uptime, and engine info (`status`)
- List registered models, see which are loaded/loading/pinned (`models`)
- Inspect active and queued requests, token throughput, cache efficiency (`stats`)
- Tail live server logs or watch a metric change in real time (`follow`)
- Load or unload a model by ID (`load` / `unload`)
- Restart the server and wait for it to come back up (`restart`)
- Run ad-hoc SDK expressions against the live server (`exec`)

## Commands

| Command | What it does |
|---|---|
| `omlxctl status` | Server health: host, version, uptime, engines, update availability |
| `omlxctl models [--loaded]` | List all registered models with load state, size, engine type |
| `omlxctl stats [--scope session\|alltime]` | Token throughput, cache efficiency, request counts |
| `omlxctl exec '<expr>'` | Evaluate an SDK expression; e.g. `exec 'sdk.memory()'` |
| `omlxctl follow [<metric>]` | Poll and emit JSONL on each change (Ctrl-C to stop) |
| `omlxctl restart` | POST restart, then poll until server responds (30s timeout) |
| `omlxctl load <id>` / `omlxctl unload <id>` | Load (polls up to 120s) or unload a model by ID |

## Agent usage rules

- Prefer `--json` (or pipe to a non-TTY) for machine-readable output; all commands auto-JSON when not attached to a TTY.
- Use `exec '<sdk expression>'` for anything not covered by a named command; run `omlxctl help sdk` for the full SDK surface (`server`, `models`, `model`, `memory`, `activeRequests`, `stats`, `cache`, `logs`, `settings`, `watch`, `chat`, `loadModel`, `unloadModel`, `clearStats`, `clearCache`, `reload`).
- Use `follow` only when watching a live change; it emits one JSONL line per state change when piped and runs until interrupted.
- Do not run destructive actions (`restart`, `clearStats`, `clearCache`, `unload`) without explicit user intent.
- Exit codes: `0` = ok, `1` = runtime error, `2` = usage error.

## Pointers

- `omlxctl help` — full subcommand docs
- `omlxctl help sdk` — SDK method reference
- `omlxctl exec` examples: `exec 'sdk.stats("alltime")'`, `exec 'sdk.logs({level:"ERROR"})'`, `exec 'sdk.model("mistral-7b")'`
