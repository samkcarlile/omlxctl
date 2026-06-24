import {
  render,
  renderLine,
  table,
  bytes,
  relativeTime,
  truncate,
  c,
} from "../render/index.ts";
import type { GlobalOpts } from "../cli.ts";
import { Omlx } from "../sdk.ts";
import { listV1Models } from "../client/endpoints.ts";

interface ModelsFlags {
  loaded: boolean;
  v1: boolean;
}

function parseModelsFlags(args: string[]): ModelsFlags {
  const flags: ModelsFlags = { loaded: false, v1: false };
  for (const arg of args) {
    if (arg === "--loaded") flags.loaded = true;
    if (arg === "--v1") flags.v1 = true;
  }
  return flags;
}

export async function modelsCommand(args: string[], opts: GlobalOpts): Promise<void> {
  const flags = parseModelsFlags(args);

  if (flags.v1) {
    const resp = await listV1Models();
    const models = resp.data ?? [];

    if (opts.json || !process.stdout.isTTY) {
      render(models);
      return;
    }

    renderLine("  " + c.bold(c.cyan("MODELS")) + "  " + c.dim("(v1 API)"));
    table(
      models.map((m) => [truncate(m.id, 48), m.object, m.owned_by]),
      { header: ["ID", "OBJECT", "OWNED BY"] },
    );
    renderLine("\n  " + c.dim(`${models.length} model(s)`));
    return;
  }

  const omlx = new Omlx({ baseUrl: opts.baseUrl, apiKey: opts.apiKey });
  let models = await omlx.models();

  if (flags.loaded) {
    models = models.filter((m) => m.loaded);
  }

  if (opts.json || !process.stdout.isTTY) {
    render(models);
    return;
  }

  const loadedCount = models.filter((m) => m.loaded).length;

  // Glyphs: filled/colored when on, dim middot when off.
  const mark = (on: boolean, glyph: string, color: (s: string) => string) =>
    on ? color(glyph) : c.dim("·");

  const rows: string[][] = models.map((m) => {
    const id = truncate(m.id, 34);
    const cells = [
      id,
      mark(m.loaded, "●", c.green),
      mark(m.pinned, "★", c.cyan),
      mark(m.isDefault, "⊕", c.yellow),
      bytes(m.sizeBytes),
      m.engineType,
      relativeTime(m.lastAccess),
    ];
    // Dim the whole row for unloaded models to surface the loaded ones.
    return m.loaded ? cells : cells.map((cell) => c.dim(cell.replace(/\x1b\[[0-9;]*m/g, "")));
  });

  renderLine("  " + c.bold(c.cyan("MODELS")) + "  " + c.dim(`(${loadedCount} loaded / ${models.length} total)`));
  table(rows, {
    header: ["ID", "LOADED", "PINNED", "DEFAULT", "SIZE", "ENGINE", "LAST ACCESS"],
  });
}
