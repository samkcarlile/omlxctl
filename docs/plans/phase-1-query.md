# Phase 1 — Query API (read-only)

Goal: turn the raw endpoints into (a) faithful typed clients, then (b) a clean domain SDK that
hides "which page has what." Read-only. This is the foundation the user wants nailed down before
actions.

## 1.1 Low-level endpoint clients (`src/client/endpoints.ts`)

One function per endpoint, return type mirrors the JSON 1:1 (types in `src/types/api.ts`,
shapes already captured in OMLX_PAGES.md). These are intentionally dumb — no merging, no renaming.

```ts
getServerInfo(): Promise<ServerInfo>
getStats(scope?: 'session' | 'alltime'): Promise<StatsResponse>   // ⭐ the firehose
getModels(): Promise<ModelsResponse>
getGlobalSettings(): Promise<GlobalSettings>
getProfileFields(): Promise<ProfileFields>
getUpdateCheck(): Promise<UpdateCheck>
getDeviceInfo(): Promise<DeviceInfo>
getLogs(opts?: { level?: LogLevel; file?: string }): Promise<LogsResponse>
getHfTasks(): Promise<{ tasks: Task[] }>      // catalogued, low priority
getOqTasks(): Promise<{ tasks: Task[] }>
// /v1 surface
listV1Models(): Promise<{ data: V1Model[] }>  // OpenAI-compatible model list
```

**Type generation:** hand-write types from OMLX_PAGES.md skeletons. Keep them in `src/types/api.ts`
grouped by endpoint. Use `| null` and optional fields liberally (the API mixes them).

⚠️ **Re-capture task:** load a model and send it traffic, then snapshot
`stats.active_models.models[]` to type the per-model runtime + per-request/queue detail (it was
empty at first capture). This is the "running requests" payload and is the most important shape to
get right.

## 1.2 Domain taxonomy SDK (`src/sdk.ts` — `class Omlx`)

The DX layer. Methods are organized by *concept*, not by *endpoint*. Several concepts are
assembled from multiple endpoints (esp. the `stats` firehose).

```ts
class Omlx {
  constructor(cfg?: Partial<ResolvedConfig>) {}

  // ── identity & health ────────────────────────────────
  server(): Promise<ServerView>          // host, port, version, uptime, engines, update info
                                         //   ← server-info + stats + update-check
  // ── models ───────────────────────────────────────────
  models(): Promise<Model[]>             // inventory + loaded/serving state merged
                                         //   ← models + stats.active_models.models
  model(id: string): Promise<Model | null>
  // ── live runtime ─────────────────────────────────────
  memory(): Promise<MemoryView>          // unified: pressure + host totals + model mem
                                         //   ← stats.active_models.memory_pressure
                                         //     + global-settings.system
  activeRequests(): Promise<RuntimeView> // active/waiting counts + per-model in-flight
                                         //   ← stats.active_models  ⭐ "running requests"
  // ── metrics ──────────────────────────────────────────
  stats(scope?: Scope): Promise<StatsView>  // tokens, tps, cache efficiency, requests
  cache(): Promise<CacheView>               // runtime_cache (ssd/hot) view
  // ── config & logs ────────────────────────────────────
  settings(): Promise<GlobalSettings>
  logs(opts?): Promise<LogLine[]>           // parse raw `logs` string → structured lines
}
```

### Domain types (illustrative)
```ts
interface ServerView {
  host: string; port: number; version: string;       // version from dashboard ("v0.4.4")
  uptimeSeconds: number;
  engines: Record<'mlx-lm'|'mlx-vlm'|'mlx-embeddings'|'mlx-audio',
                  { version: string; commit: string }>;
  update: { available: boolean; latest: string | null; channel: string };
}
interface Model {
  id: string; path: string;
  loaded: boolean; loading: boolean; pinned: boolean; isDefault: boolean;
  engineType: string; modelType: string;
  sizeBytes: number; sizeFormatted: string;
  lastAccess: string | null;
  compat: { dflash: boolean; mtp: boolean; paroquant: boolean };
  // when loaded: runtime?: { activeRequests, waitingRequests, ... }  (Phase-1 re-capture)
}
interface MemoryView {
  pressureLevel: string;                              // e.g. "low"|"soft"|"hard"
  modelUsedBytes: number; modelMaxBytes: number;
  hostTotalBytes: number; hostAvailableBytes: number;
  ssdTotalBytes: number;
}
interface RuntimeView {
  totalActiveRequests: number; totalWaitingRequests: number;
  models: Array<{ id: string; activeRequests: number; waitingRequests: number }>;
}
interface StatsView {
  scope: Scope;
  tokensServed: number; promptTokens: number; completionTokens: number;
  cachedTokens: number; cacheEfficiency: number;
  requests: number; avgPrefillTps: number; avgGenerationTps: number;
}
```

### Design rules for the SDK
- **Stable, ergonomic names** decoupled from API field names (`uptimeSeconds` not `uptime_seconds`).
- **Assemble, don't expose seams.** Caller never learns that `memory()` reads two endpoints.
- **Cheap composition.** `activeRequests()` and `stats()` and `memory()` all derive from one
  `getStats()` call — Phase 3 caching makes calling all three in one render essentially free.
- **No throwing for "empty".** No models loaded → `activeRequests().models == []`, not an error.

## Deliverables / done when
- [ ] Every core endpoint has a typed low-level client returning a faithful shape.
- [ ] `class Omlx` exposes the query taxonomy above; each method verified against the live server.
- [ ] `stats.active_models.models[]` re-captured & typed with a model actually serving.
- [ ] A throwaway `omlxctl exec 'await omlx.server()'` (early CLI) prints sensible JSON.

## CLI surfaced this phase
`status` (overview), `models` (list), `stats` — see [cli.md](cli.md).
