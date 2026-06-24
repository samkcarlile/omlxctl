# Phase 3 — Polish: subscribe (polling) + caching

Goal: make repeated/live use pleasant and cheap. Two small, isolated helpers.

## 3.1 `watch()` — faux-subscribe via polling (`src/sdk.ts`)

A standalone helper that re-evaluates a thunk on an interval and emits on change. It underpins the
`follow` CLI command but is usable directly from `exec` scripts.

```ts
omlx.watch<T>(fn: (o: Omlx) => Promise<T>, opts?: {
  intervalMs?: number;          // default 1000
  onChange?: (cur: T, prev: T | undefined) => void;
  equals?: (a: T, b: T) => boolean;   // default deep-equal
  signal?: AbortSignal;
}): AsyncIterable<T>             // yields only when value changes
```
- Polling, not real subscription (oMLX exposes no event stream for this data) — named honestly.
- Change detection via structural deep-equal so identical polls are silent.
- Backs off / surfaces errors without killing the loop (one bad poll ≠ stop); stops on `signal`.
- Isolated: no dependency on caching; safe to use even when caching is off.

## 3.2 Caching layer (`src/client/cache.ts`)

Short-TTL in-memory cache for **query** endpoints, to collapse redundant fetches within a single
render/command. Critical because many domain methods derive from the same `getStats()` call.

```ts
withCache(getStats, { ttlMs: 500 })   // wrap low-level GETs
```
- **In-process, TTL-based** (default ~500ms–1s). Scope = one CLI invocation by default.
- Keyed by `(path, query)`. `POST`/actions bypass and **invalidate** related keys.
- Makes `status` (which wants server+memory+stats+requests at once) a single network round-trip.
- Off by default for `follow` per-tick freshness? No — `follow` sets ttl < interval so each tick is
  fresh but the 3 derived reads within a tick still share one fetch.
- Optional later: tiny on-disk cache for `models()`/`settings()` across invocations (rarely
  changes). Gated behind a flag; not required for v1.

## 3.3 `follow` CLI command
Built entirely on `watch()`. See [cli.md](cli.md#follow) for the command surface and the
human-vs-agent output story (repaint vs JSONL).

## Deliverables / done when
- [ ] `watch()` yields on change, survives transient errors, stops on abort — verified by following
      `activeRequests()` while sending traffic to a model.
- [ ] `withCache` collapses the N derived reads of `status` into one `getStats()` fetch.
- [ ] Actions invalidate cache so post-action reads are fresh.
