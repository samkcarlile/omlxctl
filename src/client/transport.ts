import { resolveConfig, type ResolvedConfig } from "./config.ts";
import { OmlxApiError } from "../types/errors.ts";

type Surface = "admin" | "v1";

interface SessionCache {
  cookie: string;
  ts: number;
}

// Module-level singleton: resolved once per process
let _config: ResolvedConfig | undefined;

async function getConfig(): Promise<ResolvedConfig> {
  if (!_config) {
    _config = await resolveConfig();
  }
  return _config;
}

async function readSessionCache(path: string): Promise<SessionCache | null> {
  try {
    return await Bun.file(path).json() as SessionCache;
  } catch {
    return null;
  }
}

async function writeSessionCache(path: string, data: SessionCache): Promise<void> {
  const dir = path.substring(0, path.lastIndexOf("/"));
  await Bun.$`mkdir -p ${dir}`;
  await Bun.write(path, JSON.stringify(data));
  await Bun.$`chmod 600 ${path}`;
}

async function login(config: ResolvedConfig): Promise<string> {
  const url = `${config.baseUrl}/admin/api/login`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: config.apiKey }),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    const detail = await extractDetail(res);
    throw new OmlxApiError(res.status, "/admin/api/login", detail);
  }

  const setCookie = res.headers.get("set-cookie") ?? "";
  // Extract omlx_admin_session=<value> from the Set-Cookie header
  const match = setCookie.match(/omlx_admin_session=[^;]+/);
  if (!match) {
    throw new OmlxApiError(200, "/admin/api/login", "No omlx_admin_session cookie in response");
  }

  const cookie = match[0];
  await writeSessionCache(config.sessionCachePath, { cookie, ts: Date.now() });
  return cookie;
}

const SESSION_TTL_MS = 23 * 60 * 60 * 1000; // 23 hours

async function ensureSession(config: ResolvedConfig): Promise<string> {
  const cached = await readSessionCache(config.sessionCachePath);
  if (cached && Date.now() - cached.ts < SESSION_TTL_MS) {
    return cached.cookie;
  }
  return login(config);
}

async function extractDetail(res: Response): Promise<string> {
  try {
    const body = await res.json() as { detail?: string };
    return body.detail ?? res.statusText;
  } catch {
    return res.statusText;
  }
}

function buildUrl(
  baseUrl: string,
  path: string,
  query?: Record<string, string | number | undefined>,
): string {
  const url = new URL(path, baseUrl);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined) {
        url.searchParams.set(k, String(v));
      }
    }
  }
  return url.toString();
}

async function doFetch(
  url: string,
  init: RequestInit,
): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (err) {
    // One retry on ECONNREFUSED / fetch failed (server mid-restart)
    const msg = err instanceof TypeError ? err.message : "";
    if (msg.includes("fetch failed") || msg.includes("ECONNREFUSED")) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      return fetch(url, init);
    }
    throw err;
  }
}

export async function request<T>(
  path: string,
  opts?: {
    method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    surface?: Surface;
    query?: Record<string, string | number | undefined>;
    body?: unknown;
  },
): Promise<T> {
  const config = await getConfig();
  const surface = opts?.surface ?? "admin";
  const method = opts?.method ?? "GET";
  const url = buildUrl(config.baseUrl, path, opts?.query);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (surface === "v1") {
    headers["Authorization"] = `Bearer ${config.apiKey}`;
  }

  const makeRequest = async (sessionCookie?: string): Promise<Response> => {
    const reqHeaders = { ...headers };
    if (surface === "admin" && sessionCookie) {
      reqHeaders["Cookie"] = sessionCookie;
    }
    return doFetch(url, {
      method,
      headers: reqHeaders,
      body: opts?.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: AbortSignal.timeout(30000),
    });
  };

  if (surface === "admin") {
    const cookie = await ensureSession(config);
    let res = await makeRequest(cookie);

    if (res.status === 401) {
      // Re-login once and retry
      const freshCookie = await login(config);
      res = await makeRequest(freshCookie);
    }

    if (!res.ok) {
      const detail = await extractDetail(res);
      throw new OmlxApiError(res.status, path, detail);
    }

    return res.json() as Promise<T>;
  } else {
    const res = await makeRequest();
    if (!res.ok) {
      const detail = await extractDetail(res);
      throw new OmlxApiError(res.status, path, detail);
    }
    return res.json() as Promise<T>;
  }
}
