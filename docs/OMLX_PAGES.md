# oMLX Admin Dashboard — Page & Data Catalog

> Reverse-engineered from a running oMLX **v0.4.4** server at `http://127.0.0.1:8000`.
> This documents the **dynamic, server-state data** behind each dashboard page — not static UI.

## TL;DR — the important discovery

The admin dashboard is a **client-rendered SPA**. The served HTML is just an app shell; the
URL query params (`?tab=…&modelsTab=…`) only drive client-side routing. **All real data comes
from a clean JSON API under `/admin/api/*`.**

➡️ **Our tool consumes that JSON API directly.** "Parse the HTML with Bun" is a dead end here —
the HTML contains no state. The JSON API is strictly better: typed, stable, complete.

## Authentication model (two separate surfaces)

| Surface | Auth | Verified |
| --- | --- | --- |
| `/v1/*` (OpenAI-compatible) | `Authorization: Bearer <api_key>` | ✅ `/v1/models` → 200 with key |
| `/admin/api/*` (dashboard data) | **httpOnly session cookie** | ✅ Bearer/X-API-Key → 401 |

- `api_key` lives at `~/.omlx/settings.json → auth.api_key` (e.g. `omlx-…`). It also appears in
  the browser's `localStorage.omlx_chat_api_key` and is echoed in `/admin/api/stats.api_key`.
- The admin session is obtained via **`POST /admin/api/login`** (exists; returns 422 without a
  body). Working hypothesis (confirmed by the user): the dashboard logs in with the **api_key**,
  receiving an httpOnly session cookie. `/admin/api/logout` ends it.
- ⚠️ **To confirm in Phase 0:** the exact login request body field (`api_key` vs `password`) and
  the `Set-Cookie` name. Everything else below is captured from a live authenticated session.

---

## Navigation map (SPA routes → backing endpoints)

| Page | URL | Backing `/admin/api/*` endpoints | In scope? |
| --- | --- | --- | --- |
| **Dashboard** (overview) | `/admin/dashboard` | `server-info`, `stats`, `stats?scope=alltime`, `update-check`, `device-info` | ✅ core |
| **Models › Manager** | `?tab=models&modelsTab=manager` | `models`, `models/{id}/settings`, `models/{id}/profiles`, `models/{id}/generation`, `models/{id}/load`, `models/{id}/unload` | ✅ core |
| **Models › Downloader** | `?tab=models&modelsTab=downloader` | `hf/search`, `hf/models`, `hf/recommended`, `hf/model-info`, `hf/download`, `hf/tasks`, `hf/task/{id}`, `hf/cancel/{id}`, `hf/retry/{id}`, `ms/*` (ModelScope mirror) | ❌ out of scope |
| **Models › oQ Quantization** | `?tab=models&modelsTab=quantize` | `oq/models`, `oq/estimate`, `oq/start`, `oq/tasks`, `oq/task/{id}`, `oq/cancel/{id}` | ❌ out of scope |
| **Models › oQ Uploader** | `?tab=models&modelsTab=uploader` | `upload/oq-models`, `upload/start`, `upload/tasks`, `upload/task/{id}`, `upload/cancel/{id}`, `upload/validate-token` | ❌ out of scope |
| **Settings › Global** | `?tab=settings&settingsTab=global` | `global-settings` (GET + save) | 🟡 query yes / actions no |
| **Settings › Model** | `?tab=settings&settingsTab=model` | `profile-fields`, `profile-templates`, `models/{id}/settings`, `models/{id}/profiles` | 🟡 query |
| **Settings › Integration** | `?tab=settings&settingsTab=integration` | `global-settings` (`integrations` + `claude_code` sections) | 🟡 query |
| **Logs** | `?tab=logs` | `logs` (`?level=`, `?file=`) | ✅ core |
| **Bench › Performance** | `?tab=bench&benchTab=throughput` | `bench/`, `bench/start`, `bench/active` | ❌ out of scope |
| **Bench › Intelligence** | `?tab=bench&benchTab=intelligence` | `bench/accuracy/*`, `bench/accuracy/queue/*`, `bench/accuracy/results` | ❌ out of scope |
| **Chat** | `/admin/chat` | *(none — uses `/v1/chat/completions` with the api_key)* | ✅ via `/v1` |

> Tab-param values verified from the JS bundle: `modelsTab ∈ {manager, downloader, quantize?, uploader}`,
> `settingsTab ∈ {global, model, integration}`, `benchTab ∈ {throughput, intelligence}`.
> `quantize` is the one value not directly confirmed in source strings.

---

## Core data shapes (captured live)

These are the endpoints our tool actually reads. Shapes are abbreviated skeletons
(`num`/`str`/`bool`/`len:N`) captured from the live server.

### `GET /admin/api/server-info` — server identity
```ts
{ host: string; port: number; aliases: string[] }
```

### `GET /admin/api/stats` (and `?scope=alltime`) — the firehose ⭐
The single richest endpoint. Drives the dashboard overview **and is the source of "running
requests" + live memory**.
```ts
{
  total_tokens_served, total_cached_tokens, cache_efficiency,
  total_prompt_tokens, total_completion_tokens, total_requests,
  avg_prefill_tps, avg_generation_tps, uptime_seconds,
  host, port, api_key, cli_prefix,
  claude_code_context_scaling_enabled, claude_code_target_context_size,
  engines: { 'mlx-lm' | 'mlx-vlm' | 'mlx-embeddings' | 'mlx-audio':
             { name, version, commit, url } },
  active_models: {                       // ← LIVE serving state
    models: ModelRuntime[],              //   per loaded model (empty when none loaded)
    model_memory_used, model_memory_max,
    memory_pressure: { enabled, current_bytes, soft_bytes, hard_bytes,
                       current_formatted, soft_formatted, hard_formatted,
                       pressure_level },
    total_active_requests, total_waiting_requests   // ← running/queued requests
  },
  runtime_cache: { base_path, ssd_cache_dir, response_state_dir, models,
                   total_num_files, total_size_bytes, effective_block_sizes,
                   disk_max_bytes, hot_cache_max_bytes, hot_cache_size_bytes,
                   hot_cache_entries }
}
```
> `scope=alltime` returns the same shape with cumulative counters; default scope is "session".
> ⚠️ `active_models.models[]` was **empty** at capture time (no model loaded). The per-model
> runtime/per-request shape must be re-captured in Phase 1 with a model loaded and serving.

### `GET /admin/api/models` — model inventory
```ts
{ models: Array<{
    id, model_path, loaded, is_loading,
    estimated_size, estimated_size_formatted, actual_size, actual_size_formatted,
    pinned, is_default, engine_type, model_type, config_model_type,
    thinking_default, preserve_thinking_default, source_type, source_repo_id,
    last_access,
    dflash_compatible, dflash_compatibility_reason, dflash_ssd_cache_available,
    mtp_compatible, mtp_compatibility_reason, is_paroquant, paroquant_reason
}> }   // 10 models at capture
```

### `GET /admin/api/global-settings` — full config + live system block
Mirrors `~/.omlx/settings.json` plus a computed `system` block with **live host memory/SSD**:
```ts
{
  base_path,
  server { host, port, log_level, server_aliases[], sse_keepalive_mode,
           auto_start_on_launch, burst_decode_mode, preserve_mid_system_cache },
  model { model_dirs[], model_dir, effective_model_dirs[], model_fallback },
  memory { prefill_memory_guard, memory_guard_tier, memory_guard_custom_ceiling_gb },
  scheduler { max_concurrent_requests, embedding_batch_size, chunked_prefill },
  cache { enabled, ssd_cache_dir, ssd_cache_max_size, hot_cache_only,
          hot_cache_max_size, initial_cache_blocks },
  huggingface { endpoint, hf_cache_enabled, hf_cache_path }, modelscope { endpoint },
  network { http_proxy, https_proxy, no_proxy, ca_bundle },
  sampling { max_context_window, max_context_window_policy, max_tokens,
             temperature, top_p, top_k, repetition_penalty },
  auth { api_key_set, api_key, skip_api_key_verification, sub_keys[] },
  claude_code { context_scaling_enabled, target_context_size, mode,
                opus_model, sonnet_model, haiku_model },
  integrations { codex_model, opencode_model, openclaw_model, hermes_model,
                 pi_model, copilot_model, openclaw_tools_profile,
                 markitdown_enabled, ... },
  system {                              // ← live, computed each call
    total_memory_bytes, total_memory, auto_model_memory,
    available_memory_bytes, omlx_phys_footprint_bytes, free_memory_bytes,
    inactive_memory_bytes, active_memory_bytes,
    iogpu_wired_limit_bytes, omlx_wired_limit_request_bytes,
    ssd_total_bytes, ssd_total
  },
  ui { language }, idle_timeout { idle_timeout_seconds }
}
```

### `GET /admin/api/logs` — server logs
```ts
{ logs: string;            // raw newline-delimited log text
  total_lines: number;
  log_file: string;        // e.g. "server.log"
  available_files: string[] }   // 8 rotated files at capture
// query: ?level=TRACE|DEBUG|INFO|WARNING|ERROR|CRITICAL  ?file=<name>
```

### `GET /admin/api/profile-fields` — tunable field taxonomy
```ts
{ universal: string[];        // 19 fields, e.g. max_context_window
  model_specific: string[] }  // 27 fields, e.g. turboquant_kv_enabled
```

### `GET /admin/api/update-check`
```ts
{ update_available: boolean; latest_version: string|null;
  release_url: string|null; update_channel: string }   // e.g. "stable"
```

### `GET /admin/api/hf/tasks`, `GET /admin/api/oq/tasks`
```ts
{ tasks: Task[] }   // both empty at capture; download/quant queues (out of scope)
```

---

## Action endpoints (Phase 2 — mutations)

Discovered by grepping the dashboard JS bundle. **Exact method + body to be confirmed by observing
one manual action in Phase 2** (not probed here to avoid mutating server state).

| Action | Endpoint | Notes |
| --- | --- | --- |
| Restart server | `POST /admin/api/server/restart` | "Restart server" button |
| Reload | `POST /admin/api/reload` | lighter reload (config/presets) |
| Load model | `POST /admin/api/models/{id}/load` | id is `encodeURIComponent`'d |
| Unload model | `POST /admin/api/models/{id}/unload` | |
| Model settings | `…/models/{id}/settings` | GET/save per-model profile |
| Model profiles | `…/models/{id}/profiles` | |
| Model generation params | `…/models/{id}/generation` | |
| Clear session stats | `POST /admin/api/stats/clear` | |
| Clear all-time stats | `POST /admin/api/stats/clear-alltime` | |
| Clear hot cache | `POST /admin/api/hot-cache/clear` | |
| Clear SSD cache | `POST /admin/api/ssd-cache/clear` | |
| Logout | `POST /admin/api/logout` | ends admin session |
| **Prompt a model** | `POST /v1/chat/completions` | **`/v1`, Bearer api_key** — not admin |

Out-of-scope action families (download/quantize/upload/bench): `hf/*`, `ms/*`, `oq/*`,
`upload/*`, `bench/*` — catalogued above for completeness, intentionally **not** wrapped.

---

## Full endpoint inventory (from JS bundle)

<details><summary>All <code>/admin/api/*</code> paths referenced by the dashboard</summary>

```
bench/  bench/accuracy/  bench/accuracy/cancel  bench/accuracy/queue/
bench/accuracy/queue/add  bench/accuracy/queue/status  bench/accuracy/results
bench/accuracy/results/reset  bench/active  bench/start
device-info  global-settings  grammar/parsers
hf/cancel/  hf/download  hf/model-info  hf/models  hf/models/  hf/recommended
hf/retry/  hf/search  hf/task/  hf/tasks
hot-cache/clear  logout  logs  models  models/  models/{id}/load  models/{id}/unload
models/{id}/settings  models/{id}/profiles  models/{id}/generation
ms/cancel/  ms/download  ms/model-info  ms/recommended  ms/retry/  ms/search
ms/status  ms/task/  ms/tasks
oq/cancel/  oq/estimate  oq/models  oq/start  oq/task/  oq/tasks
presets/refresh  profile-fields  profile-templates  profile-templates/
reload  server-info  server/restart  ssd-cache/clear
stats  stats/clear  stats/clear-alltime  sub-keys  update-check
upload/cancel/  upload/oq-models  upload/start  upload/task/  upload/tasks
upload/validate-token
```
</details>

## Capture method note
All shapes above were captured against the user's live, browser-authenticated session using
**synchronous `XMLHttpRequest`** executed in the dashboard tab (the session cookie is httpOnly, so
async `fetch` from outside fails). This is a one-time documentation technique — the shipped tool
authenticates properly via `/admin/api/login`.
