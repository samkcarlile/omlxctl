# Phase 2 — Actions (control surface)

Goal: a small, curated set of **essential** mutations on top of the stable query layer. Not a
dashboard replacement — just the things you actually want from a terminal/agent.

> Deferred until Phase 1 is solid, exactly so the query layer can inform the action API shape.

## In scope
| SDK method | Endpoint | Surface |
| --- | --- | --- |
| `restart()` | `POST /admin/api/server/restart` | admin |
| `reload()` | `POST /admin/api/reload` | admin |
| `loadModel(id, opts?)` | `POST /admin/api/models/{id}/load` | admin |
| `unloadModel(id)` | `POST /admin/api/models/{id}/unload` | admin |
| `chat(model, input, opts?)` | `POST /v1/chat/completions` | **v1 / Bearer** |
| `clearStats(scope)` | `POST /admin/api/stats/clear[-alltime]` | admin |
| `clearCache(kind)` | `POST /admin/api/{hot-cache,ssd-cache}/clear` | admin |

## Explicitly out of scope
Downloading (`hf/*`, `ms/*`), quantization (`oq/*`), uploads (`upload/*`), benchmarking
(`bench/*`), sub-key management. Catalogued in OMLX_PAGES.md; intentionally not wrapped.

## 2.1 Confirm mutation contracts first
Before writing each mutation, observe **one** real action in the dashboard (Network tab) to capture
method + body + success shape. Do not blind-probe mutations. Specifically nail down:
- `models/{id}/load` — does it take a body (profile/options) or is the path enough?
- `server/restart` — response shape; does the socket drop mid-request? (transport already retries
  on connection-refused — relevant here since the server bounces).
- pin / set-default — likely via `models/{id}/settings` (PATCH); confirm before exposing.

## 2.2 SDK additions (`src/sdk.ts`)
```ts
class Omlx {
  restart(): Promise<void>              // fire, then poll server() until back up
  reload(): Promise<void>
  loadModel(id: string, opts?: LoadOpts): Promise<Model>   // resolve after loaded:true
  unloadModel(id: string): Promise<void>
  clearStats(scope: 'session'|'alltime'): Promise<void>
  clearCache(kind: 'hot'|'ssd'): Promise<void>

  // prompting — convenience over the OpenAI-compatible endpoint
  chat(model: string, input: string | ChatMessage[], opts?: {
    stream?: boolean; temperature?: number; maxTokens?: number; system?: string;
  }): Promise<string> | AsyncIterable<string>   // string (buffered) or token stream
}
```
- `loadModel`/`restart` are **async-until-settled**: kick the action, then poll the relevant query
  method (reusing Phase 1) until the state converges, with a timeout. This makes the CLI feel
  synchronous and correct.
- `chat` streams via SSE when `stream:true` (oMLX supports `sse_keepalive_mode`); buffer otherwise.

## 2.3 Safety / UX
- Destructive actions (`restart`, `clearStats`, `clearCache`) require confirmation in interactive
  TTY use; `--yes` / non-TTY skips the prompt (agents pass `--yes` or rely on non-TTY auto-confirm
  per the CLI's output-discipline rules).
- All actions return structured results so `exec`/scripts can branch on them.

## CLI surfaced this phase
`restart`, `load <model>`, `unload <model>`, `chat <model> <prompt>` (or via `exec`) — see
[cli.md](cli.md).

## Deliverables / done when
- [ ] Mutation contracts confirmed from real dashboard actions.
- [ ] `restart/reload/loadModel/unloadModel/clearStats/clearCache` implemented and settle correctly.
- [ ] `chat()` works buffered + streaming against a loaded model.
- [ ] Confirmation gating + `--yes` behave correctly for TTY vs piped/agent use.
