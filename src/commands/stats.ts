import { render, renderLine, kv, commas, c } from "../render/index.ts";
import type { GlobalOpts } from "../cli.ts";
import { Omlx } from "../sdk.ts";
import type { Scope, StatsView } from "../sdk.ts";

interface StatsFlags {
  scope: Scope;
  include: string[] | null;
  exclude: string[] | null;
}

function parseStatsFlags(args: string[]): StatsFlags {
  const flags: StatsFlags = { scope: "session", include: null, exclude: null };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--scope" && args[i + 1]) {
      const val = args[++i];
      if (val === "alltime" || val === "session") flags.scope = val;
    } else if (arg?.startsWith("--scope=")) {
      const val = arg.slice("--scope=".length);
      if (val === "alltime" || val === "session") flags.scope = val;
    } else if (arg === "--include" && args[i + 1]) {
      flags.include = args[++i]!.split(",").map((s) => s.trim()).filter(Boolean);
    } else if (arg?.startsWith("--include=")) {
      flags.include = arg.slice("--include=".length).split(",").map((s) => s.trim()).filter(Boolean);
    } else if (arg === "--exclude" && args[i + 1]) {
      flags.exclude = args[++i]!.split(",").map((s) => s.trim()).filter(Boolean);
    } else if (arg?.startsWith("--exclude=")) {
      flags.exclude = arg.slice("--exclude=".length).split(",").map((s) => s.trim()).filter(Boolean);
    }
  }
  return flags;
}

function filterStats(stats: StatsView, include: string[] | null, exclude: string[] | null): Partial<StatsView> {
  const entries = Object.entries(stats) as [keyof StatsView, unknown][];
  let filtered = entries;
  if (include) filtered = filtered.filter(([k]) => include.includes(k));
  if (exclude) filtered = filtered.filter(([k]) => !exclude.includes(k));
  return Object.fromEntries(filtered) as Partial<StatsView>;
}

export async function statsCommand(args: string[], opts: GlobalOpts): Promise<void> {
  const flags = parseStatsFlags(args);
  const omlx = new Omlx({ baseUrl: opts.baseUrl, apiKey: opts.apiKey });
  const raw = await omlx.stats(flags.scope);
  const stats = filterStats(raw, flags.include, flags.exclude);

  if (opts.json || !process.stdout.isTTY) {
    render(stats);
    return;
  }

  const scopeLabel = flags.scope === "alltime" ? "(all time)" : "(session)";
  renderLine("  " + c.bold(c.cyan("STATS")) + "  " + c.dim(scopeLabel));

  // Right-aligned numeric column. Build display values keyed by field.
  const cacheAnno =
    typeof stats.cacheEfficiency === "number"
      ? `    ${c.dim(`${(stats.cacheEfficiency * 100).toFixed(1)}% cache efficiency`)}`
      : "";

  const labels: Record<string, string> = {
    tokensServed: "Tokens served",
    promptTokens: "Prompt tokens",
    completionTokens: "Completion tokens",
    cachedTokens: "Cached tokens",
    requests: "Requests",
    avgPrefillTps: "Avg prefill TPS",
    avgGenerationTps: "Avg generation TPS",
  };

  const isTps = (k: string) => k.includes("Tps");
  const numKeys = Object.keys(labels).filter((k) => k in stats);
  const numWidth = Math.max(
    0,
    ...numKeys.map((k) => {
      const v = (stats as Record<string, unknown>)[k];
      if (typeof v !== "number") return 0;
      return (isTps(k) ? v.toFixed(1) : commas(v)).length;
    }),
  );

  const pairs: [string, string][] = [];
  for (const [k, label] of Object.entries(labels)) {
    if (!(k in stats)) continue;
    const v = (stats as Record<string, unknown>)[k];
    if (typeof v !== "number") continue;
    const num = isTps(k) ? v.toFixed(1) : commas(v);
    const anno = k === "cachedTokens" ? cacheAnno : "";
    pairs.push([label, c.bold(num.padStart(numWidth)) + anno]);
  }

  // Emit any remaining (filtered-in) fields not covered above, generically.
  for (const [k, v] of Object.entries(stats)) {
    if (k in labels || k === "scope" || k === "cacheEfficiency") continue;
    pairs.push([k, c.bold(String(v))]);
  }

  kv(pairs, { indent: 4 });
}
