# Phase 0 — Foundation: config, auth, transport

Goal: a single `request()` primitive that "just works" against both API surfaces, with zero-config
auth resolved from the user's existing oMLX install. Nothing user-facing ships here; it's the base
every later phase sits on.

## 0.1 Config resolution (`src/client/config.ts`)

Resolve connection + credentials with this precedence (first hit wins):

1. Explicit constructor args / CLI flags (`--base-url`, `--api-key`).
2. Env: `OMLX_BASE_URL`, `OMLX_API_KEY`.
3. `~/.omlx/settings.json` → `auth.api_key`, `server.host`, `server.port`.
4. Defaults: `http://127.0.0.1:8000`.

```ts
interface ResolvedConfig {
  baseUrl: string;        // e.g. http://127.0.0.1:8000
  apiKey: string;
  settingsPath: string;   // ~/.omlx/settings.json
  sessionCachePath: string; // ~/.cache/omlxctl/session.json
}
```
- Read `~/.omlx/settings.json` with Bun (`Bun.file(...).json()`); tolerate absence (fall through).
- Never log the api_key.

## 0.2 Auth / session (`src/client/transport.ts`)

Two surfaces, two mechanisms (see OMLX_PAGES.md):

- **`/v1/*`** → `Authorization: Bearer <api_key>`. Stateless. Used by `chat()` and the `models`
  convenience overlap.
- **`/admin/api/*`** → httpOnly **session cookie** from `POST /admin/api/login`.

### Session lifecycle
```
ensureSession():
  if cached cookie on disk and not known-bad → use it
  else login():
    POST /admin/api/login  { api_key }     # ⚠️ confirm field name in 0.4
    capture Set-Cookie → persist to ~/.cache/omlxctl/session.json {cookie, ts}
admin request flow:
  send with cookie → if 401/redirect-to-login → login() once → retry → else surface error
```
- Persisting the cookie matters: **each `omlxctl` invocation is a fresh process**, so without a
  cache every call would re-login. Cache file is `chmod 600`.
- `logout()` (optional) hits `POST /admin/api/logout` and clears the cache.

## 0.3 `request()` primitive
```ts
type Surface = 'admin' | 'v1';
async function request<T>(path: string, opts?: {
  method?: 'GET'|'POST'|'PUT'|'PATCH'|'DELETE';
  surface?: Surface;          // default 'admin'
  query?: Record<string, string | number | undefined>;
  body?: unknown;             // JSON-encoded
}): Promise<T>
```
- Builds URL from `baseUrl` + path + query.
- `admin` → attach session cookie (via `ensureSession`), auto re-login on 401.
- `v1` → attach Bearer header.
- Parse JSON; on non-2xx throw a typed `OmlxApiError { status, path, detail }` (oMLX returns
  `{ detail: string }` on errors — seen on 404/401/422).
- Sensible timeout + one retry on connection refused (server may be mid-restart).

## 0.4 Confirm the login contract (the one unknown)
Before writing `login()`, confirm with a single manual probe (user can run via `!`):
```
curl -i -X POST http://127.0.0.1:8000/admin/api/login \
  -H 'Content-Type: application/json' -d '{"api_key":"<api_key>"}'
```
Capture: (a) which body field is accepted (`api_key` vs `password` vs `key`), (b) the `Set-Cookie`
name, (c) status on success. Encode the answer into `login()`. If `api_key` isn't the credential,
fall back to a `--admin-password` flag / `OMLX_ADMIN_PASSWORD` env.

## Deliverables / done when
- [ ] `config.ts` resolves baseUrl + apiKey from settings.json with env/flag overrides.
- [ ] `transport.ts` logs in, caches the cookie, and re-logins transparently on 401.
- [ ] `request()` works for both surfaces; verified by fetching `/admin/api/server-info` (admin)
      and `/v1/models` (v1) from a cold process with no browser involved.
- [ ] `OmlxApiError` surfaces `{status, detail}` cleanly.

## Risks
- Login contract differs from hypothesis → handled by 0.4 + password fallback.
- Cookie expiry/rotation → 401-retry loop covers it; cap at one re-login to avoid infinite loops.
