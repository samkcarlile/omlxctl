// Phase 1 SDK — taxonomy / ergonomic layer over raw endpoints.
//
// NOTE: Constructor accepts cfg overrides but does NOT wire them into the
// module-level request() singleton in transport.ts (which resolves config
// from env/files on its own). Full per-instance config injection is deferred
// to Phase 2. For now the Omlx class is a thin namespace for grouped calls.

import type { ResolvedConfig } from "./client/config.ts";
import {
  getServerInfo,
  getStats,
  getModels,
  getGlobalSettings,
  getLogs,
  getUpdateCheck,
} from "./client/endpoints.ts";
import { invalidateCache } from "./client/cache.ts";
import { request } from "./client/transport.ts";
import { OmlxApiError } from "./types/errors.ts";
import type { GlobalSettings } from "./types/api.ts";

// ──────────────────────────────────────────────────────────────────────────────
// Domain types
// ──────────────────────────────────────────────────────────────────────────────

export interface ServerView {
  host: string;
  port: number;
  version: string;
  uptimeSeconds: number;
  engines: Record<string, { version: string; commit: string }>;
  update: { available: boolean; latest: string | null; channel: string };
}

export interface Model {
  id: string;
  path: string;
  loaded: boolean;
  loading: boolean;
  pinned: boolean;
  isDefault: boolean;
  engineType: string;
  modelType: string;
  sizeBytes: number;
  sizeFormatted: string;
  lastAccess: string | null;
  compat: { dflash: boolean; mtp: boolean; paroquant: boolean };
}

export interface MemoryView {
  pressureLevel: string;
  modelUsedBytes: number;
  modelMaxBytes: number;
  hostTotalBytes: number;
  hostAvailableBytes: number;
  ssdTotalBytes: number;
}

export interface RuntimeView {
  totalActiveRequests: number;
  totalWaitingRequests: number;
  models: Array<{ id: string; activeRequests: number; waitingRequests: number }>;
}

export type Scope = "session" | "alltime";

export interface StatsView {
  scope: Scope;
  tokensServed: number;
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  cacheEfficiency: number;
  requests: number;
  avgPrefillTps: number;
  avgGenerationTps: number;
}

export interface CacheView {
  ssdDir: string;
  totalFiles: number;
  totalSizeBytes: number;
  hotCacheMaxBytes: number;
  hotCacheSizeBytes: number;
  hotCacheEntries: number;
}

export interface LogLine {
  raw: string;
  level?: string;
  message?: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// Phase 2 supporting types
// ──────────────────────────────────────────────────────────────────────────────

export interface LoadModelOpts {
  profile?: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOpts {
  temperature?: number;
  maxTokens?: number;
  system?: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// Deep equality helper (no external deps)
// ──────────────────────────────────────────────────────────────────────────────

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return a === b;

  if (Array.isArray(a) !== Array.isArray(b)) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const keysA = Object.keys(ao);
  const keysB = Object.keys(bo);
  if (keysA.length !== keysB.length) return false;
  for (const k of keysA) {
    if (!Object.prototype.hasOwnProperty.call(bo, k)) return false;
    if (!deepEqual(ao[k], bo[k])) return false;
  }
  return true;
}

// ──────────────────────────────────────────────────────────────────────────────
// SDK class
// ──────────────────────────────────────────────────────────────────────────────

export class Omlx {
  // Stored for future Phase 2 per-instance config injection.
  // Currently unused — transport.ts resolves config via its own singleton.
  private readonly _cfg: Partial<ResolvedConfig>;

  constructor(cfg?: Partial<ResolvedConfig>) {
    this._cfg = cfg ?? {};
  }

  /** Assembles host/version/uptime/engines/update from multiple endpoints. */
  async server(): Promise<ServerView> {
    const [info, stats, update] = await Promise.all([
      getServerInfo(),
      getStats(),
      getUpdateCheck(),
    ]);

    // Derive version from engines; prefer mlx-lm, otherwise first available.
    const enginesRaw = stats.engines ?? {};
    const version =
      enginesRaw["mlx-lm"]?.version ??
      Object.values(enginesRaw)[0]?.version ??
      "unknown";

    const engines: Record<string, { version: string; commit: string }> = {};
    for (const [k, v] of Object.entries(enginesRaw)) {
      engines[k] = { version: v.version, commit: v.commit };
    }

    return {
      host: info.host,
      port: info.port,
      version,
      uptimeSeconds: stats.uptime_seconds,
      engines,
      update: {
        available: update.update_available,
        latest: update.latest_version,
        channel: update.update_channel,
      },
    };
  }

  /** Returns all registered models as ergonomic Model objects. */
  async models(): Promise<Model[]> {
    const resp = await getModels();
    return (resp.models ?? []).map((m) => ({
      id: m.id,
      path: m.model_path,
      loaded: m.loaded,
      loading: m.is_loading,
      pinned: m.pinned,
      isDefault: m.is_default,
      engineType: m.engine_type,
      modelType: m.model_type,
      sizeBytes: m.actual_size || m.estimated_size,
      sizeFormatted: (m.actual_size && m.actual_size_formatted) || m.estimated_size_formatted,
      lastAccess: m.last_access,
      compat: {
        dflash: m.dflash_compatible,
        mtp: m.mtp_compatible,
        paroquant: m.is_paroquant,
      },
    }));
  }

  /** Find a model by exact id. Returns null when not found. */
  async model(id: string): Promise<Model | null> {
    const all = await this.models();
    return all.find((m) => m.id === id) ?? null;
  }

  /** Memory pressure + host system memory from stats + global-settings. */
  async memory(): Promise<MemoryView> {
    const [stats, settings] = await Promise.all([getStats(), getGlobalSettings()]);
    const mp = stats.active_models.memory_pressure;
    const sys = settings.system;
    return {
      pressureLevel: mp.pressure_level,
      modelUsedBytes: stats.active_models.model_memory_used,
      modelMaxBytes: stats.active_models.model_memory_max,
      hostTotalBytes: sys.total_memory_bytes,
      hostAvailableBytes: sys.available_memory_bytes,
      ssdTotalBytes: sys.ssd_total_bytes,
    };
  }

  /** Active/waiting request counts per loaded model. */
  async activeRequests(): Promise<RuntimeView> {
    const stats = await getStats();
    const am = stats.active_models;
    return {
      totalActiveRequests: am.total_active_requests,
      totalWaitingRequests: am.total_waiting_requests,
      models: (am.models ?? []).map((m) => ({
        id: m.id,
        activeRequests: m.active_requests ?? 0,
        waitingRequests: m.waiting_requests ?? 0,
      })),
    };
  }

  /** Token/throughput stats for a given scope (default: session). */
  async stats(scope: Scope = "session"): Promise<StatsView> {
    const s = await getStats(scope);
    return {
      scope,
      tokensServed: s.total_tokens_served,
      promptTokens: s.total_prompt_tokens,
      completionTokens: s.total_completion_tokens,
      cachedTokens: s.total_cached_tokens,
      cacheEfficiency: s.cache_efficiency,
      requests: s.total_requests,
      avgPrefillTps: s.avg_prefill_tps,
      avgGenerationTps: s.avg_generation_tps,
    };
  }

  /** Disk + hot-cache info from stats.runtime_cache. */
  async cache(): Promise<CacheView> {
    const stats = await getStats();
    const rc = stats.runtime_cache;
    return {
      ssdDir: rc.ssd_cache_dir,
      totalFiles: rc.total_num_files,
      totalSizeBytes: rc.total_size_bytes,
      hotCacheMaxBytes: rc.hot_cache_max_bytes,
      hotCacheSizeBytes: rc.hot_cache_size_bytes,
      hotCacheEntries: rc.hot_cache_entries,
    };
  }

  /** Raw global settings object. */
  async settings(): Promise<GlobalSettings> {
    return getGlobalSettings();
  }

  /**
   * Fetches and parses server logs into LogLine objects.
   * Tries to split "LEVEL: message" pattern; falls back to raw on failure.
   */
  async logs(opts?: { level?: string; file?: string }): Promise<LogLine[]> {
    const resp = await getLogs(opts);
    const raw = resp.logs ?? "";
    if (!raw.trim()) return [];

    return raw.split("\n").filter(Boolean).map((line) => {
      // Common log pattern: "LEVEL: message" or "LEVEL - message"
      const match = line.match(/^([A-Z]+)[:\s-]+\s*(.+)$/);
      if (match) {
        return { raw: line, level: match[1], message: match[2] };
      }
      return { raw: line };
    });
  }

  // ── Phase 2: action methods ────────────────────────────────────────────────

  /**
   * POST /admin/api/server/restart — posts the restart command, then polls
   * this.server() every 2s until it responds (up to 30s).
   * The socket may drop mid-restart; OmlxApiError(0) and TypeError are treated
   * as "still restarting" and do not cause early rejection.
   */
  async restart(): Promise<void> {
    try {
      await request<unknown>("/admin/api/server/restart", { method: "POST" });
    } catch (err) {
      // Socket drop on restart is expected — continue to poll
      const isConnErr =
        (err instanceof OmlxApiError && err.status === 0) ||
        err instanceof TypeError;
      if (!isConnErr) throw err;
    }

    const timeoutMs = 30_000;
    const pollMs = 2_000;
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, pollMs));
      try {
        await this.server();
        invalidateCache("getServerInfo");
        invalidateCache("getStats");
        return; // server responded — restart complete
      } catch (err) {
        // OmlxApiError(0) or TypeError = still coming back up; keep polling
        const isConnErr =
          (err instanceof OmlxApiError && err.status === 0) ||
          err instanceof TypeError;
        if (!isConnErr) throw err;
      }
    }

    throw new Error("oMLX server did not come back within 30s after restart");
  }

  /** POST /admin/api/reload — resolves immediately on success. */
  async reload(): Promise<void> {
    await request<unknown>("/admin/api/reload", { method: "POST" });
  }

  /**
   * POST /admin/api/models/{id}/load — posts the load command, then polls
   * this.model(id) every 2s until loaded===true or is_loading===false+loaded===false.
   * Rejects after 120s.
   */
  async loadModel(id: string, opts?: LoadModelOpts): Promise<Model> {
    const encoded = encodeURIComponent(id);
    await request<unknown>(`/admin/api/models/${encoded}/load`, {
      method: "POST",
      body: opts !== undefined ? opts : undefined,
    });

    const timeoutMs = 120_000;
    const pollMs = 2_000;
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, pollMs));
      const m = await this.model(id);
      if (m === null) throw new Error(`Model "${id}" not found after load`);
      if (m.loaded) {
        invalidateCache("getModels");
        invalidateCache("getStats");
        return m;
      }
      if (!m.loading) throw new Error(`Model "${id}" failed to load`);
    }

    throw new Error(`Model "${id}" did not finish loading within 120s`);
  }

  /** POST /admin/api/models/{id}/unload */
  async unloadModel(id: string): Promise<void> {
    const encoded = encodeURIComponent(id);
    await request<unknown>(`/admin/api/models/${encoded}/unload`, { method: "POST" });
    invalidateCache("getModels");
    invalidateCache("getStats");
  }

  /**
   * Clear token stats.
   * scope 'session' → POST /admin/api/stats/clear
   * scope 'alltime' → POST /admin/api/stats/clear-alltime
   */
  async clearStats(scope: 'session' | 'alltime'): Promise<void> {
    const path =
      scope === 'alltime'
        ? '/admin/api/stats/clear-alltime'
        : '/admin/api/stats/clear';
    await request<unknown>(path, { method: "POST" });
    invalidateCache("getStats");
  }

  /**
   * Clear cache store.
   * kind 'hot' → POST /admin/api/hot-cache/clear
   * kind 'ssd' → POST /admin/api/ssd-cache/clear
   */
  async clearCache(kind: 'hot' | 'ssd'): Promise<void> {
    const path =
      kind === 'ssd'
        ? '/admin/api/ssd-cache/clear'
        : '/admin/api/hot-cache/clear';
    await request<unknown>(path, { method: "POST" });
    invalidateCache("getStats");
  }

  // ── Phase 3: watch() ──────────────────────────────────────────────────────

  /**
   * Poll `fn(this)` every `intervalMs` milliseconds and yield each time the
   * value changes (as determined by `equals`). The first value is always
   * yielded. Transient errors are skipped (logged to stderr in debug mode).
   * Stops when `signal` is aborted.
   */
  watch<T>(
    fn: (o: Omlx) => Promise<T>,
    opts?: {
      intervalMs?: number;
      onChange?: (cur: T, prev: T | undefined) => void;
      equals?: (a: T, b: T) => boolean;
      signal?: AbortSignal;
    },
  ): AsyncIterable<T> {
    const intervalMs = opts?.intervalMs ?? 1000;
    const equals = opts?.equals ?? ((a: T, b: T) => deepEqual(a, b));
    const signal = opts?.signal;
    const onChange = opts?.onChange;
    const self = this;

    return {
      [Symbol.asyncIterator](): AsyncIterator<T> {
        let prev: T | undefined = undefined;
        let first = true;
        let done = false;

        const checkAborted = (): boolean => {
          if (signal?.aborted) {
            done = true;
            return true;
          }
          return false;
        };

        return {
          async next(): Promise<IteratorResult<T>> {
            while (true) {
              if (checkAborted()) return { value: undefined as unknown as T, done: true };

              let cur: T;
              try {
                cur = await fn(self);
              } catch (err) {
                if (process.env["OMLX_DEBUG"]) {
                  process.stderr.write(`[watch] transient error: ${err instanceof Error ? err.message : String(err)}\n`);
                }
                // Wait interval then retry
                await new Promise<void>((resolve) => {
                  const tid = setTimeout(resolve, intervalMs);
                  signal?.addEventListener("abort", () => { clearTimeout(tid); resolve(); }, { once: true });
                });
                continue;
              }

              const changed = first || !equals(cur, prev as T);
              if (changed) {
                if (!done) {
                  onChange?.(cur, prev);
                  prev = cur;
                  first = false;
                  // Wait interval before next poll
                  const waitAndReturn = async (): Promise<IteratorResult<T>> => {
                    await new Promise<void>((resolve) => {
                      const tid = setTimeout(resolve, intervalMs);
                      signal?.addEventListener("abort", () => { clearTimeout(tid); resolve(); }, { once: true });
                    });
                    return { value: cur, done: false };
                  };
                  return waitAndReturn();
                }
                return { value: undefined as unknown as T, done: true };
              }

              // No change — wait then poll again
              await new Promise<void>((resolve) => {
                const tid = setTimeout(resolve, intervalMs);
                signal?.addEventListener("abort", () => { clearTimeout(tid); resolve(); }, { once: true });
              });
            }
          },
          return(): Promise<IteratorResult<T>> {
            done = true;
            return Promise.resolve({ value: undefined as unknown as T, done: true });
          },
        };
      },
    };
  }

  /**
   * POST /v1/chat/completions — buffered (non-streaming) chat completion.
   * Returns the assistant message content string.
   * opts.system prepends a system message; opts.temperature and opts.maxTokens
   * map to OpenAI-compatible fields.
   */
  async chat(
    model: string,
    input: string | ChatMessage[],
    opts?: ChatOpts,
  ): Promise<string> {
    const messages: ChatMessage[] = [];

    if (opts?.system) {
      messages.push({ role: 'system', content: opts.system });
    }

    if (typeof input === 'string') {
      messages.push({ role: 'user', content: input });
    } else {
      messages.push(...input);
    }

    const body: Record<string, unknown> = {
      model,
      messages,
      stream: false,
    };
    if (opts?.temperature !== undefined) body['temperature'] = opts.temperature;
    if (opts?.maxTokens !== undefined) body['max_tokens'] = opts.maxTokens;

    const resp = await request<{
      choices: Array<{ message: { content: string } }>;
    }>('/v1/chat/completions', {
      method: 'POST',
      surface: 'v1',
      body,
    });

    const content = resp?.choices?.[0]?.message?.content;
    if (content === undefined) {
      throw new Error('Unexpected response shape from /v1/chat/completions');
    }
    return content;
  }
}

export default Omlx;
