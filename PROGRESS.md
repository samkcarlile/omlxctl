# PROGRESS — omlxctl

## Waves
- [x] W1 · P0 Foundation — config.ts, transport.ts, OmlxApiError — clean compile
- [x] W2a · P1 Query API — types/api.ts, client/endpoints.ts, sdk.ts (query) — live server() verified
- [x] W2b · CLI scaffold — cli.ts, render/, commands/help.ts, commands/exec.ts, package.json bin
- [x] W3a · CLI P1 commands — status/models/stats wired; exec working; 4 cmds live-verified
- [x] W4 · P2 Actions SDK — restart/reload/loadModel/unloadModel/clearStats/clearCache/chat — tsc clean
- [x] W5 · P2 CLI — commands/restart/load/unload/chat + _resolve.ts fuzzy model resolver
- [x] W6 · P3 Polish — cache.ts (500ms TTL, 105ms for 3 cached calls), watch(), follow (JSONL verified)
- [x] W7 · CC integration — OMLXCTL.md, 37 lines

## Confirmed contracts
- Login: POST /admin/api/login body `{"api_key":"…"}` → 200 `{"success":true}` + Set-Cookie: `omlx_admin_session`
- Cookie: HttpOnly, Max-Age=86400, Path=/, SameSite=lax
- OMLX_PAGES.md location: docs/OMLX_PAGES.md (plan says ../OMLX_PAGES.md from docs/ — same file)

## Contracts (for cross-phase imports)
src/client/config.ts: export interface ResolvedConfig; export function resolveConfig(overrides?): Promise<ResolvedConfig>
src/client/transport.ts: export function request<T>(path, opts?): Promise<T>; export class OmlxApiError
src/sdk.ts: export class Omlx { constructor(cfg?); server(); models(); model(id); memory(); activeRequests(); stats(scope?); cache(); settings(); logs(opts?) }

## Gates
- (none — login contract confirmed; mutation contracts will be confirmed before W4 dispatch)

## Blockers
- (none)
