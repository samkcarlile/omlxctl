// Raw API response types — grouped by endpoint
// These mirror the server's JSON shapes exactly (snake_case).

// GET /admin/api/server-info
export interface ServerInfo {
  host: string;
  port: number;
  aliases: string[];
}

// GET /admin/api/stats (and ?scope=alltime)
export interface ModelRuntime {
  id: string;
  active_requests?: number;
  waiting_requests?: number;
  [key: string]: unknown; // full shape TBD
}

export interface MemoryPressure {
  enabled: boolean;
  current_bytes: number;
  soft_bytes: number;
  hard_bytes: number;
  current_formatted: string;
  soft_formatted: string;
  hard_formatted: string;
  pressure_level: string;
}

export interface ActiveModels {
  models: ModelRuntime[];
  model_memory_used: number;
  model_memory_max: number;
  memory_pressure: MemoryPressure;
  total_active_requests: number;
  total_waiting_requests: number;
}

export interface RuntimeCache {
  base_path: string;
  ssd_cache_dir: string;
  response_state_dir: string;
  models: unknown;
  total_num_files: number;
  total_size_bytes: number;
  effective_block_sizes: unknown;
  disk_max_bytes: number;
  hot_cache_max_bytes: number;
  hot_cache_size_bytes: number;
  hot_cache_entries: number;
}

export interface EngineInfo {
  name: string;
  version: string;
  commit: string;
  url: string;
}

export interface StatsResponse {
  total_tokens_served: number;
  total_cached_tokens: number;
  cache_efficiency: number;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  total_requests: number;
  avg_prefill_tps: number;
  avg_generation_tps: number;
  uptime_seconds: number;
  host: string;
  port: number;
  api_key: string;
  cli_prefix: string;
  engines: Record<string, EngineInfo>;
  active_models: ActiveModels;
  runtime_cache: RuntimeCache;
}

// GET /admin/api/models
export interface ModelEntry {
  id: string;
  model_path: string;
  loaded: boolean;
  is_loading: boolean;
  estimated_size: number;
  estimated_size_formatted: string;
  actual_size: number | null;
  actual_size_formatted: string | null;
  pinned: boolean;
  is_default: boolean;
  engine_type: string;
  model_type: string;
  config_model_type: string | null;
  thinking_default: boolean;
  preserve_thinking_default: boolean;
  source_type: string;
  source_repo_id: string | null;
  last_access: string | null;
  dflash_compatible: boolean;
  dflash_compatibility_reason: string | null;
  dflash_ssd_cache_available: boolean;
  mtp_compatible: boolean;
  mtp_compatibility_reason: string | null;
  is_paroquant: boolean;
  paroquant_reason: string | null;
}

export interface ModelsResponse {
  models: ModelEntry[];
}

// GET /admin/api/global-settings
export interface GlobalSettingsServer {
  host: string;
  port: number;
  log_level: string;
  server_aliases: string[];
  sse_keepalive_mode: string;
  auto_start_on_launch: boolean;
  burst_decode_mode: boolean;
  preserve_mid_system_cache: boolean;
}

export interface GlobalSettingsSystem {
  total_memory_bytes: number;
  total_memory: string;
  available_memory_bytes: number;
  omlx_phys_footprint_bytes: number;
  free_memory_bytes: number;
  inactive_memory_bytes: number;
  active_memory_bytes: number;
  iogpu_wired_limit_bytes: number;
  omlx_wired_limit_request_bytes: number;
  ssd_total_bytes: number;
  ssd_total: string;
}

export interface GlobalSettingsAuth {
  api_key_set: boolean;
  api_key: string;
  skip_api_key_verification: boolean;
  sub_keys: unknown[];
}

export interface GlobalSettings {
  base_path: string;
  server: GlobalSettingsServer;
  system: GlobalSettingsSystem;
  auth: GlobalSettingsAuth;
  [key: string]: unknown;
}

// GET /admin/api/logs
export interface LogsResponse {
  logs: string;
  total_lines: number;
  log_file: string;
  available_files: string[];
}

// GET /admin/api/profile-fields
export interface ProfileFields {
  universal: string[];
  model_specific: string[];
}

// GET /admin/api/update-check
export interface UpdateCheck {
  update_available: boolean;
  latest_version: string | null;
  release_url: string | null;
  update_channel: string;
}

// GET /v1/models
export interface V1ModelEntry {
  id: string;
  object: string;
  created: number;
  owned_by: string;
}

export interface V1ModelsResponse {
  data: V1ModelEntry[];
}
