# omlxctl — CLI surface

The human/agent face of the SDK. Tight, minimal, and dual-audience. Built incrementally across
phases but specified here as one design (output discipline + help apply everywhere).

## Philosophy
- **Few verbs, one escape hatch.** Curated subcommands for the common path; `exec`/`follow` expose
  the full SDK for everything else.
- **TTY vs pipe is the core UX axis.** On a TTY: pretty, colorized, aligned. Piped or non-TTY
  (i.e. an agent): clean `JSON` (and `JSONL` for streams). Detect via `process.stdout.isTTY`.
  Global `--json` forces machine output; `--no-color` honored.
- **Stable exit codes** (`0` ok, `1` runtime error, `2` usage error) so scripts/agents can branch.

## Subcommands

### `help` — the front door
- A "sexy" Markdown help page including **concise embedded SDK docs** (so `exec` users learn the
  `omlx.*` surface from `--help`).
- When TTY **and** `bat` is on PATH: render by piping the Markdown through `bat -l md --style=plain`
  (paged/colorized). Else: print clean Markdown to stdout.
- `omlxctl help <subcommand>` for focused help; `omlxctl help sdk` dumps the SDK reference.

### `status`  *(Phase 1)*
One-screen overview: server identity + version + uptime, memory pressure, loaded models, active /
waiting requests, throughput. Backed by a single cached `getStats()` (+ server-info). The "glance"
command.

### `models`  *(Phase 1)*
List models with key columns: id, loaded/pinned/default, size, engine, last access.
- Flags: `--loaded` (only loaded), `--json`.
- Note the deliberate overlap with `/v1/models`: this is the **richer admin** view; add
  `--v1` to show the OpenAI-compatible list instead (handy when comparing what clients see).

### `stats [-m model] [-i k1,k2] [-x k1,k2]`  *(Phase 1)*
Metrics view with field selection.
- `-m, --model` scope to one model (once per-model stats are typed in Phase 1 re-capture).
- `-i, --include k1,k2` allowlist keys; `-x, --exclude k1,k2` denylist. Mutually exclusive.
- `--scope session|alltime` (default session).

### `restart`  *(Phase 2)*
Restart the server; polls until healthy, prints before/after. Confirms on TTY unless `--yes`.

### `load <model>` / `unload <model>`  *(Phase 2)*
Load/unload by id (fuzzy-resolve a unique substring → confirm exact id). Settles before returning.

### `chat <model> <prompt>`  *(Phase 2, optional sugar)*
Quick one-shot prompt via `/v1/chat/completions`. `--stream`, `--system`, `--temp`, `--max-tokens`.
Streams tokens to stdout on TTY. (Equivalent to `exec 'await omlx.chat(...)'` — provided as sugar
because quick prompting is a stated goal.)

### `exec <code>`  *(Phase 1+, grows with the SDK)*  ⭐
Evaluate SDK JavaScript with `omlx` (and a few helpers) in scope. The power feature.
```bash
omlxctl exec 'await omlx.activeRequests()'
omlxctl exec '(await omlx.models()).filter(m => m.loaded).map(m => m.id)'
omlxctl exec 'await omlx.chat("Qwen3.6-27B-UD-MLX-6bit", "hello")'
```
- **Eval model:** wrap the code as the body of an `async (omlx, helpers) => { return (<code>) }`
  (expression) — fall back to executing as statements if it isn't a single expression. Top-level
  `await` supported. Since we ship via `bun link` from source, the SDK is a direct import — no
  bundling gymnastics.
- **In scope:** `omlx` (configured instance), `print`, `json` (helpers). Documented in `help sdk`.
- **Output:** `string` → printed raw; otherwise `JSON.stringify` (pretty on TTY, compact when
  piped). Errors → stderr + exit 1.
- **Why it matters for agents:** one stable, documented command covers any query/action the curated
  verbs don't, without us predicting every need.

### `follow <code>`  *(Phase 3)*  ⭐  {#follow}
Same eval engine as `exec`, but **polled + change-detected** via `omlx.watch()`. First-class
(absorbs the "watch flag" idea — `follow <code>` *is* `exec --watch`).
```bash
omlxctl follow 'await omlx.activeRequests()'
omlxctl follow --interval 500 'await omlx.memory()'
```
- **TTY:** repaint-in-place (alt-screen or clear-line) showing the current value; quiet when
  unchanged; `Ctrl-C` to stop.
- **Piped / agent:** emit one **JSONL** line per change (`{t, value}`) — append-only, parseable,
  no cursor control. This is the key dual-audience design: humans get a live panel, agents get an
  event stream they can read line-by-line.
- `--interval <ms>` (default 1000), `--count <n>` (stop after n changes), `--timeout <ms>`.

## Arg parsing
Use Bun's `util.parseArgs` (or a ~tiny hand-rolled parser) — no heavy CLI framework. Keep global
flags (`--json`, `--no-color`, `--yes`, `--base-url`, `--api-key`) consistent across subcommands.

## Output discipline summary
| Context | Query result | Stream (`follow`) | Errors |
| --- | --- | --- | --- |
| TTY | pretty table/panel | repaint-in-place | colored stderr |
| Piped / agent / `--json` | JSON | JSONL per change | `{error}` JSON + exit 1 |

## Done when
- [ ] `help` renders via `bat` on TTY (plain fallback) and embeds SDK docs.
- [ ] `status`, `models`, `stats` ship with Phase 1; respect TTY-vs-JSON.
- [ ] `exec` evaluates expressions & statements with `omlx` in scope; correct output coding.
- [ ] `restart`/`load`/`unload`/`chat` ship with Phase 2 with confirm gating.
- [ ] `follow` ships with Phase 3 with repaint (TTY) and JSONL (pipe) modes.
