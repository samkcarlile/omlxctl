import { render, renderError } from "../render/index.ts";
import type { GlobalOpts } from "../cli.ts";
import { Omlx } from "../sdk.ts";
import { resolveModelId, confirm } from "./_resolve.ts";

export async function unloadCommand(args: string[], opts: GlobalOpts): Promise<void> {
  const positional = args.filter((a) => !a.startsWith("-"));

  if (!positional[0]) {
    renderError(new Error("model id required"));
    process.exit(2);
  }

  const query = positional[0];

  // For unload, the confirm message uses "Unload" — override with a direct resolve
  // then confirm separately (resolveModelId's confirm says "Load" which is wrong here)
  const omlx = new Omlx({ baseUrl: opts.baseUrl, apiKey: opts.apiKey });
  let models;
  try {
    models = await omlx.models();
  } catch (err) {
    renderError(err);
    process.exit(1);
  }

  const exact = models.find((m) => m.id === query);
  let resolvedId: string;

  if (exact) {
    resolvedId = exact.id;
  } else {
    const lower = query.toLowerCase();
    const matches = models.filter((m) => m.id.toLowerCase().includes(lower));

    if (matches.length === 0) {
      renderError(new Error(`no model matches '${query}'`));
      process.exit(1);
    }
    if (matches.length > 1) {
      const ids = matches.map((m) => m.id).join(", ");
      renderError(new Error(`ambiguous: matches ${ids}`));
      process.exit(1);
    }

    resolvedId = matches[0]!.id;

    if (process.stdout.isTTY && !opts.yes) {
      const ok = await confirm(`Unload '${resolvedId}'? [y/N] `);
      if (!ok) {
        process.stdout.write("Aborted.\n");
        process.exit(0);
      }
    }
  }

  // TTY confirm for exact match too (unload is destructive)
  if (exact && process.stdout.isTTY && !opts.yes) {
    const ok = await confirm(`Unload '${resolvedId}'? [y/N] `);
    if (!ok) {
      process.stdout.write("Aborted.\n");
      process.exit(0);
    }
  }

  try {
    await omlx.unloadModel(resolvedId);

    if (process.stdout.isTTY && !opts.json) {
      process.stdout.write(`Unloaded ${resolvedId}.\n`);
    } else {
      render({ status: "unloaded", id: resolvedId });
    }
  } catch (err) {
    renderError(err);
    process.exit(1);
  }
}
