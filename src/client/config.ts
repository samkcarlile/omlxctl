export interface ResolvedConfig {
  baseUrl: string;
  apiKey: string;
  settingsPath: string;
  sessionCachePath: string;
}

interface SettingsJson {
  auth?: { api_key?: string };
  server?: { host?: string; port?: number };
}

export async function resolveConfig(overrides?: {
  baseUrl?: string;
  apiKey?: string;
}): Promise<ResolvedConfig> {
  const home = process.env.HOME ?? "";
  const settingsPath = `${home}/.omlx/settings.json`;
  const sessionCachePath = `${home}/.cache/omlxctl/session.json`;

  let fileSettings: SettingsJson = {};
  try {
    fileSettings = await Bun.file(settingsPath).json() as SettingsJson;
  } catch {
    // file absent or unreadable — use defaults
  }

  const fileHost = fileSettings.server?.host ?? "127.0.0.1";
  const filePort = fileSettings.server?.port ?? 8000;
  const fileBaseUrl = `http://${fileHost}:${filePort}`;

  const baseUrl =
    overrides?.baseUrl ??
    process.env.OMLX_BASE_URL ??
    fileBaseUrl ??
    "http://127.0.0.1:8000";

  const apiKey =
    overrides?.apiKey ??
    process.env.OMLX_API_KEY ??
    fileSettings.auth?.api_key ??
    "";

  return { baseUrl, apiKey, settingsPath, sessionCachePath };
}
