import {
  render,
  renderLine,
  section,
  bar,
  badge,
  bytes,
  duration,
  commas,
  compact,
  c,
} from "../render/index.ts";
import type { GlobalOpts } from "../cli.ts";
import { Omlx } from "../sdk.ts";

function pressureBadge(level: string): string {
  const l = level.toLowerCase();
  if (l.includes("high") || l.includes("crit")) return badge(level, "red");
  if (l.includes("med") || l.includes("warn")) return badge(level, "yellow");
  return badge(level, "green");
}

export async function statusCommand(opts: GlobalOpts): Promise<void> {
  const omlx = new Omlx({ baseUrl: opts.baseUrl, apiKey: opts.apiKey });

  const [server, memory, activeRequests, stats] = await Promise.all([
    omlx.server(),
    omlx.memory(),
    omlx.activeRequests(),
    omlx.stats(),
  ]);

  if (opts.json || !process.stdout.isTTY) {
    render({ server, memory, activeRequests, stats });
    return;
  }

  // ── Identity line ─────────────────────────────────────────────────────────
  const engineBits = Object.entries(server.engines)
    .map(([k, v]) => `${k} ${v.version}`)
    .join(" · ");
  renderLine(
    `${c.bold("omlxctl")} ${c.dim("·")} oMLX ${c.bold("v" + server.version)}  ${c.dim("@")}  ${c.bold(server.host + ":" + server.port)}   ${c.dim("uptime")} ${duration(server.uptimeSeconds)}`,
  );
  renderLine("");

  // ── SERVER ──────────────────────────────────────────────────────────────
  const updateMsg = server.update.available
    ? c.yellow(`update → ${server.update.latest ?? "available"} (${server.update.channel})`)
    : c.dim("up to date");
  section("Server", [
    `${c.dim("version")}  ${c.bold(server.version)}${engineBits ? "    " + c.dim(engineBits) : ""}`,
    `${c.dim("status ")}  ${updateMsg}`,
  ]);

  // ── MEMORY ──────────────────────────────────────────────────────────────
  const usedPct = memory.modelMaxBytes > 0
    ? (memory.modelUsedBytes / memory.modelMaxBytes) * 100
    : 0;
  section("Memory", [
    `${c.dim("model   ")} ${bar(memory.modelUsedBytes, memory.modelMaxBytes, 20)}  ${c.bold(bytes(memory.modelUsedBytes))} ${c.dim("/")} ${bytes(memory.modelMaxBytes)} ${c.dim(`(${usedPct.toFixed(0)}%)`)}`,
    `${c.dim("host    ")} ${c.dim("free")} ${c.bold(bytes(memory.hostAvailableBytes))}  ${c.dim("total")} ${bytes(memory.hostTotalBytes)}`,
    `${c.dim("pressure")} ${pressureBadge(memory.pressureLevel)}`,
  ]);

  // ── MODELS ──────────────────────────────────────────────────────────────
  const a = activeRequests.totalActiveRequests;
  const w = activeRequests.totalWaitingRequests;
  renderLine(
    "  " + c.bold(c.cyan("MODELS")) + "  " + c.dim(`(${a} active / ${w} waiting)`),
  );
  if (activeRequests.models.length > 0) {
    for (const m of activeRequests.models) {
      renderLine(
        `    ${c.bold(m.id)}  ${c.dim("active")} ${m.activeRequests} ${c.dim("waiting")} ${m.waitingRequests}`,
      );
    }
  } else {
    renderLine("    " + c.dim("No models loaded"));
  }
  renderLine("");

  // ── THROUGHPUT ────────────────────────────────────────────────────────────
  const cachePct = (stats.cacheEfficiency * 100).toFixed(1) + "%";
  renderLine("  " + c.bold(c.cyan("THROUGHPUT")) + "  " + c.dim("(session)"));
  renderLine(
    `    ${c.dim("Requests")}  ${c.bold(commas(stats.requests).padEnd(11))}  ${c.dim("Cache efficiency")}  ${c.bold(cachePct)}`,
  );
  renderLine(
    `    ${c.dim("Gen TPS ")}  ${c.bold(stats.avgGenerationTps.toFixed(1).padEnd(11))}  ${c.dim("Tokens served   ")}  ${c.bold(compact(stats.tokensServed))}`,
  );
}
