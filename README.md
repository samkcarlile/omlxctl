# omlxctl

A Bun-based CLI + SDK for inspecting and controlling a local [oMLX](https://github.com/ggerganov/omlx) inference server. A scriptable, agent-friendly complement to the oMLX web dashboard.

## How it works

oMLX's dashboard is a client-rendered SPA backed by a clean JSON API at `/admin/api/*`. This tool consumes that API directly — no HTML parsing. See [`OMLX_PAGES.md`](./OMLX_PAGES.md) for the full endpoint catalog.

## Setup

```bash
bun install
bun link        # makes `omlxctl` available on your PATH
```

Config is autoloaded from `~/.omlx/settings.json` (`auth.api_key`, `server.host`, `server.port`). Override with env vars or `--host`/`--port` flags.

## Usage

```bash
omlxctl status          # server identity + memory + active requests
omlxctl models          # list loaded/available models
omlxctl stats           # throughput and token counters
omlxctl logs            # tail server logs
omlxctl restart         # restart the server
omlxctl load <model>    # load a model
omlxctl unload <model>  # unload a model
omlxctl exec <code>     # one-shot SDK eval (escape hatch)
omlxctl follow <code>   # poll + change-detect (watch mode)
```

## Architecture

```
CLI (omlxctl)
  └─ SDK / domain taxonomy (class Omlx)
       └─ Low-level endpoint clients (1 fn ↔ 1 endpoint, typed)
            └─ Transport + Auth (config · session cookie · bearer)
```

Source layout:

```
src/
├─ cli.ts               # arg parsing + subcommand dispatch
├─ commands/            # one file per subcommand
├─ sdk.ts               # class Omlx
├─ client/
│  ├─ config.ts         # resolve api_key / base url
│  ├─ transport.ts      # auth, session cookie, request()
│  └─ endpoints.ts      # typed endpoint functions
├─ types/               # endpoint + domain types
└─ render/              # TTY pretty-print vs JSON/JSONL output
```

Output is pretty-printed on a TTY; plain JSON/JSONL when piped — so agents get deterministic, parseable output.

## Development

See [`docs/PLAN.md`](./docs/PLAN.md) for the full design and phase breakdown. Sub-plans are in [`docs/plans/`](./docs/plans/).

| Phase | Status |
| --- | --- |
| 0 — Foundation (config, auth, transport) | planned |
| 1 — Query API (read-only SDK + subcommands) | planned |
| 2 — Actions (restart, load/unload, clears) | planned |
| 3 — Polish (watch/follow, TTL cache) | planned |
