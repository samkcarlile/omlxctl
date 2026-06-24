import { request } from "./transport.ts";
import { withCache } from "./cache.ts";
import type {
  ServerInfo,
  StatsResponse,
  ModelsResponse,
  GlobalSettings,
  ProfileFields,
  UpdateCheck,
  LogsResponse,
  V1ModelsResponse,
} from "../types/api.ts";

export const getServerInfo = withCache(
  async (): Promise<ServerInfo> => request<ServerInfo>("/admin/api/server-info"),
  "getServerInfo",
  5000,
);

export const getStats = withCache(
  async (scope?: "session" | "alltime"): Promise<StatsResponse> =>
    request<StatsResponse>("/admin/api/stats", {
      query: scope ? { scope } : undefined,
    }),
  "getStats",
  500,
);

export const getModels = withCache(
  async (): Promise<ModelsResponse> => request<ModelsResponse>("/admin/api/models"),
  "getModels",
  2000,
);

export async function getGlobalSettings(): Promise<GlobalSettings> {
  return request<GlobalSettings>("/admin/api/global-settings");
}

export async function getProfileFields(): Promise<ProfileFields> {
  return request<ProfileFields>("/admin/api/profile-fields");
}

export const getUpdateCheck = withCache(
  async (): Promise<UpdateCheck> => request<UpdateCheck>("/admin/api/update-check"),
  "getUpdateCheck",
  30000,
);

export const getLogs = withCache(
  async (opts?: { level?: string; file?: string }): Promise<LogsResponse> => {
    const query: Record<string, string | undefined> = {};
    if (opts?.level) query["level"] = opts.level;
    if (opts?.file) query["file"] = opts.file;
    return request<LogsResponse>("/admin/api/logs", {
      query: Object.keys(query).length > 0 ? query : undefined,
    });
  },
  "getLogs",
  1000,
);

export async function listV1Models(): Promise<V1ModelsResponse> {
  return request<V1ModelsResponse>("/v1/models", { surface: "v1" });
}
