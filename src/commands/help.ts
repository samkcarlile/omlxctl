import { renderLine } from "../render/index.ts";

// ---------------------------------------------------------------------------
// Help content
// ---------------------------------------------------------------------------
const USAGE = `# omlxctl

CLI + SDK for inspecting and controlling a local oMLX inference server.

## Subcommands

| Command   | Description                                          |
|-----------|------------------------------------------------------|
| status    | Show server status and health                        |
| models    | List loaded and available models                     |
| stats     | Show runtime statistics (requests, memory, GPU…)     |
| exec      | Evaluate a JS expression against the SDK             |
| follow    | Stream live server logs                              |
| restart   | Restart the inference server                         |
| load      | Load a model into memory                             |
| unload    | Unload a model from memory                           |
| chat      | Start an interactive chat session                    |
| help      | Show this help, or \`help sdk\` for SDK docs           |

## Global flags

| Flag           | Description                                  |
|----------------|----------------------------------------------|
| --json         | Force JSON output regardless of TTY          |
| --no-color     | Disable ANSI colors                          |
| --yes          | Skip confirmation prompts                    |
| --base-url URL | Override the server base URL                 |
| --api-key KEY  | Override the API key                         |
| --help, -h     | Show help                                    |

## Examples

\`\`\`
omlxctl status
omlxctl models --json
omlxctl exec "await omlx.getStatus()"
omlxctl load my-model-id
omlxctl chat
\`\`\`
`;

const SDK_DOCS = `# omlxctl SDK

The \`Omlx\` class wraps the admin API. Instantiate with a resolved config:

\`\`\`ts
import { Omlx } from "omlxctl/sdk";
const omlx = new Omlx({ baseUrl: "http://127.0.0.1:8000", apiKey: "..." });
\`\`\`

## Inspection

\`\`\`ts
omlx.server()                  // ServerView — host, version, uptime, engines, update
omlx.models()                  // Model[] — all registered models, ergonomic shape
omlx.model(id)                 // Model | null — find one model by exact id
omlx.memory()                  // MemoryView — pressure + model & host memory
omlx.activeRequests()          // RuntimeView — active/waiting requests per model
omlx.stats(scope?)             // StatsView — token throughput ('session' | 'alltime')
omlx.cache()                   // CacheView — SSD + hot-cache disk usage
omlx.settings()                // GlobalSettings — raw global settings object
omlx.logs({ level?, file? })   // LogLine[] — parsed server log lines
\`\`\`

## Actions

\`\`\`ts
omlx.loadModel(id, opts?)      // Model — load + poll until ready (≤120s)
omlx.unloadModel(id)           // void — unload a model from memory
omlx.restart()                 // void — restart server, poll until back (≤30s)
omlx.reload()                  // void — reload server config
omlx.clearStats(scope)         // void — clear 'session' or 'alltime' token stats
omlx.clearCache(kind)          // void — clear 'hot' or 'ssd' cache store
\`\`\`

## Streaming & generation

\`\`\`ts
omlx.watch(fn, opts?)          // AsyncIterable<T> — poll fn, yield on change
omlx.chat(model, input, opts?) // string — buffered chat completion
\`\`\`

Use \`omlxctl exec\` to run one-off expressions:

\`\`\`sh
omlxctl exec "await omlx.models()"
omlxctl exec "await omlx.stats('alltime')"
\`\`\`
`;

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------
export async function helpCommand(args: string[]): Promise<void> {
  const subcommand = args[0]?.toLowerCase();
  const content = subcommand === "sdk" ? SDK_DOCS : USAGE;

  // Try to pipe through bat for nicer rendering on TTY
  if (process.stdout.isTTY) {
    try {
      await Bun.$`which bat`.quiet();
      // Write to a temp file so bat receives a real file path (avoids shell-quoting
      // issues with backticks/special chars in content) and can auto-detect language.
      // --color=always is required because bat's stdout is not a TTY inside Bun.$,
      // so without it bat silently strips all ANSI codes.
      const tmp = `/tmp/omlxctl-help-${Date.now()}.md`;
      await Bun.write(tmp, content);
      const result = await Bun.$`bat --color=always --language=md --style=plain --paging=never ${tmp}`.nothrow();
      try { await Bun.$`rm -f ${tmp}`.quiet(); } catch {}
      if (result.exitCode === 0) return;
    } catch {
      // bat not available or failed — fall through to plain print
    }
  }

  renderLine(content);
}
